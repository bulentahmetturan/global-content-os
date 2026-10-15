#!/usr/bin/env node
// Read-only check that the Dossier ClinicalTrials recurring reader has recovered after the pageToken fix (deployed 2026-10-14T23:53Z).
// Fixed SELECTs only (D1 REST, Wrangler OAuth token in memory). Prints status and counts; never row content beyond run status/timestamps.
//   node scripts/dossier-recovery-check.mjs
import { wranglerToken } from './protocols-five-item-operator.mjs';

const ACCOUNT = '92fd1fe2237154079a0834121c33964b';
const DB = 'c0ce92dc-9842-4dd9-9d05-a8d09e798b34';
const READER = 'dossier-clinicaltrials-frontier';
const FIX_DEPLOYED = '2026-10-14T23:53:51.000Z';
const token = wranglerToken();
const q = async (sql) => {
  if (!/^SELECT /.test(sql) || sql.includes(';')) throw new Error('GUARD');
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params: [] }) });
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error('QUERY_FAILED:' + r.status);
  return j.result[0].results;
};
const runs = await q(`SELECT status, created_at, finished_at, substr(error_summary,1,90) AS err FROM dossier_canary_runs WHERE reader_id = '${READER}' AND profile = 'DOSSIER_RECURRING_V1' AND created_at > '${FIX_DEPLOYED}' ORDER BY created_at DESC LIMIT 5`);
const state = await q(`SELECT control_key AS key, substr(control_value,1,40) AS value, updated_at FROM dossier_control WHERE control_key LIKE 'recurring:${READER}:%' ORDER BY updated_at DESC LIMIT 6`);
const obs = await q(`SELECT COUNT(*) AS n, MAX(observed_at) AS latest FROM dossier_observations WHERE signal_family = 'GLOBAL_RESEARCH_ACTIVITY'`);
const completed = runs.find((r) => r.status === 'COMPLETED');
const verdict = completed ? 'RECOVERED' : runs.some((r) => r.status === 'FAILED') ? 'STILL_FAILING' : 'NO_RUN_YET';
console.log(JSON.stringify({ utc: new Date().toISOString(), verdict, runsSinceFix: runs, controlKeys: state, observations: obs[0] }, null, 1));
