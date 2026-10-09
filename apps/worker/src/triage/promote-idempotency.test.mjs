// A2 double-promote idempotency + A3 brief wording integrity.
// Fake-D1 unit level (no network, no real DB): promote must mint exactly
// one brief/job per item; retries return the existing brief with
// deduped:true and create nothing. Owner wording must survive
// row → payload → persisted payload_json byte-for-byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `triage-promote-idem-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/triage/actions.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { applyTriage } = await import(pathToFileURL(out).href);

const WORDING = {
  title: 'Kalp Krizi “Sessiz” mi Gelir? Kardiyolog Yanıtı: ‘Bazen’ — ve 3 işaret',
  summary: 'Koroner arterlerden biri tıkanır & kalp kası oksijensiz kalır; <etiket> içermeyen düz metin, %100 özgün.',
  gists: ['Birinci gist: damar tıkanıklığı ve zamanlama.', 'İkinci gist: “erken anjiyoplasti” hayat kurtarır.'],
};

function makeRow(over = {}) {
  return {
    id: 'item_doc1',
    feed_id: 'doctor-ahmet-ekmekci-blog',
    route: 'tip-ogrencileri',
    channel_id: 'tip_toplulugu',
    title: WORDING.title,
    title_orig: null,
    summary: WORDING.summary,
    gists_json: JSON.stringify(WORDING.gists),
    canonical_url: 'https://www.drahmetekmekci.com/ornek-yazi/',
    publisher: 'Ahmet Ekmekçi resmî sitesi',
    published_at: '2026-09-28T20:11:48.000Z',
    triage_status: 'inbox',
    dedupe_key: 'https://www.drahmetekmekci.com/ornek-yazi/',
    fetched_at: '2026-10-07T23:44:16.852Z',
    source_id: 'ep_drahmetekmekci-com',
    intake_meta_json: '{}',
    ...over,
  };
}

// Stateful fake D1: one item row + zero or more brief rows. No CCOS vars
// in env → resolveOutbound is misconfigured → handoff 'failed', no fetch.
function fakeDb(row, briefs = []) {
  const runs = [];
  const batches = [];
  const stmt = (sql, args) => ({
    sql,
    args,
    bind(...b) { return stmt(sql, b); },
    first: async () => {
      if (/FROM approved_briefs/.test(sql)) {
        const list = briefs.filter((x) => x.source_item_id === args[0]);
        if (!list.length) return null;
        list.sort((a, b) => (a.approved_at < b.approved_at ? 1 : -1));
        return { p: list[0].payload_json };
      }
      if (/FROM source_items/.test(sql)) return row;
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => {
      runs.push({ sql: sql.trim().split(/\s+/).slice(0, 3).join(' '), args });
      const m = sql.match(/INSERT INTO approved_briefs/);
      if (m) {
        briefs.push({
          brief_id: args[0], source_item_id: args[1], payload_json: args[4],
          approved_at: args[7],
        });
      }
      return { success: true };
    },
  });
  return {
    runs, batches, briefs,
    prepare(sql) { return stmt(sql, []); },
    async batch(statements) {
      batches.push(statements.map((s) => s.sql.trim().split(/\s+/).slice(0, 3).join(' ')));
      return statements.map(() => ({ success: true }));
    },
  };
}

const envFor = (db) => ({ DB: db }); // no CCOS vars → handoff fails closed, no outbound fetch

test('A3: first promote snapshots owner wording byte-identical into payload and persisted row', async () => {
  const db = fakeDb(makeRow());
  const r = await applyTriage(envFor(db), 'item_doc1', 'promote', 'owner');
  assert.equal(r.deduped, undefined);
  assert.ok(r.brief);
  assert.equal(r.brief.title, WORDING.title);
  assert.equal(r.brief.summary, WORDING.summary);
  assert.deepEqual(r.brief.gists, WORDING.gists);
  assert.equal(r.brief.route, 'tip-ogrencileri');
  assert.equal(r.brief.channelId, 'tip_toplulugu');
  assert.equal(r.brief.canonicalUrl, 'https://www.drahmetekmekci.com/ornek-yazi/');
  assert.equal(r.brief.sourceItemId, 'item_doc1');
  // Persisted payload_json parses back to the identical payload (no
  // normalization between construction and storage).
  assert.equal(db.briefs.length, 1);
  assert.deepEqual(JSON.parse(db.briefs[0].payload_json), r.brief);
});

test('A2: second promote returns the existing brief, creates nothing, flags deduped', async () => {
  const db = fakeDb(makeRow());
  const first = await applyTriage(envFor(db), 'item_doc1', 'promote', 'owner');
  const firstBriefId = first.brief.briefId;
  const runsAfterFirst = db.runs.length;
  // Item is now production with a brief (as a retry would observe it).
  const prodRow = makeRow({ triage_status: 'production' });
  const db2 = fakeDb(prodRow, db.briefs);
  const second = await applyTriage(envFor(db2), 'item_doc1', 'promote', 'owner');
  assert.equal(second.deduped, true);
  assert.equal(second.brief.briefId, firstBriefId);
  assert.deepEqual(second.brief, first.brief);
  // No new brief row, no handoff_log row, no outbound side effects.
  assert.equal(db2.briefs.length, 1);
  assert.ok(!db2.runs.some((x) => x.sql === 'INSERT INTO approved_briefs'), 'no second brief insert');
  assert.ok(!db2.runs.some((x) => x.sql === 'INSERT INTO handoff_log'), 'no second handoff');
  // The retry itself is audit-recorded as a production→production decision.
  assert.ok(db2.runs.some((x) => x.sql === 'INSERT INTO editorial_decisions'), 'retry decision recorded');
  void runsAfterFirst;
});

test('A2: production item WITHOUT a brief (legacy gap) still mints its first brief', async () => {
  const db = fakeDb(makeRow({ triage_status: 'production' }), []);
  const r = await applyTriage(envFor(db), 'item_doc1', 'promote', 'owner');
  assert.equal(r.deduped, undefined);
  assert.ok(r.brief);
  assert.equal(db.briefs.length, 1);
});

test('A2: corrupt stored payload fails closed instead of minting a duplicate', async () => {
  const db = fakeDb(makeRow({ triage_status: 'production' }), [
    { brief_id: 'brief_x', source_item_id: 'item_doc1', payload_json: '{not json', approved_at: '2026-10-08T00:00:00.000Z' },
  ]);
  await assert.rejects(applyTriage(envFor(db), 'item_doc1', 'promote', 'owner'), /BRIEF_PAYLOAD_CORRUPT/);
  assert.equal(db.briefs.length, 1, 'no replacement brief minted');
});
