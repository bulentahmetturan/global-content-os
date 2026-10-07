// D3 Source activity + ingestability audit acceptance (sprint D3):
// append-only history keyed by association_id, deterministic derivation,
// verification/active_status separation, shared-source independence, and
// no-activation invariants. Ephemeral node:sqlite only; no network,
// no polling, no source activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors-d3');
const sources = await bundle('apps/worker/src/actors/sources.ts', 'doctor-sources-d3');
const activity = await bundle('apps/worker/src/actors/activity.ts', 'doctor-activity-d3');

const AUDIT = { by: 'test:d3', reason: 'D3 acceptance fixture' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableNames = (sqlite) =>
  sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((r) => r.name);

async function seedAssociation(db, name = 'Ahmet Ekmekçi', locator = 'https://ahmetekmekci.com', channel = 'OFFICIAL_WEBSITE') {
  const actor = await actors.createActor(db, { canonicalName: name, panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const endpoint = await sources.createEndpoint(db, { channelType: channel, platform: 'web', canonicalLocator: locator }, AUDIT);
  const assoc = await sources.linkActorToSource(
    db,
    { actorId: actor.actor_id, endpointId: endpoint.endpoint_id, associationType: 'OFFICIAL_PERSONAL' },
    AUDIT,
  );
  return { actor, endpoint, assoc };
}

const GOOD = { supportedType: true, reachable: true, authorized: true, parseable: true, observedAt: '2026-10-07T10:00:00Z' };

// Append-only activity history: rows accumulate, never rewrite.
test('activity history is append-only and ordered', async () => {
  const { sqlite, db } = openDb();
  const { assoc } = await seedAssociation(db);
  await activity.recordActivity(
    db,
    { associationId: assoc.association_id, observedAt: '2026-10-01T00:00:00Z', activityKind: 'DISCOVERED', outcome: 'CONFIRMED', reasonCode: 'NONE' },
    AUDIT,
  );
  await activity.recordActivity(
    db,
    { associationId: assoc.association_id, observedAt: '2026-10-07T00:00:00Z', activityKind: 'CHECKED', outcome: 'CONFIRMED', reasonCode: 'NONE' },
    AUDIT,
  );
  const rows = await activity.listActivityForAssociation(db, assoc.association_id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].activity_kind, 'DISCOVERED');
  assert.equal(rows[1].activity_kind, 'CHECKED');
  assert.throws(() => {
    sqlite.prepare(`UPDATE actor_source_activity SET outcome = 'BLOCKED' WHERE association_id = ?`).run(assoc.association_id);
  }, /ACTIVITY_APPEND_ONLY/);
  assert.throws(() => {
    sqlite.prepare(`DELETE FROM actor_source_activity WHERE association_id = ?`).run(assoc.association_id);
  }, /ACTIVITY_APPEND_ONLY/);
});

// Association_id ownership: activity carries association + endpoint + actor.
test('activity rows are keyed by association with endpoint and actor linkage', async () => {
  const { db } = openDb();
  const { actor, endpoint, assoc } = await seedAssociation(db);
  const row = await activity.recordActivity(
    db,
    { associationId: assoc.association_id, observedAt: '2026-10-07T00:00:00Z', activityKind: 'REACHABLE', outcome: 'CONFIRMED', reasonCode: 'NONE' },
    AUDIT,
  );
  assert.equal(row.association_id, assoc.association_id);
  assert.equal(row.endpoint_id, endpoint.endpoint_id);
  assert.equal(row.actor_id, actor.actor_id);
});

// Latest ingestability is projected; history is preserved.
test('latest ingestability projects from history without rewriting it', async () => {
  const { sqlite, db } = openDb();
  const { assoc } = await seedAssociation(db);
  await activity.evaluateIngestability(db, assoc.association_id, { ...GOOD, observedAt: '2026-10-01T00:00:00Z' }, AUDIT);
  await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: false, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  const latest = await activity.getLatestIngestability(db, assoc.association_id);
  assert.equal(latest?.status, 'NOT_INGESTABLE');
  assert.equal(latest?.reason_code, 'TRANSIENT_NETWORK');
  const history = await activity.listIngestabilityHistory(db, assoc.association_id);
  assert.equal(history.length, 2);
  assert.equal(history[0].status, 'INGESTABLE');
  assert.throws(() => {
    sqlite.prepare(`UPDATE actor_source_ingestability SET status = 'INGESTABLE'`).run();
  }, /INGESTABILITY_APPEND_ONLY/);
});

// Evaluations are append-only at the trigger level too.
test('ingestability evaluations reject update and delete', async () => {
  const { sqlite, db } = openDb();
  const { assoc } = await seedAssociation(db);
  await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  assert.throws(() => {
    sqlite.prepare(`DELETE FROM actor_source_ingestability WHERE association_id = ?`).run(assoc.association_id);
  }, /INGESTABILITY_APPEND_ONLY/);
});

// Verified association can still be NOT_INGESTABLE.
test('verified but not ingestable stays honest', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  await sources.updateVerificationStatus(db, assoc.association_id, 'VERIFIED', AUDIT);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: false, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'NOT_INGESTABLE');
  assert.equal(row.reason_code, 'TRANSIENT_NETWORK');
});

// Verified + healthy evidence is INGESTABLE.
test('verified and ingestable records cleanly', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  await sources.updateVerificationStatus(db, assoc.association_id, 'VERIFIED', AUDIT);
  const row = await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  assert.equal(row.status, 'INGESTABLE');
  assert.equal(row.reason_code, 'NONE');
});

// Unknown remains unknown and is never ingestable.
test('unknown evidence stays unknown and never becomes ingestable', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(db, assoc.association_id, {}, AUDIT);
  assert.equal(row.status, 'UNKNOWN');
  assert.notEqual(row.status, 'INGESTABLE');
  const derived = activity.deriveIngestability({}, 'PENDING_VERIFICATION');
  assert.equal(derived.status, 'UNKNOWN');
});

// Auth-required reason.
test('auth-gated source is conditionally ingestable with reason', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: true, authRequired: true, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'CONDITIONALLY_INGESTABLE');
  assert.equal(row.reason_code, 'AUTH_REQUIRED');
});

// Explicit access denial.
test('explicit denial is not ingestable with access reason', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: true, authorized: false, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'NOT_INGESTABLE');
  assert.equal(row.reason_code, 'ACCESS_DENIED');
});

// Terms/legal blocker reason.
test('terms or legal block is recorded with reason', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: true, termsBlocked: true, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'NOT_INGESTABLE');
  assert.equal(row.reason_code, 'TERMS_LEGAL_BLOCK');
});

// Unsupported reason fails closed.
test('unsupported source type fails closed', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: false, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'NOT_INGESTABLE');
  assert.equal(row.reason_code, 'UNSUPPORTED_SOURCE_TYPE');
});

// Rate-limited is conditional, not dead.
test('rate-limited source is conditionally ingestable', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: true, rateLimited: true, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'CONDITIONALLY_INGESTABLE');
  assert.equal(row.reason_code, 'RATE_LIMITED');
});

// Unparseable is not ingestable.
test('unparseable source is not ingestable', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const row = await activity.evaluateIngestability(
    db,
    assoc.association_id,
    { supportedType: true, reachable: true, parseable: false, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal(row.status, 'NOT_INGESTABLE');
  assert.equal(row.reason_code, 'PARSE_FAILED');
});

// Ambiguous association fails closed even with perfect evidence.
test('ambiguous association caps at unknown despite perfect evidence', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  await sources.updateVerificationStatus(db, assoc.association_id, 'AMBIGUOUS', AUDIT);
  const row = await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  assert.equal(row.status, 'UNKNOWN');
});

// Shared endpoint: independent per-association governance.
test('shared endpoint keeps independent per-association ingestability', async () => {
  const { db } = openDb();
  const a1 = await actors.createActor(db, { canonicalName: 'Mustafa Kalkan', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const a2 = await actors.createActor(db, { canonicalName: 'Zeynep Tartan', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'INSTITUTIONAL_PROFILE', platform: 'web', canonicalLocator: 'https://hospital.example.com/team' },
    AUDIT,
  );
  const s1 = await sources.linkActorToSource(db, { actorId: a1.actor_id, endpointId: ep.endpoint_id, associationType: 'INSTITUTIONAL_PROFILE' }, AUDIT);
  const s2 = await sources.linkActorToSource(db, { actorId: a2.actor_id, endpointId: ep.endpoint_id, associationType: 'INSTITUTIONAL_PROFILE' }, AUDIT);
  // Same technical evidence reused for both — recorded separately.
  await activity.evaluateIngestability(db, s1.association_id, GOOD, AUDIT);
  await activity.evaluateIngestability(
    db,
    s2.association_id,
    { supportedType: true, reachable: false, observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  assert.equal((await activity.getLatestIngestability(db, s1.association_id))?.status, 'INGESTABLE');
  assert.equal((await activity.getLatestIngestability(db, s2.association_id))?.status, 'NOT_INGESTABLE');
});

// Person/brand associations keep separate audit trails.
test('person and brand associations keep separate audit trails', async () => {
  const { db } = openDb();
  const person = await actors.createActor(db, { canonicalName: 'Rhonda Patrick', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  const personal = await sources.createEndpoint(db, { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: '@rhondapatrick' }, AUDIT);
  const brand = await sources.createEndpoint(db, { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://foundmyfitness.com' }, AUDIT);
  const pAssoc = await sources.linkActorToSource(db, { actorId: person.actor_id, endpointId: personal.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT);
  const bAssoc = await sources.linkActorToSource(db, { actorId: person.actor_id, endpointId: brand.endpoint_id, associationType: 'OFFICIAL_BRAND' }, AUDIT);
  await activity.recordActivity(
    db,
    { associationId: pAssoc.association_id, observedAt: '2026-10-07T00:00:00Z', activityKind: 'CHECKED', outcome: 'CONFIRMED', reasonCode: 'NONE' },
    AUDIT,
  );
  assert.equal((await activity.listActivityForAssociation(db, pAssoc.association_id)).length, 1);
  assert.equal((await activity.listActivityForAssociation(db, bAssoc.association_id)).length, 0);
});

// Future source_ref: nullable before activation, supported later via new rows.
test('future source_ref is nullable now and additive later', async () => {
  const { db } = openDb();
  const { assoc } = await seedAssociation(db);
  const first = await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  assert.equal(first.source_ref, null);
  const second = await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT, { sourceRef: 'future-source-id' });
  assert.equal(second.source_ref, 'future-source-id');
  const history = await activity.listIngestabilityHistory(db, assoc.association_id);
  assert.equal(history.length, 2);
  assert.equal(history[0].source_ref, null);
});

// active_status != ingestability: retiring the actor changes no determination.
test('actor active_status change alters no ingestability determination', async () => {
  const { sqlite, db } = openDb();
  const { actor, assoc } = await seedAssociation(db);
  await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  sqlite.prepare(`UPDATE actors SET active_status = 'INACTIVE' WHERE actor_id = ?`).run(actor.actor_id);
  assert.equal((await activity.getLatestIngestability(db, assoc.association_id))?.status, 'INGESTABLE');
});

// Recording audit never mutates canonical actor/association state.
test('audit writes never mutate canonical actor or association state', async () => {
  const { sqlite, db } = openDb();
  const { actor, assoc } = await seedAssociation(db);
  const actorBefore = JSON.stringify(sqlite.prepare(`SELECT * FROM actors WHERE actor_id = ?`).get(actor.actor_id));
  const assocBefore = JSON.stringify(
    sqlite.prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`).get(assoc.association_id),
  );
  await activity.recordActivity(
    db,
    { associationId: assoc.association_id, observedAt: '2026-10-07T00:00:00Z', activityKind: 'CHECKED', outcome: 'INCONCLUSIVE', reasonCode: 'UNKNOWN' },
    AUDIT,
  );
  await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  assert.equal(JSON.stringify(sqlite.prepare(`SELECT * FROM actors WHERE actor_id = ?`).get(actor.actor_id)), actorBefore);
  assert.equal(
    JSON.stringify(sqlite.prepare(`SELECT * FROM actor_source_associations WHERE association_id = ?`).get(assoc.association_id)),
    assocBefore,
  );
});

// Audit bundle serves D4 without activating anything.
test('association audit bundle is complete and activation-free', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds`).get().c;
  const { assoc } = await seedAssociation(db);
  await activity.recordActivity(
    db,
    { associationId: assoc.association_id, observedAt: '2026-10-07T00:00:00Z', activityKind: 'DISCOVERED', outcome: 'CONFIRMED', reasonCode: 'NONE' },
    AUDIT,
  );
  await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  const bundle = await activity.getAssociationAuditBundle(db, assoc.association_id);
  assert.ok(bundle.association);
  assert.ok(bundle.endpoint);
  assert.ok(bundle.actor);
  assert.equal(bundle.activities.length, 1);
  assert.equal(bundle.ingestabilityHistory.length, 1);
  assert.equal(bundle.latestIngestability?.status, 'INGESTABLE');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds`).get().c, feedsBefore);
});

// No source items, no briefs, no scheduler surface from D3 writes.
test('d3 writes create no items, briefs, or scheduler surface', async () => {
  const { sqlite, db } = openDb();
  const itemsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c;
  const briefsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM approved_briefs`).get().c;
  const { assoc } = await seedAssociation(db);
  await activity.recordActivity(
    db,
    { associationId: assoc.association_id, observedAt: '2026-10-07T00:00:00Z', activityKind: 'CHECKED', outcome: 'CONFIRMED', reasonCode: 'NONE' },
    AUDIT,
  );
  await activity.evaluateIngestability(db, assoc.association_id, GOOD, AUDIT);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, itemsBefore);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM approved_briefs`).get().c, briefsBefore);
  assert.ok(!tableNames(sqlite).some((t) => /schedul|cron|poll/i.test(t)));
});

// D3 creates no protocol entities (scoped to its own DDL).
test('d3 creates no protocol entities', async () => {
  const ddl35 = readFileSync('migrations/0035_doctor_source_activity_audit.sql', 'utf8');
  const created35 = [...ddl35.replace(/--.*$/gm, '').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
  assert.deepEqual(created35.sort(), ['actor_source_activity', 'actor_source_ingestability']);
});

// Migration applies cleanly in sequence.
test('migration 0035 applies cleanly after 0034', async () => {
  const { sqlite } = openDb();
  const names = tableNames(sqlite);
  assert.ok(names.includes('actor_source_activity'));
  assert.ok(names.includes('actor_source_ingestability'));
});
