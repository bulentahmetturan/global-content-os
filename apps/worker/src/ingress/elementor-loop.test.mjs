import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
const { parseElementorLoop } = await import('./elementor-loop.ts');

const NOW = new Date('2026-11-03T00:00:00Z');
const html = readFileSync(new URL('./fixtures/tubitak-bilimteknik-tip-ve-saglik.html', import.meta.url), 'utf8');

describe('Elementor loop listing (TÜBİTAK Bilim ve Teknik, saved live page 2026-11-03)', () => {
  const items = parseElementorLoop(html, 'https://bilimteknik.tubitak.gov.tr/konular/tip-ve-saglik/', NOW);
  it('reads the ten posts with title, https URL, teaser and printed date, and nothing from menu/footer/SVG text', () => {
    assert.equal(items.length, 10);
    const grip = items[0];
    assert.equal(grip.title, 'Grip Virüslerinin Değişen Yüzü');
    assert.equal(grip.url, 'https://bilimteknik.tubitak.gov.tr/grip-viruslerinin-degisen-yuzu/');
    assert.equal(grip.publishedAt, '2026-11-01');
    assert.match(grip.summary, /grip virüslerinde/);
    assert.ok(items.every((i) => i.publishedAt && /^2026-/.test(i.publishedAt)));
    assert.ok(items.every((i) => !/cls-1|Çerez|Kullanım Sözleşmesi/.test(i.title)));
    assert.ok(items.some((i) => /Nobel Fizyoloji/.test(i.title)));
  });
  it('never invents a date and ignores pages without loop items', () => {
    assert.deepEqual(parseElementorLoop('<html><a href="/x/">Bir bağlantı örneği</a></html>', 'https://a.org/'), []);
    const undated = '<div data-elementor-type="loop-item"><h1 class="elementor-heading-title"><a href="/yazi-bir/">Tarihsiz bir yazı başlığı</a></h1></div>';
    const r = parseElementorLoop(undated, 'https://a.org/', NOW);
    assert.equal(r.length, 1);
    assert.equal(r[0].publishedAt, null);
  });
});
