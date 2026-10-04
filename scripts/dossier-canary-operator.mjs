#!/usr/bin/env node
// OPERATOR CLI for the DOSSIER manual one-shot canary. A thin, explicit HTTP client for the OPS_TOKEN-gated routes of the Worker:
//
//   read-only :  status | runs | watch | candidates | errors | readiness
//   mutating  :  control <key> <0|1|n>   (kill switches)       run <reader-id>   (executes ONE canary run to completion)
//
//   OPS_TOKEN=... node scripts/dossier-canary-operator.mjs --base https://<worker> --operator <name> status
//
// Safety: the base URL is always explicit (there is no default, so it can never hit production by accident); mutating commands need
// --operator; `run` repeats the SAME explicit run request only until COMPLETED / FAILED / REFUSED (bounded by --max-invocations),
// never starts a second run, never runs on a timer. The token comes from the environment and is never printed.
import { pathToFileURL } from 'node:url';

const READ = ['status', 'runs', 'watch', 'candidates', 'errors', 'readiness'];

export async function callDossier({ base, token, method = 'GET', path, body, fetchImpl = fetch }) {
  if (!base || !/^https?:\/\//.test(base)) throw new Error('--base <worker url> is required');
  // the bearer token must never cross the network in clear text: plain http is only accepted for a local development host
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base)) throw new Error('--base must be https (http only for localhost)');
  if (!token) throw new Error('OPS_TOKEN is required in the environment');
  const res = await fetchImpl(`${base.replace(/\/+$/, '')}/api/dossier/canary/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // a non-JSON answer (for example a platform error page) is reported, not swallowed: the first bytes explain a failed invocation
  let data;
  if (typeof res.text === 'function') {
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = { error: 'NON_JSON_RESPONSE', body_head: text.replace(/\s+/g, ' ').slice(0, 160) }; }
  } else data = await res.json().catch(() => ({}));
  return { httpStatus: res.status, data };
}

/** Executes ONE run: invokes until the run reports COMPLETED / FAILED, or the gate refuses. Never starts a second run. */
/** `runId` resumes an EXISTING run: the Worker refuses an unknown or foreign run id and never creates a new run for it. */
export async function runUntilDone({ base, token, reader, operator, maxInvocations = 60, fetchImpl, onStep = () => {}, runId: resumeRunId }) {
  let runId = resumeRunId;
  const steps = [];
  for (let i = 0; i < maxInvocations; i++) {
    const { httpStatus, data } = await callDossier({ base, token, method: 'POST', path: 'run', body: { reader_id: reader, operator, ...(runId ? { run_id: runId } : {}) }, fetchImpl });
    steps.push({ httpStatus, status: data.status, phase: data.phase, statements: data.statementsThisInvocation, reasons: data.reasons, error: data.error, body_head: data.body_head });
    onStep(steps[steps.length - 1]);
    if (data.status === 'REFUSED' || httpStatus >= 400) return { final: 'REFUSED', steps, data };
    if (data.status === 'COMPLETED' || data.status === 'FAILED') return { final: data.status, steps, data };
    runId = data.runId;
  }
  return { final: 'MAX_INVOCATIONS_REACHED', steps, runId };
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { o[argv[i].slice(2)] = argv[i + 1]; i += 1; } else o._.push(argv[i]);
  }
  return o;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, x, y] = a._;
  const token = process.env.OPS_TOKEN;
  const base = a.base;
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  if (READ.includes(cmd)) {
    const qs = [a.reader && `reader=${encodeURIComponent(a.reader)}`, a.limit && `limit=${encodeURIComponent(a.limit)}`, a.after && `after=${encodeURIComponent(a.after)}`].filter(Boolean).join('&');
    const { httpStatus, data } = await callDossier({ base, token, path: `${cmd}${qs ? `?${qs}` : ''}` });
    print({ httpStatus, ...data });
    return httpStatus < 400 ? 0 : 1;
  }
  if (cmd === 'control') {
    if (!a.operator) throw new Error('--operator is required');
    const { httpStatus, data } = await callDossier({ base, token, method: 'POST', path: 'control', body: { key: x, value: y, operator: a.operator } });
    print({ httpStatus, ...data });
    return httpStatus < 400 ? 0 : 1;
  }
  if (cmd === 'run') {
    if (!a.operator) throw new Error('--operator is required');
    const r = await runUntilDone({ base, token, reader: x, operator: a.operator, runId: a['run-id'], maxInvocations: a['max-invocations'] ? Number(a['max-invocations']) : 60, onStep: (s) => console.error(`step: http=${s.httpStatus} ${s.status ?? '-'} ${s.phase ?? ''} statements=${s.statements ?? '-'} ${s.reasons ? s.reasons.join(',') : ''}${s.error ? ' error=' + s.error : ''}${s.body_head ? ' body=' + s.body_head : ''}`) });
    print({ final: r.final, invocations: r.steps.length, runId: r.data?.runId ?? r.runId, progress: r.data?.progress, reasons: r.data?.reasons, error: r.data?.error });
    return r.final === 'COMPLETED' ? 0 : 1;
  }
  console.error('usage: status|runs|watch|candidates|errors|readiness | control <key> <value> | run <reader-id>   (--base <url> [--operator <name>])');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((c) => process.exit(c), (e) => { console.error(String(e.message ?? e)); process.exit(2); });
}
