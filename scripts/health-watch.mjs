#!/usr/bin/env node
// Read-only production health watch for GCOS. Exit 0 = OK, 1 = ALERT, 2 = watch itself failed.
// Catches the failure classes seen in acceptance: a paused/failing Dossier source (10 days unnoticed), a stalled Statistics scheduler,
// stale content routes, a not-ready Worker, drifted protected Protocols rows. SELECT-only through D1 REST with the Wrangler OAuth token in memory.
//   node scripts/health-watch.mjs            (human summary + JSON)
//   node scripts/health-watch.mjs --json     (JSON only)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wranglerToken, d1RestDb, preview } from './protocols-five-item-operator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://global-content-os.channel-content-os-mcp.workers.dev';
const ACCOUNT = '92fd1fe2237154079a0834121c33964b';
const CONTENT = 'c0ce92dc-9842-4dd9-9d05-a8d09e798b34';
const STATS = 'c67cfa1e-e508-4933-8a42-7684e32b5ec5';
const H = 3_600_000;
const now = Date.now();
const alerts = [];
const ok = [];
const check = (name, pass, detail) => (pass ? ok : alerts).push({ name, detail });
const age = (iso) => (iso ? (now - Date.parse(iso)) / H : Infinity);

try {
  const token = wranglerToken();
  const q = async (db, sql) => {
    if (!/^SELECT /.test(sql) || sql.includes(';')) throw new Error('GUARD');
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${db}/query`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params: [] }) });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error('QUERY_FAILED:' + r.status);
    return j.result[0].results;
  };

  // 1. Worker readiness
  const ready = await fetch(`${ORIGIN}/api/ready`, { signal: AbortSignal.timeout(20000) }).then((r) => r.json()).catch(() => null);
  check('worker_ready', ready?.level === 'READY' && !(ready.blocked?.length) && !(ready.degraded?.length), ready ? `${ready.level} blocked=${ready.blocked?.length} degraded=${ready.degraded?.length}` : 'unreachable');

  // 2. Dossier recurring sources: state, newest run, stuck runs
  const states = await q(CONTENT, `SELECT control_key AS k, control_value AS v, updated_at FROM dossier_control WHERE control_key LIKE 'recurring:dossier-%:state' OR control_key LIKE 'recurring:dossier-%:state_reason'`);
  const readers = [...new Set(states.map((s) => s.k.split(':')[1]))];
  for (const reader of readers) {
    const state = states.find((s) => s.k === `recurring:${reader}:state`);
    const reason = states.find((s) => s.k === `recurring:${reader}:state_reason`);
    const paused = state && ['PAUSED', 'BLOCKED'].includes(state.v);
    check(`dossier_state:${reader}`, !paused, paused ? `${state.v} (${reason?.v ?? 'no reason'}) for ${age(state.updated_at).toFixed(1)} h` : state?.v ?? 'unset');
    const runs = await q(CONTENT, `SELECT status, created_at, updated_at, finished_at FROM dossier_canary_runs WHERE reader_id = '${reader}' ORDER BY created_at DESC LIMIT 1`);
    const last = runs[0];
    const stuck = last && last.status === 'RUNNING' && age(last.updated_at) > 2;
    check(`dossier_run:${reader}`, !stuck, last ? `${last.status} updated ${age(last.updated_at).toFixed(1)} h ago` : 'no runs');
  }
  const obs = await q(CONTENT, `SELECT signal_family AS k, MAX(observed_at) AS latest, COUNT(*) AS n FROM dossier_observations GROUP BY signal_family`);
  for (const o of obs) if (o.k === 'GLOBAL_RESEARCH_ACTIVITY') check('dossier_ct_observations_fresh', age(o.latest) < 72, `latest ${o.latest} (${age(o.latest).toFixed(0)} h)`);

  // 3. Statistics scheduler
  const runs = await q(STATS, `SELECT status, planned_at, finished_at, failure_class FROM statistics_ingestion_runs WHERE run_mode = 'PRODUCTION' ORDER BY planned_at DESC LIMIT 1`);
  check('statistics_last_run', !!runs[0] && runs[0].status === 'COMPLETED' && age(runs[0].planned_at) < 80, runs[0] ? `${runs[0].status} planned ${runs[0].planned_at} (${age(runs[0].planned_at).toFixed(0)} h)` : 'no runs');
  const pol = await q(STATS, `SELECT failure_count AS f, runtime_state AS s FROM statistics_source_runtime_policy`);
  check('statistics_policy', pol.every((p) => p.f === 0 && p.s === 'ACTIVE'), JSON.stringify(pol));

  // 4. Content routes still flowing
  const routes = await q(CONTENT, `SELECT route AS k, MAX(fetched_at) AS latest FROM source_items GROUP BY route`);
  for (const r of routes) check(`content_route:${r.k}`, age(r.latest) < 48, `latest ${r.latest} (${age(r.latest).toFixed(0)} h)`);

  // 5. Protected Protocols rows stay at the approved values
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'release/protocols/five-item-correction.json'), 'utf8'));
  const state = (await preview(d1RestDb({ token }), manifest)).state;
  check('protocols_five_rows', state === 'ALREADY_APPLIED', state);
} catch (e) {
  console.error(JSON.stringify({ watch: 'FAILED', error: String(e.message) }));
  process.exit(2);
}

const result = { utc: new Date(now).toISOString(), verdict: alerts.length ? 'ALERT' : 'OK', alerts, ok: ok.length };
if (!process.argv.includes('--json')) {
  console.log(`GCOS health watch ${result.utc}: ${result.verdict} (${ok.length} ok, ${alerts.length} alerts)`);
  for (const a of alerts) console.log(`  ALERT ${a.name}: ${a.detail}`);
}
console.log(JSON.stringify(result));
process.exit(alerts.length ? 1 : 0);
