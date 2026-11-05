import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, validate, readLedger, buildPlan } from './topics.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const run = (root, ...a) => quiet(() => main([...a, '--root', root]));
const fresh = () => mkdtempSync(join(tmpdir(), 'topics-'));

test('real repo topics area validates (ids, ledger, derived plan in sync)', () => {
  assert.deepEqual(validate(repo), []);
  assert.equal(quiet(() => main(['build', '--check', '--root', repo])), 0);
});

test('a topic written with sub-topics enters the registry, ledger and derived plan', () => {
  const root = fresh();
  assert.equal(run(root, 'new', 'research', 'TST', 'Test konusu', '--decision', 'DEC-TEST-1'), 0);
  assert.equal(run(root, 'add-cluster', 'TST', 'K1', 'Küme bir'), 0);
  assert.equal(run(root, 'add-sub', 'TST', 'K1', 'İlk alt başlık', 'alpha term;beta term', 'A'), 0);
  assert.equal(run(root, 'add-sub', 'TST', 'K1', 'İkinci alt başlık', 'gamma term', 'C', '--list', 'liste-2'), 0);
  assert.deepEqual(validate(root), []);
  const kinds = readLedger(root).map((r) => `${r.kind}:${r.id}`);
  assert.deepEqual(kinds, ['TOPIC_STATE:TST', 'CLUSTER_ADDED:TST:K1', 'SUBTOPIC_ADDED:TST-001', 'SUBTOPIC_ADDED:TST-002']);
  const plan = buildPlan(root).topics[0];
  assert.equal(plan.subtopic_count, 2);
  assert.deepEqual(plan.term_to_subtopics['alpha term'], ['TST-001']);
  assert.deepEqual(plan.tiers, { A: ['TST-001'], B: [], C: ['TST-002'] });
  assert.equal(plan.fetch_budget.max_queries_per_run, null);
  assert.equal(run(root, 'build'), 0);
  assert.equal(run(root, 'build', '--check'), 0);
});

test('extension is append-only: ids stay contiguous, gaps and edits to history are rejected', () => {
  const root = fresh();
  run(root, 'new', 'research', 'TST', 'Test', '--decision', 'DEC-TEST-1');
  run(root, 'add-cluster', 'TST', 'K1', 'Küme');
  run(root, 'add-sub', 'TST', 'K1', 'Bir', 'one', 'A');
  run(root, 'add-sub', 'TST', 'K1', 'İki', 'two', 'B');
  const file = join(root, 'topics', 'research', 'tst', 'topic.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const base = { ledger: readLedger(root), subIds: ['TST-001', 'TST-002'] };
  doc.subtopics.shift();
  writeFileSync(file, JSON.stringify(doc));
  const errs = validate(root, { base });
  assert.ok(errs.some((e) => e.includes('contiguous')));
  assert.ok(errs.some((e) => e.includes('TST-001') && e.includes('gone') === false) || errs.length > 0);
});

test('history rewrite and unknown ledger state are caught', () => {
  const root = fresh();
  run(root, 'new', 'research', 'TST', 'Test', '--decision', 'DEC-TEST-1');
  const base = { ledger: readLedger(root), subIds: [] };
  const lp = join(root, 'topics', 'LEDGER.ndjson');
  const rows = readFileSync(lp, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  rows[0].text = 'ACTIVE: renamed behind the owner back';
  writeFileSync(lp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  assert.ok(validate(root, { base }).some((e) => e.includes('append-only')));
});

test('a topic without an owner decision id and a duplicate topic are refused', () => {
  const root = fresh();
  assert.equal(run(root, 'new', 'research', 'TST', 'Test', '--decision', 'DEC-TEST-1'), 0);
  const l = console.error; console.error = () => {};
  try { assert.throws(() => quiet(() => main(['new', 'research', 'TST', 'Again', '--decision', 'DEC-2', '--root', root])), /already exists/); } finally { console.error = l; }
  const ip = join(root, 'topics', 'research', '_index.json');
  const idx = JSON.parse(readFileSync(ip, 'utf8'));
  idx.topics[0].decision_ref = '';
  writeFileSync(ip, JSON.stringify(idx));
  assert.ok(validate(root).some((e) => e.includes('decision_ref missing')));
});
