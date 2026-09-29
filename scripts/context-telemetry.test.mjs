import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSession, evaluate, manualManifest, checkBenchmarks, summarize, BENCHMARKS, CLASSES } from './context-telemetry.mjs';

const P = 'D:\\Desktop\\projects';
let n = 0;
const assistant = (tokens, uses = []) => JSON.stringify({
  type: 'assistant', sessionId: 's1', cwd: `${P}\\global-content-os`, timestamp: `2026-09-30T10:00:${String(n).padStart(2, '0')}Z`,
  message: { id: `m${n++}`, role: 'assistant', usage: { input_tokens: 2, cache_read_input_tokens: tokens - 2, cache_creation_input_tokens: 0 },
    content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })) },
});
const result = (id, chars) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(chars) }] } });
const prompt = (chars) => JSON.stringify({ type: 'user', sessionId: 's1', message: { role: 'user', content: 'p'.repeat(chars) } });

test('Claude transcript: exact usage per turn, baseline split, loads classified by kind', () => {
  const m = analyzeSession([
    prompt(3600),
    assistant(70000, [['t1', 'Read', { file_path: `${P}\\global-content-os\\docs\\SOURCE-LIFECYCLE.md` }]]),
    result('t1', 36000),
    assistant(90000, [['t2', 'Read', { file_path: `${P}\\global-content-os\\docs\\source-matrix.generated.json` }]]),
    result('t2', 360000),
    assistant(200000, [['t3', 'Bash', { command: `rg foo ${P}\\global-content-os\\adapters\\hekimler-radar\\content\\archive\\old.md` }]]),
    result('t3', 100),
  ]);
  assert.equal(m.CONTEXT_TOKENS.peak, 200000);
  assert.equal(m.CONTEXT_TOKENS.first, 70000);
  assert.equal(m.CONTEXT_TOKENS.task, 130000);
  assert.equal(m.CONTEXT_TOKENS.first_prompt_est, 1000);
  assert.equal(m.TURN_OVER_150K, 3);
  assert.deepEqual(m.REPOS_LOADED, ['global-content-os']);
  assert.equal(m.FULL_REGISTRY_LOADED.length, 1);
  assert.equal(m.GENERATED_EVIDENCE_LOADED.length, 1);
  assert.equal(m.HISTORY_LOADED.length, 1);
  assert.equal(m.TOP_LOADS[0].est_tokens, 100000);
  assert.match(m.TOP_LOADS[0].path, /source-matrix/);
});

test('transcript store paths are not repos; every spec field is present', () => {
  const m = analyzeSession([assistant(1000, [['a', 'Read', { file_path: 'C:\\Users\\W11\\.claude\\projects\\C--Users-W11-Desktop-projects\\x.jsonl' }]]), result('a', 10)]);
  assert.deepEqual(m.REPOS_LOADED, ['global-content-os']);
  for (const k of ['TASK_CLASS', 'CONTEXT_TOKENS', 'REPOS_LOADED', 'CHANNELS_LOADED', 'HISTORY_LOADED', 'GENERATED_EVIDENCE_LOADED', 'FULL_REGISTRY_LOADED', 'FULL_FEEDBACK_HISTORY_LOADED', 'WHY_REQUIRED']) assert.ok(k in m, k);
});

test('per-class verdicts: unnecessary load flagged for scoped work, closure needs WHY_REQUIRED, no single global limit', () => {
  const base = { CONTEXT_TOKENS: { peak: 90000, first: 75000, task: 15000 }, REPOS_LOADED: ['global-content-os'], CHANNELS_LOADED: [], HISTORY_LOADED: [], GENERATED_EVIDENCE_LOADED: [], FULL_REGISTRY_LOADED: [], FULL_FEEDBACK_HISTORY_LOADED: [], WHY_REQUIRED: null, TOP_LOADS: [] };
  assert.equal(evaluate({ ...base, TASK_CLASS: 'SINGLE_SUBSYSTEM' }).VERDICT, 'WITHIN_BUDGET');
  assert.equal(evaluate({ ...base, TASK_CLASS: 'SINGLE_SUBSYSTEM', CONTEXT_TOKENS: { peak: 150000, task: 60000 } }).VERDICT, 'OVER_CEILING_UNEXPLAINED');
  assert.equal(evaluate({ ...base, TASK_CLASS: 'ORDINARY', CONTEXT_TOKENS: { peak: 150000, task: 60000 } }).VERDICT, 'WITHIN_BUDGET');
  const reg = evaluate({ ...base, TASK_CLASS: 'SINGLE_SUBSYSTEM', FULL_REGISTRY_LOADED: ['x/source-registry-burs.json'] });
  assert.equal(reg.VERDICT, 'UNNECESSARY_LOAD');
  assert.deepEqual(reg.UNNECESSARY_LOAD_FOUND, ['x/source-registry-burs.json']);
  assert.equal(evaluate({ ...base, TASK_CLASS: 'SINGLE_SUBSYSTEM', REPOS_LOADED: ['global-content-os', 'channel-content-os'] }).VERDICT, 'UNNECESSARY_LOAD');
  assert.equal(evaluate({ ...base, TASK_CLASS: 'SYSTEM_CLOSURE' }).VERDICT, 'WHY_REQUIRED_MISSING');
  assert.equal(evaluate({ ...base, TASK_CLASS: 'SYSTEM_CLOSURE', WHY_REQUIRED: 'post-freeze integration' }).VERDICT, 'WITHIN_BUDGET');
  const bench = BENCHMARKS.find((b) => b.id === 5);
  assert.equal(evaluate({ ...base, TASK_CLASS: 'SINGLE_SUBSYSTEM', REPOS_LOADED: ['channel-content-os'], TOP_LOADS: [{ path: 'channels/kaduse-medikal/ASSET-MANIFEST.json' }] }, bench).VERDICT, 'UNNECESSARY_LOAD');
  assert.equal(new Set(Object.values(CLASSES).map((c) => c.ceiling)).size, 4);
});

test('manual adapter is vendor-neutral and rejects incomplete manifests', () => {
  assert.equal(manualManifest({ TASK_CLASS: 'ORDINARY' }).VERDICT, 'INVALID');
  const m = manualManifest({ AGENT: 'codex', TASK_CLASS: 'ORDINARY', CONTEXT_TOKENS: { peak: 120000, baseline: 30000 }, REPOS_LOADED: ['global-content-os'], CHANNELS_LOADED: [], HISTORY_LOADED: [], GENERATED_EVIDENCE_LOADED: [], FULL_REGISTRY_LOADED: [], FULL_FEEDBACK_HISTORY_LOADED: [] });
  assert.equal(m.CONTEXT_TOKENS.task, 90000);
  assert.equal(evaluate(m).VERDICT, 'OVER_CEILING_UNEXPLAINED');
});

test('benchmarks: 14 declared tasks; missing route and over-ceiling initial load fail', () => {
  assert.equal(BENCHMARKS.length, 14);
  const rows = checkBenchmarks((repo) => BENCHMARKS.filter((b) => b.repo === repo && b.id !== 9).map((b) => ({ pass: true, tokens: b.id === 8 ? 50000 : 5000, name: b.route })));
  assert.equal(rows.find((r) => r.id === 9).status, 'ROUTE_MISSING');
  assert.equal(rows.find((r) => r.id === 8).status, 'INITIAL_LOAD_OVER_CEILING');
  assert.equal(rows.filter((r) => r.status === 'PASS').length, 12);
});

test('summary explains overload shape (baseline vs accumulation)', () => {
  const s = summarize([evaluate({ ...analyzeSession([prompt(360), assistant(80000), assistant(160000), assistant(170000)]), TASK_CLASS: 'CROSS_SUBSYSTEM' })]);
  assert.equal(s.over_150k, 1);
  assert.equal(s.over_150k_shape.median_first_turn_tokens, 80000);
  assert.equal(s.over_150k_shape.median_turn_reaching_150k, 2);
});
