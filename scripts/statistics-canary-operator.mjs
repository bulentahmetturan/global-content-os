// Operator CLI for the HEALTH_STATISTICS first canary (calls /api/statistics/canary/* only).
//   OPS_TOKEN=... node scripts/statistics-canary-operator.mjs --url https://<worker> <status|bootstrap-all|run|handoff>
// The token comes from the environment only (never argv, never printed, never written). https only (http allowed for localhost).
// It never loops on a failure: the first non-2xx response stops the command and is reported with its error code.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_RUN_INVOCATIONS = 3;
export const MAX_HANDOFF_INVOCATIONS = 3;
export const DEFAULT_STATE_FILE = '.logs/statistics-canary-invocations.json';
export const DEFAULT_HANDOFF_STATE_FILE = '.logs/statistics-handoff-invocations.json';

// Policy arming/disarming is NOT an operator route: the owner runs release/statistics-canary-policy-{arm,disarm}.sql (frozen P5 rule).
export const ACTIONS = { status: 'GET', 'bootstrap-all': 'POST', run: 'POST', handoff: 'POST' };

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--state-file') out.stateFile = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

export function checkUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('--url must be an absolute URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('--url must be https (http only for localhost)');
  return u.origin;
}

async function send(origin, token, method, action, body) {
  const res = await fetch(`${origin}/api/statistics/canary/${encodeURIComponent(action)}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: 'NON_JSON_RESPONSE', body_head: text.slice(0, 120) };
  }
  return { status: res.status, body: parsed };
}

/** The Worker cannot count operator invocations (no schema for it); the CLI keeps the durable counter. An attempted invocation counts, success or not. */
export function reserveInvocation(stateFile, max = MAX_RUN_INVOCATIONS) {
  let count = 0;
  if (existsSync(stateFile)) count = Number(JSON.parse(readFileSync(stateFile, 'utf8')).count) || 0;
  if (count >= max) throw new Error(`MAX_OPERATOR_INVOCATIONS=${max} already used (${stateFile}); a further run needs a new owner decision`);
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ count: count + 1 }));
  return count + 1;
}

export async function main(argv, env, log = console.log) {
  const args = parseArgs(argv);
  const [cmd] = args._;
  if (!(cmd in ACTIONS)) throw new Error(`command must be one of ${Object.keys(ACTIONS).join(', ')}`);
  const origin = checkUrl(args.url);
  const token = env.OPS_TOKEN;
  if (!token) throw new Error('OPS_TOKEN is not set in the environment');
  if (cmd === 'run') reserveInvocation(args.stateFile ?? DEFAULT_STATE_FILE, MAX_RUN_INVOCATIONS);
  if (cmd === 'handoff') reserveInvocation(args.stateFile ?? DEFAULT_HANDOFF_STATE_FILE, MAX_HANDOFF_INVOCATIONS); // POST_CANARY_PRODUCTION_HANDOFF: owner-triggered only
  const results = [];
  const stopOnFail = (r) => {
    results.push(r);
    return r.status >= 200 && r.status < 300;
  };
  if (cmd === 'bootstrap-all') {
    let chunk = 0;
    while (chunk !== null) {
      const r = await send(origin, token, 'POST', 'bootstrap', { chunk });
      if (!stopOnFail(r)) break;
      chunk = r.body.nextChunk;
    }
  } else {
    stopOnFail(await send(origin, token, ACTIONS[cmd], cmd, {}));
  }
  const ok = results.every((r) => r.status >= 200 && r.status < 300);
  log(JSON.stringify({ command: cmd, ok, results }, null, 2));
  return ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2), process.env).then((c) => process.exit(c), (e) => {
    console.error(String(e.message ?? e));
    process.exit(2);
  });
}
