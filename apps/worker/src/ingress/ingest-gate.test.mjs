import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const g = await import('./ingest-gate.ts');
const NOW = new Date('2026-09-22T12:00:00Z');
const news = (o) => g.ingestGate({ route: 'kaduse-news', feedId: 'f', title: 'Sağlık Bakanlığı yeni düzenleme yayımladı', ...o }, NOW);
describe('ingest gate: news', () => {
  it('accepts a recent dated item and normalises RFC822', () => {
    const v = news({ publishedAt: 'Mon, 21 Sep 2026 10:00:00 GMT' });
    assert.deepEqual(v, { ok: true, publishedAt: '2026-09-21' });
  });
  it('rejects older than 10 days, undated, future, placeholder', () => {
    assert.equal(news({ publishedAt: '2026-09-10' }).reason, 'stale');
    assert.equal(news({ publishedAt: null }).reason, 'undated');
    assert.equal(news({ publishedAt: '2027-03-01' }).reason, 'future_date');
    assert.equal(news({ publishedAt: '2026-09-21', title: 'Title Pending 927' }).reason, 'placeholder_title');
  });
  it('allows undated only for the AA health listing', () => {
    assert.equal(news({ feedId: 'news-aa-saglik-scoped', publishedAt: null }).ok, true);
  });
  it('boundary: exactly 10 days ok, 11 days stale', () => {
    assert.equal(news({ publishedAt: '2026-09-12' }).ok, true);
    assert.equal(news({ publishedAt: '2026-09-11' }).reason, 'stale');
  });
});
describe('ingest gate: research and dates', () => {
  const res = (o) => g.ingestGate({ route: 'kaduse-research', feedId: 'r', title: 'Deep learning for arrhythmia detection', ...o }, NOW);
  it('does not age- or undated-gate research yet', () => {
    assert.equal(res({ publishedAt: '2019-01-01' }).ok, true);
    assert.equal(res({ publishedAt: null }).ok, true);
  });
  it('still rejects placeholders and future dates in research; GDELT needs health terms', () => {
    assert.equal(res({ title: 'Title Pending 5', publishedAt: '2026-09-01' }).reason, 'placeholder_title');
    assert.equal(res({ publishedAt: '2036-09-18' }).reason, 'future_date');
    assert.equal(res({ publishedAt: '2026 Oct' }).ok, true); // real print-issue date, ~9 days ahead
    assert.equal(res({ publishedAt: '2027 Jan 31' }).reason, 'future_date');
    assert.equal(res({ feedId: 'research-gdelt-doc-api', title: 'Nokia HMD 105 tuşlu telefon', publishedAt: '2026-09-21' }).reason, 'off_topic');
    assert.equal(res({ feedId: 'research-gdelt-doc-api', title: 'Hospital outbreak of infection reported', publishedAt: '2026-09-21' }).ok, true);
  });
  it('normalises odd formats', () => {
    assert.equal(g.normalizeDate('2026 Sep 7'), '2026-09-07');
    assert.equal(g.normalizeDate('2026 Sep'), '2026-09-01');
    assert.equal(g.normalizeDate('2026'), '2026-01-01');
    assert.equal(g.normalizeDate('garbage'), null);
    assert.equal(g.normalizeDate('2026-9-29'), '2026-09-29'); // Medical News Today news sitemap (unpadded)
    assert.equal(g.normalizeDate('2026-9-7T10:00:00Z'), '2026-09-07');
    assert.equal(g.normalizeDate('2026-09-29T23:30:00-04:00'), '2026-09-29');
  });
  it('ignores non-Kaduse routes', () => {
    assert.equal(g.ingestGate({ route: 'tip-ogrencileri', feedId: 'x', title: 'x', publishedAt: null }, NOW).ok, true);
  });
});
describe('ingest gate: Temporal V2 Group 0 research dates and media age', () => {
  const research = (o) => g.ingestGate({ route: 'kaduse-research', feedId: 'research-nejm', title: 'Randomised trial of a new therapy', ...o }, NOW);
  const media = (o) => g.ingestGate({ route: 'kaduse-research', feedId: 'research-eurekalert', title: 'Researchers report a new therapy result', ...o }, NOW);
  it('normalises valid research dates to ISO', () => {
    assert.deepEqual(research({ publishedAt: 'Mon, 21 Sep 2026 10:00:00 GMT' }), { ok: true, publishedAt: '2026-09-21' });
    assert.deepEqual(research({ publishedAt: '2026-9-7' }), { ok: true, publishedAt: '2026-09-07' });
  });
  it('rejects impossible 2101-2109 style garbage dates, in any format', () => {
    for (const d of ['2101-03-04', '2105-12-31', '2109-01-01', 'Oct 2105', '4 Mar 2107', '9999-01-01']) {
      assert.equal(research({ publishedAt: d }).reason, 'invalid_date', d);
    }
    assert.equal(g.normalizeDate('Oct 2105'), null);
    assert.equal(g.normalizeDate('4 Mar 2107'), null);
  });
  it('still rejects real near-future research dates but allows month-precision issue dates', () => {
    assert.equal(research({ publishedAt: '2027-03-01' }).reason, 'future_date');
    assert.equal(research({ publishedAt: '2026 Oct' }).ok, true);
  });
  it('journal/research sources are not age-gated or undated-gated', () => {
    assert.equal(research({ publishedAt: '2024-01-15' }).ok, true);
    assert.equal(research({ publishedAt: null }).ok, true);
  });
  it('research media: stale and undated content is rejected (14-day boundary)', () => {
    assert.equal(media({ publishedAt: '2026-09-08' }).ok, true);
    assert.equal(media({ publishedAt: '2026-09-07' }).reason, 'stale');
    assert.equal(media({ publishedAt: '2023-05-01' }).reason, 'stale');
    assert.equal(media({ publishedAt: null }).reason, 'undated');
    assert.equal(g.ingestGate({ route: 'kaduse-research', feedId: 'research-gdelt-doc-api', title: 'Hospital outbreak health news', publishedAt: '2026-08-01' }, NOW).reason, 'stale');
  });
  it('media feed set equals the catalog ACCESSIBLE_SCIENCE_MEDIA roles (+ GDELT)', async () => {
    const { readFileSync } = await import('node:fs');
    const cat = JSON.parse(readFileSync('packages/source-catalog/data/research-sources.json', 'utf8'));
    const list = Array.isArray(cat) ? cat : cat.sources;
    const want = new Set(list.filter((s) => s.sourceRole === 'ACCESSIBLE_SCIENCE_MEDIA').map((s) => `research-${s.sourceId}`));
    want.add('research-gdelt-doc-api');
    const have = [...g.RESEARCH_MEDIA_FEEDS].filter((id) => !want.has(id));
    const missing = [...want].filter((id) => !g.RESEARCH_MEDIA_FEEDS.has(id));
    assert.deepEqual({ have, missing }, { have: [], missing: [] });
  });
});
