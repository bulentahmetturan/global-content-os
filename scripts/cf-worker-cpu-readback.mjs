#!/usr/bin/env node
// READ-ONLY Cloudflare readback for the CPU root-cause gap. Two GETs and one GraphQL QUERY (no mutation anywhere).
//
//   CF_API_TOKEN=... node scripts/cf-worker-cpu-readback.mjs            (token needs: Account Analytics Read + Workers Scripts Read)
//
// The token is read from the environment, sent only in the Authorization header to api.cloudflare.com, and never printed.
// Output: the Worker's explicitly configured CPU limit (script settings), and per-version / per-status invocation counts with CPU and wall quantiles for the two
// canary windows (UTC). CPU quantiles from the analytics API are in MICROSECONDS; they are converted to milliseconds here.
const ACCOUNT = '92fd1fe2237154079a0834121c33964b';
const SCRIPT = 'global-content-os';
const token = process.env.CF_API_TOKEN;
if (!token) { console.error('CF_API_TOKEN is required in the environment (read-only scopes)'); process.exit(2); }
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const api = async (path, init = {}) => { const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: H, ...init }); const j = await r.json().catch(() => ({})); return { http: r.status, ok: j.success === true, errors: j.errors ?? [], result: j.result, data: j.data }; };

const settings = await api(`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/script-settings`);
console.log('SCRIPT SETTINGS', JSON.stringify({ http: settings.http, ok: settings.ok, errors: settings.errors.map((e) => e.message), limits: settings.result?.limits ?? null, usage_model: settings.result?.usage_model ?? null, placement: settings.result?.placement ?? null }));

const windows = [['attempt-1', '2026-10-04T20:44:00Z', '2026-10-04T20:49:00Z'], ['resume-1', '2026-10-04T21:07:00Z', '2026-10-04T21:12:00Z']];
const query = `query ($acc: String!, $from: Time!, $to: Time!, $script: String!) { viewer { accounts(filter: {accountTag: $acc}) { workersInvocationsAdaptive(limit: 200, orderBy: [datetimeMinute_ASC], filter: {scriptName: $script, datetime_geq: $from, datetime_leq: $to}) { dimensions { datetimeMinute status scriptVersion } sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 cpuTimeP999 wallTimeP50 wallTimeP99 } } } } }`;
for (const [name, from, to] of windows) {
  const r = await api('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { acc: ACCOUNT, from, to, script: SCRIPT } }) });
  const rows = r.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  console.log(`WINDOW ${name} ${from}..${to}`, JSON.stringify({ http: r.http, graphqlErrors: (r.errors ?? []).map((e) => e.message), rows: rows.length }));
  for (const x of rows) console.log(JSON.stringify({ minute: x.dimensions.datetimeMinute, status: x.dimensions.status, version: String(x.dimensions.scriptVersion ?? '').slice(0, 8), requests: x.sum.requests, errors: x.sum.errors, cpuP50_ms: +(x.quantiles.cpuTimeP50 / 1000).toFixed(1), cpuP99_ms: +(x.quantiles.cpuTimeP99 / 1000).toFixed(1), cpuP999_ms: +(x.quantiles.cpuTimeP999 / 1000).toFixed(1), wallP99_ms: +(x.quantiles.wallTimeP99 / 1000).toFixed(0) }));
}
