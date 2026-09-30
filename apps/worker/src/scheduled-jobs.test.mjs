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
  it('runs Tıp Topluluğu when enrichment fails', async () => {
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
          id: 'tip-toplulugu-continuous',
          run: async () => {
            ran.push('tip_toplulugu');
            return { due: 1 };
          },
        },
      ],
      { onError: (r) => errors.push(r) }
    );
    assert.deepEqual(ran, ['enrich', 'tip_toplulugu']);
    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].id, 'enrich');
    assert.equal(report.failures[0].error.message, 'enrichment_boom');
    assert.equal(errors.length, 1);
    assert.equal(
      report.results.find((r) => r.id === 'tip-toplulugu-continuous').status,
      'fulfilled'
    );
  });

  it('runs enrichment when Tıp Topluluğu fails', async () => {
    const ran = [];
    const report = await runIsolatedScheduledJobs([
      {
        id: 'enrich',
        run: async () => {
          ran.push('enrich');
        },
      },
      {
        id: 'tip-toplulugu-continuous',
        run: async () => {
          ran.push('tip_toplulugu');
          throw new Error('tip_toplulugu_boom');
        },
      },
      {
        id: 'news-generic',
        run: async () => {
          ran.push('news');
        },
      },
    ]);
    assert.deepEqual(ran, ['enrich', 'tip_toplulugu', 'news']);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].id, 'tip-toplulugu-continuous');
    assert.equal(report.failures[0].error.message, 'tip_toplulugu_boom');
    assert.equal(report.results.find((r) => r.id === 'enrich').status, 'fulfilled');
    assert.equal(report.results.find((r) => r.id === 'news-generic').status, 'fulfilled');
  });

  it('emits structured errors for both failure sides', async () => {
    const logged = [];
    const report = await runIsolatedScheduledJobs(
      [
        { id: 'enrich', run: async () => { throw new TypeError('no_ai_binding'); } },
        { id: 'tip-toplulugu-continuous', run: async () => { throw new Error('lock_table_missing'); } },
      ],
      { onError: (r) => logged.push(r) }
    );
    assert.equal(report.failures.length, 2);
    assert.equal(logged.length, 2);
    const byId = Object.fromEntries(logged.map((r) => [r.id, r.error]));
    assert.equal(byId.enrich.name, 'TypeError');
    assert.equal(byId.enrich.message, 'no_ai_binding');
    assert.equal(byId['tip-toplulugu-continuous'].name, 'Error');
    assert.equal(byId['tip-toplulugu-continuous'].message, 'lock_table_missing');
  });
});

describe('pickScheduledSlot (one job per tick)', async () => {
  const { pickScheduledSlot } = await import('./scheduled-jobs.ts');
  it('returns exactly one slot for every minute of the day and covers every job', () => {
    const seen = new Set();
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) seen.add(pickScheduledSlot(h, m));
    for (const id of [
      'who-news', 'europe-pmc', 'pubmed', 'research-apis', 'journal-fallback',
      'purge-trash', 'news-generic', 'research-generic', 'enrich', 'tip-toplulugu-continuous',
    ]) assert.ok(seen.has(id), `slot ${id} never scheduled`);
  });
  it('feed polling stays at least 10x per hour for news and research', () => {
    const count = (id) => Array.from({ length: 60 }, (_, m) => pickScheduledSlot(3, m)).filter((s) => s === id).length;
    assert.ok(count('news-generic') >= 10 && count('research-generic') >= 10);
  });
});

describe('journalFallbackOffset (journal Crossref rotation)', async () => {
  const { pickScheduledSlot, journalFallbackOffset } = await import('./scheduled-jobs.ts');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./ingress/journal-fallback.ts', import.meta.url), 'utf8');
  const realTotal = (src.match(/feedId: '/g) || []).length;
  const LIMIT = 5;

  /** Minute-of-simulation at which each journal index is polled, over `days` UTC days of 1-minute cron ticks. */
  function simulate(total, days) {
    const visits = Array.from({ length: total }, () => []);
    for (let d = 0; d < days; d++)
      for (let h = 0; h < 24; h++)
        for (let m = 0; m < 60; m++) {
          if (pickScheduledSlot(h, m) !== 'journal-fallback') continue;
          const offset = journalFallbackOffset(h, m, total, LIMIT);
          assert.ok(offset >= 0 && offset < total, `offset ${offset} out of range for total ${total}`);
          for (let i = offset; i < Math.min(offset + LIMIT, total); i++) visits[i].push(d * 1440 + h * 60 + m);
        }
    return visits;
  }

  it('reads the real journal count from journal-fallback.ts', () => {
    assert.ok(realTotal >= 20, `expected the JOURNAL_QUERIES list, found ${realTotal} entries`);
  });

  it('polls every journal every UTC day, not only the last batch (2026-09-22 regression)', () => {
    for (const total of [realTotal, 26, 30, 7, 5]) {
      const visits = simulate(total, 2);
      const never = visits.map((v, i) => (v.some((t) => t < 1440) ? null : i)).filter((i) => i !== null);
      assert.deepEqual(never, [], `total=${total}: journals never polled on day 1: ${never.join(',')}`);
    }
  });

  it('keeps the gap between polls of any journal within 12h, so a 1440-min journal is fetched <= 36h apart', () => {
    const visits = simulate(realTotal, 3);
    for (let i = 0; i < realTotal; i++) {
      const gaps = visits[i].slice(1).map((t, k) => t - visits[i][k]);
      assert.ok(Math.max(...gaps) <= 720, `journal ${i}: max gap ${Math.max(...gaps)} min`);
    }
  });
});
