import test from 'node:test';
import assert from 'node:assert/strict';
import { readMigrations,replay } from './migration-authority.mjs';
import { rehearse } from './central-rehearsal.mjs';
import { verifySchema,CONTENT_CAPABILITIES,STATISTICS_CAPABILITIES } from './schema-completeness.mjs';
test('real fresh, upgrade and repeat rehearsal compare schema and every persisted fixture row',()=> {
  const result=rehearse(); assert.equal(result.verdict,'PASS'); assert.equal(result.repeatExecuted,0); assert.equal(result.upgrade.kind,'HYPOTHETICAL_GIT_LEDGER'); assert.equal(result.schema,result.upgrade.schema); assert.equal(result.data,result.upgrade.data);
});
test('independent Statistics namespace replays and remains idempotent',()=> {const result=rehearse('migrations/statistics');assert.equal(result.freshExecuted,1);assert.equal(result.repeatExecuted,0);});
test('local readiness checks all required migrations and each workstream capability',()=> {
  const files=readMigrations('migrations'),result=replay(files);
  try {
    for(const capabilities of Object.values(CONTENT_CAPABILITIES)) assert.equal(verifySchema(result.db,files.map(f=>f.name),capabilities).verdict,'READY');
    result.db.prepare('DELETE FROM d1_migrations WHERE name=?').run('0031_doctor_actor_registry.sql');
    assert.equal(verifySchema(result.db,files.map(f=>f.name),{}).verdict,'BLOCKED');
    assert.ok(result.db.prepare('SELECT name FROM d1_migrations ORDER BY name DESC LIMIT 1').get().name.startsWith('0050'));
    assert.equal(verifySchema(result.db,[],{nonexistent_required_table:[]}).verdict,'BLOCKED');
  } finally {result.db.close();}
});
test('Statistics capabilities never use content fallback',()=> {
  const result=replay(readMigrations('migrations/statistics'));
  try {assert.equal(verifySchema(result.db,['0001_statistics_schema_v1.sql'],STATISTICS_CAPABILITIES).verdict,'READY');assert.equal(verifySchema(result.db,[],CONTENT_CAPABILITIES.Doctors).verdict,'BLOCKED');}finally{result.db.close();}
});
