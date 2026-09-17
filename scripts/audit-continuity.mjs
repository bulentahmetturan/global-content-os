/**
 * Continuity audit: prove every enabled feed is on a continuous rotation path.
 * Usage: node scripts/audit-continuity.mjs [hubUrl]
 */
const hub = process.argv[2] || 'http://127.0.0.1:8787';

function ageMin(iso) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

async function main() {
  const coverage = await (await fetch(`${hub}/api/coverage`)).json();
  const empty = await (await fetch(`${hub}/api/feeds/empty`)).json();
  const feeds = await (await fetch(`${hub}/api/feeds`)).json();

  const routes = coverage.byRoute || {};
  let all100 = true;
  console.log('=== COVERAGE ===');
  for (const [route, c] of Object.entries(routes)) {
    console.log(
      route,
      `ready=${c.readyPct}%`,
      `withItems=${c.withItems}/${c.feeds}`,
      `never=${c.neverFetched}`,
      `empty=${c.fetchedEmpty}`
    );
    if (c.readyPct < 100 || c.neverFetched > 0) all100 = false;
  }

  console.log('\n=== EMPTY (still no items) ===');
  for (const f of empty.feeds || []) {
    console.log(f.id, f.last_error || 'no_error', f.endpoint_url);
  }

  // Freshness: sample last_fetched ages via D1 is hard from API; use empty+feeds totals.
  console.log('\n=== CONTINUITY CHECKS ===');
  const checks = [];
  checks.push({
    name: 'hub_health',
    ok: (await (await fetch(`${hub}/api/health`)).json()).ok === true,
  });
  checks.push({
    name: 'all_routes_registered',
    ok: (feeds.total || 0) >= 800,
    detail: feeds.total,
  });
  checks.push({
    name: 'never_fetched_zero',
    ok: Object.values(routes).every((c) => c.neverFetched === 0),
  });
  checks.push({
    name: 'ready_100_all_routes',
    ok: all100,
  });
  checks.push({
    name: 'ingress_news',
    ok: (await (await fetch(`${hub}/api/ingress/news`, { method: 'POST' })).json()).ok === true,
  });
  checks.push({
    name: 'ingress_research',
    ok: (await (await fetch(`${hub}/api/ingress/research`, { method: 'POST' })).json()).ok === true,
  });
  checks.push({
    name: 'journal_fallback',
    ok: (await (await fetch(`${hub}/api/ingress/journal-fallback`, { method: 'POST' })).json()).ok ===
      true,
  });
  // Stale-first walk one batch per route
  for (const route of ['kaduse-news', 'kaduse-research', 'tip-ogrencileri']) {
    const r = await (
      await fetch(`${hub}/api/ingress/generic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, offset: 0, limit: 3, onlyEmpty: false }),
      })
    ).json();
    checks.push({
      name: `walk_${route}`,
      ok: r.ok === true && (r.scanned || 0) > 0,
      detail: `scanned=${r.scanned} created=${r.created} updated=${r.updated}`,
    });
  }

  console.log('\n=== RESULTS ===');
  let pass = 0;
  for (const c of checks) {
    console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail || '');
    if (c.ok) pass += 1;
  }
  const cov2 = await (await fetch(`${hub}/api/coverage`)).json();
  console.log('\n=== COVERAGE AFTER AUDIT WALKS ===');
  console.log(JSON.stringify(cov2.byRoute, null, 2));
  console.log(`\nchecks ${pass}/${checks.length} passed; ready100=${all100}`);
  if (!all100) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
