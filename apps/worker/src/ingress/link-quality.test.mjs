import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const q = await import('./link-quality.ts');
describe('link quality', () => {
  it('rejects navigation/menu links', () => {
    for (const [t, u] of [
      ['About Us', 'https://africacdc.org/about-us/'],
      ['Staff Directory', 'https://africacdc.org/staff-directory/'],
      ['ro română', 'https://x.eu/ro/'],
      ['MCP Server', 'https://a.com/mcp'],
      ['Working groups', 'https://imdrf.org/working-groups'],
    ]) assert.equal(q.isArticleLink(t, u), false, t);
  });
  it('keeps real headlines', () => {
    assert.ok(q.isArticleLink('Yüzdeki şekil bozukluğu 3 boyutlu teknolojiyle düzeltildi', 'https://www.aa.com.tr/tr/saglik/x/123'));
    assert.ok(q.isArticleLink('Cooper Companies continues to see activist pressure to sell divisions', 'https://www.massdevice.com/cooper-companies-activist'));
  });
  it('decodes numeric entities', () => {
    assert.equal(q.decodeEntities('Memişoğlu&#x27;ndan a&#160;b'), "Memişoğlu'ndan a b");
  });
});
