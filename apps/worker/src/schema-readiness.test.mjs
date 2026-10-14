import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { bundle, d1FromSqlite } from './sqlite-d1.test-helper.mjs';
import { readMigrations, replay } from '../../../scripts/migration-authority.mjs';
const schema = await bundle('apps/worker/src/schema-readiness.ts', 'schema-readiness-real');
const worker = await bundle('apps/worker/src/index.ts', 'schema-readiness-worker');
const files = readMigrations('migrations');
const statsFiles = readMigrations('migrations/statistics');
function fixture() {
  const content = replay(files); const stats = replay(statsFiles);
  return { content, stats, DB: d1FromSqlite(content.db), STATS_DB: d1FromSqlite(stats.db), close() { content.db.close(); stats.db.close(); } };
}
test('real SQLite readiness reports both complete ledgers and each workstream capability', async () => {
  const f = fixture();
  try { const r = await schema.gatherSchemaReadiness(f.DB, f.STATS_DB); assert.equal(r.content.level, 'READY'); assert.equal(r.statistics.level, 'READY'); assert.deepEqual(Object.keys(r.workstreams).sort(), ['Discovery','Doctors','Dossier','Protocols']); assert.ok(Object.values(r.workstreams).every(s => s.level === 'READY')); }
  finally { f.close(); }
});
test('newest ledger entry cannot hide a missing intermediate migration', async () => {
  const f = fixture();
  try {
    f.content.db.prepare('DELETE FROM d1_migrations WHERE name=?').run('0032_doctor_actor_sources.sql');
    const r = await schema.gatherSchemaReadiness(f.DB, f.STATS_DB);
    assert.equal(r.content.level, 'BLOCKED'); assert.deepEqual(r.content.missingMigrations, ['0032_doctor_actor_sources.sql']);
    assert.equal(r.workstreams.Doctors.level, 'BLOCKED'); assert.equal(r.workstreams.Protocols.level, 'READY');
    const response = await worker.default.fetch(new Request('https://x.test/api/ready'), { DB: f.DB, STATS_DB: f.STATS_DB });
    assert.equal(response.status, 503); assert.ok((await response.json()).blocked.includes('REQUIRED_MIGRATIONS_MISSING'));
  } finally { f.close(); }
});
test('full ledger cannot hide missing capability; Statistics cannot alias content DB', async () => {
  const f = fixture();
  try {
    f.content.db.exec('ALTER TABLE doctor_profile_facts RENAME COLUMN fact_id TO missing_fact_id');
    const r = await schema.gatherSchemaReadiness(f.DB, f.DB);
    assert.equal(r.workstreams.Doctors.level, 'BLOCKED'); assert.ok(r.content.missingCapabilities.includes('doctor_profile_facts.fact_id')); assert.equal(r.statistics.level, 'BLOCKED');
  } finally { f.close(); }
});
test('health performs zero DB queries; readiness metadata is bounded and cached', async () => {
  const f = fixture(); let batches = 0;
  const DB = { ...f.DB, batch: async statements => { batches++; assert.ok(statements.length < 30); assert.ok(statements.every(s => s)); return f.DB.batch(statements); } };
  try {
    const health = await worker.default.fetch(new Request('https://x.test/api/health'), { DB }); assert.equal(health.status, 200); assert.equal(batches, 0);
    await schema.gatherSchemaReadiness(DB, f.STATS_DB); await schema.gatherSchemaReadiness(DB, f.STATS_DB); assert.equal(batches, 1);
  } finally { f.close(); }
});

// ---- Gate B owner exception (2026-10-15): closed six-name historical map, exact-filename readiness otherwise ----
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const mapJson = JSON.parse(readFileSync('release/authority/historical-applied-name-map.json', 'utf8'));
const SIX = mapJson.entries.map(e => [e.rcName, e.productionName]);
function asProduction(f) {
  // Simulate the live ledger: the six RC names absent, their production counterparts present.
  for (const [rc, prod] of SIX) f.content.db.prepare('UPDATE d1_migrations SET name=? WHERE name=?').run(prod, rc);
}
test('Gate B map: exactly six entries, RC bytes pinned, counterparts never collide with local filenames', () => {
  assert.equal(mapJson.entries.length, 6);
  const local = new Set(files.map(x => x.name));
  for (const e of mapJson.entries) {
    assert.ok(local.has(e.rcName), e.rcName);
    assert.ok(!local.has(e.productionName), `${e.productionName} must not exist locally`);
    assert.equal(createHash('sha256').update(readFileSync(`migrations/${e.rcName}`)).digest('hex'), e.rcSha256, e.rcName);
  }
  assert.equal(new Set(SIX.map(x => x[1])).size, 6);
});
test('Gate B map: production ledger names satisfy exactly the six RC names, mapping is reported', async () => {
  const f = fixture();
  try {
    asProduction(f);
    const r = await schema.gatherSchemaReadiness(f.DB, f.STATS_DB);
    assert.equal(r.content.level, 'READY'); assert.deepEqual(r.content.missingMigrations, []);
    assert.deepEqual([...r.content.mappedMigrations].sort(), SIX.map(x => x[0]).sort());
    assert.equal(r.content.mappedProvenance, mapJson.auditLabel); assert.equal(mapJson.auditLabel, 'HISTORICAL_BYTES_UNPROVEN_ACCEPTED_BY_OWNER');
  } finally { f.close(); }
});
test('Gate B map: missing counterpart, one unmapped name or a near-miss name still blocks (fail-closed)', async () => {
  for (const mutate of [
    (db) => db.prepare('DELETE FROM d1_migrations WHERE name=?').run('0050_doctor_profile_facts.sql'),
    (db) => db.prepare('DELETE FROM d1_migrations WHERE name=?').run('0032_doctor_actor_sources.sql'),
    (db) => db.prepare('UPDATE d1_migrations SET name=? WHERE name=?').run('0050_doctor_profile_facts_v2.sql', '0050_doctor_profile_facts.sql'),
    (db) => db.prepare('UPDATE d1_migrations SET name=? WHERE name=?').run('0044_doctor_discovery_candidates.sql.bak', '0048_doctor_discovery_candidates.sql'),
  ]) {
    const f = fixture();
    try { asProduction(f); mutate(f.content.db); const r = await schema.gatherSchemaReadiness(f.DB, f.STATS_DB); assert.equal(r.content.level, 'BLOCKED'); assert.ok(r.content.missingMigrations.length >= 1); }
    finally { f.close(); }
  }
});
test('Gate B map: capability checks stay independent of the map; a counterpart alone cannot hide a missing column', async () => {
  const f = fixture();
  try {
    asProduction(f);
    f.content.db.exec('ALTER TABLE doctor_profile_facts RENAME COLUMN fact_id TO missing_fact_id');
    const r = await schema.gatherSchemaReadiness(f.DB, f.STATS_DB);
    assert.equal(r.content.level, 'BLOCKED'); assert.ok(r.content.missingCapabilities.includes('doctor_profile_facts.fact_id'));
  } finally { f.close(); }
});
test('Gate B map: a future migration name is never satisfied by the map', async () => {
  const f = fixture();
  try {
    asProduction(f);
    // A name that is not in the closed list cannot be satisfied through a lookalike production name.
    f.content.db.prepare('UPDATE d1_migrations SET name=? WHERE name=?').run('0047_doctor_knowledge_FUTURE.sql', '0047_doctor_knowledge.sql');
    const r = await schema.gatherSchemaReadiness(f.DB, f.STATS_DB);
    assert.equal(r.content.level, 'BLOCKED'); assert.ok(r.content.missingMigrations.includes('0046_doctor_knowledge.sql'));
  } finally { f.close(); }
});
