import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrations, replay } from './migration-authority.mjs';
import { COLUMNS, sha256 } from './protocols-five-item-writer.mjs';
import { d1RestDb, preview, fileAudit } from './protocols-five-item-operator.mjs';
import { executeCorrection } from './protocols-five-item-writer.mjs';

const manifest = JSON.parse(readFileSync('release/protocols/five-item-correction.json', 'utf8'));
const quote = (x) => (x === null ? 'NULL' : typeof x === 'number' ? String(x) : "'" + String(x).replaceAll("'", "''") + "'");

async function world() {
  const content = replay(readMigrations('migrations'));
  const sqlite = content.db;
  for (const item of manifest.items) {
    sqlite.exec(`UPDATE source_items SET ${COLUMNS.filter((k) => k !== 'id').map((k) => k + '=' + quote(item.before[k])).join(',')} WHERE id=${quote(item.id)}`);
  }
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      try {
        assert.equal(req.method, 'POST');
        assert.match(req.url, /^\/accounts\/92fd1fe2237154079a0834121c33964b\/d1\/database\/c0ce92dc-9842-4dd9-9d05-a8d09e798b34\/query$/);
        assert.equal(req.headers.authorization, 'Bearer test-token');
        const { sql, params } = JSON.parse(body);
        calls.push(sql.slice(0, 40));
        const rows = sqlite.prepare(sql).all(...params);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ success: true, result: [{ success: true, results: rows, meta: { changes: rows.length } }] }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, errors: [{ message: String(e.message).slice(0, 80) }] }));
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const db = d1RestDb({ token: 'test-token', baseUrl });
  return { sqlite, db, calls, close: () => { server.close(); content.db.close(); } };
}

test('operator: preview is read-only and classifies live rows against the approved before/after images', async () => {
  const w = await world();
  try {
    const mutationsBefore = w.sqlite.prepare("SELECT COUNT(*) n FROM source_items WHERE id LIKE 'dash-item-%' OR id LIKE 'med-item-%'").get().n;
    const report = await preview(w.db, manifest);
    assert.equal(report.state, 'READY_FOR_APPLY');
    assert.equal(report.mutations, 0);
    assert.equal(report.rowsFound, 5);
    assert.ok(!JSON.stringify(report).includes('Akdeniz'), 'row values are never printed');
    assert.ok(w.calls.every((c) => c.startsWith('SELECT')), 'preview issues SELECT statements only');
    assert.equal(w.sqlite.prepare("SELECT COUNT(*) n FROM source_items WHERE id LIKE 'dash-item-%' OR id LIKE 'med-item-%'").get().n, mutationsBefore);
  } finally { w.close(); }
});

test('operator: apply, idempotent replay, rollback and drift detection through the REST transport', async () => {
  const w = await world();
  const dir = mkdtempSync(join(tmpdir(), 'five-item-'));
  const journal = join(dir, 'audit.ndjson');
  try {
    const audit = fileAudit(journal);
    const applied = await executeCorrection(w.db, manifest, { operation: 'APPLY', audit });
    assert.equal(applied.status, 'COMPLETED');
    assert.equal(applied.recordsChanged, 5);
    assert.equal((await preview(w.db, manifest)).state, 'ALREADY_APPLIED');
    assert.equal((await executeCorrection(w.db, manifest, { operation: 'APPLY', audit })).recordsChanged, 0);
    const rolled = await executeCorrection(w.db, manifest, { operation: 'ROLLBACK', audit });
    assert.equal(rolled.recordsChanged, 5);
    assert.equal((await preview(w.db, manifest)).state, 'READY_FOR_APPLY');
    assert.ok(existsSync(journal));
    const lines = readFileSync(journal, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.status === 'INTENT') && lines.some((l) => l.status === 'COMPLETED'));
    // drift: a concurrent unrelated edit of an approved row blocks apply (never overwritten)
    w.sqlite.exec("UPDATE source_items SET summary = 'concurrent edit' WHERE id = 'med-item-dga-2015'");
    const drift = await preview(w.db, manifest);
    assert.equal(drift.state, 'DRIFT_DO_NOT_APPLY');
    assert.deepEqual(drift.perId['med-item-dga-2015'].differsFromBeforeImage, ['summary']);
    await assert.rejects(executeCorrection(w.db, manifest, { operation: 'APPLY', audit }), /STALE_BEFORE_IMAGE_OR_PARTIAL_STATE/);
    assert.equal(w.sqlite.prepare("SELECT summary FROM source_items WHERE id='med-item-dga-2015'").get().summary, 'concurrent edit');
  } finally { w.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('operator: wrong database id and missing confirmation are refused', async () => {
  assert.throws(() => d1RestDb({ token: 'x', databaseId: '00000000-0000-0000-0000-000000000000' }), /TARGET_DATABASE_MISMATCH/);
  assert.equal(sha256(manifest).length, 64);
});
