import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

// generic-web.ts imports siblings without extensions, so bundle it for the test.
const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'gw-')), 'gw.mjs');
buildSync({ entryPoints: [join(here, 'generic-web.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const { parseRssOrAtom } = await import(pathToFileURL(out).href);

describe('parseRssOrAtom dates', () => {
  it('reads dc:date (RSS 1.0 / PMDA)', () => {
    const xml = '<rss><channel><item><title>PMDA training materials have been updated</title><link>https://www.pmda.go.jp/a.html</link><dc:date>2026-10-01T12:00:00+09:00</dc:date></item></channel></rss>';
    assert.equal(parseRssOrAtom(xml, 'https://www.pmda.go.jp/rss_008.xml')[0].publishedAt, '2026-10-01T12:00:00+09:00');
  });
  it('reads Atom <updated> and <published> (previously dropped: only capture group 1 was read)', () => {
    const xml =
      '<feed><entry><title>Atom entry with updated only</title><link href="https://e.org/1"/><updated>2026-09-30T10:00:00Z</updated></entry>' +
      '<entry><title>Atom entry with published only</title><link href="https://e.org/2"/><published>2026-09-29T10:00:00Z</published></entry></feed>';
    assert.deepEqual(parseRssOrAtom(xml, 'https://e.org/feed').map((i) => i.publishedAt), ['2026-09-30T10:00:00Z', '2026-09-29T10:00:00Z']);
  });
  it('still reads pubDate and leaves a missing date null', () => {
    const xml = '<rss><channel><item><title>RSS item with a pubDate</title><link>https://e.org/3</link><pubDate>Mon, 28 Sep 2026 20:00:00 GMT</pubDate></item><item><title>RSS item without any date</title><link>https://e.org/4</link></item></channel></rss>';
    const r = parseRssOrAtom(xml, 'https://e.org/rss');
    assert.equal(r[0].publishedAt, 'Mon, 28 Sep 2026 20:00:00 GMT');
    assert.equal(r[1].publishedAt, null);
  });
});
