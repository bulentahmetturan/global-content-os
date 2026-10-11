// One-time authorized GET-only evidence. Tokens exist only in memory; never logged.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = '.logs/authorized-operator-evidence-20261011';
mkdirSync(dir, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => writeFileSync(`${dir}/${name}`, JSON.stringify(value, null, 2));
const cli = args => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
  timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8',
  env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
});
const startedUtc = new Date().toISOString();
const receipts = []; let credential; let result = 'BLOCKED_EXTERNAL';
try {
  const account = JSON.parse(readFileSync('.logs/authorized-ops-account.json', 'utf8'));
  if (!account.loggedIn || account.accounts?.length !== 1) throw new Error('UNAMBIGUOUS_AUTHORIZED_ACCOUNT_REQUIRED');
  const accountId = account.accounts[0].id;
  const before = JSON.parse(cli(['deployments', 'list', '--name', 'global-content-os', '--config', 'wrangler.toml', '--json']));
  save('deployments-before.json', before);
  const latest = records => [...records].sort((a,b) => b.created_on.localeCompare(a.created_on))[0];
  const active = latest(before);
  save('active-deployment.json', active);
  // Existing Wrangler read API; disk logging disabled before sensitive stdout capture.
  const auth = JSON.parse(cli(['auth', 'token', '--json']));
  if (!['oauth', 'api_token'].includes(auth.type) || typeof auth.token !== 'string') throw new Error('SUPPORTED_EXISTING_TOKEN_TRANSPORT_REQUIRED');
  credential = auth.token; auth.token = undefined;
  async function get(path, name, artifact = false) {
    const receipt = { method: 'GET', path, startedUtc: new Date().toISOString() }; receipts.push(receipt);
    const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
      method: 'GET', headers: { Authorization: `Bearer ${credential}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    receipt.status = response.status; receipt.requestId = response.headers.get('cf-ray');
    receipt.etag = response.headers.get('etag'); receipt.contentType = response.headers.get('content-type');
    const reader = response.body.getReader(); const chunks = []; let bytes = 0;
    const cap = artifact ? 8 * 1024 * 1024 : 1024 * 1024;
    while (true) { const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > cap) { await reader.cancel(); throw new Error('RESPONSE_BUDGET_EXCEEDED'); } chunks.push(Buffer.from(value)); }
    const body = Buffer.concat(chunks); receipt.bytes = bytes; receipt.sha256 = hash(body); receipt.finishedUtc = new Date().toISOString();
    if (!response.ok) { receipt.error = 'HTTP_' + response.status; throw new Error(receipt.error); }
    if (artifact) {
      // Sensitive executable content stays in the authorized local evidence workspace.
      writeFileSync(`${dir}/${name}.bin`, body); receipt.location = `${dir}/${name}.bin`;
      if (response.headers.get('content-type')?.startsWith('multipart/')) {
        const form = await new Response(body, { headers: { 'content-type': response.headers.get('content-type') } }).formData();
        const modules = []; let serial = 0;
        for (const [name, value] of form.entries()) {
          const data = typeof value === 'string' ? Buffer.from(value) : Buffer.from(await value.arrayBuffer());
          const location = `${dir}/module-${++serial}.bin`; writeFileSync(location, data);
          modules.push({ name, bytes: data.length, sha256: hash(data), location });
        }
        save('module-hashes.json', modules);
      } else save('module-hashes.json', [{ name: response.headers.get('cf-entrypoint') || 'index.js', bytes, sha256: hash(body), location: receipt.location }]);
      return;
    }
    const json = JSON.parse(body.toString('utf8'));
    if (json.success === false) throw new Error('API_RESPONSE_FAILED');
    // Bindings may include plaintext values: retain only approved nonsecret metadata.
    if (name === 'bindings') {
      const publicNames = new Set(['BUILD_COMMIT','BUILD_BRANCH','ENVIRONMENT','DEPLOYED_AT','BIBLE_VERSION','CCOS_HANDOFF_STUB','DOSSIER_CANARY_ENABLED','DOSSIER_RECURRING_ENABLED','STATISTICS_CANARY_ENABLED','STATISTICS_SCHEDULER_ENABLED','TIP_TOPLULUGU_CONTINUOUS_INGESTION_ENABLED']);
      save(name + '.json', { ...json, result: json.result.map(binding => ({ name: binding.name, type: binding.type,
        ...(binding.type === 'd1' ? { id: binding.id, database_id: binding.database_id } : {}),
        ...(binding.type === 'plain_text' && publicNames.has(binding.name) ? { text: binding.text } : {}) })) });
    } else save(name + '.json', json);
    receipt.location = `${dir}/${name}.json`; return json.result;
  }
  const root = `/accounts/${accountId}/workers/services/global-content-os`;
  const service = await get(root, 'service');
  const environment = service.default_environment?.environment;
  if (!environment || !/^[a-zA-Z0-9_-]+$/.test(environment)) throw new Error('AUTHORIZED_ENVIRONMENT_UNRESOLVED');
  const env = `${root}/environments/${environment}`;
  await get(env + '/content/v2', 'active-content', true);
  await get(env + '/bindings', 'bindings');
  await get(env + '/routes?show_zonename=true', 'routes');
  await get(env + '/subdomain', 'subdomain');
  await get(`/accounts/${accountId}/workers/scripts/global-content-os/schedules`, 'schedules');
  const after = JSON.parse(cli(['deployments', 'list', '--name', 'global-content-os', '--config', 'wrangler.toml', '--json']));
  save('deployments-after.json', after);
  if (JSON.stringify(latest(after)) !== JSON.stringify(active)) throw new Error('DEPLOYMENT_DRIFT_STOP');
  save('artifact-bracket.json', { status: 'VERIFIED_NO_DEPLOYMENT_DRIFT', activeDeployment: active.id, versions: active.versions, environment });
  result = 'READ_ONLY_COLLECTION_COMPLETE';
} catch (error) {
  // Child-process errors can contain sensitive stdout. Never serialize the error object.
  result = /^[A-Z_0-9]+$/.test(error.message || '') ? error.message : 'TRANSPORT_FAILURE_REDACTED';
} finally {
  credential = undefined;
  save('receipt.json', { startedUtc, finishedUtc: new Date().toISOString(), result, receipts, remoteMutations: 0 });
  console.log(JSON.stringify({ result, requests: receipts.length, remoteMutations: 0, evidence: dir }));
}
