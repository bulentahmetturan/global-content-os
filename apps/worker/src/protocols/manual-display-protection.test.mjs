import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const worker = (await bundle('apps/worker/src/index.ts', 'protocol-manual-protection')).default;
const manifest = JSON.parse(readFileSync('release/protocols/five-item-correction.json', 'utf8'));
function database() {
  const writes = [];
  return { writes, prepare(sql) { return { bind(...values) { return { async run() {
    writes.push({ sql, values }); return { success: true };
  } }; } }; } };
}
async function request(items, db, configured = 'test-only-token', supplied = 'test-only-token') {
  return worker.fetch(new Request('https://local.invalid/api/localize/apply', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${supplied}` },
    body: JSON.stringify({ items }),
  }), { DB: db, HUB_OPERATOR_TOKEN: configured }, { waitUntil() {} });
}
test('all five approved IDs reject both old and approved values without any write', async () => {
  for (const item of manifest.items) for (const state of [item.before, item.after]) {
    const db = database();
    const response = await request([{ id: item.id, title: state.title, summary: state.summary }], db);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'APPROVED_PROTOCOL_OPERATOR_WRITER_REQUIRED');
    assert.deepEqual(db.writes, []);
  }
});
test('mixed batch rejects before an unrelated first item writes', async () => {
  const db = database();
  assert.equal((await request([{ id: 'unrelated', title: 'Unrelated' }, { id: manifest.items[4].id, title: 'Blocked' }], db)).status, 409);
  assert.deepEqual(db.writes, []);
});
test('unrelated manual localization retains existing field bindings', async () => {
  const db = database();
  const response = await request([{ id: 'unrelated', title: 'Title', titleOrig: 'Original', summary: 'Summary', gists: ['Gist'] }], db);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, updated: 1, total: 1 });
  assert.deepEqual(db.writes[0].values, ['Title', 'Original', 'Summary', '["Gist"]', 'unrelated']);
});
test('missing or incorrect operator authorization still denies before writes', async () => {
  for (const [configured, supplied, status] of [['', 'test-only-token', 503], ['test-only-token', 'wrong', 401]]) {
    const db = database();
    assert.equal((await request([{ id: 'unrelated', title: 'Title' }], db, configured, supplied)).status, status);
    assert.deepEqual(db.writes, []);
  }
});
