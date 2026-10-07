// P5 claim / evidence / provenance acceptance: traceable structure only,
// disagreement preserved, no truth inferred. Ephemeral node:sqlite only.
// Fixtures are synthetic test-local rows; no real-world assertion is seeded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-claim-endpoints');
const rels = await bundle('apps/worker/src/protocols/relationships.ts', 'protocol-claim-edges');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'protocol-claims');
const evidence = await bundle('apps/worker/src/protocols/evidence.ts', 'protocol-evidence');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

function insertActor(sqlite, id, name, norm) {
  sqlite.prepare(
    `INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
     VALUES (?, ?, ?, 'GLOBAL_EXPERT_PANEL', 'test:p5', 'P5 fixture')`,
  ).run(id, name, norm);
}

let itemSeq = 0;
function insertItem(sqlite) {
  itemSeq += 1;
  const feed = sqlite.prepare('SELECT id, route, channel_id FROM source_feeds LIMIT 1').get();
  const id = `item_p5_${itemSeq}`;
  sqlite.prepare(
    `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, feed.id, feed.route, feed.channel_id, `P5 fixture ${itemSeq}`, `https://example.org/p5/${itemSeq}`, 'P5', `p5-${itemSeq}`);
  return id;
}

function claim(db, id, over = {}) {
  return claims.createClaim(db, {
    claim_id: id, protocol_id: 'mediterranean-diet', claim_type: 'OUTCOME',
    claim_text: `Neutral fixture proposition ${id}.`, ...over,
  });
}

// ---- CLAIM TESTS ----

test('protocol-wide claim can be created with immutable ID', async () => {
  const { db } = openDb();
  const c = await claim(db, 'clm_wide');
  assert.equal(c.protocol_id, 'mediterranean-diet');
  assert.equal(c.protocol_version_id, null);
  assert.deepEqual(await claims.getClaim(db, 'clm_wide'), c);
});

test('version-specific claim can be created; invalid protocol fails', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  const c = await claim(db, 'clm_ver', { protocol_version_id: 'med-v1' });
  assert.equal(c.protocol_version_id, 'med-v1');
  await assert.rejects(() => claim(db, 'clm_bad', { protocol_id: 'no-such-protocol' }));
});

test('version/protocol mismatch fails closed', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await assert.rejects(
    () => claim(db, 'clm_mm', { protocol_id: 'dash-eating-plan', protocol_version_id: 'med-v1' }),
    /CLAIM_LINEAGE_MISMATCH/,
  );
});

test('version/protocol mismatch fails at SQL level bypassing the API', async () => {
  const { sqlite, db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocol_claims (claim_id, protocol_id, protocol_version_id, claim_type, claim_text)
       VALUES ('clm_mm_sql', 'dash-eating-plan', 'med-v1', 'OUTCOME', 'Mismatch.')`,
    ).run(),
  );
});

test('historical version may receive a claim without affecting latest', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 2 });
  await claim(db, 'clm_hist', { protocol_version_id: 'med-v1' });
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v2');
  assert.deepEqual((await claims.listProtocolVersionClaims(db, 'med-v1')).map((c) => c.claim_id), ['clm_hist']);
  assert.deepEqual(
    (await claims.listProtocolClaims(db, 'mediterranean-diet')).map((c) => c.claim_id).sort(),
    ['clm_hist'],
  );
});

test('claim scope keys immutable; text editable as metadata', async () => {
  const { sqlite, db } = openDb();
  await claim(db, 'clm_keys');
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_claims SET protocol_id = 'dash-eating-plan' WHERE claim_id = 'clm_keys'`).run(),
    /CLAIM_KEYS_IMMUTABLE/,
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_claims SET claim_type = 'MECHANISM' WHERE claim_id = 'clm_keys'`).run(),
    /CLAIM_KEYS_IMMUTABLE/,
  );
  sqlite.prepare(`UPDATE protocol_claims SET claim_text = 'Edited fixture.' WHERE claim_id = 'clm_keys'`).run();
  assert.equal((await claims.getClaim(db, 'clm_keys')).claim_text, 'Edited fixture.');
});

test('exact duplicate claim (scope+type+text) fails; different text coexists', async () => {
  const { db } = openDb();
  await claim(db, 'clm_dup1', { claim_text: 'Same proposition.' });
  await assert.rejects(
    () => claim(db, 'clm_dup2', { claim_text: 'Same proposition.' }),
    /CLAIM_DUPLICATE/,
  );
  await claim(db, 'clm_dup3', { claim_text: 'Different proposition.' });
  assert.equal((await claims.listProtocolClaims(db, 'mediterranean-diet')).length, 2);
});

test('phase-scoped claim passes when lineage valid; cross-version phase fails', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'fod-v1', protocol_id: 'low-fodmap-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'fod-v2', protocol_id: 'low-fodmap-diet', version_seq: 2 });
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  const c = await claim(db, 'clm_phase', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', phase_id: 'fod-p1' });
  assert.equal(c.phase_id, 'fod-p1');
  assert.deepEqual((await claims.listPhaseClaims(db, 'fod-p1')).map((x) => x.claim_id), ['clm_phase']);
  await assert.rejects(
    () => claim(db, 'clm_phase_x', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v2', phase_id: 'fod-p1' }),
    /CLAIM_LINEAGE_MISMATCH/,
  );
});

test('component-scoped claim passes when lineage valid; cross-version component fails', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'fod-v1', protocol_id: 'low-fodmap-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'fod-v2', protocol_id: 'low-fodmap-diet', version_seq: 2 });
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await protocols.createProtocolComponent(db, { component_id: 'fod-c1', version_id: 'fod-v1', phase_id: 'fod-p1', component_seq: 1, title: 'C' });
  const c = await claim(db, 'clm_comp', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', phase_id: 'fod-p1', component_id: 'fod-c1' });
  assert.equal(c.component_id, 'fod-c1');
  assert.deepEqual((await claims.listComponentClaims(db, 'fod-c1')).map((x) => x.claim_id), ['clm_comp']);
  await assert.rejects(
    () => claim(db, 'clm_comp_x', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v2', component_id: 'fod-c1' }),
    /CLAIM_LINEAGE_MISMATCH/,
  );
});

test('phase scope without version fails closed', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'fod-v1', protocol_id: 'low-fodmap-diet', version_seq: 1 });
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await assert.rejects(
    () => claim(db, 'clm_nov', { protocol_id: 'low-fodmap-diet', phase_id: 'fod-p1' }),
    /CLAIM_LINEAGE_MISMATCH/,
  );
});

// ---- ATTRIBUTION TESTS ----

test('claim can be attributed to an actor; invalid actor fails', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await claim(db, 'clm_attr');
  const a = await claims.createClaimAttribution(db, {
    attribution_id: 'cattr_1', claim_id: 'clm_attr', actor_id: 'actor_test_one', attribution_role: 'AUTHOR',
  });
  assert.equal(a.actor_id, 'actor_test_one');
  assert.deepEqual((await claims.listClaimAttributions(db, 'clm_attr')).map((x) => x.attribution_id), ['cattr_1']);
  await assert.rejects(() => claims.createClaimAttribution(db, {
    attribution_id: 'cattr_x', claim_id: 'clm_attr', actor_id: 'actor_no_such', attribution_role: 'AUTHOR',
  }));
});

test('attribution creates no P4 edge and requires none', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  await claim(db, 'clm_attr2');
  await claims.createClaimAttribution(db, {
    attribution_id: 'cattr_2', claim_id: 'clm_attr2', actor_id: 'actor_test_one', attribution_role: 'SPEAKER',
  });
  // Attribution creates no edge for its own actor (Wave-1 seeded edges excluded by design).
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM actor_protocol_relationships WHERE actor_id = 'actor_test_one'`).get().n, 0);
});

test('exact duplicate attribution fails; different roles coexist deterministically', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  insertActor(sqlite, 'actor_test_two', 'Test Actor Two', 'test actor two');
  await claim(db, 'clm_attr3');
  await claims.createClaimAttribution(db, {
    attribution_id: 'cattr_3a', claim_id: 'clm_attr3', actor_id: 'actor_test_one', attribution_role: 'AUTHOR',
  });
  await assert.rejects(() => claims.createClaimAttribution(db, {
    attribution_id: 'cattr_3b', claim_id: 'clm_attr3', actor_id: 'actor_test_one', attribution_role: 'AUTHOR',
  }));
  await claims.createClaimAttribution(db, {
    attribution_id: 'cattr_3c', claim_id: 'clm_attr3', actor_id: 'actor_test_one', attribution_role: 'COAUTHOR',
  });
  await claims.createClaimAttribution(db, {
    attribution_id: 'cattr_3d', claim_id: 'clm_attr3', actor_id: 'actor_test_two', attribution_role: 'AUTHOR',
  });
  const list = await claims.listClaimAttributions(db, 'clm_attr3');
  assert.deepEqual(list.map((x) => x.attribution_id), ['cattr_3a', 'cattr_3c', 'cattr_3d']);
});

// ---- EVIDENCE TESTS ----

test('evidence has stable ID and references valid provenance', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  const e = await evidence.createEvidence(db, { evidence_id: 'ev_1', source_item_id: item, locator: 'p.42' });
  assert.equal(e.locator, 'p.42');
  assert.deepEqual(await evidence.getEvidence(db, 'ev_1'), e);
  await assert.rejects(() => evidence.createEvidence(db, { evidence_id: 'ev_x', source_item_id: 'no-such-item' }));
});

test('evidence keys immutable; locator editable', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  await evidence.createEvidence(db, { evidence_id: 'ev_1', source_item_id: item });
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_evidence SET source_item_id = 'x' WHERE evidence_id = 'ev_1'`).run(),
    /EVIDENCE_KEYS_IMMUTABLE/,
  );
  sqlite.prepare(`UPDATE protocol_evidence SET locator = 'Fig.2' WHERE evidence_id = 'ev_1'`).run();
  assert.equal((await evidence.getEvidence(db, 'ev_1')).locator, 'Fig.2');
});

test('evidence neither activates nor creates nor alters sources', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  const itemsBefore = sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n;
  const item = insertItem(sqlite);
  await evidence.createEvidence(db, { evidence_id: 'ev_1', source_item_id: item, locator: 'p.1' });
  await evidence.createEvidence(db, { evidence_id: 'ev_2', source_item_id: item, locator: 'p.2' });
  assert.deepEqual(sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all(), feedsBefore);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n, itemsBefore + 1);
  assert.deepEqual(
    (await evidence.listSourceItemEvidence(db, item)).map((e) => e.evidence_id),
    ['ev_1', 'ev_2'],
  );
});

// ---- CLAIM ↔ EVIDENCE TESTS ----

test('one evidence record relates to multiple claims with different directions', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  await claim(db, 'clm_a', { claim_text: 'Proposition A.' });
  await claim(db, 'clm_b', { claim_text: 'Proposition B.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_1', source_item_id: item });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_a', evidence_id: 'ev_1', direction: 'SUPPORTS' });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_b', evidence_id: 'ev_1', direction: 'CONTRADICTS' });
  const forA = await evidence.listClaimEvidence(db, 'clm_a');
  assert.equal(forA[0].direction, 'SUPPORTS');
  const back = await evidence.listEvidenceClaims(db, 'ev_1');
  assert.deepEqual(back.map((l) => `${l.claim_id}:${l.direction}`).sort(), ['clm_a:SUPPORTS', 'clm_b:CONTRADICTS']);
});

test('direction stored on link, never global on evidence', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'protocol_evidence');
  for (const forbidden of ['direction', 'stance', 'supports', 'score']) {
    assert.ok(!cols.some((c) => c.toLowerCase().includes(forbidden)), `forbidden column: ${forbidden}`);
  }
});

test('exact duplicate link fails; links immutable', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  await claim(db, 'clm_a', { claim_text: 'Proposition A.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_1', source_item_id: item });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_a', evidence_id: 'ev_1', direction: 'SUPPORTS' });
  await assert.rejects(
    () => evidence.createClaimEvidenceLink(db, { claim_id: 'clm_a', evidence_id: 'ev_1', direction: 'CONTRADICTS' }),
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE claim_evidence_links SET direction = 'CONTEXT' WHERE claim_id = 'clm_a'`).run(),
    /CLAIM_EVIDENCE_LINK_IMMUTABLE/,
  );
});

// ---- MANDATORY DISAGREEMENT TEST ----

test('SUPPORTS and CONTRADICTS coexist on one claim with no resolution', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  await claim(db, 'clm_dis', { claim_text: 'Disputed fixture proposition.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_for', source_item_id: item, locator: 'p.1' });
  await evidence.createEvidence(db, { evidence_id: 'ev_against', source_item_id: item, locator: 'p.9' });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_dis', evidence_id: 'ev_for', direction: 'SUPPORTS' });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_dis', evidence_id: 'ev_against', direction: 'CONTRADICTS' });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_dis', evidence_id: 'ev_for', direction: 'SUPPORTS' }).then(
    () => { throw new Error('duplicate link must fail'); },
    () => undefined,
  );
  const links = await evidence.listClaimEvidence(db, 'clm_dis');
  assert.deepEqual(links.map((l) => `${l.evidence_id}:${l.direction}`).sort(), ['ev_against:CONTRADICTS', 'ev_for:SUPPORTS']);
  const stored = await claims.getClaim(db, 'clm_dis');
  assert.ok(!('verdict' in stored) && !('truth' in stored));
});

// ---- PROVENANCE TESTS ----

test('Claim → Evidence → Source Item → Source chain traverses deterministically', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  const feedId = sqlite.prepare('SELECT feed_id AS f FROM source_items WHERE id = ?').get(item).f;
  await claim(db, 'clm_chain', { claim_text: 'Chained fixture proposition.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_c1', source_item_id: item, locator: 'p.3' });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_chain', evidence_id: 'ev_c1', direction: 'CONTEXT' });
  const chain = await evidence.getEvidenceChain(db, 'clm_chain');
  assert.equal(chain.length, 1);
  assert.equal(chain[0].link.direction, 'CONTEXT');
  assert.equal(chain[0].evidence.evidence_id, 'ev_c1');
  assert.equal(chain[0].sourceItemId, item);
  assert.equal(chain[0].feedId, feedId);
  assert.deepEqual(await evidence.getEvidenceChain(db, 'clm_chain'), chain);
});

// ---- REGRESSION TESTS ----

test('P0 seed count stays 6; P2/P3 behavior unchanged', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one', 'Test Actor One', 'test actor one');
  const item = insertItem(sqlite);
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await claim(db, 'clm_reg', { protocol_version_id: 'med-v1' });
  await claims.createClaimAttribution(db, {
    attribution_id: 'cattr_r', claim_id: 'clm_reg', actor_id: 'actor_test_one', attribution_role: 'AUTHOR',
  });
  await evidence.createEvidence(db, { evidence_id: 'ev_r', source_item_id: item });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_reg', evidence_id: 'ev_r', direction: 'SUPPORTS' });
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v1');
  const r = await protocols.resolveProtocol(db, 'DASH');
  assert.equal(r.outcome, 'EXACT_ALIAS');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM actor_protocol_relationships WHERE actor_id = 'actor_test_one'`).get().n, 0);
});

test('claim/evidence work introduces no scores, safety, commercial, scheduler, or brief state', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  await claim(db, 'clm_scope', { claim_text: 'Scope fixture.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_s', source_item_id: item });
  await evidence.createClaimEvidenceLink(db, { claim_id: 'clm_scope', evidence_id: 'ev_s', direction: 'SUPPORTS' });
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  for (const forbidden of ['claims', 'evidence', 'citations', 'safety', 'contraindications', 'adverse_events', 'commercial', 'sponsorships', 'products', 'scores']) {
    assert.ok(!tables.includes(forbidden), `forbidden table present: ${forbidden}`);
  }
  const allCols = ['protocol_claims', 'claim_attributions', 'protocol_evidence', 'claim_evidence_links']
    .flatMap((t) => tableColumns(sqlite, t));
  for (const forbidden of ['score', 'safety', 'price', 'product', 'verdict', 'truth']) {
    assert.ok(!allCols.some((c) => c.toLowerCase().includes(forbidden)), `forbidden column fragment: ${forbidden}`);
  }
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE id = ?`).get(item).n, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
});
