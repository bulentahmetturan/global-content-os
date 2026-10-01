// Package 5: liveness != readiness; BLOCKED only for critical dependencies; schema-expectation drift guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function load(entry, name) {
  const out = join(tmpdir(), `${name}-${process.pid}.mjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const r = await load('apps/worker/src/readiness.ts', 'readiness');
const worker = (await load('apps/worker/src/index.ts', 'worker-index-ready')).default;

const OK = {
  dbReachable: true,
  appliedMigration: r.EXPECTED_SCHEMA_MIGRATION,
  cronLastActivityAgeMin: 2,
  statusCallbackTokenConfigured: true,
  ingestTokenConfigured: true,
  openAlexKeyConfigured: true,
  handoffMode: 'stub',
};

test('EXPECTED_SCHEMA_MIGRATION equals the newest file in migrations/ (code/schema drift guard)', () => {
  const newest = readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort().at(-1);
  assert.equal(r.EXPECTED_SCHEMA_MIGRATION, newest);
});

test('READY when everything is present', () => {
  assert.equal(r.evaluateReadiness(OK).level, 'READY');
});

test('BLOCKED only for critical dependencies (db down, schema behind)', () => {
  assert.equal(r.evaluateReadiness({ ...OK, dbReachable: false }).level, 'BLOCKED');
  const behind = r.evaluateReadiness({ ...OK, appliedMigration: '0001_init.sql' });
  assert.equal(behind.level, 'BLOCKED');
  assert.match(behind.blocked[0], /^SCHEMA_BEHIND/);
});

test('optional-capability problems DEGRADE, never BLOCK', () => {
  for (const patch of [
    { statusCallbackTokenConfigured: false },
    { ingestTokenConfigured: false },
    { openAlexKeyConfigured: false },
    { handoffMode: 'misconfigured' },
    { cronLastActivityAgeMin: 500 },
    { cronLastActivityAgeMin: null },
    { appliedMigration: null },
  ]) {
    const rep = r.evaluateReadiness({ ...OK, ...patch });
    assert.equal(rep.level, 'DEGRADED', JSON.stringify(patch));
    assert.equal(rep.blocked.length, 0);
  }
});

function db({ reachable = true, migration = r.EXPECTED_SCHEMA_MIGRATION } = {}) {
  const st = (sql) => ({
    first: async () => {
      if (!reachable) throw new Error('D1 down');
      if (/d1_migrations/.test(sql)) return { name: migration };
      if (/source_feeds/.test(sql)) return { t: new Date(Date.now() - 60_000).toISOString() };
      return { one: 1 };
    },
  });
  return { prepare: st };
}

test('/api/health is liveness only and answers even when the DB is down; /api/ready reports it', async () => {
  const down = { DB: db({ reachable: false }), BUILD_COMMIT: 'abc' };
  const h = await worker.fetch(new Request('https://x.test/api/health'), down);
  assert.equal(h.status, 200);
  assert.equal((await h.json()).level, 'liveness');
  const rd = await worker.fetch(new Request('https://x.test/api/ready'), down);
  assert.equal(rd.status, 503);
  assert.equal((await rd.json()).level, 'BLOCKED');
});

test('/api/ready: 200 READY / DEGRADED with secrets flags only (no secret values leaked)', async () => {
  const env = { DB: db(), STATUS_CALLBACK_TOKEN: 'sekret-1', TIP_RADAR_INGEST_TOKEN: 'sekret-2', OPENALEX_API_KEY: 'sekret-3' };
  const ok = await worker.fetch(new Request('https://x.test/api/ready'), env);
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.level, 'READY');
  assert.ok(!JSON.stringify(body).includes('sekret'));
  const deg = await worker.fetch(new Request('https://x.test/api/ready'), { DB: db() });
  assert.equal(deg.status, 200);
  assert.equal((await deg.json()).level, 'DEGRADED');
  const behind = await worker.fetch(new Request('https://x.test/api/ready'), { DB: db({ migration: '0001_init.sql' }) });
  assert.equal(behind.status, 503);
});
