/**
 * Unit tests for isolated scheduled-job runner (no Cloudflare runtime).
 * Run: node --test apps/worker/src/scheduled-jobs.test.mjs
 * (compiled logic mirrored here in plain JS for node:test without a TS harness)
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Inline mirror of runIsolatedScheduledJobs for node:test without build step. */
async function runIsolatedScheduledJobs(jobs, opts = {}) {
  const prepared = [];
  for (const job of jobs) {
    if (job.enabled === false) {
      prepared.push({ id: job.id, promise: null, skipped: true });
    } else {
      prepared.push({ id: job.id, promise: Promise.resolve().then(() => job.run()), skipped: false });
    }
  }
  const settled = await Promise.allSettled(
    prepared.map((p) => (p.skipped ? Promise.resolve(null) : p.promise))
  );
  const results = [];
  for (let i = 0; i < prepared.length; i++) {
    const meta = prepared[i];
    if (meta.skipped) {
      results.push({ id: meta.id, status: 'skipped' });
      continue;
    }
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results.push({ id: meta.id, status: 'fulfilled' });
    } else {
      const err = outcome.reason;
      const row = {
        id: meta.id,
        status: 'rejected',
        error: {
          name: err instanceof Error ? err.name || 'Error' : 'Error',
          message: err instanceof Error ? err.message : String(err),
        },
      };
      results.push(row);
      opts.onError?.(row);
    }
  }
  const failures = results.filter((r) => r.status === 'rejected');
  return { ok: failures.length === 0, results, failures };
}

describe('runIsolatedScheduledJobs', () => {
  it('runs Hekimler when enrichment fails', async () => {
    const ran = [];
    const errors = [];
    const report = await runIsolatedScheduledJobs(
      [
        {
          id: 'enrich',
          run: async () => {
            ran.push('enrich');
            throw new Error('enrichment_boom');
          },
        },
        {
          id: 'hekimler-continuous',
          run: async () => {
            ran.push('hekimler');
            return { due: 1 };
          },
        },
      ],
      { onError: (r) => errors.push(r) }
    );
    assert.deepEqual(ran, ['enrich', 'hekimler']);
    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].id, 'enrich');
    assert.equal(report.failures[0].error.message, 'enrichment_boom');
    assert.equal(errors.length, 1);
    assert.equal(
      report.results.find((r) => r.id === 'hekimler-continuous').status,
      'fulfilled'
    );
  });

  it('runs enrichment when Hekimler fails', async () => {
    const ran = [];
    const report = await runIsolatedScheduledJobs([
      {
        id: 'enrich',
        run: async () => {
          ran.push('enrich');
        },
      },
      {
        id: 'hekimler-continuous',
        run: async () => {
          ran.push('hekimler');
          throw new Error('hekimler_boom');
        },
      },
      {
        id: 'news-generic',
        run: async () => {
          ran.push('news');
        },
      },
    ]);
    assert.deepEqual(ran, ['enrich', 'hekimler', 'news']);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].id, 'hekimler-continuous');
    assert.equal(report.failures[0].error.message, 'hekimler_boom');
    assert.equal(report.results.find((r) => r.id === 'enrich').status, 'fulfilled');
    assert.equal(report.results.find((r) => r.id === 'news-generic').status, 'fulfilled');
  });

  it('emits structured errors for both failure sides', async () => {
    const logged = [];
    const report = await runIsolatedScheduledJobs(
      [
        { id: 'enrich', run: async () => { throw new TypeError('no_ai_binding'); } },
        { id: 'hekimler-continuous', run: async () => { throw new Error('lock_table_missing'); } },
      ],
      { onError: (r) => logged.push(r) }
    );
    assert.equal(report.failures.length, 2);
    assert.equal(logged.length, 2);
    const byId = Object.fromEntries(logged.map((r) => [r.id, r.error]));
    assert.equal(byId.enrich.name, 'TypeError');
    assert.equal(byId.enrich.message, 'no_ai_binding');
    assert.equal(byId['hekimler-continuous'].name, 'Error');
    assert.equal(byId['hekimler-continuous'].message, 'lock_table_missing');
  });
});

describe('pickScheduledSlot (one job per tick)', async () => {
  const { pickScheduledSlot } = await import('./scheduled-jobs.ts');
  it('returns exactly one slot for every minute of the day and covers every job', () => {
    const seen = new Set();
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) seen.add(pickScheduledSlot(h, m));
    for (const id of [
      'who-news', 'europe-pmc', 'pubmed', 'research-apis', 'journal-fallback',
      'purge-trash', 'news-generic', 'research-generic', 'enrich', 'hekimler-continuous',
    ]) assert.ok(seen.has(id), `slot ${id} never scheduled`);
  });
  it('feed polling stays at least 10x per hour for news and research', () => {
    const count = (id) => Array.from({ length: 60 }, (_, m) => pickScheduledSlot(3, m)).filter((s) => s === id).length;
    assert.ok(count('news-generic') >= 10 && count('research-generic') >= 10);
  });
});
