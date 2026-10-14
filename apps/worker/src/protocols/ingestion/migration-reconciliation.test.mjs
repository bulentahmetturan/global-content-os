// Migration reconciliation test: semantic equivalence of 0043 -> 0046
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { readMigrations, replay, schemaFingerprint, dataFingerprint } from '../../../../../scripts/migration-authority.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

test('0046 after preserved 0043 changes no schema or persisted row in any table', () => {
  const files=readMigrations('migrations');
  const before=replay(files.filter(f=>Number(f.name.slice(0,4))<=42 || f.name==='0044_protocol_mediterranean_wave2.sql'),{fixtureClock:'2026-10-09T00:00:00.000Z'});
  try {
    const schema=schemaFingerprint(before.db),data=dataFingerprint(before.db);
    replay(files.filter(f=>f.name==='0046_protocol_mediterranean_wave2.sql'),{database:before.db});
    assert.equal(schemaFingerprint(before.db),schema);
    assert.equal(dataFingerprint(before.db),data);
  }finally{before.db.close();}
});

// Load all migrations up to 0042 (inclusive) in order
const allMigrations = readdirSync('migrations')
  .filter(f => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .filter(f => {
    const num = parseInt(f.slice(0, 4), 10);
    return num <= 42;
  });

function applyMigrations(db, migrations) {
  for (const f of migrations) {
    db.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
}

function collectMediterraneanState(db) {
  const versions = db.prepare("SELECT version_id, protocol_id, version_seq, version_label FROM protocol_versions WHERE protocol_id='mediterranean-diet'").all();
  const components = db.prepare("SELECT component_id, version_id, phase_id, component_seq, title, detail FROM protocol_components WHERE version_id='med-v1'").all();
  const sources = db.prepare("SELECT id, feed_id, route, channel_id, title, summary, canonical_url, publisher, published_at, triage_status, dedupe_key, acquisition_path, evergreen_view, discovery_mode, discovery_reason, canonical_work_id FROM source_items WHERE id LIKE 'med-item-%'").all();
  const claims = db.prepare("SELECT claim_id, protocol_id, protocol_version_id, phase_id, component_id, claim_type, claim_text FROM protocol_claims WHERE protocol_id='mediterranean-diet'").all();
  const evidence = db.prepare("SELECT evidence_id, source_item_id, locator FROM protocol_evidence WHERE evidence_id LIKE 'ev_med_%'").all();
  const links = db.prepare("SELECT claim_id, evidence_id, direction FROM claim_evidence_links WHERE claim_id LIKE 'clm_med_%'").all();
  return { versions, components, sources, claims, evidence, links };
}

test('0046 forward reconciliation is semantically equivalent to original 0043', () => {
  const db1 = new DatabaseSync(':memory:');
  applyMigrations(db1, allMigrations);
  db1.exec(readFileSync('migrations/0044_protocol_mediterranean_wave2.sql', 'utf8'));
  const state1 = collectMediterraneanState(db1);

  const db2 = new DatabaseSync(':memory:');
  applyMigrations(db2, allMigrations);
  db2.exec(readFileSync('migrations/0046_protocol_mediterranean_wave2.sql', 'utf8'));
  const state2 = collectMediterraneanState(db2);

  assert.deepEqual(state1.versions, state2.versions);
  assert.deepEqual(state1.components, state2.components);
  assert.deepEqual(state1.sources, state2.sources);
  assert.deepEqual(state1.claims, state2.claims);
  assert.deepEqual(state1.evidence, state2.evidence);
  assert.deepEqual(state1.links, state2.links);
});

test('0046 is idempotent (second apply changes nothing)', () => {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db, allMigrations);
  db.exec(readFileSync('migrations/0046_protocol_mediterranean_wave2.sql', 'utf8'));
  const state1 = collectMediterraneanState(db);
  db.exec(readFileSync('migrations/0046_protocol_mediterranean_wave2.sql', 'utf8'));
  const state2 = collectMediterraneanState(db);
  assert.deepEqual(state1, state2);
});

test('0046 does not affect existing DASH data (0042 baseline)', () => {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db, allMigrations);
  const dashClaimsBefore = db.prepare("SELECT COUNT(*) AS n FROM protocol_claims WHERE protocol_id='dash-eating-plan'").get().n;
  const dashVersBefore = db.prepare("SELECT COUNT(*) AS n FROM protocol_versions WHERE protocol_id='dash-eating-plan'").get().n;
  db.exec(readFileSync('migrations/0046_protocol_mediterranean_wave2.sql', 'utf8'));
  const dashClaimsAfter = db.prepare("SELECT COUNT(*) AS n FROM protocol_claims WHERE protocol_id='dash-eating-plan'").get().n;
  const dashVersAfter = db.prepare("SELECT COUNT(*) AS n FROM protocol_versions WHERE protocol_id='dash-eating-plan'").get().n;
  assert.equal(dashClaimsBefore, dashClaimsAfter);
  assert.equal(dashVersBefore, dashVersAfter);
});
