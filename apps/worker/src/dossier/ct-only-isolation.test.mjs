// Phase I (overnight hardening): the FIRST live canary can be ClinicalTrials-only. OECD legal uncertainty must not block the first source-level canary,
// and a ClinicalTrials-only run must manufacture no convergence, no candidate, no ACCEPT and no publication. Production-intended runtime (the real HTTP
// handler, the real guarded network wrapper, the checked-in registry), recorded fixtures only, a verified-Paid capacity that exists in TEST only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, TEST_ONLY_PAID_CAPACITY } from './test-support.mjs';
import { CC, CI, CR, CT_ID, OE_ID, FIXTURES, PF, freshWorld } from './burnin-support.mjs';

const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'cto-routes');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const gcosDigest = (sqlite) => sha(JSON.stringify(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'dossier_%' ORDER BY name`).all().map((t) => [t.name, sqlite.prepare(`SELECT * FROM ${t.name} ORDER BY rowid`).all()])));
const n = (sqlite, sql) => sqlite.prepare(sql).get().n;

test('production-intended runtime: OECD disabled, ClinicalTrials enabled, verified capacity: the run completes through the real handler, contacts ONLY the ClinicalTrials host, and quota stops it', async () => {
  const { sqlite, db } = openDossierDb();
  const gcos = gcosDigest(sqlite);
  const env = { DB: db, OPS_TOKEN: 't', ENVIRONMENT: 'test', DOSSIER_CANARY_ENABLED: 'true' };
  const call = (method, path, body) => RT.handleDossierCanary(new Request(`https://w.test${path}`, { method, headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, path);
  for (const [key, value] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1'], ...TEST_ONLY_PAID_CAPACITY]) assert.equal((await call('POST', '/api/dossier/canary/control', { key, value, operator: 'op' })).status, 200, key);
  // OECD: not enabled (and blocked by the checked-in registration even if it were)
  const hosts = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { hosts.push(new URL(String(url)).host); return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(FIXTURES.ct100)) }; };
  try {
    const steps = [];
    let runId;
    let final;
    for (let i = 0; i < 200; i++) {
      const res = await call('POST', '/api/dossier/canary/run', { reader_id: CT_ID, operator: 'op', ...(runId ? { run_id: runId } : {}) });
      const body = await res.json();
      steps.push(body.status);
      runId = body.runId;
      if (['COMPLETED', 'FAILED', 'REFUSED'].includes(body.status)) { final = body; break; }
    }
    assert.equal(final.status, 'COMPLETED');
    assert.ok(steps.length > 1, 'bounded invocations of one run');
    assert.deepEqual(hosts, ['clinicaltrials.gov'], 'exactly one request, to the official ClinicalTrials host; no OECD host, no other host');
    // the OECD route is refused (never enabled, never approved) and creates nothing
    const oecd = await call('POST', '/api/dossier/canary/run', { reader_id: OE_ID, operator: 'op' });
    assert.equal(oecd.status, 409);
    assert.ok((await oecd.json()).reasons.includes('READER_DISABLED'));
    assert.equal(hosts.length, 1);
    // quota stops the ClinicalTrials reader after its one run
    const again = await call('POST', '/api/dossier/canary/run', { reader_id: CT_ID, operator: 'op' });
    assert.equal(again.status, 409);
    assert.deepEqual((await again.json()).reasons, ['RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED']);
    assert.equal(hosts.length, 1);
  } finally { globalThis.fetch = real; }
  // nothing from the OECD family exists anywhere
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_aggregates WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${OE_ID}'`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_runs WHERE reader_id = '${OE_ID}'`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_external_source_items WHERE acquisition_source_id = 'oecd-health'`), 0);
  // WATCH only, no candidate, no review, no ACCEPT, no publication, GCOS untouched
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`), 0);
  assert.equal(n(sqlite, `SELECT COUNT(*) AS n FROM approved_briefs`), 0, 'no publication / handoff');
  assert.equal(gcosDigest(sqlite), gcos, 'no canonical GCOS or source-lifecycle row changed');
  const st = await (await call('GET', '/api/dossier/canary/status')).json();
  assert.ok(st.totals.watch_targets > 300, `WATCH targets exist: ${st.totals.watch_targets}`);
  assert.deepEqual(Object.keys(st.totals.observations_by_family), ['GLOBAL_RESEARCH_ACTIVITY']);
  assert.equal(st.operator_summary.readers[OE_ID].may_run_now, false);
  assert.ok(st.operator_summary.owner_actions_required.some((a) => a.code === `VERIFY_SOURCE_TERMS:${OE_ID}`), 'the OECD owner action stays listed but does not block ClinicalTrials');
});

test('no OECD code path is invoked: the reader factory is never asked for OECD, no OECD request, and every ClinicalTrials topic has exactly ONE signal family (no manufactured convergence)', async () => {
  const w = await freshWorld({ readers: [CT_ID], registry: CC.DOSSIER_CANARY_REGISTRY ?? CC.DOSSIER_READER_REGISTRY });
  const asked = [];
  const base = w.deps();
  const deps = { ...base, createReader: (reg) => { asked.push(reg.canonical_source_id); return base.createReader(reg); } };
  const r = await CR.runCanaryToCompletion(deps, { readerId: CT_ID, operator: 'op' });
  assert.equal(r.final.status, 'COMPLETED');
  assert.deepEqual([...new Set(asked)], ['clinicaltrials-gov-api-v2'], 'the OECD reader was never even constructed');
  assert.equal(w.calls.oecd, 0);
  const watch = await CI.watchSummary({ db: w.db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: 'true' }, ctx: w.ctx }, { limit: 100 });
  assert.ok(watch.total_watch_targets > 300);
  const all = [];
  let after;
  for (let i = 0; i < 20; i++) { const page = await CI.watchSummary({ db: w.db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: 'true' }, ctx: w.ctx }, { limit: 100, after }); all.push(...page.targets); after = page.next_after; if (!after) break; }
  const eligible = all.filter((t) => t.state === 'WATCH');
  assert.ok(eligible.length > 0);
  assert.ok(eligible.every((t) => t.signal_families.length === 1 && t.signal_families[0] === 'GLOBAL_RESEARCH_ACTIVITY'), 'single-family targets only');
  assert.ok(!all.some((t) => t.state === 'CANDIDATE_READY_NOT_YET_PROMOTED'), 'nothing is even ready for promotion');
  assert.ok(eligible.every((t) => t.support.multi_signal_family_support === false || t.support.multi_signal_family_support === undefined || t.support.multi_signal_family_support === 0), 'no multi-family support was manufactured');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`), 0);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`), 0);
});

test('"unless another valid signal family already exists in durable state": convergence appears ONLY where an OECD observation was durably recorded earlier, and a broad topic still stays WATCH', async () => {
  // durable OECD state recorded earlier under the TEST_ONLY approved registration ...
  const w = await freshWorld({ ct: FIXTURES.ctOverlap });
  await w.run(OE_ID);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 48);
  // ... then a ClinicalTrials-only run under the CHECKED-IN registry (OECD blocked, not enabled)
  await w.set(CC.controlReaderEnabled(OE_ID), '0');
  const before = w.calls.oecd;
  const r = await CR.runCanaryToCompletion(w.deps({ registry: CC.DOSSIER_READER_REGISTRY }), { readerId: CT_ID, operator: 'op' });
  assert.equal(r.final.status, 'COMPLETED');
  assert.equal(w.calls.oecd, before, 'the CT run made no OECD request');
  const watch = await CI.watchSummary({ db: w.db, profile: PF.DOSSIER_CANARY_V1, env: { DOSSIER_CANARY_ENABLED: 'true' }, ctx: w.ctx }, { limit: 100 });
  const multi = watch.targets.filter((t) => t.signal_families.length > 1);
  assert.deepEqual(multi.map((t) => t.label.toLowerCase()), ['neoplasms'], 'the only converged topic is the real overlap');
  assert.equal(multi[0].coherence.state, 'TOO_BROAD');
  assert.equal(multi[0].state, 'WATCH');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`), 0);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`), 0);
});

test('the ClinicalTrials-only canary is independent of OECD at the source level: no import, constant or registry coupling from clinicaltrials.ts to oecd.ts', async () => {
  const { readFileSync } = await import('node:fs');
  const ct = readFileSync('apps/worker/src/dossier/clinicaltrials.ts', 'utf8');
  assert.ok(!/from '\.\/oecd'/.test(ct) && !/oecd/i.test(ct.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'clinicaltrials.ts has no OECD dependency');
  const profile = PF.DOSSIER_CANARY_V1;
  assert.ok(profile.sources.value.some((s) => s.canonical_source_id === 'clinicaltrials-gov-api-v2'));
  assert.equal(CC.readerRegistration(CT_ID).legal_status, 'APPROVED');
  assert.equal(CC.readerAccessBlockers(CC.readerRegistration(CT_ID)).length, 0);
});
