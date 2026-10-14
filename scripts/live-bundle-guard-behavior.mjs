// Behavioral verification of the DEPLOYED bytes (not a source search): imports the exact bundle whose SHA-256 equals the
// live module, runs it against a disposable local SQLite D1 and proves the Protocols guards by observable behavior.
// Usage: node scripts/live-bundle-guard-behavior.mjs <path-to-index.js> <expected-sha256>
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
import { readMigrations, replay } from './migration-authority.mjs';

const [bundlePath, expected] = process.argv.slice(2);
const bytes = readFileSync(bundlePath);
const sha = createHash('sha256').update(bytes).digest('hex');
assert.equal(sha, expected, 'BUNDLE_HASH_MISMATCH');
const worker = (await import(pathToFileURL(resolve(bundlePath)).href)).default;

const manifest = JSON.parse(readFileSync('release/protocols/five-item-correction.json', 'utf8'));
const q = (x) => (x === null ? 'NULL' : typeof x === 'number' ? String(x) : "'" + String(x).replaceAll("'", "''") + "'");
const content = replay(readMigrations('migrations'));
const sqlite = content.db;
for (const item of manifest.items) {
  sqlite.exec(`UPDATE source_items SET ${Object.keys(item.before).filter((k) => k !== 'id').map((k) => k + '=' + q(item.before[k])).join(',')} WHERE id=${q(item.id)}`);
}
const tpl = { ...sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(manifest.items[0].id) };
Object.assign(tpl, { id: 'control-nonprotected-item', canonical_url: 'https://example.test/control', dedupe_key: 'control-nonprotected-item', canonical_work_id: null, acquisition_path: null });
sqlite.prepare(`INSERT INTO source_items (${Object.keys(tpl).join(',')}) VALUES (${Object.keys(tpl).map(() => '?').join(',')})`).run(...Object.values(tpl));
const control = { id: tpl.id };
const env = { DB: d1FromSqlite(sqlite), ENVIRONMENT: 'production', HUB_OPERATOR_TOKEN: 'behavior-test-hub-token', BUILD_COMMIT: 'behavior-test' };
const call = async (path, body, token = env.HUB_OPERATOR_TOKEN) => {
  const r = await worker.fetch(new Request('https://x.test' + path, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const snap = () => JSON.stringify(sqlite.prepare("SELECT id,title,summary,gists_json FROM source_items WHERE id IN (" + manifest.items.map((x) => q(x.id)).join(',') + ") ORDER BY id").all());
const out = { bundleSha256: sha, cases: [] };
const before = snap();

for (const item of manifest.items) {
  const r = await call('/api/localize/apply', { items: [{ id: item.id, title: 'overwrite attempt', summary: 'overwrite attempt', gists: ['x'] }] });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'APPROVED_PROTOCOL_OPERATOR_WRITER_REQUIRED');
  out.cases.push({ id: item.id, route: '/api/localize/apply', status: r.status });
}
assert.equal(snap(), before, 'APPROVED_ROWS_CHANGED');

const mixed = await call('/api/localize/apply', { items: [{ id: control.id, title: 'mixed batch', summary: 's' }, { id: manifest.items[0].id, title: 'overwrite attempt', summary: 's' }] });
assert.equal(mixed.status, 409);
assert.notEqual(sqlite.prepare('SELECT title FROM source_items WHERE id=?').get(control.id).title, 'mixed batch', 'MIXED_BATCH_PARTIAL_WRITE');
out.cases.push({ id: 'mixed-batch', status: mixed.status, controlRowUntouched: true });

const ok = await call('/api/localize/apply', { items: [{ id: control.id, title: 'control write', summary: 'control' }] });
assert.equal(ok.status, 200); assert.equal(ok.body.updated, 1);
assert.equal(sqlite.prepare('SELECT title FROM source_items WHERE id=?').get(control.id).title, 'control write');
out.cases.push({ id: 'control-nonprotected', status: ok.status, updated: ok.body.updated });

const unauth = await call('/api/localize/apply', { items: [] }, 'wrong');
assert.equal(unauth.status, 401);
out.cases.push({ id: 'wrong-token', status: unauth.status });

out.result = 'PASS';
console.log(JSON.stringify(out, null, 1));
content.db.close();
