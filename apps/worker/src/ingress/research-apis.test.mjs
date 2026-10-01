// OpenAlex research feed: OPENALEX_API_KEY as a Bearer credential, fail-closed when it is unset,
// auth vs rate-limit errors kept distinct in source_feeds.last_error, and the key never leaves the request header.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { ingestResearchApis, openAlexHttpError } = await bundle('apps/worker/src/ingress/research-apis.ts', 'research-apis');

const FEED = 'research-openalex-api';
const KEY = 'oa-test-key-5f3c9e1d';

/** Full migration chain; only the OpenAlex feed is left enabled so no other research API is called. */
function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((x) => x.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  sqlite.prepare(`UPDATE source_feeds SET enabled = CASE WHEN id = ? THEN 1 ELSE 0 END`).run(FEED);
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const feedRow = (sqlite) => sqlite.prepare(`SELECT last_error, fetch_attempts, last_fetched_at, last_ok_items FROM source_feeds WHERE id = ?`).get(FEED);

const WORKS = {
  meta: { count: 2 },
  results: [
    { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1234/abc', display_name: 'AI-assisted auscultation in primary care', publication_date: '2026-09-20', primary_location: { source: { display_name: 'Test Journal' } } },
    { id: 'https://openalex.org/W2', doi: null, display_name: 'Digital stethoscope validation study', publication_date: '2026-09-18' },
  ],
};

function captureConsole(t) {
  const lines = [];
  for (const m of ['log', 'error', 'warn', 'info']) t.mock.method(console, m, (...a) => lines.push(a.map(String).join(' ')));
  return lines;
}

test('secret absent: no network call, explicit last_error, attempt counted, feed stays due', async (t) => {
  const { sqlite, db } = openDb();
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('must not be called');
  });
  captureConsole(t);
  const out = await ingestResearchApis({ DB: db });
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(out.openalex, { created: 0, updated: 0, total: 0 });
  const row = feedRow(sqlite);
  assert.equal(row.last_error, 'OPENALEX_API_KEY_NOT_CONFIGURED');
  assert.equal(row.fetch_attempts, 1);
  assert.equal(row.last_fetched_at, null);
  for (const blank of ['', '   ', '\n']) {
    await ingestResearchApis({ DB: db, OPENALEX_API_KEY: blank });
    assert.equal(fetch.mock.callCount(), 0, `blank key ${JSON.stringify(blank)} must not fall back to a keyless call`);
  }
});

test('auth success: Bearer header, key not in URL, works stored, last_error cleared, attempts incremented', async (t) => {
  const { sqlite, db } = openDb();
  sqlite.prepare(`UPDATE source_feeds SET last_error = 'OpenAlex failed: 429', fetch_attempts = 4 WHERE id = ?`).run(FEED);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(WORKS), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const logs = captureConsole(t);
  const out = await ingestResearchApis({ DB: db, OPENALEX_API_KEY: ` "${KEY}"\n` });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith('https://api.openalex.org/works?'));
  assert.ok(!calls[0].url.includes(KEY) && !calls[0].url.includes('api_key'), 'key must not be in the URL');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(out.openalex, { created: 2, updated: 0, total: 2 });
  const row = feedRow(sqlite);
  assert.equal(row.last_error, null);
  assert.equal(row.fetch_attempts, 5);
  assert.equal(row.last_ok_items, 2);
  assert.ok(row.last_fetched_at);
  const items = sqlite.prepare(`SELECT dedupe_key, canonical_url, publisher FROM source_items WHERE feed_id = ? ORDER BY dedupe_key`).all(FEED);
  assert.deepEqual(items.map((i) => i.canonical_url), ['https://doi.org/10.1234/abc', 'https://openalex.org/W2']);
  assert.ok(!logs.join('\n').includes(KEY));
});

test('HTTP 429: rate-limit last_error with reset hint, last_fetched_at untouched (retried next slot), no key leaked', async (t) => {
  const { sqlite, db } = openDb();
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: 'Rate limit exceeded', api_key: KEY }), {
      status: 429,
      headers: { 'X-RateLimit-Reset': '3600', 'X-RateLimit-Remaining': '0' },
    })
  );
  const logs = captureConsole(t);
  const out = await ingestResearchApis({ DB: db, OPENALEX_API_KEY: KEY });
  assert.deepEqual(out.openalex, { created: 0, updated: 0, total: 0 });
  const row = feedRow(sqlite);
  assert.equal(row.last_error, 'OPENALEX_RATE_LIMITED: HTTP 429 reset_in_s=3600 remaining=0');
  assert.equal(row.fetch_attempts, 1);
  assert.equal(row.last_fetched_at, null);
  assert.ok(!logs.join('\n').includes(KEY), 'response body must never reach logs');
  assert.ok(!row.last_error.includes(KEY));
});

test('HTTP 401/403: auth-rejected last_error, distinct from rate limit and generic failure', async (t) => {
  for (const status of [401, 403]) {
    const { sqlite, db } = openDb();
    t.mock.method(globalThis, 'fetch', async () => new Response('{"error":"invalid api key"}', { status }));
    captureConsole(t);
    await ingestResearchApis({ DB: db, OPENALEX_API_KEY: KEY });
    assert.equal(feedRow(sqlite).last_error, `OPENALEX_AUTH_REJECTED: HTTP ${status}`);
    t.mock.restoreAll();
  }
  assert.equal(openAlexHttpError(new Response('', { status: 503 })), 'OpenAlex failed: 503');
  assert.equal(openAlexHttpError(new Response('', { status: 429, headers: { 'Retry-After': '120' } })), 'OPENALEX_RATE_LIMITED: HTTP 429 reset_in_s=120');
  assert.equal(openAlexHttpError(new Response('', { status: 429 })), 'OPENALEX_RATE_LIMITED: HTTP 429');
});

test('a thrown error that echoes the key is redacted before last_error and logs', async (t) => {
  const { sqlite, db } = openDb();
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError(`Invalid header value: Bearer ${KEY}`);
  });
  const logs = captureConsole(t);
  await ingestResearchApis({ DB: db, OPENALEX_API_KEY: KEY });
  const row = feedRow(sqlite);
  assert.ok(!row.last_error.includes(KEY));
  assert.match(row.last_error, /\[redacted\]/);
  assert.ok(!logs.join('\n').includes(KEY));
});
