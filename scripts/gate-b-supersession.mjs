// Gate B supersession (owner-approved locally, 2026-10-14): align the frozen local authority with the byte-exact
// applied migration files recorded in docs/audits/2026-10-14-gate-b-reconciliation-report.md.
// No alias: names are exact applied names; no production access; no ledger or SQL execution.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REMOVED = ['0043_protocol_mediterranean_wave2.sql', '0044_doctor_discovery_candidates.sql', '0045_discovery_signal_linkage.sql',
  '0045_doctor_source_proposals.sql', '0046_doctor_knowledge.sql', '0046_doctor_profile_facts.sql'];
const ADDED = ['0044_protocol_mediterranean_wave2.sql', '0045_shared_discovery_kernel.sql', '0046_discovery_signal_linkage.sql',
  '0047_doctor_knowledge.sql', '0048_doctor_discovery_candidates.sql', '0049_doctor_source_proposals.sql', '0050_doctor_profile_facts.sql'];
const REPLACED_BYTES = ['0044_shared_discovery_kernel.sql'];
const sha = n => createHash('sha256').update(readFileSync(`migrations/${n}`)).digest('hex');

for (const variant of ['checkout-windows', 'git-blob']) {
  const p = `release/local-migration-authority-${variant}.json`;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  const db = m.DB;
  db.authorized = db.authorized.filter(r => !REMOVED.includes(r.name));
  for (const r of db.authorized) if (REPLACED_BYTES.includes(r.name)) r.sha256 = sha(r.name);
  for (const name of ADDED) db.authorized.push({ name, namespace: 'DB', sha256: sha(name) });
  db.authorized.sort((a, b) => (a.name < b.name ? -1 : 1));
  db.order = db.authorized.map(r => r.name);
  db.provenance = { ...db.provenance, supersession: 'GATE_B_APPLIED_BYTES_20261014', productionAuthorized: false };
  writeFileSync(p, `${JSON.stringify(m, null, 2)}\n`);
}

const p = 'apps/worker/src/schema-contract.ts';
let t = readFileSync(p, 'utf8');
const [head, tail] = [t.indexOf('export const REQUIRED_CONTENT_MIGRATIONS = ['), t.indexOf('] as const;')];
const names = [...t.slice(head, tail).matchAll(/"(\d{4}_[a-z0-9_]+\.sql)"/g)].map(x => x[1]).filter(n => !REMOVED.includes(n));
for (const n of ADDED) if (!names.includes(n)) names.push(n);
names.sort();
t = t.slice(0, head) + 'export const REQUIRED_CONTENT_MIGRATIONS = [\n' + names.map(n => `  "${n}"`).join(',\n') + '\n' + t.slice(tail);
const map = {
  Doctors: ['0047_doctor_knowledge.sql', '0048_doctor_discovery_candidates.sql', '0049_doctor_source_proposals.sql', '0050_doctor_profile_facts.sql'],
  Discovery: ['0044_shared_discovery_kernel.sql', '0045_shared_discovery_kernel.sql', '0046_discovery_signal_linkage.sql'],
  Protocols: ['0044_protocol_mediterranean_wave2.sql'],
};
for (const [ws, adds] of Object.entries(map)) {
  const start = t.indexOf(`  "${ws}": [`, t.indexOf('WORKSTREAM_MIGRATIONS'));
  const end = t.indexOf(']', start);
  const list = [...t.slice(start, end).matchAll(/"(\d{4}_[a-z0-9_]+\.sql)"/g)].map(x => x[1]).filter(n => !REMOVED.includes(n));
  for (const n of adds) if (!list.includes(n)) list.push(n);
  list.sort();
  t = t.slice(0, start) + `  "${ws}": [\n` + list.map(n => `    "${n}"`).join(',\n') + '\n  ' + t.slice(end);
}
writeFileSync(p, t);
console.log(JSON.stringify({ requiredContent: names.length }));
