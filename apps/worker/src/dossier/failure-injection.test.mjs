// Phase F (overnight hardening): FAILURE INJECTION MATRIX on the current contract (local mocks / recorded fixtures only, no retry infrastructure).
// For every fault: the failing reader is isolated (the other reader still completes), the run provenance explains the failure, the lease is released or
// recoverable, nothing is accepted or published, no source lifecycle row and no canonical GCOS row changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CC, CR, CT, CT_ID, OE_ID, FIXTURES, PF, canonicalState, freshWorld } from './burnin-support.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
/** Digest of every non-dossier table: the canonical GCOS state (source registry, items, Evergreen runtime, briefs, ...). */
function gcosDigest(sqlite) {
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'dossier_%' ORDER BY name`).all().map((t) => t.name);
  return sha(JSON.stringify(tables.map((t) => [t, sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()])));
}
const res = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'function' ? body() : JSON.parse(JSON.stringify(body ?? {}))) });
const n = (w, sql) => w.sqlite.prepare(sql).get().n;
const row = (w) => w.sqlite.prepare(`SELECT * FROM dossier_canary_runs WHERE reader_id = ?`);

async function assertSafe(w, gcosBefore, what) {
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_reviews`), 0, `${what}: no review, so no ACCEPT`);
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_candidates WHERE state NOT IN ('CANDIDATE')`), 0, `${what}: no candidate in a decided state`);
  assert.equal(gcosDigest(w.sqlite), gcosBefore, `${what}: no canonical GCOS or source-lifecycle row changed`);
}

const FETCH_FAULTS = [
  ['source timeout', () => async () => { throw new Error('The operation was aborted due to timeout'); }, /timeout/i],
  ['HTTP 429', () => res(429), /429/],
  ['HTTP 500', () => res(500), /500/],
  ['HTTP 503', () => res(503), /503/],
  ['malformed payload (not an object)', () => res(200, () => 'not-json-object'), null],
  ['malformed payload (wrong shape)', () => res(200, { studies: 'nope' }), null],
  ['malformed payload (json parse error)', () => async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } }), /JSON|Unexpected/],
  ['unexpected empty page', () => res(200, { studies: [] }), /no_usable_items/],
];

test('fetch-level faults (timeout, 429, 500/503, malformed, empty page): the run FAILS with a provenance reason, the lease is released, the other reader is unaffected, nothing changes in GCOS, and a later manual run recovers', async () => {
  for (const [name, mk, pattern] of FETCH_FAULTS) {
    const w = await freshWorld();
    const gcos = gcosDigest(w.sqlite);
    // the failing reader is ClinicalTrials; OECD (TEST_ONLY approved) must stay healthy
    w.deps0 = w.deps;
    const bad = { ct: mk() };
    const wBad = await freshWorld({ fetchOverride: bad });
    const gcosBad = gcosDigest(wBad.sqlite);
    const failed = await wBad.run(CT_ID);
    assert.equal(failed.final.status, 'FAILED', name);
    assert.ok(failed.final.error && failed.final.error.length > 0, `${name}: the failure is explained`);
    if (pattern) assert.match(failed.final.error, pattern, name);
    const run = wBad.sqlite.prepare(`SELECT status, error_summary, lease_holder, lease_expires_at, finished_at FROM dossier_canary_runs WHERE reader_id = ?`).get(CT_ID);
    assert.equal(run.status, 'FAILED');
    assert.ok(run.error_summary);
    assert.equal(run.lease_holder, null, `${name}: lease released`);
    const sig = wBad.sqlite.prepare(`SELECT status, error_summary FROM dossier_signal_runs WHERE reader_id = ?`).get(CT_ID);
    assert.equal(sig.status, 'FAILED', `${name}: provenance row`);
    assert.ok(sig.error_summary);
    assert.equal(n(wBad, `SELECT COUNT(*) AS n FROM dossier_observations`), 0, `${name}: no partial data from a failed fetch`);
    assert.equal(wBad.calls.ct, 1, `${name}: exactly one request, no hidden retry loop`);
    await assertSafe(wBad, gcosBad, name);
    // isolation: the other reader runs to completion in the same database
    const other = await wBad.run(OE_ID);
    assert.equal(other.final.status, 'COMPLETED', `${name}: OECD unaffected`);
    assert.equal(n(wBad, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 48);
    // a FAILED run does not consume the one-run quota and is not resumable by id; the operator may start a fresh run once the source recovers
    const again = await CR.invokeCanary(wBad.deps(), { readerId: CT_ID, operator: 'op', runId: wBad.sqlite.prepare(`SELECT run_id FROM dossier_canary_runs WHERE reader_id = ?`).get(CT_ID).run_id });
    assert.deepEqual([again.status, again.reasons], ['REFUSED', ['RUN_NOT_ACTIVE:FAILED']], name);
    void w;
  }
});

test('recovery: after a transient source failure a fresh operator-started run completes with the same durable result as a clean run (no duplicates, quota consumed only by the completed run)', async () => {
  const clean = await freshWorld({ readers: [CT_ID] });
  await clean.run(CT_ID);
  const expected = canonicalState(clean.sqlite);
  let calls = 0;
  const flaky = async () => { calls += 1; return calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(FIXTURES.ct100)) }; };
  const w = await freshWorld({ readers: [CT_ID], fetchOverride: { ct: flaky } });
  assert.equal((await w.run(CT_ID)).final.status, 'FAILED');
  const second = await w.run(CT_ID);
  assert.equal(second.final.status, 'COMPLETED');
  const got = canonicalState(w.sqlite);
  assert.deepEqual(got.counts, expected.counts);
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_canary_runs`), 2, 'both runs are in the history');
  assert.deepEqual(w.sqlite.prepare(`SELECT status FROM dossier_signal_runs ORDER BY started_at`).all().map((r) => r.status), ['FAILED', 'SUCCEEDED']);
  const quota = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op' });
  assert.deepEqual(quota.reasons, ['RUN_QUOTA_EXHAUSTED_OPERATOR_REVIEW_REQUIRED'], 'one COMPLETED run consumes the quota; the failed one did not');
});

test('OECD fault isolation (the mirror case): a failing OECD run does not affect a ClinicalTrials run', async () => {
  const w = await freshWorld({ fetchOverride: { oecd: res(500) } });
  const gcos = gcosDigest(w.sqlite);
  assert.equal((await w.run(OE_ID)).final.status, 'FAILED');
  assert.equal((await w.run(CT_ID)).final.status, 'COMPLETED');
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`), 0);
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_observations WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`), 414);
  await assertSafe(w, gcos, 'OECD 500');
});

test('D1 controlled failure: a transient D1 error mid-run FAILS the run (recorded) and a fresh run recovers; a persistent D1 outage leaves a held lease that expires and the same run resumes', async () => {
  // (a) transient: one statement fails once
  const clean = await freshWorld({ readers: [CT_ID] });
  await clean.run(CT_ID);
  const expected = canonicalState(clean.sqlite);
  const wa = await freshWorld({ readers: [CT_ID] });
  const gcosA = gcosDigest(wa.sqlite);
  let count = 0;
  const flakyDb = { prepare: (s) => { count += 1; if (count === 120) throw new Error('D1_ERROR: simulated transient failure'); return wa.db.prepare(s); }, batch: (b) => wa.db.batch(b) };
  const first = await CR.runCanaryToCompletion(wa.deps({ db: flakyDb }), { readerId: CT_ID, operator: 'op' });
  assert.equal(first.final.status, 'FAILED');
  assert.match(first.final.error, /D1_ERROR/);
  const ra = wa.sqlite.prepare(`SELECT status, error_summary, lease_holder FROM dossier_canary_runs`).get();
  assert.deepEqual([ra.status, ra.lease_holder], ['FAILED', null]);
  assert.ok(ra.error_summary.includes('D1_ERROR'));
  assert.equal(wa.sqlite.prepare(`SELECT status FROM dossier_signal_runs`).get().status, 'FAILED');
  await assertSafe(wa, gcosA, 'transient D1');
  const recovered = await wa.run(CT_ID);
  assert.equal(recovered.final.status, 'COMPLETED');
  assert.deepEqual(canonicalState(wa.sqlite).counts, expected.counts, 'the partial work of the failed run is reused idempotently: no duplicates');
  // (b) persistent outage: even the failure handler cannot write; the run stays RUNNING with its lease, nothing else is lost
  const wb = await freshWorld({ readers: [CT_ID] });
  const gcosB = gcosDigest(wb.sqlite);
  let cb = 0;
  const deadDb = { prepare: (s) => { cb += 1; if (cb > 150) throw new Error('D1_ERROR: outage'); return wb.db.prepare(s); }, batch: (b) => wb.db.batch(b) };
  await CR.invokeCanary(wb.deps({ db: deadDb }), { readerId: CT_ID, operator: 'op' });
  const rb = wb.sqlite.prepare(`SELECT status, lease_holder, lease_expires_at FROM dossier_canary_runs`).get();
  assert.equal(rb.status, 'RUNNING');
  assert.ok(rb.lease_holder, 'lease left held, it expires by itself');
  await assertSafe(wb, gcosB, 'persistent D1');
  wb.ctx.setNow(new Date(Date.parse(wb.ctx.now()) + 10 * 60 * 1000).toISOString());
  const rid = wb.sqlite.prepare(`SELECT run_id FROM dossier_canary_runs`).get().run_id;
  let last;
  for (let i = 0; i < 60; i++) { last = await CR.invokeCanary(wb.deps(), { readerId: CT_ID, operator: 'op', runId: rid }); if (['COMPLETED', 'FAILED', 'REFUSED'].includes(last.status)) break; }
  assert.equal(last.status, 'COMPLETED');
  assert.equal(canonicalState(wb.sqlite).digest, expected.digest);
});

test('checkpoint write failure: the fetched work and the checkpoint are one statement; if it fails the run is FAILED (not half-advanced) and a fresh run recovers', async () => {
  const w = await freshWorld({ readers: [CT_ID] });
  const gcos = gcosDigest(w.sqlite);
  const failCkpt = { prepare: (s) => { if (/SET checkpoint_json = \?, phase = 'INGEST'/.test(s)) throw new Error('D1_ERROR: checkpoint write failed'); return w.db.prepare(s); }, batch: (b) => w.db.batch(b) };
  const r = await CR.runCanaryToCompletion(w.deps({ db: failCkpt }), { readerId: CT_ID, operator: 'op' });
  assert.equal(r.final.status, 'FAILED');
  assert.match(r.final.error, /checkpoint write failed/);
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_observations`), 0, 'nothing was ingested before the checkpoint existed');
  assert.equal(w.sqlite.prepare(`SELECT lease_holder FROM dossier_canary_runs`).get().lease_holder, null);
  await assertSafe(w, gcos, 'checkpoint failure');
  const ok = await w.run(CT_ID);
  assert.equal(ok.final.status, 'COMPLETED');
  assert.equal(w.calls.ct, 2, 'the failed run and the recovery run each made one request');
});

test('candidate gate exception and attribution serialization failure: the run FAILS with provenance; no candidate, no review, no GCOS change; the other reader still runs', async () => {
  // candidate gate: any read of the aggregates in the evaluation path throws during DERIVE
  const w = await freshWorld({ ct: FIXTURES.ctOverlap });
  const gcos = gcosDigest(w.sqlite);
  let derive = false;
  const gateDb = { prepare: (s) => { if (/FROM dossier_signal_aggregates/.test(s) && /SELECT/i.test(s) && derive) throw new Error('candidate_gate_exception'); if (/SELECT DISTINCT concept_id FROM dossier_observations/.test(s)) derive = true; return w.db.prepare(s); }, batch: (b) => w.db.batch(b) };
  const r = await CR.runCanaryToCompletion(w.deps({ db: gateDb }), { readerId: CT_ID, operator: 'op' });
  assert.equal(r.final.status, 'FAILED');
  assert.match(r.final.error, /candidate_gate_exception/);
  assert.equal(n(w, `SELECT COUNT(*) AS n FROM dossier_candidates`), 0);
  assert.equal(w.sqlite.prepare(`SELECT status FROM dossier_signal_runs`).get().status, 'FAILED');
  await assertSafe(w, gcos, 'candidate gate exception');
  assert.equal((await w.run(OE_ID)).final.status, 'COMPLETED', 'the other reader is unaffected');

  // attribution serialization failure at FINALIZE: the descriptor attribution cannot be serialized
  const w2 = await freshWorld({ readers: [CT_ID, OE_ID] });
  const gcos2 = gcosDigest(w2.sqlite);
  const base = w2.deps();
  const cyc = {};
  cyc.self = cyc;
  const deps = { ...base, createReader: (reg) => { const rd = base.createReader(reg); return reg.canonical_source_id === 'clinicaltrials-gov-api-v2' ? { ...rd, descriptor: { ...rd.descriptor, attribution: { ...rd.descriptor.attribution, notice: cyc } } } : rd; } };
  const bad = await CR.runCanaryToCompletion(deps, { readerId: CT_ID, operator: 'op' });
  assert.equal(bad.final.status, 'FAILED');
  assert.ok(bad.final.error.length > 0);
  assert.equal(w2.sqlite.prepare(`SELECT lease_holder FROM dossier_canary_runs WHERE reader_id = ?`).get(CT_ID).lease_holder, null);
  await assertSafe(w2, gcos2, 'attribution serialization failure');
  assert.equal((await CR.runCanaryToCompletion(base, { readerId: OE_ID, operator: 'op' })).final.status, 'COMPLETED');
});

test('budget exhaustion and budget below the minimum runnable unit stay controlled (PAUSED_BUDGET resumes; an impossible budget is refused / FAILED with a reason) and never touch GCOS', async () => {
  const w = await freshWorld({ readers: [CT_ID] });
  const gcos = gcosDigest(w.sqlite);
  const first = await CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'op' });
  assert.equal(first.status, 'PAUSED_BUDGET');
  assert.ok(first.statementsThisInvocation <= 800);
  await assertSafe(w, gcos, 'budget exhausted');
  const tiny = structuredClone(PF.DOSSIER_CANARY_V1);
  tiny.runtime.d1_statements_per_invocation.value = 58;
  const w2 = await freshWorld({ readers: [CT_ID], profile: tiny });
  const gcos2 = gcosDigest(w2.sqlite);
  const r = await w2.run(CT_ID);
  assert.equal(r.final.status, 'FAILED');
  assert.match(r.final.error, /budget_below_minimum_runnable_unit/);
  await assertSafe(w2, gcos2, 'below minimum runnable unit');
  const w3 = await freshWorld({ readers: [CT_ID], profile: (() => { const p = structuredClone(PF.DOSSIER_CANARY_V1); p.runtime.d1_statements_per_invocation.value = 40; return p; })(), capacity: true });
  const refused = await CR.invokeCanary(w3.deps(), { readerId: CT_ID, operator: 'op' });
  assert.equal(refused.status, 'REFUSED');
  assert.equal(w3.calls.ct, 0, 'refused before any source request');
});

test('no failure path can reach canonical GCOS state: the dossier runtime never writes a non-dossier table', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const writes = [];
  for (const f of readdirSync('apps/worker/src/dossier').filter((x) => x.endsWith('.ts'))) {
    const src = readFileSync(`apps/worker/src/dossier/${f}`, 'utf8');
    for (const m of src.matchAll(/\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_]+)/gi)) if (!/^dossier_/.test(m[1]) && !/^(SET|SELECT|VALUES)$/i.test(m[1])) writes.push(`${f}:${m[1]}`);
  }
  assert.deepEqual(writes, [], 'every write statement of the dossier runtime targets a dossier_ table');
  void CC; void CT;
});
