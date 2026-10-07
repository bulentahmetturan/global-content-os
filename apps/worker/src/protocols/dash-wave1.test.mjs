// DASH Real Data Wave 1 acceptance: authoritative DASH content populated
// through migration 0042, read back deterministically via repository APIs,
// idempotent on re-apply, atomic on invalid input. Ephemeral node:sqlite only.
// No medicalNEWS involvement: boundary held by construction (no news fixture,
// no news feed, no news item referenced anywhere in this file).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'dash-wave1-registry');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'dash-wave1-claims');
const evidence = await bundle('apps/worker/src/protocols/evidence.ts', 'dash-wave1-evidence');
const safety = await bundle('apps/worker/src/protocols/safety.ts', 'dash-wave1-safety');
const rels = await bundle('apps/worker/src/protocols/relationships.ts', 'dash-wave1-edges');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

// ---- IDENTITY ----

test('existing DASH canonical ID reused; seed count stays 6; nothing else canonicalized', async () => {
  const { db } = openDb();
  const dash = await protocols.getProtocol(db, 'dash-eating-plan');
  assert.equal(dash.canonical_name, 'DASH eating plan');
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
});

// ---- VERSION ----

test('real version populated with authoritative label; latest resolves deterministically', async () => {
  const { db } = openDb();
  const versions = await protocols.listProtocolVersions(db, 'dash-eating-plan');
  assert.deepEqual(versions.map((v) => v.version_id), ['dash-v1']);
  assert.equal(versions[0].version_label, 'NIH Publication No. 06-4082 (Revised April 2006)');
  assert.equal((await protocols.getLatestProtocolVersion(db, 'dash-eating-plan')).version_id, 'dash-v1');
});

// ---- PHASES (NONE) ----

test('DASH has no phases: authoritative structure is non-phased', async () => {
  const { db } = openDb();
  assert.deepEqual(await protocols.listProtocolPhases(db, 'dash-v1'), []);
  const { sqlite } = openDb();
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM protocol_phases WHERE version_id = 'dash-v1'`).get().n, 0);
});

// ---- COMPONENTS ----

test('nine authoritative components, deterministic order, version lineage', async () => {
  const { db } = openDb();
  const comps = await protocols.listProtocolComponents(db, 'dash-v1');
  assert.deepEqual(comps.map((c) => c.component_id), [
    'dash-comp-grains', 'dash-comp-vegetables', 'dash-comp-fruits', 'dash-comp-dairy',
    'dash-comp-protein', 'dash-comp-nuts-legumes', 'dash-comp-fats', 'dash-comp-sweets',
    'dash-comp-sodium',
  ]);
  const sodium = comps.find((c) => c.component_id === 'dash-comp-sodium');
  assert.ok(sodium.title.includes('2,300 mg') && sodium.detail.includes('1,500 mg'));
  assert.ok(comps.every((c) => c.version_id === 'dash-v1' && c.phase_id === null));
  assert.throws(
    () => db && openDb().sqlite.prepare(
      `INSERT INTO protocol_components (component_id, version_id, component_seq, title)
       VALUES ('dash-comp-x', 'dash-v1', 1, 'Duplicate position')`,
    ).run(),
    /UNIQUE/,
  );
});

// ---- ACTORS ----

test('issuing institution linked once as ASSOCIATED_WITH; no inferred persons', async () => {
  const { db } = openDb();
  const edges = await rels.listProtocolActors(db, 'dash-eating-plan');
  assert.deepEqual(edges.map((e) => `${e.actor_id}:${e.relationship_type}:${e.protocol_version_id ?? 'wide'}`), [
    'actor_nhlbi:ASSOCIATED_WITH:wide',
  ]);
  const { sqlite } = openDb();
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM actors WHERE actor_id = 'actor_nhlbi'`).get().n, 1);
});

// ---- CLAIMS ----

test('four bounded claims attach to dash-v1 with separate attribution', async () => {
  const { db } = openDb();
  const list = await claims.listProtocolVersionClaims(db, 'dash-v1');
  assert.deepEqual(list.map((c) => c.claim_id).sort(), [
    'clm_dash_bp_lowering', 'clm_dash_definition', 'clm_dash_sodium_combined', 'clm_dash_subgroup_response',
  ]);
  assert.ok(list.every((c) => c.protocol_id === 'dash-eating-plan'));
  const attrs = await claims.listClaimAttributions(db, 'clm_dash_definition');
  assert.deepEqual(attrs.map((a) => `${a.actor_id}:${a.attribution_role}`), ['actor_nhlbi:AUTHOR']);
  assert.deepEqual(await claims.listClaimAttributions(db, 'clm_dash_bp_lowering'), []);
  assert.equal((await rels.listActorProtocolRelationships(db, 'actor_nhlbi')).length, 1);
});

// ---- EVIDENCE ----

test('claim-evidence links carry direction; provenance resolves to source items', async () => {
  const { db } = openDb();
  const links = await evidence.listClaimEvidence(db, 'clm_dash_bp_lowering');
  assert.deepEqual(links.map((l) => `${l.evidence_id}:${l.direction}`), ['ev_dash_trial_1997:SUPPORTS']);
  const chain = await evidence.getEvidenceChain(db, 'clm_dash_sodium_combined');
  assert.equal(chain.length, 1);
  assert.equal(chain[0].evidence.locator, 'PMID:11136953; DOI:10.1056/NEJM200101043440101');
  assert.equal(chain[0].sourceItemId, 'dash-item-sodium-2001');
  assert.ok(chain[0].feedId !== null);
  const item = await db.prepare('SELECT canonical_url, publisher FROM source_items WHERE id = ?').bind('dash-item-trial-1997').first();
  assert.equal(item.canonical_url, 'https://pubmed.ncbi.nlm.nih.gov/9099655/');
  assert.equal(item.publisher, 'The New England Journal of Medicine');
});

// ---- SAFETY / COMMERCIAL (legitimately sparse) ----

test('no safety or commercial rows fabricated for Wave 1', async () => {
  const { sqlite } = openDb();
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM safety_rules WHERE protocol_id = 'dash-eating-plan'`).get().n, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM commercial_relationships WHERE protocol_id = 'dash-eating-plan'`).get().n, 0);
});

// ---- IMPORT (idempotency + atomicity) ----

test('re-applying migration 0042 changes nothing', async () => {
  const { sqlite } = openDb();
  const before = {};
  for (const t of ['protocol_versions', 'protocol_components', 'protocol_claims', 'claim_attributions', 'protocol_evidence', 'claim_evidence_links', 'source_items', 'actors', 'actor_protocol_relationships']) {
    before[t] = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  }
  sqlite.exec(readFileSync('migrations/0042_protocol_dash_wave1.sql', 'utf8'));
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
       VALUES ('clm_bad', 'dash-eating-plan', 'no-such-version', 'OUTCOME', 'Bad lineage.')`,
    ).run(),
  );
  sqlite.exec('ROLLBACK');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM protocol_claims WHERE claim_id = 'clm_bad'`).get().n, 0);
  assert.equal((await claims.listProtocolVersionClaims(db, 'dash-v1')).length, 4);
});

// ---- READBACK ----

test('deterministic full-tree readback via repository APIs', async () => {
  const { db } = openDb();
  const tree = {
    protocol: (await protocols.getProtocol(db, 'dash-eating-plan')).protocol_id,
    versions: (await protocols.listProtocolVersions(db, 'dash-eating-plan')).map((v) => v.version_id),
    phases: (await protocols.listProtocolPhases(db, 'dash-v1')).map((p) => p.phase_id),
    components: (await protocols.listProtocolComponents(db, 'dash-v1')).map((c) => c.component_id),
    actors: (await rels.listProtocolActors(db, 'dash-eating-plan')).map((e) => e.actor_id),
    claims: (await claims.listProtocolVersionClaims(db, 'dash-v1')).map((c) => c.claim_id),
    safety: (await safety.listProtocolSafetyRules(db, 'dash-eating-plan')).map((s) => s.rule_id),
  };
  assert.deepEqual(tree, {
    protocol: 'dash-eating-plan',
    versions: ['dash-v1'],
    phases: [],
    components: [
      'dash-comp-grains', 'dash-comp-vegetables', 'dash-comp-fruits', 'dash-comp-dairy',
      'dash-comp-protein', 'dash-comp-nuts-legumes', 'dash-comp-fats', 'dash-comp-sweets',
      'dash-comp-sodium',
    ],
    actors: ['actor_nhlbi'],
    claims: ['clm_dash_bp_lowering', 'clm_dash_definition', 'clm_dash_sodium_combined', 'clm_dash_subgroup_response'],
    safety: [],
  });
  assert.deepEqual(tree, JSON.parse(JSON.stringify(tree)));
});
