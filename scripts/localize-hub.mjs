/**
 * Bulk-localize still-English Hub cards via Worker /api/localize,
 * prioritizing title==title_orig rows until a pass updates 0.
 */
const base = process.argv[2] || 'http://127.0.0.1:8787';
const routes = ['kaduse-news', 'kaduse-research', 'tip-ogrencileri'];

async function once(route) {
  const url = `${base}/api/localize?route=${encodeURIComponent(route)}&limit=50`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`${route} ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  for (const route of routes) {
    for (let i = 0; i < 12; i++) {
      const r = await once(route);
      console.log(route, i, JSON.stringify(r));
      if (!r.updated) break;
      await new Promise((x) => setTimeout(x, 400));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
