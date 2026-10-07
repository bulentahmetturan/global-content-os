// Mediterranean Real Data Wave 2 acceptance: authoritative content populated
// through migration 0043, read back deterministically, idempotent on re-apply,
// atomic on invalid input. Ephemeral node:sqlite only. No medicalNEWS
// involvement; no retracted material anywhere (2013 PREDIMED excluded by test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'med-wave2-registry');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'med-wave2-claims');
const evidence = await bundle('apps/worker/src/protocols/evidence.ts', 'med-wave2-evidence');
const safety = await bundle('apps/worker/src/protocols/safety.ts', 'med-wave2-safety');
const rels = await bundle('apps/worker/src/protocols/relationships.ts', 'med-wave2-edges');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

test('existing Mediterranean canonical ID reused; seed count stays 6', async () => {
  const { db } = openDb();
  const med = await protocols.getProtocol(db, 'mediterranean-diet');
  assert.equal(med.canonical_name, 'Mediterranean diet');
  assert.equal(med.protocol_type, 'DIETARY_PATTERN');
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
});

test('real version carries the verified edition label; latest resolves', async () => {
  const { db } = openDb();
  const versions = await protocols.listProtocolVersions(db, 'mediterranean-diet');
  assert.deepEqual(versions.map((v) => v.version_id), ['med-v1']);
  assert.ok(versions[0].version_label.includes('2015-2020') && versions[0].version_label.includes('A4-1'));
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v1');
});

test('no phases: authoritative structure is non-phased', async () => {
  const { db } = openDb();
  assert.deepEqual(await protocols.listProtocolPhases(db, 'med-v1'), []);
});

test('nine authoritative components in deterministic order with exact units', async () => {
  const { db } = openDb();
  const comps = await protocols.listProtocolComponents(db, 'med-v1');
  assert.deepEqual(comps.map((c) => c.component_id), [
    'med-comp-vegetables', 'med-comp-fruits', 'med-comp-grains', 'med-comp-dairy',
    'med-comp-protein', 'med-comp-oils', 'med-comp-sodium-limit',
    'med-comp-saturated-fat-limit', 'med-comp-added-sugars-limit',
  ]);
  const veg = comps.find((c) => c.component_id === 'med-comp-vegetables');
  assert.ok(veg.title.includes('2.5 cup-eq') && veg.detail.includes('5.5'));
  const sodium = comps.find((c) => c.component_id === 'med-comp-sodium-limit');
  assert.ok(sodium.title.includes('2,300 mg'));
  assert.ok(comps.every((c) => c.version_id === 'med-v1' && c.phase_id === null));
});

test('three bounded claims attach to med-v1; definition unattributed without actors', async () => {
  const { db } = openDb();
  const list = await claims.listProtocolVersionClaims(db, 'med-v1');
  assert.deepEqual(list.map((c) => c.claim_id).sort(), [
    'clm_med_definition', 'clm_med_mace_reduction', 'clm_med_stroke_reduction',
  ]);
  assert.ok(list.every((c) => c.protocol_id === 'mediterranean-diet'));
  assert.deepEqual(await claims.listClaimAttributions(db, 'clm_med_definition'), []);
  assert.deepEqual((await rels.listProtocolActors(db, 'mediterranean-diet')), []);
});

test('claim-evidence links carry direction; provenance resolves to source items', async () => {
  const { db } = openDb();
  const links = await evidence.listClaimEvidence(db, 'clm_med_mace_reduction');
  assert.deepEqual(links.map((l) => `${l.evidence_id}:${l.direction}`), ['ev_med_predimed_2018:SUPPORTS']);
  const chain = await evidence.getEvidenceChain(db, 'clm_med_definition');
  assert.equal(chain.length, 1);
  assert.equal(chain[0].evidence.locator, 'Appendix 4, Table A4-1, 2,000-calorie column; Chapter 1 limits');
  assert.equal(chain[0].sourceItemId, 'med-item-dga-2015');
  const item = await db.prepare('SELECT canonical_url, publisher FROM source_items WHERE id = ?').bind('med-item-predimed-2018').first();
  assert.equal(item.canonical_url, 'https://pubmed.ncbi.nlm.nih.gov/29897866/');
  assert.equal(item.publisher, 'The New England Journal of Medicine');
});

test('retracted 2013 PREDIMED material appears nowhere', async () => {
  const { sqlite } = openDb();
  for (const [table, col] of [['protocol_evidence', 'locator'], ['source_items', 'canonical_url']]) {
    const rows = sqlite.prepare(`SELECT ${col} AS v FROM ${table}`).all();
    for (const row of rows) {
      assert.ok(!String(row.v).includes('NEJMoa1200303'), `retracted DOI leaked in ${table}`);
      assert.ok(!String(row.v).includes('23432189'), `retracted PMID leaked in ${table}`);
    }
  }
  const evIds = sqlite.prepare(`SELECT evidence_id AS v FROM protocol_evidence`).all().map((r) => r.v);
  assert.ok(!evIds.some((id) => /2013/.test(id)));
});

test('no safety or commercial rows fabricated for Wave 2', async () => {
  const { sqlite } = openDb();
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM safety_rules WHERE protocol_id = 'mediterranean-diet'`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM commercial_relationships WHERE protocol_id = 'mediterranean-diet'`).get().n, 0);
});

test('re-applying migration 0043 changes nothing', async () => {
  const { sqlite } = openDb();
  const before = {};
  for (const t of ['protocol_versions', 'protocol_components', 'protocol_claims', 'protocol_evidence', 'claim_evidence_links', 'source_items']) {
    before[t] = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  }
  sqlite.exec(readFileSync('migrations/0043_protocol_mediterranean_wave2.sql', 'utf8'));
  for (const t of Object.keys(before)) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, before[t], `table ${t} changed on re-apply`);
  }
});

test('invalid package fails atomically without partial mutation', async () => {
  const { sqlite, db } = openDb();
  sqlite.exec('BEGIN IMMEDIATE');
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocol_claims (claim_id, protocol_id, protocol_version_id, claim_type, claim_text)
       VALUES ('clm_bad', 'mediterranean-diet', 'no-such-version', 'OUTCOME', 'Bad lineage.')`,
    ).run(),
  );
  sqlite.exec('ROLLBACK');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM protocol_claims WHERE claim_id = 'clm_bad'`).get().n, 0);
  assert.equal((await claims.listProtocolVersionClaims(db, 'med-v1')).length, 3);
});

test('deterministic full-tree readback via repository APIs', async () => {
  const { db } = openDb();
  const tree = {
    protocol: (await protocols.getProtocol(db, 'mediterranean-diet')).protocol_id,
    versions: (await protocols.listProtocolVersions(db, 'mediterranean-diet')).map((v) => v.version_id),
    phases: (await protocols.listProtocolPhases(db, 'med-v1')).map((p) => p.phase_id),
    components: (await protocols.listProtocolComponents(db, 'med-v1')).map((c) => c.component_id),
    claims: (await claims.listProtocolVersionClaims(db, 'med-v1')).map((c) => c.claim_id),
    safety: (await safety.listProtocolSafetyRules(db, 'mediterranean-diet')).map((s) => s.rule_id),
  };
  assert.deepEqual(tree, {
    protocol: 'mediterranean-diet',
    versions: ['med-v1'],
    phases: [],
    components: [
      'med-comp-vegetables', 'med-comp-fruits', 'med-comp-grains', 'med-comp-dairy',
      'med-comp-protein', 'med-comp-oils', 'med-comp-sodium-limit',
      'med-comp-saturated-fat-limit', 'med-comp-added-sugars-limit',
    ],
    claims: ['clm_med_definition', 'clm_med_mace_reduction', 'clm_med_stroke_reduction'],
    safety: [],
  });
});

test('Wave-2 work leaves News pipeline, briefs, and unrelated domains untouched', async () => {
  const { sqlite, db } = openDb();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  assert.equal((await protocols.listProtocols(db)).length, 6);
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
});
