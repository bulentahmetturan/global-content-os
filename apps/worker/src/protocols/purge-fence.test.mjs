import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const approved = await bundle('apps/worker/src/protocols/approved-display.ts', 'purge-fence-approved');
const actions = await bundle('apps/worker/src/triage/actions.ts', 'purge-fence-actions');

test('purgeExpiredTrash never hard-deletes the five approved protocol items, but purges other expired trash', async () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((x) => x.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const db = d1FromSqlite(sqlite);
  try {
    const ids = approved.APPROVED_PROTOCOL_DISPLAY.map((x) => x.id);
    assert.equal(ids.length, 5);
    const feed = sqlite.prepare('SELECT feed_id FROM source_items WHERE id = ?').get(ids[0]).feed_id;
    sqlite.prepare(`UPDATE source_items SET triage_status='trash', updated_at='2000-01-01T00:00:00.000Z' WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, updated_at)
      VALUES ('purge-victim', ?, 'kaduse-news', 'kaduse-medikal', 'T', 'https://example.org/purge', 'P', 'trash', 'purge-dk', '2000-01-01T00:00:00.000Z')`).run(feed);
    const before = JSON.stringify(sqlite.prepare(`SELECT * FROM source_items WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids));
    const out = await actions.purgeExpiredTrash({ DB: db }, 2);
    assert.deepEqual(out, { deleted: 1 });
    assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM source_items WHERE id='purge-victim'`).get().n, 0);
    assert.equal(JSON.stringify(sqlite.prepare(`SELECT * FROM source_items WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids)), before);
  } finally { sqlite.close(); }
});
