// Independent authorized OPS group plus local evidence index; no SQL or state changes.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = '.logs/authorized-operator-evidence-20261011';
const reads = [], denied = new Set();
for (const [path, group] of [
  ['/api/ops/summary','ops'], ['/api/dossier/ops/summary','dossier'], ['/api/dossier/ops/alerts','dossier'],
  ['/api/dossier/ops/audit?limit=20','dossier'], ['/api/dossier/ops/runs?limit=20','dossier'],
]) {
  const token = group === 'ops' ? (process.env.OPS_TOKEN || process.env.GCOS_OPS_TOKEN) : process.env.DOSSIER_OPS_READ_TOKEN;
  const receipt = { path, method: 'GET', startedUtc: new Date().toISOString() }; reads.push(receipt);
  if (!token || denied.has(group)) { receipt.status = 'BLOCKED_EXTERNAL'; receipt.attempted = false; receipt.reason = 'EXISTING_READ_TRANSPORT_UNAVAILABLE_OR_STOPPED'; continue; }
  try {
    const response = await fetch('https://global-content-os.channel-content-os-mcp.workers.dev' + path,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    receipt.status = response.status; receipt.requestId = response.headers.get('cf-ray'); receipt.attempted = true;
    if ([401,403].includes(response.status)) { denied.add(group); receipt.reason = 'AUTHENTICATION_DENIED_GROUP_STOP'; continue; }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { denied.add(group); receipt.reason = 'NOT_SUCCESSFUL_JSON_EVIDENCE'; continue; }
    const chunks = []; let bytes = 0; const reader = response.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > 262144) { await reader.cancel(); throw new Error('RESPONSE_BUDGET_EXCEEDED'); } chunks.push(Buffer.from(value)); }
    receipt.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { receipt.status = 'BLOCKED_EXTERNAL'; receipt.reason = 'TRANSPORT_FAILURE_REDACTED'; denied.add(group); }
  finally { receipt.finishedUtc = new Date().toISOString(); }
}
writeFileSync(`${dir}/ops-receipts.json`, JSON.stringify(reads, null, 2));
const boundaries = {
  invocationRecords: { status: 'BLOCKED_EXTERNAL', requestedWindowMinutes: 30, limit: 100, recordsRetrieved: 0,
    reason: 'NO_EXISTING_READ_ONLY_LOG_EXPORT_TRANSPORT_IDENTIFIED; NO_TAIL_CREATED', absenceProvesNoActivity: false },
  privilegedClientInventory: { status: 'UNKNOWN', reason: 'NO_AUTHORITATIVE_OPERATOR_CLIENT_INVENTORY_AVAILABLE' },
  drain: { status: 'UNKNOWN', actionExecuted: false, reason: 'NO_AUTHORIZED_EXISTING_DRAIN_ACKNOWLEDGMENT_OR_WRITE_FENCE_EVIDENCE' },
  rollback: { status: 'PARTIAL', metadataEvidence: '.logs/final-ops-rollback-version.json',
    artifact: 'BLOCKED_EXTERNAL_NO_IDENTIFIED_IMMUTABLE_RETENTION_TRANSPORT', compatibility: 'UNKNOWN' },
  migration: { status: 'PARTIAL', reusedEvidence: '.logs/operator-evidence-recovery-20261011/ER03/release-decision.json',
    sourceBytesOnly: 59, provenAppliedBytes: 0, pendingSet: 'UNKNOWN', newApplyReceipts: 0,
    missingProof: 'AUTHORITATIVE_HISTORICAL_APPLY_RECEIPTS_AND_SIX_EXACT_FILENAME_RECONCILIATION_AUTHORITY', archivalInspectionRepeated: false },
  sourceBuildLinkage: { status: 'UNKNOWN', reason: 'NO_IMMUTABLE_CI_BUILD_TO_RETRIEVED_BYTES_RECEIPT_AVAILABLE' },
};
writeFileSync(`${dir}/independent-group-boundaries.json`, JSON.stringify(boundaries, null, 2));
const checksums = readdirSync(dir).filter(name => name !== 'checksums.json' && statSync(`${dir}/${name}`).isFile()).map(name => {
  const bytes = readFileSync(`${dir}/${name}`);
  return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
writeFileSync(`${dir}/checksums.json`, JSON.stringify({ indexedUtc: new Date().toISOString(), files: checksums }, null, 2));
console.log(JSON.stringify({ opsAttempts: reads.filter(read => read.attempted).length, blockedOps: reads.filter(read => read.status === 'BLOCKED_EXTERNAL').length,
  indexedFiles: checksums.length, remoteMutations: 0 }));
