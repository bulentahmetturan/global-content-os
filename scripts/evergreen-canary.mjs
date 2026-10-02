#!/usr/bin/env node
/**
 * Local, bounded EVERGREEN canary (temporal-v2). No production write, no remote migration, no deploy.
 *
 *   node scripts/evergreen-canary.mjs [--only id1,id2] [--no-readiness]
 *
 * 1. In-memory D1 (node:sqlite, migrations 0001..latest) + Kaduse feed rows from config/feeds.json; the Worker's own
 *    evergreenPlan() builds the plan from the lifecycle-owned temporal registry (read via apps/worker/src/temporal/registry.ts).
 * 2. The Python executor runs that plan: bounded real GETs to the configured archives only, robots.txt honoured,
 *    403/429 counted and never bypassed, nothing posted (dry run, no hub, no token).
 * 3. Production verdicts: ingestEvergreenItems(..., { dryRun: true }) -> NEW / REDISCOVERY / budget / write blockers.
 * 4. Local E2E on the same in-memory DB: one time-sensitive Haber item and one candidate pre-seeded as an earlier
 *    time-sensitive sighting, then a local write past CANARY_ONLY (code-only switch) and a second identical run;
 *    the bundled Worker's /api/items and /api/routes are read with the Hub's query strings.
 * 5. Optional: GET the public production /api/ready (read-only) for the OpenAlex key marker (a boolean, never a key).
 *
 * Output: .logs/evergreen-canary/<timestamp>/{plan.json,executor.json,report.json}.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { d1FromSqlite, bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
import { pythonCmd } from './source-lifecycle/bridge.mjs';

const READINESS_URL = 'https://global-content-os.channel-content-os-mcp.workers.dev/api/ready';
const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? String(args[i + 1] || '').split(',').filter(Boolean) : null;
})();
const checkReadiness = !args.includes('--no-readiness');

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const now = new Date();
const outDir = join(root, '.logs', 'evergreen-canary', now.toISOString().replace(/[:.]/g, '-'));
mkdirSync(outDir, { recursive: true });

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
for (const f of readdirSync('migrations').filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) sqlite.exec(readFileSync(join('migrations', f), 'utf8'));
const feeds = JSON.parse(readFileSync('config/feeds.json', 'utf8')).feeds || [];
const seed = sqlite.prepare(`INSERT OR IGNORE INTO source_feeds (id, label, route, channel_id, transport, poll_minutes, enabled) VALUES (?, ?, ?, 'kaduse-medikal', ?, ?, ?)`);
for (const f of feeds) if (f.route === 'kaduse-news' || f.route === 'kaduse-research') seed.run(f.id, f.label || f.id, f.route, f.transport || 'RSS', f.pollMinutes || 1440, f.enabled === false ? 0 : 1);
const env = { DB: d1FromSqlite(sqlite) };

const ev = await bundle('apps/worker/src/ingress/evergreen.ts', 'evergreen-canary');
const reg = await bundle('apps/worker/src/temporal/registry.ts', 'evergreen-canary-registry');
const q = await bundle('apps/worker/src/db/queries.ts', 'evergreen-canary-queries');
const worker = (await bundle('apps/worker/src/index.ts', 'evergreen-canary-worker')).default;
const registry = reg.temporalRegistry();

const plan = await ev.evergreenPlan(env, now);
if (only) plan.sources = plan.sources.filter((s) => only.includes(s.source_id));
const planFile = join(outDir, 'plan.json');
writeFileSync(planFile, JSON.stringify(plan, null, 2));

const py = pythonCmd();
if (!py) throw new Error('python 3 not available');
const execFile = join(outDir, 'executor.json');
const started = Date.now();
const proc = spawnSync(py, ['scripts/evergreen_scheduled_run.py', '--plan-file', planFile, '--out', execFile], {
  cwd: join(root, 'adapters', 'tip-toplulugu-radar'),
  encoding: 'utf8',
  env: { ...process.env, TIP_RADAR_INGEST_TOKEN: '', GCOS_HUB_URL: '' },
  timeout: 15 * 60_000,
  maxBuffer: 64 * 1024 * 1024,
});
if (proc.status !== 0) {
  writeFileSync(join(outDir, 'executor.stderr.txt'), proc.stderr || '');
  throw new Error(`executor exited ${proc.status}; see ${outDir}`);
}
const executor = JSON.parse(readFileSync(execFile, 'utf8'));
const countBy = (ds) => ds.reduce((m, d) => ({ ...m, [d.outcome]: (m[d.outcome] || 0) + 1 }), {});

// 3. Production verdicts (dry run: nothing is written, CANARY_ONLY blocks writes anyway).
const sources = [];
for (const res of executor.sources) {
  const p = plan.sources.find((s) => s.source_id === res.source_id);
  const verdict = await ev.ingestEvergreenItems(env, res.source_id, { items: res.items, dryRun: true }, now);
  sources.push({
    source_id: res.source_id,
    semantic_lane: p.semantic_lane,
    evergreen_view: p.evergreen_view,
    activation: p.activation,
    tier: p.tier,
    family: p.family,
    daily_target: p.daily_target,
    budget_remaining_today: p.budget_remaining_today,
    evaluation_cap: p.evaluation_cap,
    archives: p.archives.map((a) => `${a.id}:${a.kind}`),
    executor: {
      evaluated: res.stats.evaluated,
      picked: res.picked,
      rejected: res.stats.rejected,
      blocked_403_429: res.stats.blocked,
      robots_skipped: res.stats.robots_skipped,
      archive_fetch_failed: res.stats.archive_fetch_failed ?? 0,
      signal_errors: res.stats.signal_errors,
      providers: res.stats.providers,
      underfilled: res.underfilled,
      written: res.written ?? null,
    },
    worker_dry_run: { write_blockers: verdict.writeBlockers, created_new: verdict.created, rediscovered: verdict.rediscovered, outcomes: countBy(verdict.decisions), budget: verdict.budget },
    items: res.items.map((it) => ({
      title: it.title,
      url: it.url,
      publishedAt: it.publishedAt ?? null,
      updatedAtSource: it.updatedAtSource ?? null,
      archiveId: it.archiveId,
      discoveryReason: it.discoveryReason,
      signal: { tier: it.signal.tier, type: it.signal.type, value: it.signal.value, source: it.signal.source, normalization: it.signal.normalization },
      publisher: it.publisher ?? null,
      discoveredVia: it.discoveredVia ?? null,
      whySelected: it.whySelected,
    })),
  });
}

// 4. Local E2E on the in-memory DB only.
const call = async (path) => {
  const r = await worker.fetch(new Request(`https://canary.local${path}`), env, { waitUntil() {} });
  return r.json();
};
const HUB = {
  haber: '/api/items?route=kaduse-news&path=TIME_SENSITIVE&status=inbox&days=14&limit=200',
  research: '/api/items?route=kaduse-research&path=TIME_SENSITIVE&status=inbox&days=14&limit=200',
  health_reference: '/api/items?route=kaduse-news&path=EVERGREEN&evergreen_view=health_reference&status=inbox&days=14&limit=200',
  research_rediscovery: '/api/items?route=kaduse-research&path=EVERGREEN&evergreen_view=research_rediscovery&status=inbox&days=14&limit=200',
};
const e2e = { checks: {}, notes: [] };
const tsFeed = feeds.find((f) => f.route === 'kaduse-news' && f.enabled !== false);
const ts = await q.upsertSourceItem(env.DB, {
  feedId: tsFeed.id,
  route: 'kaduse-news',
  channelId: 'kaduse-medikal',
  title: 'Time-sensitive canary control item (local only)',
  summary: 'control',
  canonicalUrl: 'https://example.org/canary/time-sensitive-control',
  publisher: 'control',
  publishedAt: new Date(now.getTime() - 86400000).toISOString(),
});
const tsBefore = JSON.stringify(sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(ts.id));

// A research candidate pre-seeded as an earlier time-sensitive sighting of the same work (different URL, same DOI).
const researchSrc = executor.sources.find((s) => (plan.sources.find((p) => p.source_id === s.source_id) || {}).evergreen_view === 'research_rediscovery' && s.items.some((i) => i.evidence?.doi));
let seededWork = null;
if (researchSrc) {
  const it = researchSrc.items.find((i) => i.evidence?.doi);
  const p = plan.sources.find((x) => x.source_id === researchSrc.source_id);
  const r = await q.upsertSourceItem(env.DB, {
    feedId: p.feed_id,
    route: 'kaduse-research',
    channelId: 'kaduse-medikal',
    title: it.title,
    summary: 'earlier time-sensitive sighting',
    canonicalUrl: `https://europepmc.org/article/MED/${it.evidence.pmid || 'canary'}`,
    dedupeKey: String(it.evidence.doi).toLowerCase(),
    publisher: it.publisher || 'canary',
    publishedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
    evidence: { doi: it.evidence.doi, pmid: it.evidence.pmid ?? null },
  });
  seededWork = { id: r.id, doi: it.evidence.doi, url: it.url, published_at: sqlite.prepare(`SELECT published_at FROM source_items WHERE id = ?`).get(r.id).published_at };
}

const writeRuns = [];
for (const pass of [1, 2]) {
  for (const res of executor.sources) {
    const p = plan.sources.find((s) => s.source_id === res.source_id);
    try {
      const v = await ev.ingestEvergreenItems(env, res.source_id, { items: res.items }, now, { localCanaryWrite: true });
      writeRuns.push({ pass, source_id: res.source_id, created: v.created, rediscovered: v.rediscovered, outcomes: countBy(v.decisions) });
    } catch (err) {
      writeRuns.push({ pass, source_id: res.source_id, blocked: String(err.message || err).slice(0, 160), lane: p.semantic_lane });
    }
  }
}
const rows = sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items`).get().n;
const works = sqlite.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT route, COALESCE(canonical_work_id, dedupe_key) FROM source_items)`).get().n;
const routes = await call('/api/routes');
const lists = {};
for (const [k, path] of Object.entries(HUB)) lists[k] = await call(path);
const navCount = { haber: routes.temporal.TIME_SENSITIVE.haber.inbox, research: routes.temporal.TIME_SENSITIVE.research.inbox, health_reference: routes.temporal.EVERGREEN.health_reference.inbox, research_rediscovery: routes.temporal.EVERGREEN.research_rediscovery.inbox };
const viewIds = (k) => lists[k].items.map((i) => i.id);
const pick = (k) => lists[k].items.find((i) => i.acquisitionPath === 'EVERGREEN') || null;

e2e.checks.health_reference_candidate = viewIds('health_reference').length > 0;
e2e.checks.research_rediscovery_candidate = viewIds('research_rediscovery').length > 0;
e2e.checks.time_sensitive_unaffected = JSON.stringify(sqlite.prepare(`SELECT * FROM source_items WHERE id = ?`).get(ts.id)) === tsBefore && viewIds('haber').includes(ts.id) && !viewIds('health_reference').includes(ts.id);
e2e.checks.counts_equal_lists = Object.keys(HUB).every((k) => navCount[k] === lists[k].items.length && lists[k].counts.inbox === lists[k].items.length);
e2e.checks.no_duplicate_in_any_view = Object.keys(HUB).every((k) => new Set(viewIds(k)).size === viewIds(k).length);
e2e.checks.one_row_per_work = rows === works;
const harvardIds = sqlite.prepare(`SELECT id FROM source_items WHERE source_id = 'harvard_nutrition_source' AND route = 'kaduse-news' AND acquisition_path = 'EVERGREEN'`).all().map((r) => r.id);
if (executor.sources.some((s) => s.source_id === 'harvard_nutrition_source' && s.items.length)) {
  e2e.checks.harvard_health_reference_not_haber = harvardIds.length > 0 && harvardIds.every((id) => viewIds('health_reference').includes(id) && !viewIds('haber').includes(id));
}
e2e.checks.second_run_writes_nothing = writeRuns.filter((r) => r.pass === 2).every((r) => r.blocked || (r.created === 0 && r.rediscovered === 0));
if (seededWork) {
  const after = sqlite.prepare(`SELECT published_at, acquisition_path FROM source_items WHERE id = ?`).get(seededWork.id);
  const m = sqlite.prepare(`SELECT COUNT(*) AS n FROM item_path_membership WHERE source_item_id = ? AND temporal_path = 'EVERGREEN'`).get(seededWork.id).n;
  const doi = String(seededWork.doi).toLowerCase();
  e2e.checks.rediscovery_is_membership_not_new_row = m === 1 && sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE dedupe_key = ? OR canonical_work_id = ?`).get(doi, doi).n === 1;
  e2e.checks.rediscovered_item_in_both_paths = viewIds('research').includes(seededWork.id) && viewIds('research_rediscovery').includes(seededWork.id);
  e2e.checks.published_at_preserved = after.published_at === seededWork.published_at && after.acquisition_path === 'TIME_SENSITIVE';
} else {
  e2e.notes.push('no research candidate with a DOI was returned live; rediscovery checks covered by unit tests only');
}
const sample = { health_reference: pick('health_reference'), research_rediscovery: pick('research_rediscovery') };
for (const k of Object.keys(sample)) {
  const s = sample[k];
  if (s) sample[k] = { title: s.title, url: s.canonicalUrl, publishedAt: s.publishedAt, discoveryReason: s.discoveryReason, importanceSignal: s.importanceSignal, semanticLane: s.semanticLane };
}
e2e.sample = sample;
e2e.write_runs = writeRuns;
e2e.nav_counts = navCount;
e2e.unclassified = routes.temporal.unclassified;

let openalex = { executor: 'NOT_INVOKED (no canary source lists openalex)', production_key_configured: 'NOT_CHECKED' };
if (checkReadiness) {
  try {
    const r = await fetch(READINESS_URL, { headers: { 'User-Agent': 'evergreen-canary (read-only)' } });
    const body = await r.json();
    const degraded = Array.isArray(body?.degraded) ? body.degraded : null;
    openalex = {
      ...openalex,
      production_key_configured: degraded ? !degraded.includes('OPENALEX_API_KEY_NOT_CONFIGURED') : 'NOT_REPORTED',
      readiness_http: r.status,
      production_level: body?.level ?? null,
      deployed_commit: body?.commit ?? body?.buildCommit ?? null,
    };
  } catch (e) {
    openalex = { ...openalex, production_key_configured: `UNREACHABLE:${String(e?.message || e).slice(0, 80)}` };
  }
}

const report = {
  canary: 'evergreen temporal-v2 (local, bounded, read-only toward production)',
  generated_at: now.toISOString(),
  duration_s: Math.round((Date.now() - started) / 1000),
  registry: { reader: 'apps/worker/src/temporal/registry.ts', entries: registry.entries.length, errors: registry.errors },
  mode: executor.mode,
  production_write: false,
  openalex,
  sources,
  e2e,
};
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const line = (s) =>
  `${s.source_id.padEnd(48)} lane=${s.semantic_lane} view=${s.evergreen_view} ${s.activation} target=${s.daily_target} | evaluated=${s.executor.evaluated} picked=${s.executor.picked} blocked=${s.executor.blocked_403_429} robots=${s.executor.robots_skipped} fetch_failed=${s.executor.archive_fetch_failed} | dry-run: new=${s.worker_dry_run.created_new} rediscovered=${s.worker_dry_run.rediscovered} flag=${s.worker_dry_run.budget.flag ?? '-'} blockers=${s.worker_dry_run.write_blockers.join(',') || '-'}`;
console.log(sources.map(line).join('\n'));
console.log(`E2E ${Object.entries(e2e.checks).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join(' ')}`);
console.log(`OPENALEX executor=${openalex.executor.split(' ')[0]} production_key_configured=${openalex.production_key_configured}`);
console.log(`REPORT ${join(outDir, 'report.json')}`);
process.exitCode = Object.values(e2e.checks).every(Boolean) ? 0 : 1;
