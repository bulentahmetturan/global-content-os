// D4 Controlled source activation + first real ingestion (sprint D4):
// one explicit activation through the real intake write path, full
// provenance chain, no editorial mutation, failure-path proofs. Ephemeral
// node:sqlite only; no network, no polling, no scheduler, no production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors-d4');
const sources = await bundle('apps/worker/src/actors/sources.ts', 'doctor-sources-d4');
const activity = await bundle('apps/worker/src/actors/activity.ts', 'doctor-activity-d4');

const AUDIT = { by: 'test:d4', reason: 'D4 activation proof fixture' };
const PROOF_FEED_ID = 'doctor_d4_proof_only';

// Controlled source (D4.2): the safest fixture already represented across
// D1–D3 tests. No new person introduced.
const CONTROLLED = {
  actorName: 'Ahmet Ekmekçi',
  panel: 'TURKEY_EXPERT_PANEL',
  channelType: 'OFFICIAL_WEBSITE',
  locator: 'https://ahmetekmekci.com',
  itemUrl: 'https://ahmetekmekci.com/d4-controlled-proof',
  itemTitle: 'D4 kontrollü alım kanıtı: resmî site duyurusu',
};

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

// Proof-only feed carrier in the DISPOSABLE db: explicitly disabled so no
// scheduler would ever select it; it exists only to satisfy the enforced
// source_items.feed_id FK while keeping provenance honest via source_id +
// intake_meta_json + the association audit trail.
function seedProofFeed(sqlite) {
  sqlite
    .prepare(
      `INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, rules_json)
       VALUES (?, 'D4 PROOF ONLY — disposable fixture, not a registry source',
               'tip-ogrencileri', 'tip_toplulugu', 'D4_PROOF', ?, 0, 0, '{}')`,
    )
    .run(PROOF_FEED_ID, CONTROLLED.locator);
}

async function seedControlledAssociation(db) {
  const actor = await actors.createActor(db, { canonicalName: CONTROLLED.actorName, panel: CONTROLLED.panel }, AUDIT);
  const endpoint = await sources.createEndpoint(
    db,
    { channelType: CONTROLLED.channelType, platform: 'web', canonicalLocator: CONTROLLED.locator },
    AUDIT,
  );
  const assoc = await sources.linkActorToSource(
    db,
    { actorId: actor.actor_id, endpointId: endpoint.endpoint_id, associationType: 'OFFICIAL_PERSONAL' },
    AUDIT,
  );
  return { actor, endpoint, assoc };
}

const GOOD_EVIDENCE = {
  supportedType: true,
  reachable: true,
  authorized: true,
  parseable: true,
  observedAt: '2026-10-07T10:00:00Z',
};

function ingestInput(assoc) {
  return {
    associationId: assoc.association_id,
    feedId: PROOF_FEED_ID,
    route: 'tip-ogrencileri',
    channelId: 'tip_toplulugu',
    title: CONTROLLED.itemTitle,
    summary: 'D4 kontrollü alım kanıtı özeti: ham öğe alımı, editoryal üretim değildir.',
    canonicalUrl: CONTROLLED.itemUrl,
    publisher: 'Ahmet Ekmekçi (resmî site)',
    publishedAt: '2026-10-07',
  };
}

// D4.1 + D4.3: explicit activation, then one bounded real ingestion.
test('controlled activation authorizes exactly one real ingestion', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { assoc } = await seedControlledAssociation(db);
  const { evaluation } = await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD_EVIDENCE, AUDIT);
  assert.equal(evaluation.status, 'INGESTABLE');
  assert.ok(evaluation.evaluated_reason.startsWith('CONTROLLED_ACTIVATION:'));
  const result = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  assert.ok(result.itemId);
  assert.equal(result.created, true);
  const item = sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(result.itemId);
  assert.equal(item.triage_status, 'inbox');
  assert.equal(item.route, 'tip-ogrencileri');
  const meta = JSON.parse(item.intake_meta_json);
  assert.equal(meta.doctor_association_id, assoc.association_id);
  assert.equal(meta.doctor_activation_evaluation_id, evaluation.evaluation_id);
});

// D4.4 provenance gate: all ten questions answerable from stored rows.
test('provenance chain answers who/what/when/why from stored rows', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { actor, endpoint, assoc } = await seedControlledAssociation(db);
  const { evaluation } = await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD_EVIDENCE, AUDIT);
  const result = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  const item = sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(result.itemId);
  // 1+2. Which source/endpoint produced the item?
  assert.equal(item.source_id, endpoint.endpoint_id);
  assert.equal(item.canonical_url, CONTROLLED.itemUrl);
  // 3. Which association was responsible?
  assert.equal(JSON.parse(item.intake_meta_json).doctor_association_id, assoc.association_id);
  // 4+5. Was it ingestable at ingestion time, and why?
  assert.equal(result.activation.status, 'INGESTABLE');
  assert.equal(result.activation.reason_code, 'NONE');
  // 6+7. Which audit event preceded ingestion, and when?
  const acts = await activity.listActivityForAssociation(db, assoc.association_id);
  assert.ok(acts.some((a) => JSON.parse(a.tech_metadata_json ?? '{}').controlled_activation === true));
  assert.ok(acts.some((a) => JSON.parse(a.tech_metadata_json ?? '{}').source_item_id === result.itemId));
  // 8. Prior state reconstructible from append-only history.
  const history = await activity.listIngestabilityHistory(db, assoc.association_id);
  assert.ok(history.length >= 1);
  assert.equal(history[history.length - 1].evaluation_id, result.activation.evaluation_id);
  // 10. Shared-source support intact (no global ownership table/flag).
  const bundle = await activity.getAssociationAuditBundle(db, assoc.association_id);
  assert.equal(bundle.actor?.actor_id, actor.actor_id);
  assert.equal(bundle.endpoint?.endpoint_id, endpoint.endpoint_id);
});

// D4.5: raw item created, zero editorial mutation.
test('ingestion creates raw item only, never editorial output', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { assoc } = await seedControlledAssociation(db);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD_EVIDENCE, AUDIT);
  const result = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items WHERE triage_status = 'production'`).get().c, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM approved_briefs`).get().c, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM editorial_decisions`).get().c, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM production_status`).get().c, 0);
  assert.ok(result.itemId);
});

// D4.6: non-ingestable association rejects ingestion with nothing written.
test('inactive non-ingestable association rejects ingestion', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { assoc } = await seedControlledAssociation(db);
  const itemsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c;
  await assert.rejects(activity.ingestOneItem(db, ingestInput(assoc), AUDIT), /INGESTION_NOT_AUTHORIZED/);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, itemsBefore);
});

// D4.6: verification alone cannot authorize ingestion.
test('verification alone cannot authorize ingestion', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { assoc } = await seedControlledAssociation(db);
  await sources.updateVerificationStatus(db, assoc.association_id, 'VERIFIED', AUDIT);
  await assert.rejects(activity.ingestOneItem(db, ingestInput(assoc), AUDIT), /INGESTION_NOT_AUTHORIZED/);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, 0);
});

// D4.6: actor active status alone cannot authorize ingestion.
test('actor active status alone cannot authorize ingestion', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { actor, assoc } = await seedControlledAssociation(db);
  assert.equal((await actors.getActor(db, actor.actor_id))?.active_status, 'ACTIVE');
  await assert.rejects(activity.ingestOneItem(db, ingestInput(assoc), AUDIT), /INGESTION_NOT_AUTHORIZED/);
});

// Active/inactive independence, both directions: an INACTIVE actor's
// explicitly activated association still ingests (no coupling either way).
test('inactivation of the actor does not block an activated ingestion', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { actor, assoc } = await seedControlledAssociation(db);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD_EVIDENCE, AUDIT);
  sqlite.prepare(`UPDATE actors SET active_status = 'INACTIVE' WHERE actor_id = ?`).run(actor.actor_id);
  const result = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  assert.ok(result.itemId);
});

// D4.6: ingestion without a valid association cannot bypass provenance.
test('ingestion without a valid association is impossible', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  await seedControlledAssociation(db);
  await assert.rejects(
    activity.ingestOneItem(db, { ...ingestInput({ association_id: 'assoc_does_not_exist' }), associationId: 'assoc_does_not_exist' }, AUDIT),
    /unknown association/,
  );
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, 0);
});

// D4.6: disabling prevents the next ingestion; history stays observable.
test('disable after ingest blocks retry while preserving history', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { assoc } = await seedControlledAssociation(db);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD_EVIDENCE, AUDIT);
  const first = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  await activity.deactivateAssociation(db, assoc.association_id, AUDIT, { observedAt: '2026-10-07T11:00:00Z' });
  assert.equal((await activity.getLatestIngestability(db, assoc.association_id))?.status, 'NOT_INGESTABLE');
  await assert.rejects(activity.ingestOneItem(db, ingestInput(assoc), AUDIT), /INGESTION_NOT_AUTHORIZED/);
  // Prior ingestion + full audit trail remain queryable.
  assert.ok(sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(first.itemId));
  assert.equal((await activity.listIngestabilityHistory(db, assoc.association_id)).length, 2);
  assert.ok((await activity.listActivityForAssociation(db, assoc.association_id)).length >= 3);
  // Re-activation is a new explicit act, restoring the path.
  await activity.activateAssociationForIngestion(
    db,
    assoc.association_id,
    { ...GOOD_EVIDENCE, observedAt: '2026-10-07T12:00:00Z' },
    AUDIT,
  );
  const retry = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  assert.equal(retry.itemId, first.itemId);
  assert.equal(retry.deduped, true);
});

// D4.6: duplicate execution follows the existing idempotency contract.
test('repeated ingestion deduplicates to the same item', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const { assoc } = await seedControlledAssociation(db);
  await activity.activateAssociationForIngestion(db, assoc.association_id, GOOD_EVIDENCE, AUDIT);
  const first = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  const second = await activity.ingestOneItem(db, ingestInput(assoc), AUDIT);
  assert.equal(second.itemId, first.itemId);
  assert.equal(second.deduped, true);
  const key = sqlite.prepare(`SELECT dedupe_key FROM source_items WHERE id = ?`).get(first.itemId).dedupe_key;
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items WHERE dedupe_key = ?`).get(key).c, 1);
});

// D4.6: shared source never becomes globally owned by one association.
test('shared endpoint ingestion attributes to one association only', async () => {
  const { sqlite, db } = openDb();
  seedProofFeed(sqlite);
  const a1 = await actors.createActor(db, { canonicalName: 'Derya Uludüz', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const a2 = await actors.createActor(db, { canonicalName: 'Zeynep Tartan', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'INSTITUTIONAL_PROFILE', platform: 'web', canonicalLocator: 'https://hospital.example.com/team' },
    AUDIT,
  );
  const s1 = await sources.linkActorToSource(db, { actorId: a1.actor_id, endpointId: ep.endpoint_id, associationType: 'INSTITUTIONAL_PROFILE' }, AUDIT);
  const s2 = await sources.linkActorToSource(db, { actorId: a2.actor_id, endpointId: ep.endpoint_id, associationType: 'INSTITUTIONAL_PROFILE' }, AUDIT);
  await activity.activateAssociationForIngestion(db, s1.association_id, GOOD_EVIDENCE, AUDIT);
  const result = await activity.ingestOneItem(
    db,
    { ...ingestInput(s1), canonicalUrl: 'https://hospital.example.com/team/d4-proof', title: 'D4 kanıtı: kurum ekip sayfası duyurusu', publisher: 'Örnek Hastane' },
    AUDIT,
  );
  assert.equal(JSON.parse(sqlite.prepare(`SELECT intake_meta_json AS m FROM source_items WHERE id = ?`).get(result.itemId).m).doctor_association_id, s1.association_id);
  assert.equal((await activity.listActivityForAssociation(db, s2.association_id)).length, 0);
  assert.equal(await activity.getLatestIngestability(db, s2.association_id), null);
});

// D4.6 + person/brand: brand association untouched by personal ingestion.
test('personal ingestion leaves the brand association untouched', async () => {
  const { db } = openDb();
  const person = await actors.createActor(db, { canonicalName: 'Rhonda Patrick', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  const personal = await sources.createEndpoint(db, { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: '@rhondapatrick' }, AUDIT);
  const brand = await sources.createEndpoint(db, { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://foundmyfitness.com' }, AUDIT);
  const pAssoc = await sources.linkActorToSource(db, { actorId: person.actor_id, endpointId: personal.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT);
  const bAssoc = await sources.linkActorToSource(db, { actorId: person.actor_id, endpointId: brand.endpoint_id, associationType: 'OFFICIAL_BRAND' }, AUDIT);
  await activity.activateAssociationForIngestion(db, pAssoc.association_id, GOOD_EVIDENCE, AUDIT);
  assert.ok((await activity.getLatestIngestability(db, pAssoc.association_id))?.evaluated_reason.startsWith('CONTROLLED_ACTIVATION:'));
  assert.equal(await activity.getLatestIngestability(db, bAssoc.association_id), null);
});

// D4 needs no new migration: doctor file set is exactly 0031/0032/0035.
test('d4 requires no new migration', async () => {
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  const doctorFiles = files.filter((n) => n.includes('_doctor_'));
  assert.deepEqual(doctorFiles, [
    '0031_doctor_actor_registry.sql',
    '0032_doctor_actor_sources.sql',
    '0035_doctor_source_activity_audit.sql',
  ]);
});
