#!/usr/bin/env node
// P4 context efficiency telemetry. Read-only; never edits a transcript, router or rule.
//   sessions [--dir D | --file F] [--since ISO] [--class C] [--why "..."] [--benchmark N] [--check]
//   summary  [--dir D] [--since ISO] [--scope content-systems]         class split of real sessions, overload explanation
//   manual   <manifest.json> [--check]          vendor-neutral adapter (Codex, other agents, hand-recorded)
//   benchmarks                                 declared manifests: route exists, initial load vs class ceiling
// Claude Code transcripts are the supported adapter: `usage` totals are exact, tool-result sizes are estimates (chars/3.6).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const CLASSES = JSON.parse(readFileSync(join(root, 'docs/context/task-classes.json'), 'utf8')).classes;
export const BENCHMARKS = JSON.parse(readFileSync(join(root, 'docs/context/benchmarks.json'), 'utf8')).benchmarks;

const HISTORY = /_history[\\/]|[\\/]archive[\\/]|legacy-cleanup|\.p4wt|preserve[\\/]|\.arch\b|SORUN-TESPIT/i;
const GENERATED = /\.generated\.json|cron-capacity-report|ASSET-MANIFEST\.json|[\\/]evidence[\\/]/i;
const REGISTRY = /source-registry-[^\\/]*\.json|source-matrix\.generated\.json|source-catalog[\\/]data[\\/]/i;
const FEEDBACK = /feedback[^\\/]*(export|dump)|review_feedback[^\\/]*\.(json|ndjson|csv)|feedback-events[^\\/]*\.ndjson/i;
const INFRA = /wrangler\s+(deploy|d1\s+migrations\s+apply)|git\s+(merge|push|tag)\b|time-travel|release[\\/]manifest/i;
const PATHISH = /[A-Za-z]:[\\/][^\s"'`|<>]+|(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+/g;
const tok = (chars) => Math.round(chars / 3.6);

export const CONTENT_SYSTEMS = ['global-content-os', 'channel-content-os', 'multi_channel_design'];
function repoOf(p) {
  if (/\.claude[\\/]+projects/i.test(p)) return null;
  const m = /Desktop[\\/]+projects[\\/]+(?:content-systems[\\/]+)?(?:\.p4wt[\\/]+)?([\w][\w.-]*)(?=[\\/]|$)/i.exec(p);
  if (!m || /^[0-9a-f]{8}-/i.test(m[1]) || /\.(md|json|mjs|txt|log)$/i.test(m[1])) return null;
  return m[1];
}
function subsystemOf(p, repo) {
  const m = new RegExp(`${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/]+([^\\\\/\\s"']+)(?:[\\\\/]+([^\\\\/\\s"']+))?`, 'i').exec(p);
  if (!m) return null;
  return ['apps', 'packages', 'adapters', 'channels', 'mcp-server'].includes(m[1]) && m[2] ? `${m[1]}/${m[2]}` : m[1];
}
const resultText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text || '').join('') : '');

export function analyzeSession(lines, opts = {}) {
  const turns = new Map();
  const uses = new Map();
  const loads = [];
  let session = null, cwd = null, first = null, last = null, infra = false, prompt = null;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    session ||= e.sessionId; cwd ||= e.cwd;
    if (e.timestamp) { first ||= e.timestamp; last = e.timestamp; }
    const msg = e.message;
    if (e.type === 'user' && prompt == null && typeof msg?.content === 'string') prompt = tok(msg.content.length);
    if (e.type === 'assistant' && msg?.usage) {
      const u = msg.usage;
      turns.set(msg.id || e.uuid, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0));
    }
    for (const c of Array.isArray(msg?.content) ? msg.content : []) {
      if (c.type === 'tool_use') {
        const i = c.input || {};
        const direct = i.file_path || i.path || i.notebook_path || null;
        const text = direct || i.command || i.pattern || '';
        if (INFRA.test(i.command || '')) infra = true;
        const paths = direct ? [direct] : (String(text).match(PATHISH) || []);
        uses.set(c.id, { tool: c.name, paths, whole: c.name === 'Read' && i.offset == null && i.limit == null });
      } else if (c.type === 'tool_result' && uses.has(c.tool_use_id)) {
        const u = uses.get(c.tool_use_id);
        loads.push({ ...u, tokens: tok(resultText(c.content).length) });
      }
    }
  }
  const ordered = [...turns.values()];
  const sizes = [...ordered].sort((a, b) => a - b);
  const all = loads.flatMap((l) => l.paths.map((p) => ({ ...l, path: p })));
  const repos = new Set([...all.map((l) => repoOf(l.path)), cwd && repoOf(cwd)].filter(Boolean));
  const subsystems = new Set(all.map((l) => { const r = repoOf(l.path); return r && subsystemOf(l.path, r); }).filter(Boolean));
  const hit = (re, pred = () => true) => [...new Set(all.filter((l) => re.test(l.path) && pred(l)).map((l) => l.path))];
  const inferred = infra ? 'SYSTEM_CLOSURE' : repos.size >= 2 ? 'CROSS_SUBSYSTEM' : subsystems.size <= 1 ? 'SINGLE_SUBSYSTEM' : subsystems.size === 2 ? 'ORDINARY' : 'CROSS_SUBSYSTEM';
  return {
    SESSION: session, CWD: cwd, FROM: first, TO: last, TURNS: sizes.length,
    TASK_CLASS: opts.class || inferred, TASK_CLASS_SOURCE: opts.class ? 'declared' : 'inferred',
    CONTEXT_TOKENS: { peak: sizes.at(-1) || 0, p50: sizes[Math.floor(sizes.length / 2)] || 0, first: ordered[0] || 0, first_prompt_est: prompt, task: Math.max(0, (sizes.at(-1) || 0) - (ordered[0] || 0)), exact: true },
    TURN_OVER_150K: ordered.findIndex((t) => t > 150000) + 1 || null,
    REPOS_LOADED: [...repos], CHANNELS_LOADED: [...new Set(all.map((l) => /channels[\\/]+([\w-]+)/.exec(l.path)?.[1]).filter(Boolean))],
    HISTORY_LOADED: hit(HISTORY), GENERATED_EVIDENCE_LOADED: hit(GENERATED),
    FULL_REGISTRY_LOADED: hit(REGISTRY, (l) => l.whole || l.tokens > 8000),
    FULL_FEEDBACK_HISTORY_LOADED: hit(FEEDBACK, (l) => l.whole || l.tokens > 8000),
    WHY_REQUIRED: opts.why || null,
    TOP_LOADS: all.sort((a, b) => b.tokens - a.tokens).slice(0, 5).map((l) => ({ path: l.path, tool: l.tool, est_tokens: l.tokens })),
  };
}

// Ceilings apply to context the task added on top of the agent's own first-turn baseline
// (system prompt, tool schemas, skills: ~55-90k in Claude Code and outside repo control).
const taskTokens = (m) => m.CONTEXT_TOKENS.task ?? m.CONTEXT_TOKENS.peak;

export function evaluate(m, benchmark = null) {
  const cls = CLASSES[m.TASK_CLASS];
  if (!cls) return { ...m, VERDICT: 'INVALID', REASON: `unknown TASK_CLASS ${m.TASK_CLASS}` };
  const scoped = m.TASK_CLASS !== 'SYSTEM_CLOSURE';
  const unnecessary = scoped ? [...m.HISTORY_LOADED, ...m.GENERATED_EVIDENCE_LOADED, ...m.FULL_REGISTRY_LOADED, ...m.FULL_FEEDBACK_HISTORY_LOADED] : [];
  if (benchmark) {
    const everything = [...(m.TOP_LOADS || []).map((l) => l.path), ...m.REPOS_LOADED, ...m.HISTORY_LOADED, ...m.GENERATED_EVIDENCE_LOADED, ...m.FULL_REGISTRY_LOADED];
    for (const f of benchmark.forbidden) unnecessary.push(...everything.filter((p) => p.replace(/\\/g, '/').includes(f)));
  }
  if (cls.max_repos != null && m.REPOS_LOADED.length > cls.max_repos) unnecessary.push(`repos:${m.REPOS_LOADED.join('+')}`);
  const over = cls.ceiling != null && taskTokens(m) > cls.ceiling;
  const needsWhy = over || Boolean(cls.why_required) || unnecessary.length > 0;
  const UNNECESSARY_LOAD_FOUND = [...new Set(unnecessary)];
  const VERDICT = needsWhy && !m.WHY_REQUIRED ? (over ? 'OVER_CEILING_UNEXPLAINED' : cls.why_required ? 'WHY_REQUIRED_MISSING' : 'UNNECESSARY_LOAD') : over ? 'OVER_CEILING_EXPLAINED' : 'WITHIN_BUDGET';
  return { ...m, CEILING: cls.ceiling, UNNECESSARY_LOAD_FOUND, VERDICT };
}

const REQUIRED = ['TASK_CLASS', 'CONTEXT_TOKENS', 'REPOS_LOADED', 'CHANNELS_LOADED', 'HISTORY_LOADED', 'GENERATED_EVIDENCE_LOADED', 'FULL_REGISTRY_LOADED', 'FULL_FEEDBACK_HISTORY_LOADED'];
export function manualManifest(obj) {
  const missing = REQUIRED.filter((k) => obj[k] === undefined);
  if (missing.length) return { VERDICT: 'INVALID', REASON: `missing ${missing.join(', ')}` };
  const peak = typeof obj.CONTEXT_TOKENS === 'number' ? obj.CONTEXT_TOKENS : obj.CONTEXT_TOKENS.peak;
  const list = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);
  return {
    SESSION: obj.SESSION || 'manual', AGENT: obj.AGENT || 'unspecified', TASK_CLASS: obj.TASK_CLASS, TASK_CLASS_SOURCE: 'declared',
    CONTEXT_TOKENS: { peak, p50: obj.CONTEXT_TOKENS.p50 ?? null, task: obj.CONTEXT_TOKENS.baseline != null ? Math.max(0, peak - obj.CONTEXT_TOKENS.baseline) : peak, exact: Boolean(obj.CONTEXT_TOKENS.exact) },
    REPOS_LOADED: list(obj.REPOS_LOADED), CHANNELS_LOADED: list(obj.CHANNELS_LOADED), HISTORY_LOADED: list(obj.HISTORY_LOADED),
    GENERATED_EVIDENCE_LOADED: list(obj.GENERATED_EVIDENCE_LOADED), FULL_REGISTRY_LOADED: list(obj.FULL_REGISTRY_LOADED),
    FULL_FEEDBACK_HISTORY_LOADED: list(obj.FULL_FEEDBACK_HISTORY_LOADED), WHY_REQUIRED: obj.WHY_REQUIRED || null, TOP_LOADS: obj.TOP_LOADS || [],
  };
}

export function checkBenchmarks(simulate = simulateRoutes) {
  const byRepo = {};
  return BENCHMARKS.map((b) => {
    byRepo[b.repo] ||= simulate(b.repo);
    const hit = byRepo[b.repo].find((r) => r.name === b.route);
    const ceiling = CLASSES[b.class]?.ceiling;
    const status = !CLASSES[b.class] ? 'UNKNOWN_CLASS' : !hit ? 'ROUTE_MISSING' : hit.pass !== true ? 'ROUTE_BROKEN' : ceiling != null && hit.tokens > ceiling ? 'INITIAL_LOAD_OVER_CEILING' : 'PASS';
    return { id: b.id, task: b.task, class: b.class, repo: b.repo, initial_tokens: hit?.tokens ?? null, ceiling, status };
  });
}
function simulateRoutes(repo) {
  const dir = resolve(root, '..', repo);
  if (!existsSync(join(dir, 'scripts/check-router-links.mjs'))) return [];
  const out = execFileSync(process.execPath, ['scripts/check-router-links.mjs', '--simulate'], { cwd: dir, encoding: 'utf8' });
  return out.split('\n').map((l) => /^(PASS|FAIL) ~\s*(\d+) tok\s+cross-repo=\S+\s+(.+?)(?:\s+FORBIDDEN:.*)?$/.exec(l.trim())).filter(Boolean)
    .map((m) => ({ pass: m[1] === 'PASS', tokens: Number(m[2]), name: m[3].trim() }));
}

export function transcriptFiles(dir, since) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...transcriptFiles(p, since));
    else if (e.name.endsWith('.jsonl') && (!since || statSync(p).mtime >= new Date(since))) out.push(p);
  }
  return out;
}
const readLines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean);

export function summarize(manifests) {
  const byClass = {};
  for (const m of manifests) {
    const c = (byClass[m.TASK_CLASS] ||= { sessions: 0, over_150k: 0, over_ceiling: 0, with_unnecessary_load: 0, peak_max: 0 });
    c.sessions++; c.peak_max = Math.max(c.peak_max, m.CONTEXT_TOKENS.peak);
    if (m.CONTEXT_TOKENS.peak > 150000) c.over_150k++;
    if (m.CEILING != null && taskTokens(m) > m.CEILING) c.over_ceiling++;
    if (m.UNNECESSARY_LOAD_FOUND.length) c.with_unnecessary_load++;
  }
  const load = {};
  for (const m of manifests.filter((x) => x.UNNECESSARY_LOAD_FOUND.length)) for (const p of m.UNNECESSARY_LOAD_FOUND) {
    const k = basename(p.replace(/\\/g, '/')) || p; load[k] = (load[k] || 0) + 1;
  }
  const withTurns = manifests.filter((m) => m.TURNS > 0);
  const big = withTurns.filter((m) => m.CONTEXT_TOKENS.peak > 150000);
  const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? null;
  return {
    sessions: withTurns.length, over_150k: big.length, by_class: byClass,
    over_150k_shape: {
      median_first_turn_tokens: median(big.map((m) => m.CONTEXT_TOKENS.first)),
      median_first_prompt_est_tokens: median(big.map((m) => m.CONTEXT_TOKENS.first_prompt_est ?? 0)),
      median_turn_reaching_150k: median(big.map((m) => m.TURN_OVER_150K)),
      median_turns: median(big.map((m) => m.TURNS)),
      first_turn_over_40k: big.filter((m) => m.CONTEXT_TOKENS.first > 40000).length,
    },
    top_unnecessary_loads: Object.entries(load).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, sessions]) => ({ path, sessions })),
  };
}

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') o.check = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

function main(argv) {
  const o = parse(argv);
  const cmd = o._[0];
  const dir = o.dir || join(homedir(), '.claude', 'projects');
  const bench = o.benchmark ? BENCHMARKS.find((b) => String(b.id) === String(o.benchmark)) : null;
  if (cmd === 'benchmarks') {
    const rows = checkBenchmarks();
    for (const r of rows) console.log(JSON.stringify(r));
    const bad = rows.filter((r) => r.status !== 'PASS').length;
    console.log(`BENCHMARKS=${rows.length} FAILING=${bad}`);
    return bad ? 1 : 0;
  }
  let manifests;
  if (cmd === 'manual') manifests = [manualManifest(JSON.parse(readFileSync(o._[1], 'utf8')))];
  else if (cmd === 'sessions' || cmd === 'summary') {
    const files = o.file ? [o.file] : transcriptFiles(dir, o.since);
    manifests = files.map((f) => analyzeSession(readLines(f), { class: o.class, why: o.why }));
    if (o.scope === 'content-systems') manifests = manifests.filter((m) => m.REPOS_LOADED.some((r) => CONTENT_SYSTEMS.includes(r)));
  } else {
    console.error('usage: context-telemetry.mjs sessions|summary|manual <file>|benchmarks');
    return 2;
  }
  const evaluated = manifests.map((m) => (m.VERDICT === 'INVALID' ? m : evaluate(m, bench)));
  if (cmd === 'summary') console.log(JSON.stringify(summarize(evaluated.filter((m) => m.VERDICT !== 'INVALID')), null, 1));
  else for (const m of evaluated) console.log(JSON.stringify(m));
  const failing = evaluated.filter((m) => ['INVALID', 'OVER_CEILING_UNEXPLAINED', 'WHY_REQUIRED_MISSING', 'UNNECESSARY_LOAD'].includes(m.VERDICT));
  return o.check && failing.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
