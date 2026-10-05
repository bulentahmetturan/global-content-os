/**
 * I22 lineage, I23 TIME_SENSITIVE outbox (storage only), I36 P5 governance, I24 read-model bounds.
 * Gates: P5 (no auto activation, outbox cannot publish, validation cannot mutate ontology), P4 (bounded read APIs), P1 (dedupe).
 * Run: node --test apps/worker/src/statistics/governance-outbox.test.mjs      (STATS_ENGINE=d1 for the real local D1 runtime)
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { freshDb, gateForCanary, newRelease, rejectsWith, sha, simulateOwnerActivation } from './test-support/fixtures.mjs';

let c;
before(async () => {
  c = await freshDb();
});
after(async () => c.close());

describe('lineage (I22)', () => {
  it('persists edges idempotently; self-edge rejected; OWID-derived metric traces to WHO upstream', async () => {
    const a = await c.repos.lineage.add({ edgeType: 'DERIVED_FROM', from: { sourceId: 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH' }, to: { sourceId: 'WHO_HEALTH_STATISTICS' }, evidenceStatus: 'VERIFIED', evidenceRef: 'owid metadata.json' });
    assert.equal(a.created, true);
    assert.equal(a.edge.edge_id, 'lin_eea9b36014ce5d865d7274d5');
    const b = await c.repos.lineage.add({ edgeType: 'DERIVED_FROM', from: { sourceId: 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH' }, to: { sourceId: 'WHO_HEALTH_STATISTICS' }, evidenceStatus: 'PARTIAL' });
    assert.deepEqual([b.created, b.evidenceDiffers, b.edge.evidence_status], [false, true, 'VERIFIED']);
    await rejectsWith(assert, c.repos.lineage.add({ edgeType: 'MIRROR_OF', from: { sourceId: 'WHO_HEALTH_STATISTICS' }, to: { sourceId: 'WHO_HEALTH_STATISTICS' }, evidenceStatus: 'VERIFIED' }), 'STATISTICS_INTEGRITY_ERROR');
    const t = await c.repos.lineage.traceUpstream('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', { maxDepth: 3, fanOut: 10 });
    assert.ok(t.edges.some((e) => e.to_ref === 'WHO_HEALTH_STATISTICS'));
    assert.equal((await c.repos.lineage.upstreamOf('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 5))[0].to_ref, 'WHO_HEALTH_STATISTICS');
    assert.equal((await c.repos.lineage.downstreamOf('WHO_HEALTH_STATISTICS', 5))[0].from_ref, 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH');
  });

  it('a secondary and its upstream are ONE evidence group, never independent confirmation; unrelated sources stay independent', async () => {
    const g = await c.repos.lineage.independentEvidenceGroups(['OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'WHO_HEALTH_STATISTICS', 'SGK_HEALTH_STATISTICS'], { maxDepth: 4, fanOut: 10 });
    assert.deepEqual(g, [['OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'WHO_HEALTH_STATISTICS'], ['SGK_HEALTH_STATISTICS']]);
  });

  it('edges are immutable and undeletable; dataset-level edges are supported; trace is depth/fan-out bounded', async () => {
    const e = (await c.repos.lineage.upstreamOf('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 5))[0];
    await rejectsWith(assert, c.storage.run("UPDATE statistics_lineage_edges SET to_ref = 'X' WHERE edge_id = ?1", e.edge_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_LINEAGE_IDENTITY_IMMUTABLE');
    await rejectsWith(assert, c.storage.run('DELETE FROM statistics_lineage_edges WHERE edge_id = ?1', e.edge_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_NO_DELETE');
    const d = await c.repos.lineage.add({ edgeType: 'NORMALIZED_FROM', from: { datasetId: c.D.owid }, to: { datasetId: c.D.who }, evidenceStatus: 'PARTIAL' });
    assert.deepEqual([d.edge.from_dataset_id, d.edge.to_dataset_id, d.edge.from_source_id], [c.D.owid, c.D.who, null]);
    await rejectsWith(assert, c.repos.lineage.traceUpstream('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', { maxDepth: 3 }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.lineage.upstreamOf('X'), 'STATISTICS_BOUNDS_ERROR');
  });
});

describe('TIME_SENSITIVE outbox, storage level only (I23)', () => {
  const URL1 = 'https://data.tuik.gov.tr/Bulten/Index?p=Health-Statistics-2024-54196';
  let rel1, rel2;

  it('creates a PENDING, deduplicated release event; concurrent/duplicate creation converges on one row', async () => {
    rel1 = await newRelease(c.repos, c.clock, c.D.sgk, 'PUBLICATION', 'tuik-bulletin-1', { published: '2026-10-01' });
    const mk = () => c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, releaseId: rel1.release_id, officialUrl: URL1, payload: { facts: [{ label: 'x', value: 1 }] } });
    const results = await Promise.all([mk(), mk(), mk()]);
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(new Set(results.map((r) => r.event.event_id)).size, 1);
    const ev = results[0].event;
    assert.deepEqual([ev.eligibility_state, ev.republication_gate, ev.emitted_at], ['PENDING', 'UNKNOWN', null]);
    assert.match(ev.event_id, /^sev_[0-9a-f]{24}$/);
    assert.equal(ev.canonical_url_key, 'data.tuik.gov.tr/Bulten/Index?p=Health-Statistics-2024-54196');
    assert.equal((await c.repos.outbox.readBatch('PENDING', 10)).length, 1);
    assert.equal((await c.repos.read.pendingReleaseEvents(10)).length, 1);
  });

  it('URL variants of the same TÜİK bulletin dedupe to the same canonical key; a different release/type with the same URL is a REPORTED collision, never silently merged', async () => {
    const variant = await c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, releaseId: rel1.release_id, officialUrl: 'https://WWW.data.tuik.gov.tr/Bulten/Index/?utm_source=x&p=Health-Statistics-2024-54196#frag', payload: {} });
    assert.equal(variant.created, false, 'same canonical URL + release + type = same event');
    rel2 = await newRelease(c.repos, c.clock, c.D.sgk, 'PUBLICATION', 'tuik-bulletin-2', { published: '2026-10-02' });
    const reused = await c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, releaseId: rel2.release_id, officialUrl: URL1, payload: {} });
    assert.equal(reused.created, true);
    assert.equal(reused.urlCollisions.length, 1);
    assert.equal(reused.urlCollisions[0].release_id, rel1.release_id);
    const sameUrlOtherType = await c.repos.outbox.create({ eventType: 'MATERIAL_REVISION', sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, releaseId: rel1.release_id, officialUrl: URL1, payload: {} });
    assert.equal(sameUrlOtherType.created, true);
    assert.equal((await c.repos.outbox.byUrlKey(reused.event.canonical_url_key, 10)).length, 3);
  });

  it('payload is bounded (≤5 facts, ≤2000 chars, https only, no secrets, no article text)', async () => {
    const base = { eventType: 'NEW_EDITION', sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, releaseId: rel1.release_id, officialUrl: URL1 };
    await rejectsWith(assert, c.repos.outbox.create({ ...base, payload: { facts: Array(6).fill({ a: 1 }) } }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.outbox.create({ ...base, payload: { text: 'x'.repeat(2100) } }), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, c.repos.outbox.create({ ...base, officialUrl: 'http://x.org/b', payload: {} }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.repos.outbox.create({ ...base, payload: { authorization: 'Bearer abcdefghijkl' } }), 'STATISTICS_INTEGRITY_ERROR');
  });

  it('ELIGIBLE needs republication gate PASS; EMITTED is impossible while the source is not ACTIVE (P5) and the outbox never touches content', async () => {
    const ev = (await c.repos.outbox.readBatch('PENDING', 10))[0];
    await rejectsWith(assert, c.repos.outbox.decide(ev.event_id, { state: 'ELIGIBLE', republicationGate: 'UNKNOWN', reason: 'r' }), 'STATISTICS_ACTIVATION_GATED');
    await rejectsWith(assert, c.repos.outbox.markEmitted(ev.event_id, 'receipt-1'), 'STATISTICS_ACTIVATION_GATED', 'STAT_EVENT_EMIT_NOT_GOVERNED'); // not ELIGIBLE
    await c.repos.outbox.decide(ev.event_id, { state: 'ELIGIBLE', republicationGate: 'PASS', reason: 'owner materiality policy' });
    await rejectsWith(assert, c.repos.outbox.markEmitted(ev.event_id, 'receipt-1'), 'STATISTICS_ACTIVATION_GATED', 'STAT_EVENT_EMIT_NOT_GOVERNED'); // source policy not ACTIVE
    assert.equal((await c.repos.outbox.get(ev.event_id)).eligibility_state, 'ELIGIBLE');
    await rejectsWith(assert, c.storage.run("UPDATE statistics_release_events SET official_url = 'https://evil.example/' WHERE event_id = ?1", ev.event_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_EVENT_IDENTITY_IMMUTABLE');
    // governed emit succeeds only in an ephemeral DB with a simulated owner activation (test-only)
    await simulateOwnerActivation(c.repos, 'SGK_HEALTH_STATISTICS');
    const e = await c.repos.outbox.markEmitted(ev.event_id, 'receipt-1');
    assert.deepEqual([e.eligibility_state, e.emitted_ref], ['EMITTED', 'receipt-1']);
    await rejectsWith(assert, c.repos.outbox.decide(ev.event_id, { state: 'SUPPRESSED', republicationGate: 'PASS', reason: 'x' }), 'STATISTICS_INTEGRITY_ERROR');
    await rejectsWith(assert, c.storage.run("UPDATE statistics_release_events SET eligibility_state = 'ELIGIBLE' WHERE event_id = ?1", ev.event_id), 'STATISTICS_INTEGRITY_ERROR', 'STAT_EVENT_FINAL');
  });

  it('a CANARY release event can never be emitted even for an ACTIVE source', async () => {
    const canary = await newRelease(c.repos, c.clock, c.D.sgk, 'PUBLICATION', 'canary-bulletin', { published: '2026-10-03', cls: 'CANARY' });
    const ev = (await c.repos.outbox.create({ eventType: 'NEW_RELEASE', sourceId: 'SGK_HEALTH_STATISTICS', datasetId: c.D.sgk, releaseId: canary.release_id, officialUrl: 'https://data.tuik.gov.tr/Bulten/Index?p=canary', payload: {} })).event;
    await c.repos.outbox.decide(ev.event_id, { state: 'ELIGIBLE', republicationGate: 'PASS', reason: 'x' });
    await rejectsWith(assert, c.repos.outbox.markEmitted(ev.event_id, 'r'), 'STATISTICS_ACTIVATION_GATED', 'STAT_EVENT_EMIT_NOT_GOVERNED');
  });

  it('the outbox module is storage-only: no content/triage import, no network, no content tables written', async () => {
    const src = readFileSync('apps/worker/src/statistics/repositories/outbox.ts', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|from ['"][^'"]*(triage|queries|ingress|localize|handoff)/);
    assert.doesNotMatch(src, /INSERT INTO (?!statistics_)|UPDATE (?!statistics_)/);
  });
});

describe('P5 governance (I36)', () => {
  it('bootstrap registered 6 sources, 5 datasets and left NO runtime policy ACTIVE or ACTIVATION_GATED before any owner action', async () => {
    const fresh = await freshDb();
    try {
      assert.equal((await fresh.storage.first('SELECT COUNT(*) c FROM statistics_sources')).c, 6);
      assert.equal((await fresh.storage.first('SELECT COUNT(*) c FROM statistics_source_runtime_policy')).c, 0);
      for (const s of ['ACTIVE', 'ACTIVATION_GATED', 'PAUSED']) assert.equal(await fresh.repos.policy.countByState(s), 0);
      for (const sid of ['EUROSTAT_HEALTH', 'WHO_HEALTH_STATISTICS', 'SGK_HEALTH_STATISTICS', 'TR_MINISTRY_OF_HEALTH_STATISTICS', 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'WORLDOMETER']) {
        assert.equal((await fresh.repos.policy.getEffective(sid)).runtimeState, 'DISABLED');
      }
    } finally {
      await fresh.close();
    }
  });

  it('safe-default creation for every source yields only DISABLED rows (ACTIVE count stays 0)', async () => {
    const fresh = await freshDb();
    try {
      for (const s of await fresh.repos.sources.list({ limit: 50 })) await fresh.repos.policy.ensureDefault(s.source_id);
      assert.equal(await fresh.repos.policy.countByState('DISABLED'), 6);
      assert.equal(await fresh.repos.policy.countByState('ACTIVE'), 0);
    } finally {
      await fresh.close();
    }
  });

  it('no library module activates a source: only the controlled policy.update path can set ACTIVE/ACTIVATION_GATED, and it needs explicit patch + named owner', () => {
    const dir = 'apps/worker/src/statistics';
    const offenders = [];
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? e.name !== 'test-support' && walk(`${d}/${e.name}`) : e.name.endsWith('.ts') && scan(`${d}/${e.name}`)));
    const scan = (f) => {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      if (!f.endsWith('runtime-policy.ts') && !f.endsWith('local-smoke.ts') && /['"`]ACTIVE['"`]|ACTIVATION_GATED/.test(src.replace(/WHERE[^;`]*runtime_state[^;`]*/g, '').replace(/status = 'ACTIVE'/g, ''))) {
        // allowed: type unions in rules/types and SQL predicates that READ policy state
        if (/runtimeState\s*[:=]|runtime_state\s*=\s*['"]/.test(src)) offenders.push(f);
      }
    };
    walk(dir);
    assert.deepEqual(offenders, []);
  });

  it('the single allowed activation site (local-smoke.ts) is local-only, flag-guarded and synthetic-source-only', () => {
    const smoke = readFileSync('apps/worker/src/statistics/local-smoke.ts', 'utf8');
    const entry = readFileSync('apps/worker/src/statistics/local-entry.ts', 'utf8');
    assert.match(entry, /STATISTICS_LOCAL_SMOKE !== '1'/, 'smoke route refused unless the local config sets the flag');
    for (const m of smoke.matchAll(/repos\.policy\.(ensureDefault|update)\(([^,)]*)/g)) assert.equal(m[2].trim(), 'SYNTHETIC', 'policy changes only ever target the synthetic source');
    assert.match(smoke, /const SYNTHETIC = 'LOCAL_SMOKE_SYNTHETIC'/);
    for (const f of ['index.ts', 'runtime.ts', 'bootstrap.ts']) assert.doesNotMatch(readFileSync('apps/worker/src/statistics/' + f, 'utf8'), /local-smoke/);
    assert.doesNotMatch(readFileSync('apps/worker/src/index.ts', 'utf8'), /local-smoke|local-entry/);
  });

  it('migration seeds no policy rows and no statistics data (schema only)', () => {
    const sql = readFileSync('migrations/statistics/0001_statistics_schema_v1.sql', 'utf8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /INSERT\s+INTO/i);
  });

  it('owner gate set: canary needs ACTIVATION_GATED; DISCOVERY sources are never ingestible; frozen CHECK blocks half-open ACTIVE', async () => {
    await gateForCanary(c.repos, 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH');
    assert.equal((await c.repos.policy.getEffective('OUR_WORLD_IN_DATA_GLOBAL_HEALTH')).runtimeState, 'ACTIVATION_GATED');
    await rejectsWith(assert, c.repos.policy.update('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', '*', { runtimeState: 'ACTIVE', ownerActivationRef: 'REF' }, { changedBy: 'owner', reason: 'half-open' }), 'STATISTICS_INTEGRITY_ERROR', 'CHECK');
    await c.repos.policy.ensureDefault('WORLDOMETER');
    await rejectsWith(assert, gateForCanary(c.repos, 'WORLDOMETER'), 'STATISTICS_ACTIVATION_GATED');
  });
});

describe('bounded read models (I24)', () => {
  it('every read API that can grow requires an explicit positive limit within the configured maximum', async () => {
    const r = c.repos.read;
    const calls = [
      () => r.seriesHistory('s', {}), () => r.revisionHistory('s', 'Y2020'), () => r.releaseHistory('d'), () => r.versionsByRelease('r', {}), () => r.runCheckpoints('r'),
      () => r.searchSeries({ indicatorId: 'i' }), () => r.flaggedVersions(), () => r.recentRevisions(), () => r.pendingReleaseEvents(),
      () => c.repos.releases.latestByDataset('d'), () => c.repos.outbox.readBatch('PENDING'), () => c.repos.validation.flagsByStatus('SUSPECT'), () => c.repos.validation.forVersion('s', 'Y2020'),
      () => c.repos.indicators.listMappings('i'), () => c.repos.artifacts.listByRelease('r'), () => c.repos.checkpoints.listForRun('r'),
    ];
    for (const call of calls) await rejectsWith(assert, call(), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, r.flaggedVersions(501), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, r.flaggedVersions(-1), 'STATISTICS_BOUNDS_ERROR');
    await rejectsWith(assert, r.flaggedVersions('10'), 'STATISTICS_BOUNDS_ERROR');
  });

  it('there is no unbounded "get all" API in any repository, and searchSeries refuses an unfiltered query', async () => {
    const names = Object.entries(c.repos).flatMap(([k, o]) => Object.keys(o).map((f) => `${k}.${f}`));
    assert.ok(names.length > 80);
    assert.ok(!names.some((n) => /(^|\.)(getAll|all|listAll|dump|export)\w*$/i.test(n) || /getAllStatistics|findAll/i.test(n)), 'no getAll-style API');
    await rejectsWith(assert, c.repos.read.searchSeries({ limit: 10 }), 'STATISTICS_BOUNDS_ERROR');
  });

  it('reads cover: latest value, history, release history, revision history, provenance trace, run, run checkpoints, search, flags, pending events', async () => {
    for (const k of ['latestValue', 'seriesHistory', 'getCurrentObservation', 'releaseHistory', 'revisionHistory', 'versionsByRelease', 'traceObservationProvenance', 'latestRun', 'runCheckpoints', 'searchSeries', 'flaggedVersions', 'pendingReleaseEvents']) assert.equal(typeof c.repos.read[k], 'function', k);
    assert.equal(sha('x').length, 64);
  });
});
