/**
 * Retry only feeds that still cannot deliver into Hub (never fetched OR 0 items).
 * Goal: every enabled source should end with last_ok_items > 0.
 */
const hub = process.argv[2] || process.env.GCOS_HUB_URL || 'http://127.0.0.1:8787';
const routes = ['kaduse-news', 'kaduse-research', 'tip-ogrencileri'];

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
    console.warn(` retry ${attempt}: ${err.message || err}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
    return post(path, body, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function walkEmpty(route) {
  let offset = 0;
  const batch = 6;
  let loops = 0;
  while (loops < 200) {
    loops += 1;
    process.stdout.write(`[${route} empty] offset=${offset} ... `);
    try {
      const r = await post('/api/ingress/generic', {
        route,
        offset,
        limit: batch,
        onlyEmpty: true,
      });
      console.log(
        `scanned=${r.scanned} +${r.created}/~${r.updated} empty=${r.empty} err=${r.errors}`
      );
      if (!r.scanned || r.nextOffset == null) break;
      // When onlyEmpty=true, successfully filled feeds drop out of the set,
      // so keep offset at 0 to drain remaining empties.
      if ((r.created || 0) + (r.updated || 0) > 0) offset = 0;
      else offset = r.nextOffset;
    } catch (err) {
      console.error(`FAIL: ${err.message || err}`);
      offset += batch;
    }
  }
}

async function main() {
  console.log('Hub', hub);
  try {
    console.log('WHO', await post('/api/ingress/news'));
  } catch (e) {
    console.warn(e.message);
  }
  try {
    console.log('research APIs', await post('/api/ingress/research'));
  } catch (e) {
    console.warn(e.message);
  }

  for (const route of routes) {
    await walkEmpty(route);
  }

  const coverage = await fetch(`${hub}/api/coverage`).then((r) => r.json());
  console.log('\nCOVERAGE', JSON.stringify(coverage, null, 2));
  const ready = Object.values(coverage.byRoute || {}).every((r) => r.withItems === r.feeds);
  console.log(ready ? '\nALL SOURCES CAN DELIVER TO INBOX' : '\nSOME SOURCES STILL BLOCKED');
  process.exit(ready ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
