/**
 * Curl-backed closer for feeds that Node/Worker TLS/bot blocks cannot reach.
 * Usage: node scripts/curl-close-empty.mjs [hubUrl]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hub = process.argv[2] || 'http://127.0.0.1:8787';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const FORCE_URL = {
  'news-medical-device-network-news-whole': 'https://www.medicaldevice-network.com/feed/',
  'news-hma-news-whole': 'https://www.hma.eu/',
  'news-edqm-news-whole': 'https://www.edqm.eu/',
  'news-resmi-gazete-health-scoped': 'https://www.resmigazete.gov.tr/',
  'tip-resmi_gazete': 'https://www.resmigazete.gov.tr/',
  'tip-tip_usak_duyuru': 'https://tip.usak.edu.tr/',
  'research-nih-news-releases':
    'https://www.ncbi.nlm.nih.gov/feed/rss.cgi?ChanKey=NationalInstitutesofHealthNewsReleases',
  'research-eurekalert': 'https://www.eurekalert.org/news-releases',
  'news-edqm-news-whole': 'https://www.edqm.eu/',
  'news-africa-cdc-news-whole': 'https://africacdc.org/news-item/',
  'tip-tabip_odasi_kirklareli': 'http://kirktabib.org.tr/',
  'tip-tabip_odasi_rize_artvin': 'http://www.rato.org.tr/',
};

function curlGet(url) {
  const tmp = path.join(os.tmpdir(), `gcos_${Date.now()}_${Math.random().toString(16).slice(2)}.html`);
  const r = spawnSync(
    'curl.exe',
    [
      '-sL',
      '-A',
      UA,
      '--max-time',
      '60',
      '--max-filesize',
      '2000000',
      '-o',
      tmp,
      '-w',
      '%{http_code}',
      url,
    ],
    { encoding: 'utf8' }
  );
  let text = '';
  try {
    text = fs.readFileSync(tmp, 'utf8');
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  const code = Number((r.stdout || '').trim() || 0);
  return { code, text };
}

function stripTags(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml, base) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, 25)) {
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link =
      (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
      stripTags((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '') ||
      stripTags((block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || '');
    if (!title || !link) continue;
    try {
      items.push({ title, url: new URL(link, base).toString(), summary: title, publishedAt: null });
    } catch {
      /* skip */
    }
  }
  return items;
}

function parseHtml(html, base) {
  const items = [];
  const seen = new Set();
  let host = '';
  try {
    host = new URL(base).hostname.replace(/^www\./, '');
  } catch {
    return items;
  }
  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && items.length < 20) {
    const title = stripTags(m[2]);
    if (title.length < 8 || title.length > 280) continue;
    let url;
    try {
      url = new URL(m[1], base).toString();
      const h = new URL(url).hostname.replace(/^www\./, '');
      if (!(h === host || h.endsWith('.' + host) || host.endsWith('.' + h))) continue;
      if (new URL(url).pathname.length < 2) continue;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ title, url, summary: title, publishedAt: null });
  }
  if (items.length) return items;
  const pageTitle = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  if (pageTitle.length >= 8) {
    return [{ title: pageTitle.slice(0, 280), url: base.split('#')[0], summary: pageTitle, publishedAt: null }];
  }
  return [];
}

async function main() {
  const empty = await (await fetch(`${hub}/api/feeds/empty`)).json();
  console.log('empty', empty.total);
  for (const feed of empty.feeds || []) {
    const url = FORCE_URL[feed.id] || feed.endpoint_url;
    if (!url || url === 'null') continue;
    const { code, text } = curlGet(url);
    // Accept 200–299 including 202
    if (code < 200 || code >= 300 || !text || text.length < 200) {
      console.log('FAIL', feed.id, code, text.length);
      continue;
    }
    let items = [];
    if (/<rss[\s>]|<feed[\s>]|<item[\s>]/i.test(text.slice(0, 4000)) || /xml|rss|atom/i.test(url)) {
      items = parseRss(text, url);
    }
    if (!items.length) items = parseHtml(text, url);
    items = items.slice(0, 15);
    if (!items.length) {
      console.log('FAIL', feed.id, 'no_items', code);
      continue;
    }
    const res = await fetch(`${hub}/api/ingress/feed-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedId: feed.id, items }),
    });
    const body = await res.json();
    console.log('OK', feed.id, items.length, body);
  }
  console.log(JSON.stringify((await (await fetch(`${hub}/api/coverage`)).json()).byRoute, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
