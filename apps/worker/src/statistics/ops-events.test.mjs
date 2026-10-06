/**
 * Items 71 + 72 + 73: revision classification, the one-way release-event outbox plan (statistics stays separate from TIME_SENSITIVE and EVERGREEN: it
 * writes only the storage-level outbox, never content, never auto-publishes), and bulletin dedupe where mirrors are not independent events.
 * Real runs through the real storage path with the recorded revision fixtures; sqlite and real local D1; no network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { createEngine, loadReader } from './test-support/engines.mjs';
import { bootstrapRegistry, makeClock, openStorage } from './test-support/fixtures.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const closers = [];
after(async () => Promise.all(closers.map((f) => f())));
const SETUP_AT = '2026-10-05T09:00:00.000Z';
const DS = 'EUROSTAT_HEALTH:DEMO_MLEXPEC';

async function world() {
  const eng = await createEngine();
  closers.push(() => eng.close());
  const c = await openStorage(eng.db, { clock: makeClock() });
  Object.assign(c, await bootstrapRegistry(c.repos), { eng });
  await ownerSql(c, 'release/statistics-canary-policy-arm.sql', 'OWNER-REF', SETUP_AT);
  await ownerSql(c, 'release/statistics-canary-policy-activate.sql', 'OWNER-REF', SETUP_AT);
  c.unit = (mode, variant = 'v1', behavior = 'ok') => {
    c.clock.advance(60_000);
    return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: mode, fetcher: R.fixtureFetcher(variant, behavior), sleep: async () => {}, leaseTtlMs: 60_000 });
  };
  c.facts = async (r) => {
    const rel = await c.repos.releases.get(r.releaseId);
    return { releaseId: rel.release_id, releaseClass: rel.release_class, datasetId: DS, sourceId: 'EUROSTAT_HEALTH', upstreamMarker: rel.source_native_release_id };
  };
  return c;
}
const kinds = (a) => a.map((x) => `${x.kind}:${x.severity}:${x.count}`).sort();

describe('71 revision alerting (classification only, bounded, no publication)', () => {
  let c;
  const out = {};
  it('the first release is NEW_RELEASE (INFO); an identical newer release is a CONFIRMATION (INFO) and writes no version', async () => {
    c = await world();
    out.v1 = await c.unit('PRODUCTION');
    assert.deepEqual(kinds((await O.revisionAlertsForRelease(c.storage, out.v1.releaseId)).alerts), ['NEW_RELEASE:INFO:27']);
    assert.deepEqual(kinds(O.alertsFromRunCounts(out.v1)), ['NEW_RELEASE:INFO:27']);
    out.same = await c.unit('PRODUCTION', 'same-newer');
    assert.deepEqual(kinds(O.alertsFromRunCounts(out.same)), ['CONFIRMATION:INFO:27']);
    assert.equal((await O.revisionAlertsForRelease(c.storage, out.same.releaseId)).alerts.length, 0, 'confirmation creates no version, so no revision alert');
  });
  it('a changed value is a REVISION (SOURCE_REVISION = WARNING) with a bounded sample', async () => {
    out.changed = await c.unit('PRODUCTION', 'changed');
    const d = await O.revisionAlertsForRelease(c.storage, out.changed.releaseId);
    assert.deepEqual(kinds(d.alerts), ['REVISION:WARNING:1']);
    assert.match(d.alerts[0].samples[0].detail, /SOURCE_REVISION: 7\d(\.\d)? -> 78\.9/);
    assert.deepEqual([d.examined, d.capped], [1, false]);
    assert.deepEqual(kinds(O.alertsFromRunCounts(out.changed)), ['CONFIRMATION:INFO:26', 'REVISION:WARNING:1'], '26 unchanged cells are confirmations, one cell is revised');
  });
  it('a flag-only change is a FLAG_CHANGE (INFO); a value that disappears is MISSING (ACTION_REQUIRED)', async () => {
    const w = await world();
    await w.unit('PRODUCTION');
    const flag = await w.unit('PRODUCTION', 'flag-only');
    assert.deepEqual(kinds((await O.revisionAlertsForRelease(w.storage, flag.releaseId)).alerts), ['FLAG_CHANGE:INFO:1']);
    const missing = await w.unit('PRODUCTION', 'present-missing');
    // the recorded variant also drops the earlier flag again, so the flag flips back in the same release
    assert.deepEqual(kinds((await O.revisionAlertsForRelease(w.storage, missing.releaseId)).alerts), ['FLAG_CHANGE:INFO:1', 'MISSING:ACTION_REQUIRED:1']);
  });
  it('a late older release is a LATE_BACKFILL (WARNING) and never news by itself', async () => {
    out.old = await c.unit('PRODUCTION', 'old');
    const d = await O.revisionAlertsForRelease(c.storage, out.old.releaseId);
    assert.ok(d.alerts.every((a) => a.kind === 'LATE_BACKFILL' && a.severity === 'WARNING'), kinds(d.alerts).join());
    assert.ok(d.alerts[0].count >= 1);
    assert.equal(O.planReleaseEvent(await c.facts(out.old), d.alerts), null);
  });
  it('schema drift is a HARD_STOP alert; samples and examined versions are capped', async () => {
    const bad = await c.unit('PRODUCTION', 'unexpected-geo');
    assert.equal(bad.status, 'FAILED');
    assert.deepEqual(kinds(O.alertsFromRunCounts({ inserted: 0, revised: 0, backfilled: 0, confirmed: 0, unchanged: 0, readerFailureClass: bad.readerError.failureClass })), ['SCHEMA_DRIFT:HARD_STOP:1']);
    assert.deepEqual([O.MAX_SAMPLES, O.MAX_EXAMINED], [5, 200]);
  });
});

describe('72 one-way release-event outbox (storage only, owner decides materiality)', () => {
  let c, v1, changed;
  it('a PRODUCTION release plans one bounded event; a CANARY release plans none', async () => {
    c = await world();
    const canary = await (async () => {
      c.clock.advance(60_000);
      return R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: 'CANARY', fetcher: R.fixtureFetcher('v1'), sleep: async () => {}, leaseTtlMs: 60_000 });
    })();
    assert.equal(O.planReleaseEvent(await c.facts(canary), []), null);
    v1 = await c.unit('PRODUCTION');
    const plan = O.planReleaseEvent(await c.facts(v1), O.alertsFromRunCounts(v1));
    assert.deepEqual([plan.eventType, plan.officialUrl, plan.payload.facts.length], ['NEW_RELEASE', O.CANONICAL_BULLETIN_URL[DS], 1]);
    assert.ok(plan.payload.facts.length <= 5);
    const rec = await O.recordPlannedEvent(c.repos, plan);
    assert.equal(rec.created, true);
    assert.equal(rec.event.eligibility_state, 'PENDING', 'never ELIGIBLE or EMITTED automatically');
    assert.equal(rec.event.emitted_at, null);
  });
  it('a material revision plans a MATERIAL_REVISION event', async () => {
    changed = await c.unit('PRODUCTION', 'changed');
    const alerts = (await O.revisionAlertsForRelease(c.storage, changed.releaseId)).alerts;
    const plan = O.planReleaseEvent(await c.facts(changed), alerts);
    assert.equal(plan.eventType, 'MATERIAL_REVISION');
    const rec = await O.recordPlannedEvent(c.repos, plan);
    assert.equal(rec.created, true);
    assert.equal(await O.recordPlannedEvent(c.repos, null), null);
  });
  it('emission is governed by the database: PENDING cannot be emitted; ELIGIBLE needs the republication gate PASS; a PAUSED source cannot emit; only then an owner can mark it emitted', async () => {
    const [ev] = await c.repos.outbox.readBatch('PENDING', 10);
    await assert.rejects(c.repos.outbox.markEmitted(ev.event_id, 'receipt-1'), (e) => e.code === 'STATISTICS_ACTIVATION_GATED');
    await assert.rejects(c.repos.outbox.decide(ev.event_id, { state: 'ELIGIBLE', republicationGate: 'NOT_PASS', reason: 'owner review' }), (e) => e.code === 'STATISTICS_ACTIVATION_GATED');
    await c.repos.outbox.decide(ev.event_id, { state: 'ELIGIBLE', republicationGate: 'PASS', reason: 'owner approved the headline facts' });
    await ownerSql(c, 'release/statistics-canary-policy-pause.sql', 'OWNER-REF', '2026-10-06T00:00:00.000Z');
    await assert.rejects(c.repos.outbox.markEmitted(ev.event_id, 'receipt-1'), (e) => e.code === 'STATISTICS_ACTIVATION_GATED');
    await ownerSql(c, 'release/statistics-policy-resume.sql', 'OWNER-REF', '2026-10-06T00:00:01.000Z');
    const done = await c.repos.outbox.markEmitted(ev.event_id, 'receipt-1');
    assert.equal(done.eligibility_state, 'EMITTED');
  });
  it('no content path: the module imports nothing from content, triage, ingress or localize code and performs no network call', () => {
    const src = readFileSync('apps/worker/src/statistics/ops/revision-events.ts', 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.ok(imports.every((i) => /^\.\.?\//.test(i) && !/triage|ingress|db\/queries|localize|handoff|index'$/.test(i) || i === '../index'), imports.join());
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\bfetch\s*\(|XMLHttpRequest|approved_brief|source_items/);
  });
});

describe('73 duplicate bulletin dedupe: mirrors are not independent events', () => {
  it('the same bulletin through URL variants (tracking params, www, trailing slash, mirror host) is ONE event and never a second', async () => {
    const c = await world();
    const v1 = await c.unit('PRODUCTION');
    const facts = await c.facts(v1);
    const alerts = O.alertsFromRunCounts(v1);
    const variants = [
      undefined,
      `${O.CANONICAL_BULLETIN_URL[DS]}/`,
      `${O.CANONICAL_BULLETIN_URL[DS]}?utm_source=newsletter&utm_campaign=x`,
      'https://www.ec.europa.eu/eurostat/databrowser/view/demo_mlexpec/default/table',
      'https://appsso.eurostat.ec.europa.eu/nui/show.do?dataset=demo_mlexpec',
    ];
    const ids = new Set();
    let created = 0;
    for (const u of variants) {
      const rec = await O.recordPlannedEvent(c.repos, O.planReleaseEvent(facts, alerts, u));
      ids.add(rec.event.event_id);
      if (rec.created) created++;
      assert.deepEqual(rec.urlCollisions, [], 'no second event, so nothing collides');
    }
    assert.deepEqual([ids.size, created], [1, 1]);
    assert.equal((await c.storage.first('SELECT COUNT(*) c FROM statistics_release_events')).c, 1);
  });
  it('bulletin identity folds mirror hosts onto the canonical bulletin and keeps the source-native release key; unknown datasets fold mirrors only', () => {
    const m = O.bulletinIdentity(DS, 'https://appsso.eurostat.ec.europa.eu/nui/show.do?dataset=demo_mlexpec');
    assert.deepEqual([m.viaMirror, m.canonicalUrl], [true, O.CANONICAL_BULLETIN_URL[DS]]);
    const u = O.bulletinIdentity('OTHER:X', 'https://europa.eu/some/bulletin/2026');
    assert.deepEqual([u.viaMirror, u.canonicalUrl], [true, 'https://ec.europa.eu/some/bulletin/2026']);
    const own = O.bulletinIdentity('OTHER:X', 'https://example.org/bulletin/2026');
    assert.deepEqual([own.viaMirror, own.canonicalUrl], [false, 'https://example.org/bulletin/2026']);
  });
  it('different releases of the same bulletin URL stay distinct events (a new release is news again); the collision is reported, never merged', async () => {
    const c = await world();
    const a = await c.unit('PRODUCTION');
    const b = await c.unit('PRODUCTION', 'changed');
    const ra = await O.recordPlannedEvent(c.repos, O.planReleaseEvent(await c.facts(a), O.alertsFromRunCounts(a)));
    const rb = await O.recordPlannedEvent(c.repos, O.planReleaseEvent(await c.facts(b), (await O.revisionAlertsForRelease(c.storage, b.releaseId)).alerts));
    assert.notEqual(ra.event.event_id, rb.event.event_id);
    assert.equal(rb.urlCollisions.length, 1);
    assert.equal(rb.urlCollisions[0].event_id, ra.event.event_id);
  });
});
