import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hub = process.argv[2] || 'http://127.0.0.1:8787';

function curl(url) {
  const t = path.join(os.tmpdir(), `f${Date.now()}.xml`);
  const c = spawnSync(
    'curl.exe',
    ['-sL', '-A', 'Mozilla/5.0', '--max-time', '30', '-o', t, '-w', '%{http_code}', url],
    { encoding: 'utf8' }
  ).stdout.trim();
  const text = fs.existsSync(t) ? fs.readFileSync(t, 'utf8') : '';
  return { code: Number(c), text };
}

function strip(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rss(xml) {
  const items = [];
  for (const b of (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 15)) {
    const title = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = strip((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
    if (title && link) items.push({ title, url: link, summary: title, publishedAt: null });
  }
  return items;
}

const jobs = [
  ['news-mobihealthnews-ai-device-scoped', 'https://feeds.feedburner.com/MobiHealthNews'],
  // Council of Europe / EDQM often share council-of-europe newsroom
  ['news-edqm-news-whole', 'https://www.coe.int/en/web/portal/-/rss'],
  ['news-council-eu-epsco-health-scoped', 'https://ec.europa.eu/commission/presscorner/api/rss'],
];

for (const [id, url] of jobs) {
  const { code, text } = curl(url);
  console.log(id, code, text.length, url);
  let items = rss(text);
  if (!items.length && text.length > 400) {
    const title = strip((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    if (title) items = [{ title, url, summary: title, publishedAt: null }];
  }
  if (!items.length) {
    console.log('no items');
    continue;
  }
  const res = await fetch(`${hub}/api/ingress/feed-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedId: id, items }),
  });
  console.log(await res.json());
}

console.log(JSON.stringify((await (await fetch(`${hub}/api/coverage`)).json()).byRoute, null, 2));
console.log(
  'empty',
  (await (await fetch(`${hub}/api/feeds/empty`)).json()).feeds.map((f) => f.id)
);
