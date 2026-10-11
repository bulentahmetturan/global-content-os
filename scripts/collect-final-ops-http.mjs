// Bounded GET evidence only. No credential values or request headers are persisted.
import { writeFileSync } from 'node:fs';
const base = 'https://global-content-os.channel-content-os-mcp.workers.dev';
const reads = [];
const blockedGroups = new Set();
for (const [path, group] of [
  ['/api/health', 'public'], ['/api/ready', 'public'],
  ['/api/ops/summary', 'ops'], ['/api/dossier/ops/summary', 'dossier'],
  ['/api/dossier/ops/alerts', 'dossier'],
]) {
  const token = group === 'dossier' ? process.env.DOSSIER_OPS_READ_TOKEN : group === 'ops' ? (process.env.OPS_TOKEN || process.env.GCOS_OPS_TOKEN) : undefined;
  if (blockedGroups.has(group) || (group !== 'public' && !token)) {
    reads.push({ path, status: 'BLOCKED_EXTERNAL', reason: 'EXISTING_APPROVED_READ_ACCESS_UNAVAILABLE' }); continue;
  }
  const startedUtc = new Date().toISOString();
  try {
    const response = await fetch(base + path, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const reader = response.body.getReader(); const chunks = []; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 262144) { await reader.cancel(); throw new Error('RESPONSE_BUDGET_EXCEEDED'); }
      chunks.push(Buffer.from(value));
    }
    const json = response.headers.get('content-type')?.includes('application/json');
    reads.push({ path, startedUtc, finishedUtc: new Date().toISOString(), status: response.status,
      requestId: response.headers.get('cf-ray'), authenticated: Boolean(token),
      body: json ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined,
      ...(json ? {} : { reason: 'NON_JSON_NOT_API_EVIDENCE' }) });
    if ([401, 403].includes(response.status) || !json) blockedGroups.add(group);
  } catch (error) {
    reads.push({ path, startedUtc, finishedUtc: new Date().toISOString(), status: 'UNAVAILABLE', error: error.message }); blockedGroups.add(group);
  }
}
writeFileSync('.logs/final-ops-http.json', JSON.stringify({ base, method: 'GET_ONLY', reads }, null, 2));
console.log(JSON.stringify(reads.map(({ path, status, reason }) => ({ path, status, reason }))));
