import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { STARVED_JOURNALS, parseArgs, preflightUrl } from './journal-backfill.mjs';

const q = await import('../apps/worker/src/ingress/research-quality.ts');

describe('journal backfill operator script', () => {
  it('targets exactly the 14 starved journals with the ISSNs the Worker uses', () => {
    const src = readFileSync(new URL('../apps/worker/src/ingress/journal-fallback.ts', import.meta.url), 'utf8');
    assert.equal(Object.keys(STARVED_JOURNALS).length, 14);
    for (const [feedId, issn] of Object.entries(STARVED_JOURNALS)) {
      const re = new RegExp(`feedId: '${feedId}',[\\s\\S]{0,160}?issn: '${issn.replace('-', '\\-')}'`);
      assert.ok(re.test(src), `${feedId} / ${issn} not in JOURNAL_QUERIES`);
    }
  });

  it('defaults to the owner-approved window and requires an explicit mode', () => {
    const a = parseArgs(['--dry-run']);
    assert.equal(a.mode, 'dry-run');
    assert.equal(a.from, '2026-09-22');
    assert.equal(a.until, '2026-09-30');
    assert.equal(a.maxItems, 2000);
    assert.throws(() => parseArgs([]), /choose one of/);
    assert.throws(() => parseArgs(['--execute', '--feeds', 'research-nejm']), /not a backfill journal/);
  });

  it('preflight URL matches the Worker URL builder', () => {
    const worker = q.crossrefWindowUrl({ issn: '1756-1833', from: '2026-09-22', until: '2026-09-30', rows: 20, cursor: 'abc' });
    assert.equal(preflightUrl('1756-1833', '2026-09-22', '2026-09-30', 20, 'abc'), worker);
  });
});

describe('crossrefWindowUrl', () => {
  it('filters by ISSN and publication window with cursor paging, rows capped at 20', () => {
    const u = new URL(q.crossrefWindowUrl({ issn: '0140-6736', from: '2026-09-22', until: '2026-09-30', rows: 500 }));
    assert.equal(u.searchParams.get('filter'), 'issn:0140-6736,from-pub-date:2026-09-22,until-pub-date:2026-09-30');
    assert.equal(u.searchParams.get('rows'), '20');
    assert.equal(u.searchParams.get('cursor'), '*');
  });
  it('rejects a missing ISSN or a bad window', () => {
    assert.throws(() => q.crossrefWindowUrl({ issn: '', from: '2026-09-22', until: '2026-09-30', rows: 20 }), /issn_required/);
    assert.throws(() => q.crossrefWindowUrl({ issn: 'x', from: '2026-9-22', until: '2026-09-30', rows: 20 }), /invalid_window/);
    assert.throws(() => q.crossrefWindowUrl({ issn: 'x', from: '2026-09-30', until: '2026-09-22', rows: 20 }), /invalid_window/);
  });
});
