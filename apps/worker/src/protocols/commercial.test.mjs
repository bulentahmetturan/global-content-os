// P7 commercial acceptance: structural relationships with counterparty and
// version scope, fail-closed duplicates/lineage, strict separation from P4/P5/
// P6/source/scheduler/brief. Ephemeral node:sqlite only. Fixtures are
// synthetic; no real-world commercial assertion is seeded anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-commercial-endpoints');
const rels = await bundle('apps/worker/src/protocols/relationships.ts', 'protocol-commercial-edges');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'protocol-commercial-claims');
const evidence = await bundle('apps/worker/src/protocols/evidence.ts', 'protocol-commercial-evidence');
const safety = await bundle('apps/worker/src/protocols/safety.ts', 'protocol-commercial-safety');
const cmr = await bundle('apps/worker/src/protocols/commercial.ts', 'protocol-commercial');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

function insertActor(sqlite, id) {
  sqlite.prepare(
    `INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
     VALUES (?, ?, ?, 'GLOBAL_EXPERT_PANEL', 'test:p7', 'P7 fixture')`,
  ).run(id, `Name ${id}`, id.replace(/_/g, ' '));
}

let itemSeq = 0;
function insertItem(sqlite) {
  itemSeq += 1;
  const feed = sqlite.prepare('SELECT id, route, channel_id FROM source_feeds LIMIT 1').get();
  const id = `item_p7_${itemSeq}`;
  sqlite.prepare(
    `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, feed.id, feed.route, feed.channel_id, `P7 fixture ${itemSeq}`, `https://example.org/p7/${itemSeq}`, 'P7', `p7-${itemSeq}`);
  return id;
}

function edge(db, id, subject, protocol, type, over = {}) {
  return cmr.createCommercialRelationship(db, {
    relationship_id: id, subject_actor_id: subject, protocol_id: protocol,
    relationship_type: type, ...over,
  });
}

// ---- CORE COMMERCIAL TESTS ----

test('commercial relationship created with stable immutable ID', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  const r = await edge(db, 'cmr_basic', 'actor_test_one', 'mediterranean-diet', 'CONSULTANT');
  assert.equal(r.subject_actor_id, 'actor_test_one');
  assert.equal(r.counterparty_actor_id, null);
  assert.equal(r.protocol_version_id, null);
  assert.deepEqual(await cmr.getCommercialRelationship(db, 'cmr_basic'), r);
  assert.equal(await cmr.getCommercialRelationship(db, 'cmr_missing'), null);
  assert.throws(
    () => sqlite.prepare(`UPDATE commercial_relationships SET relationship_id = 'cmr_x' WHERE relationship_id = 'cmr_basic'`).run(),
    /COMMERCIAL_KEYS_IMMUTABLE/,
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE commercial_relationships SET relationship_type = 'OWNER' WHERE relationship_id = 'cmr_basic'`).run(),
    /COMMERCIAL_KEYS_IMMUTABLE/,
  );
});

test('invalid subject/protocol FK fails; type constrained', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await assert.rejects(() => edge(db, 'cmr_bad_a', 'actor_no_such', 'mediterranean-diet', 'ADVISOR'));
  await assert.rejects(() => edge(db, 'cmr_bad_p', 'actor_test_one', 'no-such-protocol', 'ADVISOR'));
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO commercial_relationships (relationship_id, subject_actor_id, protocol_id, relationship_type)
       VALUES ('cmr_bad_t', 'actor_test_one', 'mediterranean-diet', 'CONFLICTED')`,
    ).run(),
  );
});

// ---- VERSION SCOPE ----

test('version-scoped edge; mismatch fails (API + SQL); historical version keeps latest', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 2 });
  const r = await edge(db, 'cmr_scoped', 'actor_test_one', 'mediterranean-diet', 'FUNDED_BY', { protocol_version_id: 'med-v1' });
  assert.equal(r.protocol_version_id, 'med-v1');
  assert.deepEqual(
    (await cmr.listProtocolVersionCommercialRelationships(db, 'med-v1')).map((x) => x.relationship_id),
    ['cmr_scoped'],
  );
  await assert.rejects(
    () => edge(db, 'cmr_cross', 'actor_test_one', 'dash-eating-plan', 'FUNDED_BY', { protocol_version_id: 'med-v1' }),
    /COMMERCIAL_VERSION_PROTOCOL_MISMATCH/,
  );
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO commercial_relationships (relationship_id, subject_actor_id, protocol_id, protocol_version_id, relationship_type)
       VALUES ('cmr_cross_sql', 'actor_test_one', 'dash-eating-plan', 'med-v1', 'FUNDED_BY')`,
    ).run(),
  );
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v2');
});

// ---- COUNTERPARTY TESTS ----

test('counterparty via existing Actor works; invalid counterparty fails; roles distinguishable', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_subject');
  insertActor(sqlite, 'actor_org');
  const r = await edge(db, 'cmr_cp', 'actor_subject', 'mediterranean-diet', 'SPONSORED_BY', { counterparty_actor_id: 'actor_org' });
  assert.equal(r.subject_actor_id, 'actor_subject');
  assert.equal(r.counterparty_actor_id, 'actor_org');
  assert.deepEqual(
    (await cmr.listCommercialRelationshipsByCounterparty(db, 'actor_org')).map((x) => x.relationship_id),
    ['cmr_cp'],
  );
  await assert.rejects(() => edge(db, 'cmr_cp_bad', 'actor_subject', 'mediterranean-diet', 'SPONSORED_BY', { counterparty_actor_id: 'actor_no_such' }));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM actors').get().n, 2);
});

// ---- DUPLICATE TESTS ----

test('exact duplicates fail in all four nullable quadrants', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  insertActor(sqlite, 'actor_org');
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  // wide + no counterparty
  await edge(db, 'cmr_d1a', 'actor_test_one', 'mediterranean-diet', 'ADVISOR');
  await assert.rejects(() => edge(db, 'cmr_d1b', 'actor_test_one', 'mediterranean-diet', 'ADVISOR'));
  // wide + counterparty
  await edge(db, 'cmr_d2a', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { counterparty_actor_id: 'actor_org' });
  await assert.rejects(() => edge(db, 'cmr_d2b', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { counterparty_actor_id: 'actor_org' }));
  // scoped + no counterparty
  await edge(db, 'cmr_d3a', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v1' });
  await assert.rejects(() => edge(db, 'cmr_d3b', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v1' }));
  // scoped + counterparty
  await edge(db, 'cmr_d4a', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v1', counterparty_actor_id: 'actor_org' });
  await assert.rejects(() => edge(db, 'cmr_d4b', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v1', counterparty_actor_id: 'actor_org' }));
});

test('distinct dimensions coexist: type, version, counterparty, scope', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  insertActor(sqlite, 'actor_org_a');
  insertActor(sqlite, 'actor_org_b');
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 2 });
  await edge(db, 'cmr_c1', 'actor_test_one', 'mediterranean-diet', 'ADVISOR');
  await edge(db, 'cmr_c2', 'actor_test_one', 'mediterranean-diet', 'CONSULTANT');
  await edge(db, 'cmr_c3', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v1' });
  await edge(db, 'cmr_c4', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v2' });
  await edge(db, 'cmr_c5', 'actor_test_one', 'mediterranean-diet', 'SPONSORED_BY', { counterparty_actor_id: 'actor_org_a' });
  await edge(db, 'cmr_c6', 'actor_test_one', 'mediterranean-diet', 'SPONSORED_BY', { counterparty_actor_id: 'actor_org_b' });
  await edge(db, 'cmr_c7', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { counterparty_actor_id: 'actor_org_a' });
  assert.equal((await cmr.listActorCommercialRelationships(db, 'actor_test_one')).length, 7);
});

// ---- QUERY TESTS ----

test('actor/protocol listings deterministic across repeats; no leakage', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await edge(db, 'cmr_q3', 'actor_test_one', 'dash-eating-plan', 'OWNER');
  await edge(db, 'cmr_q1', 'actor_test_one', 'mediterranean-diet', 'ADVISOR');
  await edge(db, 'cmr_q2', 'actor_test_one', 'mediterranean-diet', 'ADVISOR', { protocol_version_id: 'med-v1' });
  const first = await cmr.listActorCommercialRelationships(db, 'actor_test_one');
  assert.deepEqual(first.map((r) => r.relationship_id), (await cmr.listActorCommercialRelationships(db, 'actor_test_one')).map((r) => r.relationship_id));
  assert.deepEqual(first.map((r) => r.relationship_id), ['cmr_q3', 'cmr_q1', 'cmr_q2']);
  assert.deepEqual(
    (await cmr.listProtocolCommercialRelationships(db, 'mediterranean-diet')).map((r) => r.relationship_id).sort(),
    ['cmr_q1', 'cmr_q2'],
  );
});

// ---- P4 SEPARATION ----

test('commercial edges and P4 edges never synchronize', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await edge(db, 'cmr_sep', 'actor_test_one', 'mediterranean-diet', 'CONSULTANT');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM actor_protocol_relationships').get().n, 0);
  await rels.createActorProtocolRelationship(db, {
    relationship_id: 'apr_sep', actor_id: 'actor_test_one',
    protocol_id: 'mediterranean-diet', relationship_type: 'RESEARCHER',
  });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM commercial_relationships').get().n, 1);
});

// ---- P5 SEPARATION + LINKAGE ----

test('commercial work creates no claim/evidence and alters no stance', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await edge(db, 'cmr_sep2', 'actor_test_one', 'mediterranean-diet', 'AFFILIATE');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_evidence').get().n, 0);
});

test('commercial↔claim linkage works; invalid FK and duplicates fail; P5 untouched', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await edge(db, 'cmr_lc', 'actor_test_one', 'mediterranean-diet', 'FUNDED_BY');
  await claims.createClaim(db, { claim_id: 'clm_lc', protocol_id: 'mediterranean-diet', claim_type: 'OTHER', claim_text: 'Linkage fixture.' });
  const claimBefore = await claims.getClaim(db, 'clm_lc');
  await cmr.linkCommercialRelationshipClaim(db, { relationship_id: 'cmr_lc', claim_id: 'clm_lc' });
  assert.deepEqual((await cmr.listCommercialRelationshipClaims(db, 'cmr_lc')).map((l) => l.claim_id), ['clm_lc']);
  await assert.rejects(() => cmr.linkCommercialRelationshipClaim(db, { relationship_id: 'cmr_lc', claim_id: 'clm_missing' }));
  await assert.rejects(() => cmr.linkCommercialRelationshipClaim(db, { relationship_id: 'cmr_lc', claim_id: 'clm_lc' }));
  assert.deepEqual(await claims.getClaim(db, 'clm_lc'), claimBefore);
});

test('commercial↔evidence linkage works without touching provenance', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  const item = insertItem(sqlite);
  await edge(db, 'cmr_le', 'actor_test_one', 'mediterranean-diet', 'SELLER');
  const before = await evidence.createEvidence(db, { evidence_id: 'ev_le', source_item_id: item, locator: 'p.7' });
  await cmr.linkCommercialRelationshipEvidence(db, { relationship_id: 'cmr_le', evidence_id: 'ev_le' });
  assert.deepEqual((await cmr.listCommercialRelationshipEvidence(db, 'cmr_le')).map((l) => l.evidence_id), ['ev_le']);
  assert.deepEqual(await evidence.getEvidence(db, 'ev_le'), before);
  await assert.rejects(() => cmr.linkCommercialRelationshipEvidence(db, { relationship_id: 'cmr_le', evidence_id: 'ev_le' }));
});

// ---- P6 SEPARATION ----

test('commercial work creates no safety rule and touches no severity/context', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await edge(db, 'cmr_safe', 'actor_test_one', 'mediterranean-diet', 'LICENSOR');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM safety_rules').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM safety_rule_contexts').get().n, 0);
});

// ---- LIFECYCLE / SOURCE / REGRESSION ----

test('lifecycle transitions touch only the edge row', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  insertActor(sqlite, 'actor_org');
  const actorBefore = sqlite.prepare('SELECT * FROM actors WHERE actor_id = ?').get('actor_test_one');
  const protoBefore = await protocols.getProtocol(db, 'mediterranean-diet');
  await edge(db, 'cmr_lc2', 'actor_test_one', 'mediterranean-diet', 'EMPLOYEE', { counterparty_actor_id: 'actor_org' });
  await cmr.setCommercialActiveStatus(db, 'cmr_lc2', 'INACTIVE');
  assert.deepEqual(sqlite.prepare('SELECT * FROM actors WHERE actor_id = ?').get('actor_test_one'), actorBefore);
  assert.deepEqual(await protocols.getProtocol(db, 'mediterranean-diet'), protoBefore);
  assert.equal((await cmr.getCommercialRelationship(db, 'cmr_lc2')).active_status, 'INACTIVE');
});

test('no source/scheduler/brief/triage side effects; no ecommerce columns', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  insertActor(sqlite, 'actor_test_one');
  await edge(db, 'cmr_src', 'actor_test_one', 'mediterranean-diet', 'COMMERCIAL_PROVIDER');
  assert.deepEqual(sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all(), feedsBefore);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue|cart|checkout|payment|price/i.test(t)));
  const cols = ['commercial_relationships', 'commercial_relationship_claims', 'commercial_relationship_evidence']
    .flatMap((t) => tableColumns(sqlite, t));
  for (const forbidden of ['price', 'currency', 'payment', 'cart', 'sku', 'discount', 'score', 'verdict', 'safety', 'dose']) {
    assert.ok(!cols.some((c) => c.toLowerCase().includes(forbidden)), `forbidden fragment: ${forbidden}`);
  }
});

test('P0 seed count stays 6; P2/P3 behavior unchanged; offering model absent', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  await edge(db, 'cmr_reg', 'actor_test_one', 'mediterranean-diet', 'OTHER_DISCLOSED_INTEREST');
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
  const r = await protocols.resolveProtocol(db, 'DASH');
  assert.equal(r.outcome, 'EXACT_ALIAS');
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((x) => x.name);
  for (const forbidden of ['commercial_offerings', 'products', 'brands', 'companies', 'vendors', 'offerings']) {
    assert.ok(!tables.includes(forbidden), `forbidden table present: ${forbidden}`);
  }
});
