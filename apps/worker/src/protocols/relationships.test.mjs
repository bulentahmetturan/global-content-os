// P4 actor ↔ protocol relationship acceptance: structural edges with optional
// version scope, fail-closed duplicates and cross-version guards, deterministic
// queries, endpoint preservation. Ephemeral node:sqlite only. Actor fixtures
// are synthetic test-local rows (raw inserts, no Doctor module dependency);
// no real-world assertion is seeded anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-rel-endpoints');
const rels = await bundle('apps/worker/src/protocols/relationships.ts', 'protocol-relationships');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

/** Synthetic actor fixture (raw row; Doctor identity semantics untouched). */
function insertActor(sqlite, id, name, norm) {
  sqlite.prepare(
    `INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
     VALUES (?, ?, ?, 'GLOBAL_EXPERT_PANEL', 'test:p4', 'P4 fixture')`,
  ).run(id, name, norm);
}

async function version(db, versionId, protocolId, seq) {
  return protocols.createProtocolVersion(db, { version_id: versionId, protocol_id: protocolId, version_seq: seq });
}

function edge(db, id, actorId, protocolId, type, versionId = null) {
  return rels.createActorProtocolRelationship(db, {
    relationship_id: id, actor_id: actorId, protocol_id: protocolId,
    protocol_version_id: versionId, relationship_type: type,
  });
}

// ---- BASIC EDGE TESTS ----

test('relationship receives the caller-supplied stable unique ID', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  const created = await edge(db, 'apr_stable_1', 'actor_test_one', 'dash-eating-plan', 'PRACTITIONER');
  assert.equal(created.relationship_id, 'apr_stable_1');
  assert.ok((await rels.getActorProtocolRelationship(db, 'apr_stable_1')) !== null);
  assert.equal(await rels.getActorProtocolRelationship(db, 'apr_missing'), null);
});

test('relationship roundtrip points at the correct endpoints', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  const created = await edge(db, 'apr_basic', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER');
  assert.equal(created.actor_id, 'actor_test_one');
  assert.equal(created.protocol_id, 'mediterranean-diet');
  assert.equal(created.protocol_version_id, null);
  assert.equal(created.relationship_type, 'RESEARCHER');
  const got = await rels.getActorProtocolRelationship(db, 'apr_basic');
  assert.deepEqual(got, created);
});

test('invalid actor FK fails', async () => {
  const { db } = openDb();
  await assert.rejects(
    () => edge(db, 'apr_bad_actor', 'actor_no_such', 'mediterranean-diet', 'RESEARCHER'),
  );
});

test('invalid protocol FK fails', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await assert.rejects(
    () => edge(db, 'apr_bad_proto', 'actor_test_one', 'no-such-protocol', 'RESEARCHER'),
  );
});

test('relationship identity keys immutable', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await edge(db, 'apr_imm', 'actor_test_one', 'mediterranean-diet', 'COMMENTATOR');
  assert.throws(
    () => sqlite.prepare(`UPDATE actor_protocol_relationships SET relationship_id = 'apr_x' WHERE relationship_id = 'apr_imm'`).run(),
    /RELATIONSHIP_KEYS_IMMUTABLE/,
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE actor_protocol_relationships SET relationship_type = 'CREATOR' WHERE relationship_id = 'apr_imm'`).run(),
    /RELATIONSHIP_KEYS_IMMUTABLE/,
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE actor_protocol_relationships SET protocol_id = 'dash-eating-plan' WHERE relationship_id = 'apr_imm'`).run(),
    /RELATIONSHIP_KEYS_IMMUTABLE/,
  );
});

// ---- VERSION-SCOPED EDGE TESTS ----

test('actor can be linked to a specific protocol version', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  const e = await edge(db, 'apr_scoped', 'actor_test_one', 'mediterranean-diet', 'CONTRIBUTOR', 'med-v1');
  assert.equal(e.protocol_version_id, 'med-v1');
  const scoped = await rels.listProtocolVersionActors(db, 'med-v1');
  assert.deepEqual(scoped.map((r) => r.relationship_id), ['apr_scoped']);
});

test('cross-version/cross-protocol mismatch fails closed', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await assert.rejects(
    () => edge(db, 'apr_cross', 'actor_test_one', 'dash-eating-plan', 'CONTRIBUTOR', 'med-v1'),
    /RELATIONSHIP_VERSION_PROTOCOL_MISMATCH/,
  );
});

test('cross-version mismatch fails at SQL level bypassing the API', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO actor_protocol_relationships (relationship_id, actor_id, protocol_id, protocol_version_id, relationship_type)
       VALUES ('apr_cross_sql', 'actor_test_one', 'dash-eating-plan', 'med-v1', 'CONTRIBUTOR')`,
    ).run(),
  );
});

test('edge to nonexistent version fails', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await assert.rejects(
    () => edge(db, 'apr_ghost', 'actor_test_one', 'mediterranean-diet', 'CONTRIBUTOR', 'no-such-version'),
    /RELATIONSHIP_VERSION_NOT_FOUND/,
  );
});

test('historical version may receive an edge without disturbing latest', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await version(db, 'med-v2', 'mediterranean-diet', 2);
  await edge(db, 'apr_hist', 'actor_test_one', 'mediterranean-diet', 'CREATOR', 'med-v1');
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v2');
  assert.deepEqual((await protocols.listProtocolVersions(db, 'mediterranean-diet')).map((v) => v.version_id), ['med-v1', 'med-v2']);
});

// ---- UNIQUENESS TESTS ----

test('exact duplicate protocol-wide edge fails', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await edge(db, 'apr_dup1', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER');
  await assert.rejects(
    () => edge(db, 'apr_dup2', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER'),
    /UNIQUE/,
  );
});

test('exact duplicate version-specific edge fails', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await edge(db, 'apr_dup1', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v1');
  await assert.rejects(
    () => edge(db, 'apr_dup2', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v1'),
    /UNIQUE/,
  );
});

test('different relationship types may coexist in the same scope', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await edge(db, 'apr_r1', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER');
  await edge(db, 'apr_r2', 'actor_test_one', 'mediterranean-diet', 'COMMENTATOR');
  const list = await rels.listActorProtocolRelationships(db, 'actor_test_one');
  assert.equal(list.length, 2);
});

test('same type on different versions may coexist; wide and scoped may coexist', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await version(db, 'med-v2', 'mediterranean-diet', 2);
  await edge(db, 'apr_wide', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER');
  await edge(db, 'apr_s1', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v1');
  await edge(db, 'apr_s2', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v2');
  assert.equal((await rels.listActorProtocolRelationships(db, 'actor_test_one')).length, 3);
});

// ---- QUERY TESTS ----

test('list relationships for actor is deterministic across repeats', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  insertActor(sqlite, 'actor_test_two', 'Test Actor Two', 'test actor two');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await edge(db, 'apr_q3', 'actor_test_one', 'dash-eating-plan', 'COMMENTATOR');
  await edge(db, 'apr_q1', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER');
  await edge(db, 'apr_q2', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v1');
  const first = await rels.listActorProtocolRelationships(db, 'actor_test_one');
  const second = await rels.listActorProtocolRelationships(db, 'actor_test_one');
  assert.deepEqual(first.map((r) => r.relationship_id), second.map((r) => r.relationship_id));
  assert.deepEqual(first.map((r) => r.relationship_id), ['apr_q3', 'apr_q1', 'apr_q2']);
  assert.equal((await rels.listActorProtocolRelationships(db, 'actor_test_one', 'RESEARCHER')).length, 2);
});

test('list actors for protocol excludes other protocols and versions', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await edge(db, 'apr_p1', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER');
  await edge(db, 'apr_p2', 'actor_test_one', 'dash-eating-plan', 'RESEARCHER');
  await edge(db, 'apr_p3', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v1');
  assert.deepEqual(
    (await rels.listProtocolActors(db, 'mediterranean-diet')).map((r) => r.relationship_id).sort(),
    ['apr_p1', 'apr_p3'],
  );
  assert.deepEqual((await rels.listProtocolVersionActors(db, 'med-v1')).map((r) => r.relationship_id), ['apr_p3']);
  assert.deepEqual((await rels.listProtocolVersionActors(db, 'med-v9-missing')).length, 0);
});

// ---- IDENTITY / REGRESSION TESTS ----

test('endpoint identities unchanged by edge lifecycle', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  const actorBefore = sqlite.prepare('SELECT * FROM actors WHERE actor_id = ?').get('actor_test_one');
  const protoBefore = await protocols.getProtocol(db, 'mediterranean-diet');
  await edge(db, 'apr_lc', 'actor_test_one', 'mediterranean-diet', 'PRACTITIONER', 'med-v1');
  await rels.setRelationshipActiveStatus(db, 'apr_lc', 'INACTIVE');
  assert.deepEqual(sqlite.prepare('SELECT * FROM actors WHERE actor_id = ?').get('actor_test_one'), actorBefore);
  assert.deepEqual(await protocols.getProtocol(db, 'mediterranean-diet'), protoBefore);
  assert.equal((await rels.getActorProtocolRelationship(db, 'apr_lc')).active_status, 'INACTIVE');
});

test('canonical seed count stays 6; nothing canonicalized by relationships', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await edge(db, 'apr_seed', 'actor_test_one', 'mediterranean-diet', 'ASSOCIATED_WITH', 'med-v1');
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
});

test('P2 resolver and family canonical-set behavior unchanged', async () => {
  const { db } = openDb();
  const r = await protocols.resolveProtocol(db, 'DASH');
  assert.equal(r.outcome, 'EXACT_ALIAS');
  assert.deepEqual(
    (await protocols.listFamilyCanonicalProtocols(db, 'cardiometabolic-dietary-patterns')).map((p) => p.protocol_id).sort(),
    ['dash-eating-plan', 'mediterranean-diet'],
  );
});

// ---- SCOPE TESTS ----

test('no claim/evidence/safety/commercial tables introduced', async () => {
  const { sqlite } = openDb();
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  for (const forbidden of ['claims', 'evidence', 'citations', 'safety', 'contraindications', 'adverse_events', 'commercial', 'sponsorships', 'products', 'claim_actor', 'claim_protocol']) {
    assert.ok(!tables.includes(forbidden), `forbidden table present: ${forbidden}`);
  }
  const cols = tableColumns(sqlite, 'actor_protocol_relationships');
  for (const forbidden of ['evidence', 'confidence', 'quote', 'citation', 'safety', 'price', 'product']) {
    assert.ok(!cols.some((c) => c.toLowerCase().includes(forbidden)), `forbidden column present: ${forbidden}`);
  }
});

test('relationship work touches no source, scheduler, brief, or triage state', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await version(db, 'med-v1', 'mediterranean-diet', 1);
  await edge(db, 'apr_scope', 'actor_test_one', 'mediterranean-diet', 'RESEARCHER', 'med-v1');
  assert.deepEqual(sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all(), feedsBefore);
  // Relationship work creates no source items of its own (Wave-1 controlled-import rows excluded by design).
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE COALESCE(discovery_reason, '') != 'protocol-wave-1-dash-controlled-import'`).get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
});
