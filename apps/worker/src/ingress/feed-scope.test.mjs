import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { applyFeedUrlScope } = await import('./feed-scope.ts');
describe('applyFeedUrlScope', () => {
  const mk = (url) => ({ title: 't', url, summary: '', publishedAt: null });
  it('keeps only AA saglik articles', () => {
    const out = applyFeedUrlScope('news-aa-saglik-scoped', [
      mk('https://www.aa.com.tr/tr/saglik/x-hastaligi/123'),
      mk('https://www.aa.com.tr/tr/dunya/israil/456'),
      mk('https://www.aa.com.tr/tr/gundem/z/789'),
      mk('https://www.aa.com.tr/tr/saglik'),
    ]);
    assert.deepEqual(out.map((i) => i.url), ['https://www.aa.com.tr/tr/saglik/x-hastaligi/123']);
  });
  it('leaves other feeds untouched', () => {
    const items = [mk('https://example.com/a')];
    assert.equal(applyFeedUrlScope('some-other-feed', items), items);
  });
});
