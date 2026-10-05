#!/usr/bin/env node
// OPERATOR CLI for the DOSSIER RECURRING operation (R14/R15). A thin, explicit HTTP client for /api/dossier/ops/* (docs/DOSSIER-RECURRING-RUNBOOK.md).
//
//   read  (DOSSIER_OPS_READ_TOKEN)  : summary | alerts | runs [--reader --limit] | health <reader-id> | changes --run-id <id> | candidates [--state --limit] | snapshot <id>
//   write (DOSSIER_OPS_WRITE_TOKEN) : recurring on|off | persistence on|off | sweep on|off | retention on|off | capacity <d1|subrequests|cpu-ms|verify> <value>
//                                     source-state <reader-id> <DISABLED|BURN_IN|ACTIVE|PAUSED|BLOCKED> [--reason ...]
//                                     review <candidate-id> <ACCEPT|REJECT|SNOOZE> [--reason-code ...] [--note ...] | promote <concept-id> [--note ...]
//
//   DOSSIER_OPS_READ_TOKEN=... node scripts/dossier-ops-operator.mjs --base https://<worker> summary
//   DOSSIER_OPS_WRITE_TOKEN=... node scripts/dossier-ops-operator.mjs --base https://<worker> --operator <name> recurring on
//
// Safety: the base URL is always explicit (no default: it can never hit production by accident) and must be https (http only for localhost). Reads use ONLY the read
// token, every change uses ONLY the write token (a missing token is an error, never a fallback to the other one or to OPS_TOKEN). Tokens come from the environment, are
// sent only in the Authorization header and are never printed or put in a URL. Nothing here loops, polls or runs on a timer; one invocation = one request.
import { pathToFileURL } from 'node:url';

export const READ_COMMANDS = ['summary', 'alerts', 'runs', 'health', 'changes', 'candidates', 'snapshot'];
export const SWITCHES = { recurring: 'recurring_enabled', persistence: 'recurring:candidate_persistence', sweep: 'recurring:aging_sweep', retention: 'recurring:retention' };
export const CAPACITY_KEYS = { d1: 'platform:d1_queries_per_invocation', subrequests: 'platform:subrequest_limit', 'cpu-ms': 'platform:cpu_budget_ms' };

export async function callOps({ base, token, tokenName, method = 'GET', path, body, fetchImpl = fetch }) {
  if (!base || !/^https?:\/\//.test(base)) throw new Error('--base <worker url> is required');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base)) throw new Error('--base must be https (http only for localhost)');
  if (!token) throw new Error(`${tokenName} is required in the environment`);
  const res = await fetchImpl(`${base.replace(/\/+$/, '')}/api/dossier/ops/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { error: 'NON_JSON_RESPONSE', body_head: text.replace(/\s+/g, ' ').slice(0, 160) }; }
  return { httpStatus: res.status, data };
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { o[argv[i].slice(2)] = argv[i + 1]; i += 1; } else o._.push(argv[i]);
  }
  return o;
}

const onoff = (v) => { if (v !== 'on' && v !== 'off') throw new Error('expected on|off'); return v === 'on' ? '1' : '0'; };

/** Builds the request for a command (pure: tested without a network). Returns null for an unknown command. */
export function buildRequest(cmd, x, y, a, env = process.env) {
  if (READ_COMMANDS.includes(cmd)) {
    const read = { token: env.DOSSIER_OPS_READ_TOKEN, tokenName: 'DOSSIER_OPS_READ_TOKEN', method: 'GET' };
    const qs = (pairs) => pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (cmd === 'summary' || cmd === 'alerts') return { ...read, path: cmd };
    if (cmd === 'runs') return { ...read, path: `runs?${qs([['reader', a.reader], ['limit', a.limit]])}` };
    if (cmd === 'health') { if (!x) throw new Error('health <reader-id>'); return { ...read, path: `source/${encodeURIComponent(x)}/health` }; }
    if (cmd === 'changes') { if (!a['run-id']) throw new Error('--run-id is required'); return { ...read, path: `changes?${qs([['run_id', a['run-id']]])}` }; }
    if (cmd === 'candidates') return { ...read, path: `candidates?${qs([['state', a.state], ['limit', a.limit]])}` };
    if (!x) throw new Error('snapshot <snapshot-id>');
    return { ...read, path: `snapshot/${encodeURIComponent(x)}` };
  }
  const write = { token: env.DOSSIER_OPS_WRITE_TOKEN, tokenName: 'DOSSIER_OPS_WRITE_TOKEN', method: 'POST' };
  const operator = a.operator;
  if (cmd in SWITCHES) { if (!operator) throw new Error('--operator is required'); return { ...write, path: 'control', body: { key: SWITCHES[cmd], value: onoff(x), operator } }; }
  if (cmd === 'capacity') {
    if (!operator) throw new Error('--operator is required');
    if (x === 'verify') return { ...write, path: 'control', body: { key: 'platform:capacity_verified', value: '1', operator } };
    if (!(x in CAPACITY_KEYS) || !/^[1-9]\d{0,6}$/.test(y ?? '')) throw new Error('capacity <d1|subrequests|cpu-ms> <positive integer> | capacity verify');
    return { ...write, path: 'control', body: { key: CAPACITY_KEYS[x], value: y, operator } };
  }
  if (cmd === 'source-state') {
    if (!operator) throw new Error('--operator is required');
    if (!x || !y) throw new Error('source-state <reader-id> <state>');
    return { ...write, path: 'source-state', body: { reader_id: x, to: y, operator, ...(a.reason ? { reason: a.reason } : {}) } };
  }
  if (cmd === 'review') {
    if (!operator) throw new Error('--operator is required (the reviewer identity: a human)');
    if (!x || !y) throw new Error('review <candidate-id> <ACCEPT|REJECT|SNOOZE>');
    return { ...write, path: 'review', body: { reviewer_id: operator, target_type: 'DOSSIER_CANDIDATE', target_id: x, decision: y, ...(a['reason-code'] ? { reason_code: a['reason-code'] } : {}), ...(a.note ? { reason_note: a.note } : {}) } };
  }
  if (cmd === 'promote') {
    if (!operator) throw new Error('--operator is required (the reviewer identity: a human)');
    if (!x) throw new Error('promote <concept-id>');
    return { ...write, path: 'promote', body: { reviewer_id: operator, target_id: x, ...(a.note ? { reason_note: a.note } : {}) } };
  }
  return null;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, x, y] = a._;
  const req = buildRequest(cmd, x, y, a);
  if (!req) {
    console.error('usage: summary|alerts|runs|health|changes|candidates|snapshot | recurring|persistence|sweep|retention on|off | capacity | source-state | review | promote   (--base <url> [--operator <name>])');
    return 2;
  }
  const { httpStatus, data } = await callOps({ base: a.base, ...req });
  console.log(JSON.stringify({ httpStatus, ...data }, null, 2));
  return httpStatus < 400 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((c) => process.exit(c), (e) => { console.error(String(e.message ?? e)); process.exit(2); });
}
