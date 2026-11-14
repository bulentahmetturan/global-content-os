// Dry run for research-medical-xpress (Bible 26.1 closing dry-run, 29): live RSS -> editorial rules -> article page ->
// original-study link. Reads only; writes nothing. Output: fetched / dropped (with rule) / kept with link / kept without link (HOLD).
// Usage: node --experimental-strip-types scripts/dry-run-medical-xpress.mjs [maxArticles]
import { editorialRejection } from '../apps/worker/src/ingress/feed-editorial.ts';
import { doiFromUrl, originalStudyFromHtml } from '../apps/worker/src/ingress/research-ids.ts';

const FEED = 'research-medical-xpress';
const UA = 'global-content-os/0.1 (dry-run)';
const max = Number(process.argv[2]) || 30;
const dec = (s) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const xml = await (await fetch('https://medicalxpress.com/rss-feed/', { headers: { 'User-Agent': UA } })).text();
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
  const g = (t) => dec((m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
  return { title: g('title'), summary: g('description'), url: g('link'), date: g('pubDate') };
});

const out = { fetched: items.length, dropped: [], keptLinked: [], keptNoLink: [], pageFailed: [] };
let reads = 0;
for (const it of items) {
  const rule = editorialRejection(FEED, it.title, it.summary);
  if (rule) {
    out.dropped.push({ title: it.title, rule });
    continue;
  }
  let doi = doiFromUrl(it.url);
  let link = doi ? `https://doi.org/${doi}` : null;
  if (!link && reads < max) {
    reads += 1;
    const res = await fetch(it.url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (!res || !res.ok) {
      out.pageFailed.push({ title: it.title, status: res ? res.status : 'network' });
      continue;
    }
    const found = originalStudyFromHtml(await res.text());
    link = found.link;
    doi = found.doi;
  }
  (link ? out.keptLinked : out.keptNoLink).push({ title: it.title, link });
}
console.log(JSON.stringify({ fetched: out.fetched, dropped: out.dropped.length, keptWithOriginalLink: out.keptLinked.length, keptNoLinkHOLD: out.keptNoLink.length, pageFailed: out.pageFailed.length }));
console.log('DROPPED', JSON.stringify(out.dropped, null, 1));
console.log('NO LINK (would HOLD)', JSON.stringify(out.keptNoLink.map((x) => x.title), null, 1));
console.log('PAGE FAILED', JSON.stringify(out.pageFailed, null, 1));
console.log('LINKED sample', JSON.stringify(out.keptLinked.slice(0, 5), null, 1));
