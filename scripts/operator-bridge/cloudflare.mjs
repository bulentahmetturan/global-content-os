import { TARGET } from './config.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const LIVE_VERSION = /^[0-9a-f-]{36}$/i;

export class BridgeError extends Error {
  constructor(code) { super(code); this.name = 'BridgeError'; this.code = code; }
}

async function apiGet(path, token, fetchImpl = fetch) {
  if (!path.startsWith(`/accounts/${TARGET.accountId}/workers/`) || path.includes('..')) throw new BridgeError('CLOUDFLARE_PATH_DENIED');
  let response;
  try {
    response = await fetchImpl(API + path, {
      method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BridgeError(error?.name === 'TimeoutError' ? 'CLOUDFLARE_TIMEOUT' : 'CLOUDFLARE_NETWORK_UNAVAILABLE');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new BridgeError(response.status === 401 || response.status === 403 ? 'CLOUDFLARE_AUTH_DENIED' : `CLOUDFLARE_HTTP_${response.status}`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new BridgeError('CLOUDFLARE_NON_JSON_RESPONSE');
  const chunks = []; let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new BridgeError('CLOUDFLARE_RESPONSE_TOO_LARGE'); }
    chunks.push(Buffer.from(value));
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BridgeError('CLOUDFLARE_INVALID_JSON'); }
  if (body?.success !== true || !body.result) throw new BridgeError('CLOUDFLARE_API_FAILURE');
  return body.result;
}

const uuid = value => typeof value === 'string' && LIVE_VERSION.test(value) ? value : null;
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? value : null;
const short = value => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(value) ? value : null;
const cap = (arr, max) => Array.isArray(arr) ? arr.slice(0, max) : [];

function versionRow(value) {
  if (!value || !uuid(value.id)) return null;
  return {
    id: value.id,
    number: Number.isSafeInteger(value.number) ? value.number : null,
    createdOn: iso(value.metadata?.created_on),
    modifiedOn: iso(value.metadata?.modified_on),
    source: short(value.metadata?.source),
    hasPreview: typeof value.hasPreview === 'boolean' ? value.hasPreview : null,
  };
}

function deploymentRow(value) {
  const versions = cap(value?.versions, 20).map(item => ({
    versionId: uuid(item?.version_id),
    percentage: Number.isFinite(item?.percentage) ? item.percentage : null,
  })).filter(x => x.versionId);
  return value && {
    id: uuid(value.id), createdOn: iso(value.created_on), source: short(value.source), versions,
  };
}

function versionDetail(value) {
  const resources = value?.resources ?? {};
  const script = resources.script ?? {};
  const runtime = resources.script_runtime ?? {};
  return {
    versionId: uuid(value?.id),
    number: Number.isSafeInteger(value?.number) ? value.number : null,
    createdOn: iso(value?.metadata?.created_on),
    source: short(value?.metadata?.source),
    scriptEtag: typeof script.etag === 'string' && /^[a-f0-9]{32,128}$/i.test(script.etag) ? script.etag : null,
    handlers: cap(script.handlers, 30).map(short).filter(Boolean),
    compatibilityDate: short(runtime.compatibility_date),
    compatibilityFlags: cap(runtime.compatibility_flags, 50).map(short).filter(Boolean),
    bindings: cap(resources.bindings, 100).map(binding => ({ name: short(binding?.name), type: short(binding?.type) }))
      .filter(binding => binding.name && binding.type),
    executableSourceReturned: false,
  };
}

export async function inspectWorkerVersions(token, fetchImpl = fetch) {
  const path = `/accounts/${TARGET.accountId}/workers/scripts/${TARGET.workerName}/versions?per_page=20`;
  const result = await apiGet(path, token, fetchImpl);
  const versions = cap(result.versions ?? result, 20).map(versionRow).filter(Boolean);
  return { evidenceKind: 'CLOUDFLARE_WORKER_VERSION_METADATA', worker: TARGET.workerName, count: versions.length, versions };
}

export async function inspectActiveWorkerMetadata(token, fetchImpl = fetch) {
  const base = `/accounts/${TARGET.accountId}/workers/scripts/${TARGET.workerName}`;
  const before = cap((await apiGet(`${base}/deployments`, token, fetchImpl)).deployments, 20).map(deploymentRow).filter(Boolean);
  const active = before.flatMap(d => d.versions.map(v => ({ deploymentId: d.id, createdOn: d.createdOn, ...v })))
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0];
  if (!active?.versionId) throw new BridgeError('ACTIVE_DEPLOYMENT_UNAVAILABLE');
  const details = versionDetail(await apiGet(`${base}/versions/${active.versionId}`, token, fetchImpl));
  const after = cap((await apiGet(`${base}/deployments`, token, fetchImpl)).deployments, 20).map(deploymentRow).filter(Boolean);
  const stable = JSON.stringify(before) === JSON.stringify(after);
  return {
    evidenceKind: 'CLOUDFLARE_ACTIVE_WORKER_METADATA', worker: TARGET.workerName,
    environment: TARGET.environment, deploymentStableDuringRead: stable,
    deployment: active, version: details,
    bindingsContainValues: false,
  };
}

export async function inspectRollbackEvidence(token, fetchImpl = fetch) {
  const base = `/accounts/${TARGET.accountId}/workers/scripts/${TARGET.workerName}`;
  const deployments = cap((await apiGet(`${base}/deployments`, token, fetchImpl)).deployments, 20).map(deploymentRow).filter(Boolean);
  const found = deployments.some(d => d.versions.some(v => v.versionId === TARGET.rollbackVersionId));
  if (!found) return {
    evidenceKind: 'CLOUDFLARE_ROLLBACK_METADATA', worker: TARGET.workerName,
    targetVersionId: TARGET.rollbackVersionId, presentInRecentDeploymentHistory: false,
    executableArtifactAvailable: false, compatibilityProven: false,
  };
  const detail = versionDetail(await apiGet(`${base}/versions/${TARGET.rollbackVersionId}`, token, fetchImpl));
  return {
    evidenceKind: 'CLOUDFLARE_ROLLBACK_METADATA', worker: TARGET.workerName,
    targetVersionId: TARGET.rollbackVersionId, presentInRecentDeploymentHistory: true,
    version: detail, executableArtifactAvailable: false, compatibilityProven: false,
  };
}
