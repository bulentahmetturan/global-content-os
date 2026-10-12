import { createHash, randomUUID } from 'node:crypto';
import { mkdir, appendFile, writeFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APPLICATION_READS, CREDENTIAL_ALIASES } from './config.mjs';
import { BridgeError, inspectActiveWorkerMetadata, inspectRollbackEvidence, inspectWorkerVersions } from './cloudflare.mjs';
import { classifyOperatorResponse, projectOperatorEvidence } from '../operator-evidence-sanitize.mjs';
import { TOOLS } from './tools.mjs';

const RESPONSE_CAP = 256 * 1024;
const APP_TIMEOUT_MS = 12_000;
const RESULT_CAP = 32 * 1024;
const METHODS = Object.freeze({
  cloudflare_worker_versions: inspectWorkerVersions,
  cloudflare_active_worker_metadata: inspectActiveWorkerMetadata,
  cloudflare_rollback_evidence: inspectRollbackEvidence,
});

export function createLocalEvidenceSink(root = path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'GCOS', 'operator-bridge')) {
  const auditPath = path.join(root, 'audit.ndjson');
  const evidenceDir = path.join(root, 'evidence');
  return Object.freeze({
    async record(event, evidence) {
      await mkdir(evidenceDir, { recursive: true });
      const existing = await readdir(evidenceDir);
      if (existing.length >= 100) throw new BridgeError('EVIDENCE_STORE_FULL');
      const auditSize = await stat(auditPath).then(value => value.size).catch(error => error.code === 'ENOENT' ? 0 : Promise.reject(error));
      const eventId = randomUUID();
      let evidenceRef = null;
      if (evidence) {
        const bytes = Buffer.from(JSON.stringify(evidence));
        if (bytes.length > RESULT_CAP) throw new BridgeError('EVIDENCE_TOO_LARGE');
        evidenceRef = { id: eventId, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
        await writeFile(path.join(evidenceDir, `${eventId}.json`), bytes, { flag: 'wx' });
      }
      const line = `${JSON.stringify({ ...event, eventId, evidence: evidenceRef })}\n`;
      if (auditSize + Buffer.byteLength(line, 'utf8') > 5 * 1024 * 1024) throw new BridgeError('AUDIT_STORE_FULL');
      await appendFile(auditPath, line, { flag: 'a' });
    },
  });
}

async function boundedJson(response, maxBytes) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new BridgeError('NON_JSON_RESPONSE');
  const chunks = []; let bytes = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) { await reader.cancel(); throw new BridgeError('RESPONSE_TOO_LARGE'); }
    chunks.push(Buffer.from(value));
  }
  const raw = Buffer.concat(chunks);
  let body;
  try { body = JSON.parse(raw.toString('utf8')); }
  catch { throw new BridgeError('INVALID_JSON'); }
  return { body, bytes, sha256: createHash('sha256').update(raw).digest('hex') };
}

export function createOperatorService({ credentialStore, evidenceSink = createLocalEvidenceSink(), fetchImpl = fetch, now = () => new Date().toISOString() }) {
  async function credential(alias) {
    if (!CREDENTIAL_ALIASES.includes(alias)) throw new BridgeError('CREDENTIAL_ALIAS_NOT_ALLOWED');
    const value = await credentialStore.get(alias);
    if (!value) throw new BridgeError(`CREDENTIAL_MISSING_${alias}`);
    return value;
  }

  async function appRead(name) {
    const spec = APPLICATION_READS[name];
    const token = await credential(spec.alias);
    const controller = AbortSignal.timeout(APP_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(new URL(spec.path, 'https://global-content-os.channel-content-os-mcp.workers.dev'), {
        method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        redirect: 'error', signal: controller,
      });
    } catch (error) {
      throw new BridgeError(controller.aborted || error?.name === 'TimeoutError' ? 'REQUEST_TIMEOUT' : 'NETWORK_UNAVAILABLE');
    }
    const classification = classifyOperatorResponse(response.status, response.headers.get('content-type'), true);
    if (classification !== 'SUCCESS') {
      await response.body?.cancel().catch(() => {});
      throw new BridgeError(classification);
    }
    const { body, bytes, sha256 } = await boundedJson(response, RESPONSE_CAP);
    const evidence = projectOperatorEvidence(spec.path, body);
    if (!evidence) throw new BridgeError('RESPONSE_SHAPE_REJECTED');
    return { evidenceKind: 'APPLICATION_READ_ONLY', operation: name, result: evidence, responseBytes: bytes, responseSha256: sha256 };
  }

  async function perform(name) {
    if (name === 'operator_credential_status') return credentialStore.status();
    if (Object.hasOwn(METHODS, name)) {
      const token = await credential('CLOUDFLARE_READ');
      return METHODS[name](token, fetchImpl);
    }
    if (Object.hasOwn(APPLICATION_READS, name)) return appRead(name);
    throw new BridgeError('OPERATION_NOT_ALLOWED');
  }

  return Object.freeze({
    async listTools() {
      return TOOLS;
    },
    async call(name, args = {}) {
      const started = Date.now();
      const at = now();
      let result;
      let failure;
      try {
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 0) throw new BridgeError('ARGUMENTS_NOT_ALLOWED');
        result = await perform(name);
        const output = JSON.stringify(result);
        if (Buffer.byteLength(output, 'utf8') > RESULT_CAP) throw new BridgeError('RESULT_TOO_LARGE');
        await evidenceSink.record({ at, operation: name, outcome: 'SUCCESS', durationMs: Date.now() - started }, result);
        return result;
      } catch (error) {
        failure = error instanceof BridgeError ? error.code : 'OPERATOR_BRIDGE_FAILURE';
        try { await evidenceSink.record({ at, operation: name, outcome: 'ERROR', errorCode: failure, durationMs: Date.now() - started }); }
        catch { throw new BridgeError('AUDIT_WRITE_FAILED'); }
        throw new BridgeError(failure);
      }
    },
  });
}
