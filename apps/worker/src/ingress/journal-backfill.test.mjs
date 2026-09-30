// One-off journal backfill: same filters + DOI dedupe as the scheduled job, dry-run never writes, re-run creates nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `journal-backfill-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/ingress/journal-fallback.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const { backfillJournalWindow } = await import(pathToFileURL(out).href);

/** In-memory D1 stand-in: knows which dedupe keys exist, records every write. */
function fakeEnv(existingKeys = []) {
  const keys = new Set(existingKeys);
  const writes = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => {
              if (/FROM source_feeds/.test(sql)) return { id: args[0], channel_id: 'kaduse-medikal', label: 'The Lancet' };
              if (/FROM source_items WHERE route = \? AND dedupe_key = \?/.test(sql)) {
                return keys.has(args[1])
                  ? { id: `item_${args[1]}`, triage_status: 'inbox', title: 'x', title_orig: 'x', summary: 'x', gists_json: '["x"]', enrichment_status: 'pending' }
                  : null;
              }
              return null;
            },
            run: async () => {
              writes.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
              if (/^\s*INSERT INTO source_items/.test(sql)) for (const v of args) if (typeof v === 'string' && v.startsWith('10.')) keys.add(v);
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { env: { DB }, keys, writes };
}

const work = (doi, over = {}) => ({
  DOI: doi,
  title: [`A randomised trial of intervention ${doi}`],
  'container-title': ['The Lancet'],
  published: { 'date-parts': [[2026, 9, 24]] },
  ...over,
});

async function withCrossref(pages, fn) {
  const real = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const cursor = new URL(String(url)).searchParams.get('cursor');
    const body = pages[cursor] ?? { items: [] };
    return new Response(JSON.stringify({ message: { 'total-results': 3, ...body } }), { status: 200 });
  };
  try {
    return await fn(urls);
  } finally {
    globalThis.fetch = real;
  }
}

const PAGES = {
  '*': {
    items: [
      work('10.1016/S0140-6736(26)00001-1'),
      work('10.1016/S0140-6736(26)00002-2'),
      work('10.1016/other', { 'container-title': ['The Lancet Oncology'] }), // wrong journal: filtered like the scheduled job
      work('10.1016/pending', { title: ['Title Pending 1'] }),
    ],
    'next-cursor': 'c2',
  },
  c2: { items: [work('10.1016/S0140-6736(26)00003-3')], 'next-cursor': 'c3' },
};
const args = { feedId: 'research-the-lancet', from: '2026-09-22', until: '2026-09-30', rows: 20 };

test('dry-run reads only and reports would-create vs existing', async () => {
  const { env, writes } = fakeEnv(['10.1016/s0140-6736(26)00002-2']);
  await withCrossref(PAGES, async (urls) => {
    const p = await backfillJournalWindow(env, { ...args, dryRun: true });
    assert.equal(p.fetched, 4);
    assert.equal(p.candidates, 2);
    assert.equal(p.existing, 1);
    assert.equal(p.wouldCreate, 1);
    assert.equal(p.nextCursor, 'c2');
    assert.match(urls[0], /filter=issn%3A0140-6736%2Cfrom-pub-date%3A2026-09-22%2Cuntil-pub-date%3A2026-09-30/);
  });
  assert.deepEqual(writes, []);
});

test('execute is idempotent: a second pass over the same pages creates nothing (DOI dedupe)', async () => {
  const { env, writes } = fakeEnv();
  await withCrossref(PAGES, async () => {
    const run = async () => {
      const a = await backfillJournalWindow(env, { ...args, dryRun: false });
      const b = await backfillJournalWindow(env, { ...args, dryRun: false, cursor: a.nextCursor });
      const c = await backfillJournalWindow(env, { ...args, dryRun: false, cursor: b.nextCursor });
      assert.equal(c.fetched, 0);
      assert.equal(c.nextCursor, null);
      return a.created + b.created;
    };
    assert.equal(await run(), 3);
    const inserts = writes.filter((w) => w === 'INSERT INTO source_items').length;
    assert.equal(inserts, 3);
    assert.equal(await run(), 0);
    assert.equal(writes.filter((w) => w === 'INSERT INTO source_items').length, inserts);
  });
  assert.ok(!writes.some((w) => /source_feeds/.test(w)), 'backfill must not touch source_feeds cadence');
});

test('only journals with an ISSN in JOURNAL_QUERIES can be backfilled', async () => {
  const { env } = fakeEnv();
  await assert.rejects(backfillJournalWindow(env, { ...args, feedId: 'research-medrxiv-preprint' }), /backfill_unknown_journal/);
  await assert.rejects(backfillJournalWindow(env, { ...args, feedId: 'nope' }), /backfill_unknown_journal/);
});
