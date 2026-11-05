#!/usr/bin/env node
// Owner answers -> versioned golden cases -> classifier check (Bible v5 §4.6, §6.3, §10.3, §11.6).
//   node scripts/topics-feedback.mjs --pull                pull new topic_labels rows from D1 (read-only) into topics/<lane>/<topic>/labels/golden.ndjson
//   node scripts/topics-feedback.mjs --report [--topic UYK] which golden cases the current plan gets wrong, grouped as next actions
//   node scripts/topics-feedback.mjs --baseline             record the currently-correct golden cases (topics/_generated/golden-baseline.json)
// A golden case is the owner's answer with the English title it was given on. CI (topics-golden.test.mjs) fails when a case
// that the baseline records as correct becomes wrong: an accepted owner decision can never silently break (§11.6).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadClassifier } from './topics-dryrun.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] ?? true : null; };
const TOPIC_DIRS = { UYK: 'topics/research/uyku' };
export const goldenPath = (topicId) => join(root, TOPIC_DIRS[topicId] || `topics/research/${topicId.toLowerCase()}`, 'labels', 'golden.ndjson');
export const baselinePath = join(root, 'topics', '_generated', 'golden-baseline.json');

export function readGolden(topicId) {
  const p = goldenPath(topicId);
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

/** Expected vs predicted for each golden case under the given plan (same rules as the Worker clarity bar). */
export function evaluate(cases, classify, plan) {
  const t = (topicId) => plan.topics.find((x) => x.topicId === topicId);
  const clusterOf = (topicId, unitId) => {
    const units = new Map((t(topicId)?.units || []).map((u) => [u.id, u]));
    const u = units.get(unitId);
    if (!u) return null;
    if (u.cluster) return u.cluster;
    for (const m of u.maps || []) if (units.get(m)?.cluster) return units.get(m).cluster;
    return null;
  };
  const latest = new Map();
  for (const c of cases) { const k = `${c.topic_id}|${c.item_id}|${c.unit_id}`; const prev = latest.get(k); if (!prev || c.labeled_at >= prev.labeled_at) latest.set(k, c); }
  const out = [];
  for (const c of latest.values()) {
    if (c.verdict === 'HOLD') continue;
    const hit = classify(c.title_orig || '', null, plan).topics.find((x) => x.topicId === c.topic_id);
    const predicted = new Set((hit?.units || []).map((u) => u.clusterId || clusterOf(c.topic_id, u.unitId)).filter(Boolean));
    const asked = c.unit_id.endsWith('-?') ? null : clusterOf(c.topic_id, c.unit_id);
    const push = (cluster, expected, ok) => out.push({ key: `${c.label_id}|${cluster || '_topic'}|${expected}`, label_id: c.label_id, topic_id: c.topic_id, cluster: cluster || '_topic', expected, ok, title: c.title_orig, note: c.note, reason: c.reason_code, scope: c.scope });
    if (c.verdict === 'PASS') {
      const target = c.correct_unit_id ? clusterOf(c.topic_id, c.correct_unit_id) : asked;
      if (target) push(target, 'PASS', predicted.has(target)); else push(null, 'PASS', !!hit);
      if (c.correct_unit_id && asked && asked !== target) push(asked, 'FAIL', !predicted.has(asked));
    } else if (asked) push(asked, 'FAIL', !predicted.has(asked));
    else push(null, 'FAIL', !hit);
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

async function main() {
  if (arg('--pull')) {
    const sql = 'SELECT label_id, item_id, topic_id, unit_id, verdict, scope, correct_unit_id, reason_code, note, feed_id, title_orig, url, plan_version, labeled_by, labeled_at FROM topic_labels ORDER BY labeled_at';
    const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', 'global-content-os', '--remote', '--json', '--command', sql], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 << 20 });
    const rows = JSON.parse(raw)[0].results;
    let added = 0;
    for (const topicId of [...new Set(rows.map((r) => r.topic_id))]) {
      const have = new Set(readGolden(topicId).map((r) => r.label_id));
      const fresh = rows.filter((r) => r.topic_id === topicId && !have.has(r.label_id));
      if (!fresh.length) continue;
      const p = goldenPath(topicId);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, (existsSync(p) ? readFileSync(p, 'utf8') : '') + fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
      added += fresh.length;
    }
    console.log(`GOLDEN_ADDED=${added} LABEL_ROWS=${rows.length}`);
    return;
  }
  const { classify } = await loadClassifier();
  const TOPIC_PLAN = await loadPlan();
  const topics = arg('--topic') && arg('--topic') !== true ? [arg('--topic')] : TOPIC_PLAN.topics.map((t) => t.topicId);
  const results = topics.flatMap((id) => evaluate(readGolden(id), classify, TOPIC_PLAN));
  if (arg('--baseline')) {
    writeFileSync(baselinePath, JSON.stringify({ planVersion: TOPIC_PLAN.version, correct: results.filter((r) => r.ok).map((r) => r.key) }, null, 1) + '\n');
    console.log(`BASELINE correct=${results.filter((r) => r.ok).length} wrong=${results.filter((r) => !r.ok).length}`);
    return;
  }
  const wrong = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ cases: results.length, wrong: wrong.length, missedPass: wrong.filter((r) => r.expected === 'PASS').length, falsePass: wrong.filter((r) => r.expected === 'FAIL').length }));
  for (const w of wrong) console.log(`${w.expected === 'PASS' ? 'ADD_TERMS ' : 'NARROW    '} ${w.topic_id}/${w.cluster} | ${w.scope} | ${w.reason || ''} | ${w.note || ''} | ${w.title}`);
}

export async function loadPlan() {
  const { build } = await import('esbuild');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const out = join(mkdtempSync(join(tmpdir(), 'topics-plan-')), 'plan.mjs');
  await build({ entryPoints: [join(root, 'apps/worker/src/topics/plan.generated.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return (await import(pathToFileURL(out).href)).TOPIC_PLAN;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
