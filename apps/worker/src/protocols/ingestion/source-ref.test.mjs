// Immutable source references: real 0042 source_items rows bind, forgeries fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const refs = await bundle('apps/worker/src/protocols/ingestion/source-ref.ts', 'ingest-sourceref');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

test('content hash is deterministic (SHA-256 hex)', async () => {
  const a = await refs.hashContent('DASH booklet Box 3');
  const b = await refs.hashContent('DASH booklet Box 3');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await refs.hashContent('DASH booklet Box 4'));
});

test('real CONTROLLED_SQL_IMPORT row binds (dash-item-trial-1997)', async () => {
  const { db } = openDb();
  const bound = await refs.bindSourceRef(db, {
    sourceItemId: 'dash-item-trial-1997',
    canonicalUrl: 'https://pubmed.ncbi.nlm.nih.gov/9099655/',
    publisher: 'The New England Journal of Medicine',
    contentText: 'RCT n=459: DASH combination diet lowered blood pressure.',
  });
  assert.equal(bound.sourceItemId, 'dash-item-trial-1997');
  assert.match(bound.contentHash, /^[0-9a-f]{64}$/);
});

test('unknown source item fails closed', async () => {
  const { db } = openDb();
  await assert.rejects(
    refs.bindSourceRef(db, { sourceItemId: 'item_nope', canonicalUrl: 'https://x', publisher: 'P', contentText: 't' }),
    /SOURCE_REF_UNKNOWN/,
  );
});

test('URL/publisher mismatch fails closed (no silent rebind)', async () => {
  const { db } = openDb();
  await assert.rejects(
    refs.bindSourceRef(db, {
      sourceItemId: 'dash-item-trial-1997',
      canonicalUrl: 'https://evil.example/fake',
      publisher: 'The New England Journal of Medicine',
      contentText: 't',
    }),
    /SOURCE_REF_MISMATCH/,
  );
});

test('excerpt binding: verbatim substring passes, invented text quarantines', async () => {
  refs.assertExcerptBound('Grains: 6-8 servings per day at 2000 kcal', '6-8 servings per day');
  assert.throws(() => refs.assertExcerptBound('Grains: 6-8 servings per day', 'cures hypertension in 3 days'), /EXCERPT_UNBOUND/);
  assert.throws(() => refs.assertExcerptBound('content', '   '), /EXCERPT_EMPTY/);
});
