// Phase U (+ doc consistency): the policy skeleton is entirely unset by default, covers every contract policy key, and the runtime
// fails safely whenever a required value is missing. The docs must record the same owner decisions the contract lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const P = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-unit');
const V = JSON.parse(readFileSync('packages/contracts/dossier-discovery.json', 'utf8'));

test('U default policy: every contract policy key exists, is unset, and carries an explicit unset status', () => {
  assert.deepEqual(Object.keys(P.POLICY_KEYS).sort(), [...V.policy.keys].sort(), 'the skeleton covers exactly the contract policy keys');
  assert.equal(V.policy.defaults_are_unset, true);
  for (const [contractKey, prop] of Object.entries(P.POLICY_KEYS)) {
    const v = P.DEFAULT_POLICY[prop];
    assert.ok(v, `${contractKey} has a property`);
    assert.ok(V.policy.statuses.includes(v.status) && v.status !== 'SET', `${contractKey} must default to an unset status, got ${v.status}`);
    assert.equal(P.policyValue(v), null);
  }
  assert.ok(Object.values(P.DEFAULT_POLICY).every((v) => !('value' in v)), 'no default carries a value (no number, threshold, interval or cap)');
  assert.deepEqual(JSON.parse(JSON.stringify(P.DEFAULT_POLICY)), JSON.parse(JSON.stringify(P.DEFAULT_POLICY)));
});

test('U unset statuses distinguish who must decide: owner decisions, configuration, and not-yet-defined policy', () => {
  const s = (k) => P.DEFAULT_POLICY[k].status;
  for (const k of ['candidateClassCriteria', 'wowThresholds', 'commercialConcentration', 'tripleNetworkQualification', 'candidateReconsideration', 'snoozeBehavior', 'repetitionCriteria', 'actorMentionProposal', 'extractionMethod']) assert.equal(s(k), 'OWNER_DECISION_REQUIRED', k);
  for (const k of ['perRunFetchCap', 'perRunItemCap', 'provenanceRepresentativeCap', 'publicHealthCredibleAnchor']) assert.equal(s(k), 'CONFIG_REQUIRED', k);
  for (const k of ['retention', 'backfill']) assert.equal(s(k), 'POLICY_NOT_SET', k);
});

test('U required policy fails safely: requirePolicy throws a typed error carrying the missing policy, a set value is returned', () => {
  assert.throws(() => P.requirePolicy('per_run_item_cap', P.DEFAULT_POLICY.perRunItemCap), (e) => e instanceof P.PolicyNotSetError && e.policy === 'per_run_item_cap' && e.status === 'CONFIG_REQUIRED' && /policy_not_set:per_run_item_cap:CONFIG_REQUIRED/.test(e.message));
  assert.equal(P.requirePolicy('x', P.set(7)), 7);
  assert.deepEqual(P.unset('OWNER_DECISION_REQUIRED'), { status: 'OWNER_DECISION_REQUIRED' });
  assert.equal(P.policyValue(P.set('v')), 'v');
});

test('U the policy source contains no numeric policy literal (only the structural 0/1 and the contract-derived vocabulary)', () => {
  const src = readFileSync('apps/worker/src/dossier/policy.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const nums = [...src.matchAll(/(?<![\w.'"-])(\d+(?:\.\d+)?)(?![\w'"-])/g)].map((m) => m[1]);
  assert.deepEqual(nums, [], 'no number appears in the policy skeleton');
});

test('V docs record the owner decisions the contract lists, and use the agreed source-readiness statuses only', () => {
  const sources = readFileSync('docs/DOSSIER-SOURCES.md', 'utf8');
  const arch = readFileSync('docs/DOSSIER-DISCOVERY.md', 'utf8');
  for (const d of ['Instagram production access method', 'TikTok production access method', 'Creator Search Insights', 'paid provider', 'API credential', 'extraction method', 'retention', 'credible-anchor', 'OWNER_DECISION_REQUIRED', 'ACCESS_POC_REQUIRED', 'SOURCE_LIFECYCLE_REQUIRED']) assert.ok(sources.includes(d), `DOSSIER-SOURCES.md must record: ${d}`);
  const statuses = new Set(['REUSE_CANDIDATE', 'READY_FOR_POC', 'NEEDS_ACCESS_POC', 'MANUAL_ONLY', 'RESTRICTED', 'UNRESOLVED', 'REJECTED']);
  const matrix = sources.split('## Smallest real canary plan')[0];
  const rows = matrix.split('\n').filter((l) => /^\| /.test(l) && !/^\|---/.test(l) && l.split('|').length > 12);
  assert.ok(rows.length >= 20, 'the readiness matrix covers every source family');
  for (const r of rows.slice(1)) {
    const status = r.split('|').filter(Boolean).at(-1).trim();
    const first = status.split(/[ (/]/)[0];
    assert.ok(statuses.has(first), `unknown status "${status}"`);
  }
  assert.ok(!/\bAPPROVED\b[^|]*\|[^|]*\|[^|]*$/m.test(rows.join('\n')), 'no source is claimed APPROVED');
  assert.match(sources, /nothing activated|No source below is active/i);
  assert.ok(arch.includes('DEFERRED') && arch.includes('EXTEND_WITH_NAMESPACE') && arch.includes('runtime-reuse.test.mjs'));
  assert.ok(arch.includes('EVERGREEN') && arch.includes('not wired into the Worker'));
  for (const w of ['magnesium', 'creatine', 'sibo', 'pfas', 'berberine']) assert.ok(!sources.toLowerCase().includes(w), `no example topic "${w}" as a source or topic in the readiness doc`);
});
