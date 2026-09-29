#!/usr/bin/env node
// S66 -- generates the full source-by-source operational matrix (task 20).
// Combines static registry/config data with LIVE, READ-ONLY production D1
// queries (wrangler d1 execute --remote, SELECT only -- never a mutating
// command). Requires Cloudflare credentials (wrangler login); when they
// are not available, live columns are filled with null and the matrix
// still prints the static picture (canonical identity, heading, cadence,
// wiring, scheduler_path) with a clear "LIVE DATA UNAVAILABLE" note.
//
// This is a report generator, not a CI gate -- scripts/production-check.mjs
// (which DOES run in CI without credentials) only runs the static
// invariant checks (check_source_identity.py etc.), never this script.
//
// Usage: node scripts/source-matrix.mjs [--out docs/source-matrix.generated.json]
//        node scripts/source-matrix.mjs --md   (prints a markdown table instead of the summary)

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => join(root, ...p);
const args = process.argv.slice(2);
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const mdMode = args.includes('--md');

// ---- static: Kaduse feeds (config/feeds.json) --------------------------
function kaduseStatic() {
  const feeds = JSON.parse(execFileSync('node', ['-e', `console.log(JSON.stringify(require('./config/feeds.json')))`], { cwd: root }).toString());
  return feeds.feeds
    .filter((f) => f.route === 'kaduse-news' || f.route === 'kaduse-research')
    .map((f) => ({
      canonical_source_key: f.id,
      source_id: f.id,
      publisher: f.label,
      primary_heading: f.route === 'kaduse-news' ? 'HABER' : 'RESEARCH',
      route: f.route,
      channel_id: 'kaduse-medikal',
      lifecycle_state: f.enabled ? 'ACTIVE' : 'DISABLED',
      enabled: !!f.enabled,
      wired: true, // every enabled Kaduse feed has a real ingress fetch path (generic-web / dedicated)
      transport: f.transport,
      endpoint: f.endpointUrl,
      poll_minutes: f.pollMinutes ?? null,
      scheduler_path: 'cloudflare_cron_generic_web',
    }));
}

// ---- static: Hekimler sources (Python registry dump) -------------------
function hekimlerStatic() {
  const out = execFileSync('python3', ['scripts/dump_source_registry.py'], {
    cwd: rel('adapters/hekimler-radar'),
    stdio: 'pipe',
  }).toString();
  const rows = JSON.parse(out);

  // Ground truth for scheduler_path: read the actual deployed Cloudflare
  // ready-bundle. If its `profiles` array is empty, the Cloudflare-native
  // continuous tick (hekimler-continuous.ts::runHekimlerContinuousTick)
  // owns ZERO Hekimler sources right now, regardless of what the registry
  // says -- per task 12, never report a runtime as processing sources it
  // does not actually have wired.
  let cfWiredIds = new Set();
  let pythonRunnerIds = new Set();
  try {
    const bundle = JSON.parse(
      execFileSync('node', ['-e', `console.log(JSON.stringify(require('./apps/worker/src/ingress/hekimler-automation-ready.json')))`], {
        cwd: root,
      }).toString()
    );
    cfWiredIds = new Set((bundle.profiles || []).map((p) => p.source_id || p.sourceId).filter(Boolean));
    pythonRunnerIds = new Set(bundle.python_runner_source_ids || []);
  } catch {
    // bundle missing -- treat as zero Cloudflare-wired sources (fail closed)
  }

  return rows.map((r) => {
    let scheduler_path = 'none';
    if (cfWiredIds.has(r.source_id)) scheduler_path = 'cloudflare_continuous_tick';
    else if (pythonRunnerIds.has(r.source_id) || r.execution === 'python_runner') scheduler_path = 'python_runner_github_actions';
    return {
      canonical_source_key: r.source_id,
      source_id: r.source_id,
      publisher: r.source_id,
      primary_heading: r.primary_heading,
      route: r.route,
      channel_id: r.channel_id,
      lifecycle_state: r.lifecycle_state,
      enabled: r.fetch_enabled,
      wired: r.wired,
      transport: r.execution,
      endpoint: r.url,
      poll_minutes: r.poll_minutes,
      scheduler_path,
      manual_intake_reason: r.manual_intake_reason || null,
    };
  });
}

// ---- live (optional): D1 read-only ---------------------------------------
function d1Query(sql) {
  try {
    // shell: true is required on Windows (npx is a .cmd shim execFileSync
    // cannot resolve directly); sql is caller-controlled (this file's own
    // literals), never external input, so this is safe.
    const escaped = sql.replace(/"/g, '\\"');
    const out = execFileSync(`npx wrangler d1 execute global-content-os --remote --command "${escaped}"`, {
      cwd: root,
      stdio: 'pipe',
      shell: true,
    }).toString();
    const start = out.indexOf('\n[\n');
    if (start === -1) return null;
    const parsed = JSON.parse(out.slice(start + 1));
    return parsed?.[0]?.results ?? null;
  } catch {
    return null;
  }
}

function liveData() {
  const kaduseFeeds = d1Query(
    `SELECT id, last_fetched_at, last_ok_items, last_error, fetch_attempts FROM source_feeds WHERE route IN ('kaduse-news','kaduse-research')`
  );
  const hekTelemetry = d1Query(
    `SELECT source_id, last_success_at, source_health, coverage_status, failure_count, zero_accept_streak, last_item_count FROM hekimler_source_telemetry`
  );
  const items24hKaduse = d1Query(
    `SELECT feed_id, COUNT(*) AS n FROM source_items WHERE route IN ('kaduse-news','kaduse-research') AND fetched_at >= datetime('now','-1 day') GROUP BY feed_id`
  );
  const items7dKaduse = d1Query(
    `SELECT feed_id, COUNT(*) AS n FROM source_items WHERE route IN ('kaduse-news','kaduse-research') AND fetched_at >= datetime('now','-7 day') GROUP BY feed_id`
  );
  const items24hHek = d1Query(
    `SELECT source_id, COUNT(*) AS n FROM source_items WHERE route = 'tip-ogrencileri' AND fetched_at >= datetime('now','-1 day') GROUP BY source_id`
  );
  const items7dHek = d1Query(
    `SELECT source_id, COUNT(*) AS n FROM source_items WHERE route = 'tip-ogrencileri' AND fetched_at >= datetime('now','-7 day') GROUP BY source_id`
  );
  // review_feedback (migration 0023) may not be applied to remote yet --
  // gracefully returns null (table-not-found) rather than erroring the run.
  const rejects30d = d1Query(
    `SELECT COALESCE(feed_id, source_id) AS key, COUNT(*) AS n FROM review_feedback WHERE created_at >= datetime('now','-30 day') GROUP BY key`
  );

  const byId = (rows, keyField) => {
    const m = new Map();
    for (const r of rows || []) m.set(r[keyField], r);
    return m;
  };
  return {
    kaduseFeeds: byId(kaduseFeeds, 'id'),
    hekTelemetry: byId(hekTelemetry, 'source_id'),
    items24h: new Map([...(items24hKaduse || []).map((r) => [r.feed_id, r.n]), ...(items24hHek || []).map((r) => [r.source_id, r.n])]),
    items7d: new Map([...(items7dKaduse || []).map((r) => [r.feed_id, r.n]), ...(items7dHek || []).map((r) => [r.source_id, r.n])]),
    rejects30d: new Map((rejects30d || []).map((r) => [r.key, r.n])),
    available: kaduseFeeds !== null || hekTelemetry !== null,
  };
}

// ---- classification (task 7) --------------------------------------------
const OVERDUE_TOLERANCE_MINUTES = 60; // grace period beyond next_due before calling it OVERDUE not NOT_DUE

function classify(row, live) {
  if (row.lifecycle_state === 'RETIRED' || row.lifecycle_state?.toLowerCase?.() === 'retired') return 'RETIRED';
  if (row.lifecycle_state === 'MANUAL_INTAKE') return 'MANUAL_INTAKE';
  if (!row.wired || row.scheduler_path === 'none') return 'NOT_WIRED';
  if (!row.enabled) return 'MANUAL_INTAKE';

  const kLive = live.kaduseFeeds.get(row.source_id);
  const hLive = live.hekTelemetry.get(row.source_id);
  const lastSuccess = kLive?.last_fetched_at || hLive?.last_success_at || null;
  const lastError = kLive?.last_error || null;
  const failureCount = hLive?.failure_count ?? (kLive?.last_error ? 1 : 0);

  if (!live.available) return 'UNKNOWN_LIVE_DATA_UNAVAILABLE';
  if (!lastSuccess) return 'NEVER_RUN';

  if (failureCount >= 3 || (kLive && kLive.last_error)) return 'DEGRADED';

  const pollMinutes = row.poll_minutes || 1440;
  const nextDue = new Date(new Date(lastSuccess).getTime() + pollMinutes * 60000);
  const overdueMs = Date.now() - nextDue.getTime();
  if (overdueMs > OVERDUE_TOLERANCE_MINUTES * 60000) return 'OVERDUE';
  if (overdueMs > 0) return 'NOT_DUE'; // within tolerance, about to be picked up
  const items24h = live.items24h.get(row.source_id) || 0;
  return items24h > 0 ? 'HEALTHY' : 'HEALTHY_EMPTY';
}

function nextDueLabel(row, live) {
  const kLive = live.kaduseFeeds.get(row.source_id);
  const hLive = live.hekTelemetry.get(row.source_id);
  const lastSuccess = kLive?.last_fetched_at || hLive?.last_success_at || null;
  if (!lastSuccess) return null;
  const pollMinutes = row.poll_minutes || 1440;
  return new Date(new Date(lastSuccess).getTime() + pollMinutes * 60000).toISOString();
}

// ---- build ---------------------------------------------------------------
function build() {
  const rows = [...kaduseStatic(), ...hekimlerStatic()];
  const live = liveData();
  return rows.map((row) => {
    const kLive = live.kaduseFeeds.get(row.source_id);
    const hLive = live.hekTelemetry.get(row.source_id);
    return {
      ...row,
      last_success: kLive?.last_fetched_at || hLive?.last_success_at || null,
      last_error: kLive?.last_error || null,
      next_due_at: nextDueLabel(row, live),
      items_24h: live.items24h.get(row.source_id) || 0,
      items_7d: live.items7d.get(row.source_id) || 0,
      rejects_30d: live.rejects30d.get(row.source_id) || 0,
      health: classify(row, live),
      live_data_available: live.available,
    };
  });
}

function main() {
  const matrix = build();
  const generated_at = new Date().toISOString();
  const payload = { generated_at, note: 'Generated by scripts/source-matrix.mjs -- do not hand-edit.', count: matrix.length, sources: matrix };

  if (mdMode) {
    const cols = ['source_id', 'primary_heading', 'health', 'scheduler_path', 'poll_minutes', 'next_due_at', 'items_24h', 'items_7d'];
    console.log(`| ${cols.join(' | ')} |`);
    console.log(`| ${cols.map(() => '---').join(' | ')} |`);
    for (const r of matrix) console.log(`| ${cols.map((c) => String(r[c] ?? '')).join(' | ')} |`);
  } else {
    const byHealth = {};
    for (const r of matrix) byHealth[r.health] = (byHealth[r.health] || 0) + 1;
    console.log(`Generated ${generated_at} -- ${matrix.length} sources`);
    console.log('By health:', byHealth);
    if (!matrix[0]?.live_data_available) {
      console.log('\nNOTE: live D1 data unavailable (no wrangler credentials in this environment) -- health classification above is not authoritative.');
    }
  }

  if (outArg) {
    mkdirSync(dirname(rel(outArg)), { recursive: true });
    writeFileSync(rel(outArg), JSON.stringify(payload, null, 2) + '\n');
    console.error(`Wrote ${outArg}`);
  }
}

main();
