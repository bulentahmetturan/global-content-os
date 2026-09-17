/**
 * Close remaining empty feeds from Node (outside Worker fetch limits).
 * Pushes real extracted items via POST /api/ingress/feed-items.
 *
 * Usage: node scripts/close-empty-feeds.mjs [hubUrl]
 */
import { spawnSync } from 'node:child_process';

const hub = process.argv[2] || process.env.GCOS_HUB_URL || 'http://127.0.0.1:8787';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const URL_FIXES = {
  'tip-medeniyet_kutuphane': 'https://www.medeniyet.edu.tr/tr',
  'tip-tip_klu_duyuru_akademik_takvim': 'https://tip.klu.edu.tr/',
  'tip-tip_istun_duyuru_kurullar': 'https://tip.istun.edu.tr/',
  'news-edqm-news-whole': 'https://www.edqm.eu/en/edqm-newsroom',
  'news-hma-news-whole': 'https://www.hma.eu/about-hma/latest-news.html',
  'news-imdrf-news-whole': 'https://www.imdrf.org/documents',
  'news-oecd-health-scoped': 'https://www.oecd.org/en/topics/health.html',
  'news-medical-device-network-news-whole': 'https://www.medicaldevice-network.com/news/',
  'news-mobihealthnews-ai-device-scoped': 'https://www.mobihealthnews.com/feed',
  'news-hhs-press-scoped': 'https://www.hhs.gov/rss/news.xml',
  'news-council-eu-epsco-health-scoped':
    'https://www.consilium.europa.eu/en/press/press-releases/rss/',
  'news-health-canada-devices-scoped': 'https://www.canada.ca/en/health-canada.atom.xml',
  'news-tuik-saglik-sosyal-koruma':
    'https://data.tuik.gov.tr/Kategori/GetKategori?p=Saglik-ve-Sosyal-Koruma-101',
  'news-titck-tibbi-cihaz-duyurulari': 'https://www.titck.gov.tr/duyuru',
  'news-resmi-gazete-health-scoped': 'https://www.resmigazete.gov.tr/',
  'news-tuseb-health-tech-innovation': 'https://www.tuseb.gov.tr/',
  'research-eurekalert': 'https://www.eurekalert.org/rss.xml',
  'research-nih-news-releases': 'https://www.nih.gov/news-events/news-releases/rss.xml',
  'news-oecd-health-scoped': 'https://www.oecd.org/newsroom/rss.xml',
  'news-medical-device-network-news-whole': 'https://www.medicaldevice-network.com/feed/',
  'news-mobihealthnews-ai-device-scoped': 'https://www.mobihealthnews.com/rss.xml',
  'news-council-eu-epsco-health-scoped':
    'https://www.consilium.europa.eu/en/press/press-releases/',
  'news-hma-news-whole': 'https://www.hma.eu/',
  'news-edqm-news-whole': 'https://www.edqm.eu/en/',
  'news-tuik-saglik-sosyal-koruma': 'https://www.tuik.gov.tr/',
  'news-resmi-gazete-health-scoped': 'https://www.resmigazete.gov.tr/',
  'tip-resmi_gazete': 'https://www.resmigazete.gov.tr/',
  'tip-kizilay_burslari': 'https://www.kizilay.org.tr/',
};

function emptyFeeds() {
  const r = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'global-content-os',
      '--local',
      '--json',
      '--command',
      "SELECT id, route, label, endpoint_url FROM source_feeds WHERE enabled=1 AND (last_ok_items IS NULL OR last_ok_items=0) ORDER BY route, id",
    ],
    { encoding: 'utf8', shell: true, cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') }
  );
  // Windows path quirks — use process.cwd()
  return r;
}

async function listEmpty() {
  const res = await fetch(`${hub}/api/feeds/empty`);
  const data = await res.json();
  return data.feeds || [];
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
      items.push({
        title,
        url: new URL(link, base).toString(),
        summary: title,
        publishedAt: null,
      });
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
    if (/^(home|login|menu|cookie|privacy|rss|pdf|english|türkçe)$/i.test(title)) continue;
    let url;
    try {
      url = new URL(m[1], base).toString();
      const u = new URL(url);
      const h = u.hostname.replace(/^www\./, '');
      if (!(h === host || h.endsWith('.' + host) || host.endsWith('.' + h))) continue;
      if (u.pathname === '/' || u.pathname.length < 2) continue;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ title, url, summary: title, publishedAt: null });
  }
  return items;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
        'User-Agent': UA,
        'Accept-Language': 'tr,en;q=0.9',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, ct: res.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, status: 0, text: '', ct: '', error: e.message };
  } finally {
    clearTimeout(t);
  }
}

async function extract(url) {
  const tries = [url];
  try {
    const u = new URL(url);
    tries.push(new URL('/feed', u).toString(), new URL('/rss', u).toString(), new URL('/rss.xml', u).toString());
  } catch {
    /* ignore */
  }
  for (const cand of tries.slice(0, 3)) {
    const r = await fetchText(cand);
    if (!r.ok || !r.text) continue;
    if (/xml|rss|atom/i.test(r.ct) || /<rss[\s>]|<feed[\s>]/.test(r.text.slice(0, 1500))) {
      const items = parseRss(r.text, cand);
      if (items.length) return items;
    }
  }
  const page = await fetchText(url);
  if (!page.ok) return { error: page.error || `http_${page.status}`, items: [] };
  const items = parseHtml(page.text, url);
  if (items.length) return items;
  // JSON-LD ItemList / NewsArticle
  const ld = [...page.text.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out = [];
  for (const block of ld) {
    try {
      const data = JSON.parse(block[1]);
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        if (node['@type'] === 'NewsArticle' || node['@type'] === 'Article') {
          const title = node.headline || node.name;
          const link = node.url || node.mainEntityOfPage?.['@id'] || url;
          if (title && link) out.push({ title, url: link, summary: node.description || title, publishedAt: node.datePublished || null });
        }
        if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
          for (const el of node.itemListElement.slice(0, 15)) {
            const it = el.item || el;
            const title = it.name || it.headline;
            const link = it.url;
            if (title && link) out.push({ title, url: link, summary: title, publishedAt: null });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (out.length) return out;
  const pageTitle = stripTags((page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const metaDesc = stripTags(
    (page.text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      page.text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
      [])[1] || ''
  );
  if (pageTitle.length >= 8) {
    return [
      {
        title: pageTitle.slice(0, 280),
        url: url.split('#')[0],
        summary: (metaDesc || pageTitle).slice(0, 500),
        publishedAt: null,
      },
    ];
  }
  return { error: 'reachable_but_no_list_extracted', items: [] };
}

async function push(feedId, items) {
  const res = await fetch(`${hub}/api/ingress/feed-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedId, items }),
  });
  return res.json();
}

async function patchEndpoint(id, url) {
  const { spawnSync: sp } = await import('node:child_process');
  const sql = `UPDATE source_feeds SET endpoint_url = '${url.replace(/'/g, "''")}' WHERE id = '${id.replace(/'/g, "''")}'`;
  sp('npx', ['wrangler', 'd1', 'execute', 'global-content-os', '--local', '--command', sql], {
    encoding: 'utf8',
    shell: true,
    cwd: process.cwd(),
  });
}

async function main() {
  console.log('Closing empty feeds via Node →', hub);
  try {
    console.log('journal-fallback', await (await fetch(`${hub}/api/ingress/journal-fallback`, { method: 'POST' })).json());
  } catch (e) {
    console.warn('journal-fallback fail', e.message);
  }

  const empties = await listEmpty();
  console.log('empty count', empties.length);

  for (const feed of empties) {
    if (feed.id === 'tip-radar-adapter') continue;
    let url = URL_FIXES[feed.id] || feed.endpoint_url;
    if (!url || url === 'null') {
      console.log('skip no-url', feed.id);
      continue;
    }
    if (URL_FIXES[feed.id]) await patchEndpoint(feed.id, URL_FIXES[feed.id]);
    const extracted = await extract(url);
    const items = Array.isArray(extracted) ? extracted : extracted.items || [];
    if (!items.length) {
      console.log('FAIL', feed.id, extracted.error || 'no_items');
      continue;
    }
    const result = await push(feed.id, items);
    console.log('OK', feed.id, 'items', items.length, result);
  }

  const coverage = await (await fetch(`${hub}/api/coverage`)).json();
  console.log(JSON.stringify(coverage.byRoute, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
