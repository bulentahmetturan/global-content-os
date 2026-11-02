import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractListPage } from './parse.mjs';

// DW-style listing: every article has its own slug directory and ends in /a-<id>; nav pages end in /s- or /t-.
describe('extractListPage with id-suffixed article URLs', () => {
  const a = (slug, id, title) => `<a href="/tr/${slug}/a-${id}">${title}</a>`;
  const html = [
    '<a href="/tr/bilim-ve-cevre/s-10204">Bilim ve Çevre bölümü</a>',
    '<a href="/tr/israilde-secimler/t-79772932">İsrail seçimler konusu</a>',
    a('kanser-genclesiyor', 79649636, '50 yaş altındaki kanser vakaları neden artıyor?'),
    a('protein-tozu', 79723773, 'Gençler proteine neden bu kadar meraklı?'),
    a('obsesif-kompulsif', 79600001, 'Obsesif kompulsif bozukluk: Delirdiğinizi seyretmek'),
  ].join('\n');

  it('groups the articles by id shape and ignores section and topic pages', () => {
    const items = extractListPage(html, 'https://www.dw.com/tr/sa%C4%9Fl%C4%B1k/s-57554999');
    assert.equal(items.length, 3);
    assert.ok(items.every((i) => /\/a-\d+$/.test(i.url)));
  });
});
