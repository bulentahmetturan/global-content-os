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
  });
  it('ignores non-Kaduse routes', () => {
    assert.equal(g.ingestGate({ route: 'tip-ogrencileri', feedId: 'x', title: 'x', publishedAt: null }, NOW).ok, true);
  });
});
