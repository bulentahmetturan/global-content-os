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
  editorial_brand: null, content_family: 'tip_toplulugu_phase1', source_id: 's1', decision_route: 'NEEDS_REVIEW', intake_meta_json: '{"a":1}',
};
const input = {
  feedId: 'f', route: 'tip-ogrencileri', channelId: 'tip_toplulugu', title: 'Original title', summary: 'summary EN',
  canonicalUrl: 'https://example.org/a', publisher: 'Pub', publishedAt: '2026-09-20', contentFamily: 'tip_toplulugu_phase1',
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
  await upsertSourceItem(db, { ...input, sourceId: "s2" });
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

function bindingDb(existing) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => (/FROM source_items/.test(sql) ? existing : null),
            run: async () => { writes.push({ sql: sql.trim().split(/\s+/).slice(0, 3).join(' '), args }); return { success: true }; },
          };
        },
      };
    },
  };
}
const news = { ...input, route: 'kaduse-news', channelId: 'kaduse-medikal', contentFamily: null, sourceId: null, decisionRoute: null, intakeMetaJson: null };
const newsRow = { ...base, published_at: '2026-09-29', content_family: null, source_id: null, decision_route: null, intake_meta_json: null };

test('re-poll with an unpadded source date keeps the stored ISO date: zero writes (2026-09 MNT regression)', async () => {
  const db = bindingDb(newsRow);
  await upsertSourceItem(db, { ...news, publishedAt: '2026-9-29' });
  assert.deepEqual(db.writes, []);
});

test('re-poll repairs a previously stored raw date to ISO', async () => {
  const db = bindingDb({ ...newsRow, published_at: '2026-9-29' });
  await upsertSourceItem(db, { ...news, publishedAt: '2026-9-29' });
  assert.equal(db.writes.length, 1);
  assert.ok(db.writes[0].args.includes('2026-09-29'), JSON.stringify(db.writes[0].args));
  assert.ok(!db.writes[0].args.includes('2026-9-29'));
});

test('research month-precision dates are normalised on update too', async () => {
  const db = bindingDb({ ...newsRow, published_at: '2026-09-02' });
  await upsertSourceItem(db, { ...news, route: 'kaduse-research', publishedAt: '2026 Sep 2' });
  assert.deepEqual(db.writes, []);
});

test('top-level fetched_at/created_at differences are volatile too', async () => {
  const meta = (f) => JSON.stringify({ decision: 'NEEDS_REVIEW', fetched_at: f, created_at: f, provenance: { fetched_at: f, content_hash: 'h' } });
  const db = fakeDb({ ...base, intake_meta_json: meta('2026-09-21T14:47:04Z') });
  await upsertSourceItem(db, { ...input, intakeMetaJson: meta('2026-09-21T16:00:00Z') });
  assert.deepEqual(db.writes, []);
});

// Temporal V2 Group 0: published_at is immutable once set.
function recordingDb(existing) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => (/FROM source_items/.test(sql) ? existing : null),
            run: async () => { calls.push({ sql, args }); return { success: true }; },
          };
        },
      };
    },
  };
}

test('published_at preserved: later sighting with a different date writes nothing', async () => {
  const db = recordingDb(base);
  await upsertSourceItem(db, { ...input, publishedAt: '2026-09-25' });
  assert.deepEqual(db.calls, []);
});

test('published_at preserved: later sighting with null date writes nothing', async () => {
  const db = recordingDb(base);
  await upsertSourceItem(db, { ...input, publishedAt: null });
  assert.deepEqual(db.calls, []);
});

test('published_at preserved: a meta UPDATE for another field cannot null or replace it', async () => {
  const db = recordingDb(base);
  await upsertSourceItem(db, { ...input, publishedAt: null, sourceId: 's2' });
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /published_at = CASE WHEN \? = 1 THEN COALESCE\(\?, published_at\) ELSE COALESCE\(published_at, \?\) END/);
  const [, , flag, incoming, fallback] = db.calls[0].args;
  assert.equal(flag, 0);
  assert.equal(incoming, null);
  assert.equal(fallback, null);
});

test('published_at: a null stored date may be filled by a later sighting', async () => {
  const db = recordingDb({ ...base, published_at: null });
  await upsertSourceItem(db, { ...input, publishedAt: '2026-09-25' });
  assert.equal(db.calls.length, 1);
});

test('published_at: explicit verified correction is the only way to change it', async () => {
  const db = recordingDb(base);
  await upsertSourceItem(db, { ...input, publishedAt: '2026-09-25', verifiedDateCorrection: true });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].args[2], 1);
  assert.equal(db.calls[0].args[3], '2026-09-25');
});

test('published_at: impossible-year source date never reaches an existing row', async () => {
  const db = recordingDb({ ...base, route: 'kaduse-research', published_at: null });
  await upsertSourceItem(db, { ...input, route: 'kaduse-research', publishedAt: '2105-03-04' });
  assert.deepEqual(db.calls, []);
});

test('published_at: a different day is not a representation repair', async () => {
  const db = recordingDb({ ...base, published_at: '2026-9-20' });
  await upsertSourceItem(db, { ...input, publishedAt: '2026-09-25' });
  assert.deepEqual(db.calls, []);
});
