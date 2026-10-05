// Production-canary PREPARATION proofs for the Eurostat TURKEY_HEALTH_BURDEN reader. Offline: the deployed Worker ROUTE (the exact code a production invocation executes) drives the
// real runner against an isolated database that already holds the recorded ClinicalTrials baseline; global fetch is stubbed and records every outbound request.
// Nothing here touches production; the V1 canary and its registry stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { EU, EU_FIXTURE, EU_ID, CC, CR, PF, clone, euWorld, q, n, canonicalState } from './eurostat-support.mjs';
import { CT_ID } from './burnin-support.mjs';

const RT = await bundle('apps/worker/src/dossier-canary-routes.ts', 'prep-routes');
const norm = (s) => s.normalize('NFKC').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const OPS = 'ops-secret';

/** A production-shaped call of the deployed route. `fetchLog` records every outbound request of the Worker. */
function harness(w, { enabled = 'true' } = {}) {
  const fetchLog = [];
  const real = globalThis.fetch;
  const stub = async (url) => {
    fetchLog.push(String(url));
    if (!/^https:\/\/ec\.europa\.eu\/eurostat\/api\/dissemination\/statistics\/1\.0\/data\/hlth_cd_asdr2\?/.test(String(url))) throw new Error(`UNEXPECTED_OUTBOUND ${url}`);
    return new Response(JSON.stringify(clone(EU_FIXTURE)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const env = { DB: w.db, OPS_TOKEN: OPS, DOSSIER_CANARY_ENABLED: enabled, ENVIRONMENT: 'production' };
  const call = async (method, path, b) => {
    globalThis.fetch = stub;
    try { return await RT.handleDossierCanary(new Request(`https://worker.test${path}`, { method, headers: { authorization: `Bearer ${OPS}`, 'content-type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) }), env, path.split('?')[0]); } finally { globalThis.fetch = real; }
  };
  return { env, call, fetchLog };
}

/** The exact future operator control sequence, applied through the route from an all-OFF control table. */
async function applyControlSequence(h) {
  const ctl = (key, value) => h.call('POST', '/api/dossier/canary/control', { key, value, operator: 'canary-operator' });
  for (const [k, v] of [['platform:d1_queries_per_invocation', '1000'], ['platform:subrequest_limit', '10000'], ['platform:cpu_budget_ms', '30000'], ['platform:capacity_verified', '1'], ['canary_enabled', '1'], ['manual_runs_allowed', '1'], ['promotion_enabled', '1'], [`reader:${EU_ID}:enabled`, '1']]) assert.equal((await ctl(k, v)).status, 200, k);
}

async function cleanProductionLikeWorld(o = {}) {
  const w = await euWorld({ baseline: true, readerEnabled: false, ...o });
  w.sqlite.exec('DELETE FROM dossier_control');
  return w;
}

test('PRODUCTION ROUTE PATH: the future control sequence + repeated POST /run drives ONE V2 logical run to COMPLETED against the persisted ClinicalTrials state: one Eurostat request, no other outbound request, every invocation <= 240 statements, 0 candidates / snapshots / reviews / ACTIVE', async () => {
  const w = await cleanProductionLikeWorld();
  const h = harness(w);
  const frozen = { ct: n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`), concepts: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts'), ctRuns: q(w.sqlite, `SELECT run_id, status FROM dossier_canary_runs WHERE reader_id = '${CT_ID}'`) };
  // before the sequence everything is OFF: a run is refused and nothing is fetched
  const off = await h.call('POST', '/api/dossier/canary/run', { reader_id: EU_ID, operator: 'canary-operator' });
  assert.equal(off.status, 409);
  const offBody = await off.json();
  assert.ok(offBody.reasons.includes('CANARY_DISABLED_BY_OPERATOR') && offBody.reasons.includes('READER_DISABLED'));
  assert.deepEqual(h.fetchLog, []);
  await applyControlSequence(h);
  // V1 readers stay OFF: they cannot run, and nothing outside Eurostat is ever requested
  for (const r of ['dossier-clinicaltrials-frontier', 'dossier-oecd-turkiye-mortality']) {
    const res = await h.call('POST', '/api/dossier/canary/run', { reader_id: r, operator: 'canary-operator' });
    assert.equal(res.status, 409, r);
    assert.ok((await res.json()).reasons.includes('READER_DISABLED'), r);
  }
  assert.deepEqual(h.fetchLog, []);
  // the V2 run, pinned by the run id of its FIRST invocation
  let runId; let out; const stmts = [];
  for (let i = 0; i < 40; i++) {
    const res = await h.call('POST', '/api/dossier/canary/run', { reader_id: EU_ID, operator: 'canary-operator', ...(runId ? { run_id: runId } : {}) });
    out = await res.json();
    assert.ok(res.status === 200, JSON.stringify(out));
    if (runId) assert.equal(out.runId, runId, 'every later invocation resumes the SAME run');
    runId = out.runId;
    stmts.push(out.statementsThisInvocation);
    if (out.status === 'COMPLETED') break;
  }
  assert.equal(out.status, 'COMPLETED');
  assert.equal(h.fetchLog.length, 1, 'exactly one source request in the whole logical run');
  assert.match(h.fetchLog[0], /geo=TR&sex=T&age=TOTAL&unit=RT&lastTimePeriod=1&format=JSON&lang=EN$/);
  assert.ok(Math.max(...stmts) <= 240 && Math.max(...stmts) < 800, `max statements ${Math.max(...stmts)}`);
  assert.ok(stmts.length <= 12, `operator invocations ${stmts.length}`);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}'`), 1, 'one logical V2 run');
  assert.deepEqual(q(w.sqlite, `SELECT run_id, status FROM dossier_canary_runs WHERE reader_id = '${CT_ID}'`), frozen.ctRuns, 'the frozen first-canary run record is untouched');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`), frozen.ct, 'research-activity observations unchanged');
  assert.deepEqual([n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidate_snapshots'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews'), n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`)], [0, 0, 0, 0]);
  // quota: a second logical run is refused (the one-run quota), and the run cannot be restarted
  const second = await h.call('POST', '/api/dossier/canary/run', { reader_id: EU_ID, operator: 'canary-operator' });
  assert.equal(second.status, 409);
  assert.ok((await second.json()).reasons.includes('RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED'));
  assert.equal(h.fetchLog.length, 1);
  // read-only report: the counters the success criteria need
  const rep = await (await h.call('GET', `/api/dossier/canary/eurostat-report?run_id=${runId}`)).json();
  assert.equal(rep.ok, true);
  const c = rep.counters;
  assert.deepEqual([c.eurostat_observations, c.duplicate_normalized_labels, c.unresolved_links, c.promotion_eligible_concepts], [91, 0, 0, 0]);
  assert.equal(c.exact_concept_links + c.approved_alias_links + c.new_concept_proposals, 91, 'every observation is classified exactly once');
  assert.equal(c.approved_alias_links, 0, 'no approved alias exists, none was created');
  assert.equal(c.ineligible_or_review_required, 14);
  // measured, not hardcoded: the two-family concepts are exactly the exact-label overlap with the persisted research-activity concepts
  const ctLabels = new Set(q(w.sqlite, `SELECT DISTINCT c.normalized_label AS l FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id WHERE o.signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`).map((r) => r.l));
  const slice = EU.normalizeEurostatSlice(EU.parseEurostatSlice(clone(EU_FIXTURE), { maxCells: 100 }));
  const overlap = slice.items.filter((i) => i.signals[0].sourceRole === 'TOPIC_BEARING' && ctLabels.has(norm(i.signals[0].conceptLabel))).length;
  assert.equal(c.two_family_concepts, overlap);
  assert.equal(c.exact_concept_links, slice.items.filter((i) => ctLabels.has(norm(i.signals[0].conceptLabel))).length);
  assert.deepEqual([rep.invariants.candidates, rep.invariants.snapshots, rep.invariants.reviews, rep.invariants.concepts_active, rep.invariants.canary_runs_for_reader, rep.invariants.non_eurostat_runs_since_start], [0, 0, 0, 0, 1, 0]);
  assert.equal((await h.call('GET', '/api/dossier/canary/eurostat-report?run_id=nope')).status, 400);
  // V2 status read model
  const st = await (await h.call('GET', '/api/dossier/canary/status?profile=v2')).json();
  assert.equal(st.profile, 'DOSSIER_CANARY_V2');
  assert.deepEqual(st.readers.map((r) => r.dossier_reader_id), [EU_ID]);
  // the frozen V1 read model is unchanged: V1 profile, the two V1 readers
  const st1 = await (await h.call('GET', '/api/dossier/canary/status')).json();
  assert.equal(st1.profile, 'DOSSIER_CANARY_V1');
  assert.deepEqual(st1.readers.map((r) => r.dossier_reader_id).sort(), ['dossier-clinicaltrials-frontier', 'dossier-oecd-turkiye-mortality']);
});

test('PRODUCTION GUARDS: the Worker route never sends the Eurostat reader anywhere but the one official https dataset URL for geo=TR; the V1 default route is unchanged', async () => {
  const f = RT.guardedEurostatFetch();
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (u) => { seen.push(String(u)); return new Response('{}'); };
  try {
    const good = EU.buildEurostatUrl();
    await f(good, { headers: {} });
    for (const bad of ['http://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2?geo=TR', 'https://example.com/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2?geo=TR', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_aro?geo=TR', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2?geo=DE', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2?sex=T'])
      await assert.rejects(f(bad, { headers: {} }), /blocked request/, bad);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(seen, [EU.buildEurostatUrl()]);
  const routeSrc = readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8');
  assert.match(routeSrc, /const profile|let profile: CanaryProfile = opts\.profile \?\? DOSSIER_CANARY_V1/, 'V1 stays the default profile');
  // unknown reader still refused; an unauthenticated caller never reaches the runner
  const w = await euWorld({ baseline: false });
  const h = harness(w);
  assert.equal((await h.call('POST', '/api/dossier/canary/run', { reader_id: 'dossier-nope', operator: 'o' })).status, 400);
  const anon = await RT.handleDossierCanary(new Request('https://worker.test/api/dossier/canary/run', { method: 'POST', body: '{}' }), h.env, '/api/dossier/canary/run');
  assert.equal(anon.status, 401);
  assert.deepEqual(h.fetchLog, []);
});

test('HARD STOP: a concept that reaches the promotion boundary stops the V2 run BEFORE any candidate or snapshot is persisted (PROMOTION_ELIGIBILITY_REACHED), without changing any threshold', async () => {
  // fabricate (TEST ONLY) the one condition that cannot occur naturally with Eurostat: a source-exposed SCOPED granularity on a topic that two families support
  const w = await euWorld({ baseline: true });
  const inner = EU.createEurostatReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => clone(EU_FIXTURE), headers: { get: () => null } }), readerId: EU_ID, legalStatus: 'APPROVED', sleep: async () => {} });
  const reader = { ...inner, normalize: (raw) => inner.normalize(raw).map((i) => (i.signals[0].conceptLabel === 'Neoplasms' ? { ...i, signals: [{ ...i.signals[0], topicGranularity: 'SCOPED_TOPIC', granularityReason: 'SCOPED_BY_SOURCE_TAXONOMY' }] } : i)) };
  const before = canonicalState(w.sqlite).state.candidates;
  const r = await CR.runCanaryToCompletion(w.deps({ createReader: () => reader }), { readerId: EU_ID, operator: 'o' }, 60);
  assert.equal(r.final.status, 'FAILED');
  assert.match(String(r.final.error), /V2_HARD_STOP_PROMOTION_ELIGIBILITY_REACHED/);
  assert.match(String(r.final.error), /PROMOTION_ELIGIBILITY_REACHED=YES/);
  assert.equal(r.final.progress.promotionEligibilityReached, 1);
  assert.deepEqual([n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidates'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_candidate_snapshots'), n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_reviews')], [0, 0, 0]);
  assert.deepEqual(canonicalState(w.sqlite).state.candidates, before);
  // thresholds untouched: the policy the run evaluated under is the frozen V1 promotion contract
  const p2 = PF.canaryPolicy(PF.DOSSIER_CANARY_V2, { promotionEnabled: true, canonicalSourceId: 'eurostat-hlth-cd-asdr2' });
  const p1 = PF.canaryPolicy(PF.DOSSIER_CANARY_V1, { promotionEnabled: true, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
  assert.deepEqual([p2.candidatePromotion, p2.topicCoherence, p2.candidateClassCriteria], [p1.candidatePromotion, p1.topicCoherence, p1.candidateClassCriteria]);
  // the same fabricated reader under the FROZEN V1 path semantics would have persisted (control): the guard exists only for a profile that forbids persistence
  const cloneProfile = structuredClone(PF.DOSSIER_CANARY_V2);
  cloneProfile.candidate_persistence.value = 'ALLOWED';
  assert.ok(PF.validateCanaryProfileV2(cloneProfile).includes('candidate_and_snapshot_persistence_must_be_forbidden'), 'a V2 profile cannot allow persistence');
  // natural data never reaches the boundary: unknown granularity fails closed (the recorded real response)
  const natural = await euWorld({ baseline: true });
  const nr = await natural.run();
  assert.equal(nr.final.status, 'COMPLETED');
  assert.equal(nr.final.progress.promotionEligibilityReached ?? 0, 0);
});

test('DEPLOYED ARTIFACT CONTENT: the Worker bundle input list now contains the Eurostat reader, the V2 registry, the revision selector, the V2 concurrency guard and the runner guard; V1 files are only type-widened', () => {
  const route = readFileSync('apps/worker/src/dossier-canary-routes.ts', 'utf8');
  for (const m of ["from './dossier/eurostat'", "from './dossier/canary-v2'", 'DOSSIER_CANARY_V2', 'eurostatCanaryReport']) assert.ok(route.includes(m), m);
  const agg = readFileSync('apps/worker/src/dossier/aggregation.ts', 'utf8');
  assert.match(agg, /export function selectEffectiveRelease/);
  assert.match(agg, /STATISTICAL_RELEASE_SOURCES.*eurostat-hlth-cd-asdr2/);
  const run = readFileSync('apps/worker/src/dossier/canary.ts', 'utf8');
  for (const m of ["strategy === 'DATASET_RELEASE_KEY'", 'CONCEPT_PROPOSER_BUSY', 'NOT EXISTS (SELECT 1 FROM dossier_canary_runs o', 'leaseNearlyOver', 'V2_HARD_STOP_PROMOTION_ELIGIBILITY_REACHED', 'gateTarget']) assert.ok(run.includes(m), m);
  // V1 profile and registry source text have no semantic change relative to the previous commit (only type widening in canary-control.ts / canary.ts signatures)
  const ctl = readFileSync('apps/worker/src/dossier/canary-control.ts', 'utf8');
  assert.equal((ctl.match(/enabled: false,/g) ?? []).length, 2);
  assert.ok(!/eurostat/i.test(ctl.replace(/'EUROSTAT'/g, '')), 'the frozen V1 registry mentions no Eurostat reader');
});

test('OPERATOR CLI (V2): --once performs exactly one invocation and returns the run id to pin; the pinned loop resumes the SAME run; reads accept --profile v2; the report is reachable', async () => {
  const CLI = await import('../../../../scripts/dossier-canary-operator.mjs');
  const w = await cleanProductionLikeWorld();
  const h = harness(w);
  await applyControlSequence(h);
  const real = globalThis.fetch;
  const viaRoute = async (url, init) => { globalThis.fetch = async (u) => { h.fetchLog.push(String(u)); return new Response(JSON.stringify(clone(EU_FIXTURE)), { status: 200 }); }; try { return await RT.handleDossierCanary(new Request(url, init), h.env, new URL(url).pathname); } finally { globalThis.fetch = real; } };
  const first = await CLI.callDossier({ base: 'https://worker.test', token: OPS, method: 'POST', path: 'run', body: { reader_id: EU_ID, operator: 'op' }, fetchImpl: viaRoute });
  assert.equal(first.httpStatus, 200);
  assert.equal(first.data.status, 'PAUSED_BUDGET');
  const rid = first.data.runId;
  assert.match(rid, /^crun_/);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}'`), 1);
  const done = await CLI.runUntilDone({ base: 'https://worker.test', token: OPS, reader: EU_ID, operator: 'op', runId: rid, maxInvocations: 12, fetchImpl: viaRoute });
  assert.equal(done.final, 'COMPLETED');
  assert.ok(done.steps.length + 1 <= 12, `total invocations ${done.steps.length + 1}`);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}'`), 1, 'still one logical run');
  assert.equal(h.fetchLog.length, 1, 'one Eurostat request across --once and the resumed loop');
  const rep = await CLI.callDossier({ base: 'https://worker.test', token: OPS, path: `eurostat-report?run_id=${rid}`, fetchImpl: viaRoute });
  assert.equal(rep.data.counters.eurostat_observations, 91);
  const st = await CLI.callDossier({ base: 'https://worker.test', token: OPS, path: 'status?profile=v2', fetchImpl: viaRoute });
  assert.equal(st.data.profile, 'DOSSIER_CANARY_V2');
});

test('RESUME CONTRACT (exposed before deployment): once the work list is persisted a resume never refetches; the ONLY refetch window is a platform termination inside the FETCH invocation before that persist (nothing is ingested yet), and it still ends in the identical durable state', async () => {
  const { killableDb: kdb } = await import('./eurostat-support.mjs');
  const refW = await euWorld();
  await refW.run();
  const refDigest = canonicalState(refW.sqlite).digest;
  // after the work list exists: kills at several points never refetch (also proven in eurostat-e2e)
  const probe = await euWorld();
  const log = [];
  await CR.invokeCanary(probe.deps({ db: { prepare: (sql) => { log.push(sql); return probe.db.prepare(sql); }, batch: probe.db.batch } }), { readerId: EU_ID, operator: 'o' });
  const iWork = log.findIndex((s) => /INSERT OR IGNORE INTO dossier_canary_work/.test(s));
  const iPersist = log.findIndex((s) => /UPDATE dossier_canary_runs SET checkpoint_json = \?, phase = 'INGEST'/.test(s));
  assert.ok(iWork > 0 && iPersist > iWork, 'the fetched work is persisted, then the phase flips, in a bounded number of statements');
  assert.ok(iPersist - iWork <= 8, `window after the HTTP response is at most ${iPersist - iWork + 1} statements`);
  for (const killAt of [iWork, iPersist, iPersist + 3]) {
    const w = await euWorld();
    const k = kdb(w.db);
    k.arm(killAt);
    await CR.invokeCanary(w.deps({ db: k.db }), { readerId: EU_ID, operator: 'o' });
    assert.ok(k.killed);
    k.disarm();
    assert.equal(w.calls.eu, 1);
    const open = q(w.sqlite, `SELECT * FROM dossier_canary_runs WHERE reader_id = '${EU_ID}'`)[0];
    w.ctx.setNow(new Date(Date.parse(open.lease_expires_at) + 60000).toISOString());
    let last;
    for (let i = 0; i < 100; i++) { last = await CR.invokeCanary(w.deps(), { readerId: EU_ID, operator: 'o', runId: open.run_id }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
    assert.equal(last.status, 'COMPLETED');
    assert.equal(w.calls.eu, killAt <= iPersist ? 2 : 1, 'a kill before the phase flip refetches once (nothing was ingested); a kill after it never refetches');
    assert.equal(canonicalState(w.sqlite).digest, refDigest, 'identical durable state either way');
    assert.equal(q(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE reader_id = '${EU_ID}'`)[0].n, 1, 'same logical run');
  }
});

test('PLAN CONSISTENCY: the prepared plan equals the code (profile, slice request, expected counts, live baseline numbers, family counting) and states that nothing was executed', async () => {
  const plan = JSON.parse(readFileSync('docs/generated/dossier-eurostat-canary-plan-v1.json', 'utf8'));
  const lim = JSON.parse(readFileSync('docs/generated/dossier-eurostat-canary-hard-limits-v1.json', 'utf8'));
  const p = PF.DOSSIER_CANARY_V2;
  assert.equal(plan.status, 'PREPARED_NOT_EXECUTED');
  assert.deepEqual([plan.profile.d1_budget, plan.profile.d1_hard_ceiling, plan.profile.lease_seconds_initial, plan.profile.max_concurrent_v2_runs, plan.profile.max_concurrent_concept_proposers, plan.profile.oecd, plan.profile.candidate_persistence, plan.profile.snapshot_persistence],
    [p.runtime.d1_statements_per_invocation.value, PF.D1_OPERATIONAL_CEILING, p.runtime.lease_seconds.value, 1, 1, p.oecd.value, p.candidate_persistence.value, p.snapshot_persistence.value]);
  assert.equal(plan.slice.request, EU.buildEurostatUrl());
  assert.equal(plan.slice.cell_cap, p.eurostat.max_items_per_run.value);
  const w = await euWorld({ baseline: false });
  const r = await w.run();
  assert.equal(r.final.status, 'COMPLETED');
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), plan.slice.expected_canonical_observations);
  assert.equal(n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN' AND candidate_signal_eligible = 'REVIEW_REQUIRED'`), plan.slice.expected_review_required_residuals);
  assert.equal(n(w.sqlite, `SELECT COUNT(DISTINCT target_id) AS n FROM dossier_signal_aggregates WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), plan.slice.expected_eligible_targets);
  // the live baseline numbers equal what the local isolated baseline holds (same recorded page): the canary starts from the same state
  const local = await euWorld({ baseline: true, readerEnabled: false });
  // aggregates are NOT compared: the research-activity FAST windows are dated by the derive day (live 1185 = 3 windows x 395 concepts across two UTC dates; the local replay 1182 = 3 x 394), so they are clock-dependent derived rows
  assert.deepEqual([plan.live_preflight.baseline.concepts, plan.live_preflight.baseline.observations, plan.live_preflight.baseline.origins, plan.live_preflight.baseline.aliases],
    [n(local.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts'), n(local.sqlite, 'SELECT COUNT(*) AS n FROM dossier_observations'), n(local.sqlite, 'SELECT COUNT(*) AS n FROM dossier_external_source_items'), n(local.sqlite, 'SELECT COUNT(*) AS n FROM dossier_aliases')]);
  assert.match(plan.live_preflight.baseline.aggregates_note, /clock-dependent/);
  assert.deepEqual(plan.family_counting, { ct_only: 1, eurostat_only: 1, oecd_plus_eurostat: 1, ct_plus_eurostat: 2, ct_plus_eurostat_plus_oecd: 2 });
  assert.equal(plan.hard_limits_ref, 'docs/generated/dossier-eurostat-canary-hard-limits-v1.json');
  assert.equal(lim.limits.MAX_RECOVERABLE_PLATFORM_TERMINATIONS, plan.platform_recovery.max_recoverable_terminations);
  assert.ok(Object.values(plan.not_performed).every((v) => v === true));
  for (const f of plan.deployment_diff.worker_files_included) assert.ok(/^apps\/worker\/src\//.test(f), f);
  assert.ok(plan.deployment_diff.worker_files_included.includes('apps/worker/src/dossier/eurostat.ts') && plan.deployment_diff.worker_files_included.includes('apps/worker/src/dossier-canary-routes.ts'));
  assert.equal(plan.canary_execution_ready, 'YES');
  assert.equal(plan.production_activation_ready, 'NO');
});
