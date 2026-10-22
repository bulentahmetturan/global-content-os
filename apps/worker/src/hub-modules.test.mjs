import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { collectHubModules } = await bundle('apps/worker/src/hub-modules.ts', 'hub-modules');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return { sqlite, DB: d1FromSqlite(sqlite) };
}

test('every content-DB module summarizes an empty migrated database without error', async () => {
  const { DB } = openDb();
  const m = await collectHubModules({ DB });
  for (const k of ['dossier', 'doctors', 'protocols', 'discovery']) assert.ok(!('error' in m[k]), `${k}: ${JSON.stringify(m[k])}`);
  assert.ok(Array.isArray(m.doctors.actors));
  assert.equal(typeof m.protocols.counts.protocols, 'number');
  assert.deepEqual(m.statistics, { error: 'STATS_DB_NOT_BOUND' });
});

test('actors, candidates, onboarding and discovery rows are reported compactly', async () => {
  const { sqlite, DB } = openDb();
  sqlite.exec(`INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
    VALUES ('actor_x', 'Test Doctor', 'test doctor', 'GLOBAL_EXPERT_PANEL', 't', 'test reason')`);
  sqlite.exec(`INSERT INTO discovery_runs (run_id, domain, wave_number, search_space_json, exclusions_json, status) VALUES ('r1','DOCTOR',1,'["x"]','{}','OPEN')`);
  sqlite.exec(`INSERT INTO candidate_ledger (candidate_id, run_id, domain, canonical_name, normalized_identity) VALUES ('c1','r1','DOCTOR','Test Doctor','test doctor')`);
  const m = await collectHubModules({ DB });
  const mine = m.doctors.actors.find((a) => a.canonical_name === 'Test Doctor');
  assert.ok(mine);
  assert.equal(mine.sources, 0);
  assert.deepEqual(m.doctors.candidates.map((c) => ({ ...c })), [{ canonical_name: 'Test Doctor', state: 'DISCOVERED' }]);
  assert.ok(m.discovery.waves.some((w) => w.domain === 'DOCTOR' && w.wave_number === 1 && w.status === 'OPEN'));
});

test('one failing module is isolated and reported, the others still answer', async () => {
  const { sqlite, DB } = openDb();
  sqlite.exec('DROP TABLE protocol_claims');
  const m = await collectHubModules({ DB });
  assert.ok('error' in m.protocols);
  assert.ok(!('error' in m.doctors));
});
