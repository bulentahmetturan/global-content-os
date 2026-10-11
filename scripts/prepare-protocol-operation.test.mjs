import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prepareOperation } from './prepare-protocol-operation.mjs';
import { sourceMetadataSql } from './protocols-five-item-writer.mjs';
const manifest = JSON.parse(readFileSync('release/protocols/five-item-correction.json', 'utf8'));
const evidence = results => [{ success: true, results, meta: { rows_written: 0, changed_db: false } }];
function input() {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync('migrations/' + name, 'utf8'));
  const metadata = db.prepare(sourceMetadataSql).all(); db.close();
  return [{ uuid: manifest.target.databaseId, name: manifest.target.databaseName, read_replication: { mode: 'disabled' } }, evidence(manifest.items.map(item => item.before)), evidence(metadata)];
}
test('plan binds exact five values and emits no production authorization', () => {
  const plan = prepareOperation(manifest, ...input());
  assert.equal(plan.expectedChangedRecords, 5);
  assert.equal(plan.authorization, 'NOT_GRANTED_FOR_PRODUCTION_OPERATION');
  assert.match(plan.applySql, /RETURNING \*/);
  assert.doesNotMatch(plan.applySql, /0 = 1/);
});
test('wrong identity, unknown replica routing, unsafe receipts and stale rows fail closed', () => {
  for (const mutate of [args => args[0].uuid = 'wrong', args => delete args[0].read_replication, args => args[1][0].meta.rows_written = 1, args => args[2][0].meta.changed_db = true, args => args[1][0].results[0].title = 'stale']) {
    const args = input(); mutate(args); assert.throws(() => prepareOperation(manifest, ...args));
  }
});
