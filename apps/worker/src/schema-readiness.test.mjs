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
