/**
 * Drive complete source activation until every enabled feed has been attempted,
 * then print coverage. Resumes via --*-offset flags.
 */
const args = process.argv.slice(2);
const hub =
  args.find((a) => a.startsWith('http')) ||
  process.env.GCOS_HUB_URL ||
  'http://127.0.0.1:8787';

function flag(name, fallback = 0) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
}

const start = {
  'kaduse-news': flag('news-offset', 0),
  'kaduse-research': flag('research-offset', 0),
  'tip-ogrencileri': flag('tip-offset', 0),
};

async function post(path, body, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${hub}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    if (attempt >= 4) throw err;
    console.warn(`  retry ${attempt}: ${err.message || err}`);
    await new Promise((r) => setTimeout(r, attempt * 2500));
    return post(path, body, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function walk(route, batch) {
  let offset = start[route] || 0;
  const summary = { route, created: 0, updated: 0, scanned: 0, empty: 0, errors: 0, batches: 0 };
  for (;;) {
    process.stdout.write(`[${route}] offset=${offset} ... `);
    try {
      const r = await post('/api/ingress/generic', { route, offset, limit: batch });
      summary.created += r.created || 0;
      summary.updated += r.updated || 0;
      summary.scanned += r.scanned || 0;
      summary.empty += r.empty || 0;
      summary.errors += r.errors || 0;
      summary.batches += 1;
      console.log(
        `ok scanned=${r.scanned} +${r.created}/~${r.updated} empty=${r.empty} err=${r.errors}`
      );
      if (r.nextOffset == null || r.scanned === 0) break;
      offset = r.nextOffset;
    } catch (err) {
      console.error(`FAIL offset=${offset}: ${err.message || err} — skipping batch`);
      offset += batch;
      summary.errors += 1;
      if (summary.errors > 80) break;
    }
  }
  return summary;
}

async function main() {
  console.log('Hub', hub, 'resume', start);
  try {
    console.log('WHO', await post('/api/ingress/news'));
  } catch (e) {
    console.warn('WHO', e.message);
  }
  try {
    console.log('research APIs', await post('/api/ingress/research'));
  } catch (e) {
    console.warn('research', e.message);
  }

  const results = [
    await walk('kaduse-news', 5),
    await walk('kaduse-research', 5),
    await walk('tip-ogrencileri', 10),
  ];
  console.log('\nWALK DONE', JSON.stringify(results, null, 2));
  const coverage = await fetch(`${hub}/api/coverage`).then((r) => r.json());
  const routes = await fetch(`${hub}/api/routes`).then((r) => r.json());
  console.log('\nCOVERAGE', JSON.stringify(coverage, null, 2));
  console.log('\nROUTES', JSON.stringify(routes, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
