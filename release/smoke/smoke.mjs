#!/usr/bin/env node
// Post-deployment smoke: small, safe, non-destructive, fast, repeatable. Not run against production by P7.
//
// Safety properties (asserted by tests):
//   * only GET requests, plus POSTs that are guaranteed to be rejected before any write:
//       - GCOS status callback with NO token          -> must be 401/503
//       - CCOS approved_brief with NO token           -> must be 401/503
//       - CCOS approved_brief with the real token but an INVALID payload -> must be 400 (never creates a job)
//   * no publish, no promote, no D1 writes, no secrets printed (tokens come from env names, never echoed).
//
// SMOKE_PASS: every required probe passes. SMOKE_FAIL: any required probe fails (or is unreachable).
// Usage: node release/smoke/smoke.mjs --gcos https://... --ccos https://... [--expect-commit <sha>] [--json]
//        (CCOS_SMOKE_TOKEN env = HANDOFF_INGEST_TOKEN value, optional; without it the authed probe is SKIPPED, not passed)
import { matchLiveIdentity } from '../lib/identity.mjs';

const INVALID_BRIEF = { smoke: true }; // strict contract => guaranteed 400 (never a valid brief)

export async function runSmoke({ gcosUrl, ccosUrl, expectCommit = null, ccosToken = null, fetchImpl = fetch, timeoutMs = 10000 }) {
  const probes = [];
  const call = async (method, url, { headers = {}, body } = {}) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json };
    } catch (e) {
      return { status: 0, json: null, error: String(e.name ?? e) };
    } finally { clearTimeout(t); }
  };
  const add = (id, required, ok, detail) => probes.push({ id, required, ok, detail });

  const h = await call('GET', `${gcosUrl}/api/health`);
  add('gcos_liveness', true, h.status === 200 && h.json?.ok === true && h.json?.service === 'global-content-os', `status=${h.status}`);
  if (expectCommit) {
    const m = matchLiveIdentity(h.json, expectCommit);
    add('gcos_identity', true, m.ok, m.ok ? 'commit matches' : m.reason);
  }
  const sh = await call('GET', `${gcosUrl}/api/system-health`);
  add('gcos_readiness', true, sh.status === 200 && sh.json?.ok === true, `status=${sh.status}`);
  const cb = await call('POST', `${gcosUrl}/api/handoff/status`, { body: { briefId: 'smoke', status: 'accepted' } });
  add('gcos_callback_auth_fail_closed', true, cb.status === 401 || cb.status === 503, `status=${cb.status}`);

  const cl = await call('GET', `${ccosUrl}/`);
  add('ccos_liveness', true, cl.status === 200, `status=${cl.status}`);
  const noAuth = await call('POST', `${ccosUrl}/api/handoff/approved-brief`, { body: INVALID_BRIEF });
  add('ccos_handoff_auth_fail_closed', true, noAuth.status === 401, `status=${noAuth.status} (503 = token not configured)`);
  if (ccosToken) {
    const authed = await call('POST', `${ccosUrl}/api/handoff/approved-brief`, { headers: { Authorization: `Bearer ${ccosToken}` }, body: INVALID_BRIEF });
    add('ccos_handoff_validation_path', true, authed.status === 400 && authed.json?.error === 'invalid_approved_brief', `status=${authed.status}`);
  } else add('ccos_handoff_validation_path', false, true, 'SKIPPED (no CCOS_SMOKE_TOKEN)');

  const failed = probes.filter((p) => p.required && !p.ok).map((p) => p.id);
  return { verdict: failed.length ? 'SMOKE_FAIL' : 'SMOKE_PASS', failed, probes };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('smoke.mjs')) {
  const args = process.argv.slice(2);
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const gcosUrl = val('--gcos'); const ccosUrl = val('--ccos');
  if (!gcosUrl || !ccosUrl) { console.error('usage: smoke.mjs --gcos <url> --ccos <url> [--expect-commit sha] [--json]'); process.exit(2); }
  const r = await runSmoke({ gcosUrl: gcosUrl.replace(/\/$/, ''), ccosUrl: ccosUrl.replace(/\/$/, ''), expectCommit: val('--expect-commit'), ccosToken: process.env.CCOS_SMOKE_TOKEN ?? null });
  if (args.includes('--json')) console.log(JSON.stringify(r));
  else { console.log(r.verdict + (r.failed.length ? ` failed=${r.failed.join(',')}` : '')); for (const p of r.probes) if (!p.ok) console.log(`  ${p.id}: ${p.detail}`); }
  process.exit(r.verdict === 'SMOKE_PASS' ? 0 : 1);
}
