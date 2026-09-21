// Regression: re-polling an unchanged item must not write to D1 (Free plan bills each index update as a row write).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `upsert-writes-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/db/queries.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const { upsertSourceItem } = await import(pathToFileURL(out).href);

function fakeDb(existing, evidence = null) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => (/FROM source_items/.test(sql) ? existing : /FROM evidence_cards/.test(sql) ? evidence : null),
            run: async () => { writes.push(sql.trim().split(/\s+/).slice(0, 3).join(' ')); return { success: true }; },
          };
        },
      };
    },
  };
}

const base = {
  id: 'item_1', triage_status: 'inbox', title: 'Başlık TR', title_orig: 'Original title', summary: 'özet', gists_json: '["özet"]',
  canonical_url: 'https://example.org/a', publisher: 'Pub', published_at: '2026-09-20', enrichment_status: 'done',
  editorial_brand: null, content_family: 'hekimler_phase1', source_id: 's1', decision_route: 'NEEDS_REVIEW', intake_meta_json: '{"a":1}',
};
const input = {
  feedId: 'f', route: 'tip-ogrencileri', channelId: 'hekimler-toplulugu', title: 'Original title', summary: 'summary EN',
  canonicalUrl: 'https://example.org/a', publisher: 'Pub', publishedAt: '2026-09-20', contentFamily: 'hekimler_phase1',
  sourceId: 's1', decisionRoute: 'NEEDS_REVIEW', intakeMetaJson: '{"a":1}',
};

test('identical enriched item: zero writes', async () => {
  const db = fakeDb(base);
  const r = await upsertSourceItem(db, input);
  assert.equal(r.created, false);
  assert.deepEqual(db.writes, []);
});

test('only metadata changed: one narrow UPDATE that keeps enrichment', async () => {
  const db = fakeDb(base);
  await upsertSourceItem(db, { ...input, publishedAt: '2026-09-21' });
  assert.equal(db.writes.length, 1);
});

test('new title: full update', async () => {
  const db = fakeDb(base);
  await upsertSourceItem(db, { ...input, title: 'Changed title' });
  assert.equal(db.writes.length, 1);
});

test('identical evidence: zero writes', async () => {
  const ev = { id: 'e1', doi: 'd', pmid: null, pmcid: null, finding: 'f', limitation: null, study_type: null };
  const db = fakeDb(base, ev);
  await upsertSourceItem(db, { ...input, evidence: { doi: 'd', finding: 'f' } });
  assert.deepEqual(db.writes, []);
});

test('only provenance.fetched_at differs in intake meta: zero writes', async () => {
  const meta = (f) => JSON.stringify({ decision: 'NEEDS_REVIEW', provenance: { source_id: 's1', fetched_at: f, content_hash: 'h' } });
  const db = fakeDb({ ...base, intake_meta_json: meta('2026-09-21T14:47:04Z') });
  await upsertSourceItem(db, { ...input, intakeMetaJson: meta('2026-09-21T15:59:59Z') });
  assert.deepEqual(db.writes, []);
});

test('real intake meta change still writes', async () => {
  const db = fakeDb({ ...base, intake_meta_json: '{"decision":"NEEDS_REVIEW"}' });
  await upsertSourceItem(db, { ...input, intakeMetaJson: '{"decision":"DISCARD"}' });
  assert.equal(db.writes.length, 1);
});
