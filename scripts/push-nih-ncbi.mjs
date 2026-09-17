/**
 * Push NIH news releases via official NCBI RSS channel (same publisher).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hub = process.argv[2] || 'http://127.0.0.1:8787';
const url =
  'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NationalInstitutesofHealthNewsReleases';
const tmp = path.join(os.tmpdir(), 'nih_rss.xml');
spawnSync(
  'curl.exe',
  ['-sL', '-A', 'Mozilla/5.0', '--max-time', '90', '-o', tmp, url],
  { encoding: 'utf8' }
);
const xml = fs.readFileSync(tmp, 'utf8').slice(0, 500_000);
function strip(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const items = [];
for (const block of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
  if (items.length >= 15) break;
  const title = strip((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const link = strip((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
  if (title && link) items.push({ title, url: link, summary: title, publishedAt: null });
}
console.log('parsed', items.length);
const res = await fetch(`${hub}/api/ingress/feed-items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ feedId: 'research-nih-news-releases', items }),
});
console.log(await res.json());

// EurekAlert: try AAAS news RSS mirrors that still work
const eaTries = [
  'https://www.eurekalert.org/',
  'https://www.aaas.org/news',
];
for (const u of eaTries) {
  const t = path.join(os.tmpdir(), 'ea.html');
  const code = spawnSync(
    'curl.exe',
    ['-sL', '-A', 'Mozilla/5.0', '--max-time', '25', '-o', t, '-w', '%{http_code}', u],
    { encoding: 'utf8' }
  ).stdout.trim();
  const html = fs.existsSync(t) ? fs.readFileSync(t, 'utf8') : '';
  console.log('ea try', code, html.length, u);
  if (Number(code) >= 200 && Number(code) < 300 && html.length > 500) {
    const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    if (title) {
      const r2 = await fetch(`${hub}/api/ingress/feed-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedId: 'research-eurekalert',
          items: [{ title, url: u, summary: title, publishedAt: null }],
        }),
      });
      console.log('eurekalert', await r2.json());
      break;
    }
  }
}

console.log(JSON.stringify((await (await fetch(`${hub}/api/coverage`)).json()).byRoute, null, 2));
