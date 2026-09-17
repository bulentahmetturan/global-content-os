/**
 * Walk every registered feed and pull items into D1 via the local Worker.
 * Resilient: retries, continues on failure, supports resume offsets.
 *
 * Usage:
 *   node scripts/activate-all-sources.mjs [hubUrl]
 *   node scripts/activate-all-sources.mjs http://127.0.0.1:8787 --news-offset=24
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

const startOffsets = {
  'kaduse-news': flag('news-offset', 0),
  'kaduse-research': flag('research-offset', 0),
  'tip-ogrencileri': flag('tip-offset', 0),
};

async function post(path, body, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(`${hub}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path} ${res.status} ${data.error || ''}`);
    return data;
  } catch (err) {
    if (attempt >= 3) throw err;
    const wait = attempt * 4000;
    console.warn(` retry ${attempt} after error: ${err.message || err} (wait ${wait}ms)`);
    await new Promise((r) => setTimeout(r, wait));
    return post(path, body, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function walk(route, batch = 5) {
  let offset = startOffsets[route] || 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalScanned = 0;
  let failures = 0;
  for (;;) {
    process.stdout.write(`\n[${route}] offset=${offset} ... `);
    try {
      const r = await post('/api/ingress/generic', { route, offset, limit: batch });
      totalCreated += r.created || 0;
      totalUpdated += r.updated || 0;
      totalScanned += r.scanned || 0;
      console.log(
        `scanned=${r.scanned} created=${r.created} updated=${r.updated} empty=${r.empty} errors=${r.errors}`
      );
      if (r.nextOffset == null) break;
      offset = r.nextOffset;
    } catch (err) {
      failures += 1;
      console.error(`FAILED at offset=${offset}: ${err.message || err}`);
      // Skip this batch window and continue so one dead host cannot stop the walk.
      offset += batch;
      if (failures > 40) {
        console.error('Too many consecutive/batch failures; stopping route', route);
        break;
      }
    }
  }
  return { route, totalScanned, totalCreated, totalUpdated, failures, endedAtOffset: offset };
}

async function main() {
  console.log('Hub:', hub);
  console.log('Resume offsets:', startOffsets);
  console.log('Primary APIs...');
  try {
    console.log('news WHO', await post('/api/ingress/news'));
  } catch (e) {
    console.warn('WHO failed', e.message || e);
  }
  try {
    console.log('research', await post('/api/ingress/research'));
  } catch (e) {
    console.warn('research APIs failed', e.message || e);
  }

  const results = [];
  results.push(await walk('kaduse-news', 4));
  results.push(await walk('kaduse-research', 4));
  results.push(await walk('tip-ogrencileri', 8));
  console.log('\nDONE');
  console.log(JSON.stringify(results, null, 2));
  const routes = await fetch(`${hub}/api/routes`).then((r) => r.json());
  console.log(JSON.stringify(routes, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
