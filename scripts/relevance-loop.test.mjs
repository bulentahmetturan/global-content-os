import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run, patterns, toEvents, renderBundle, measure, LEDGER, BUNDLE } from './relevance-loop.mjs';
import { rankCandidates } from './relevance-selection.mjs';

const rows = [];
const at = (d) => `2026-09-${String(d).padStart(2, '0')}T10:00:00Z`;
const push = (n, decision, source, day, extra = {}) => { for (let i = 0; i < n; i++) rows.push({ item_id: `${source}-${decision}-${day}-${i}`, decision, reason_code: decision === 'rejected' ? 'off_topic' : null, channel_id: 'kaduse-medikal', source_id: source, content_family: null, at: at(day), ...extra }); };
push(5, 'rejected', 'noisy-feed', 10);
push(1, 'accepted', 'noisy-feed', 10);
push(8, 'accepted', 'europe-pmc-batch', 11);
push(2, 'rejected', 'rare-feed', 12);
push(3, 'accepted', 'tdb_dental', 12, { channel_id: 'hekimler-toplulugu', content_family: 'hekimler_phase1' });

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'p5-'));
  const ledgerPath = join(dir, 'ledger.json');
  const bundlePath = join(dir, 'bundle.ts');
  copyFileSync(LEDGER, ledgerPath);
  writeFileSync(bundlePath, renderBundle([]));
  return { ledgerPath, bundlePath, read: () => rows, now: at(15) };
}

test('capture: accepts AND rejects become structured events with channel, source, content family, reason', () => {
  const ev = toEvents(rows);
  assert.equal(ev.filter((e) => e.evidence.data.decision === 'accepted').length, 12);
  assert.equal(ev.filter((e) => e.evidence.data.decision === 'rejected').length, 7);
  const rej = ev.find((e) => e.evidence.data.decision === 'rejected');
  assert.deepEqual(rej.channel_scope, { kind: 'channel', channel_id: 'kaduse-medikal' });
  assert.equal(rej.evidence.data.source_id, 'noisy-feed');
  assert.equal(rej.observation.code, 'LOW_RELEVANCE');
  assert.equal(ev.find((e) => e.evidence.data.source_id === 'tdb_dental').evidence.data.content_family, 'hekimler_phase1');
});

test('patterns: noise floor buckets; only a repeated, dominant signal becomes a proposal', () => {
  const p = patterns(toEvents(rows));
  const by = (k) => p.find((x) => x.key === k && x.dimension === 'source');
  assert.equal(by('noisy-feed').bucket, 'PROPOSAL');
  assert.equal(by('noisy-feed').proposal.action, 'LOWER_SOURCE_PRIORITY');
  assert.equal(by('rare-feed').bucket, 'BELOW_NOISE_FLOOR');
  assert.equal(by('europe-pmc-batch').bucket, 'NO_CLEAR_SIGNAL');
  assert.equal(p.find((x) => x.dimension === 'content_family').bucket, 'BELOW_NOISE_FLOOR');
});

test('apply is gated: human/review-gate reviewer, proposal only, dry run without --apply', () => {
  const s = sandbox();
  const pat = patterns(toEvents(rows)).find((x) => x.key === 'noisy-feed' && x.dimension === 'source').pattern_id;
  const other = patterns(toEvents(rows)).find((x) => x.key === 'rare-feed').pattern_id;
  assert.equal(run(['apply', '--pattern', pat, '--reviewer', 'machine:bot'], s).code, 'NOT_REVIEWED');
  assert.equal(run(['apply', '--pattern', other, '--reviewer', 'human:bulent'], s).code, 'NOT_A_PROPOSAL');
  const dry = run(['apply', '--pattern', pat, '--reviewer', 'human:bulent'], s);
  assert.equal(dry.ok, true);
  assert.equal(dry.applied, false);
  assert.deepEqual(JSON.parse(readFileSync(s.ledgerPath, 'utf8')).rows, []);
});

async function loadWorkerQueries(bundleSource) {
  const dir = mkdtempSync(join(tmpdir(), 'p5w-'));
  cpSync('apps/worker/src', join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/triage/relevance-adjustments.generated.ts'), bundleSource);
  const out = join(dir, 'queries.mjs');
  await build({ entryPoints: [join(dir, 'src/db/queries.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const hub = [
  { id: 'a', channel_id: 'kaduse-medikal', feed_id: 'noisy-feed', source_id: null, route: 'kaduse-news', triage_status: 'inbox' },
  { id: 'b', channel_id: 'kaduse-medikal', feed_id: 'europe-pmc-batch', source_id: null, route: 'kaduse-news', triage_status: 'inbox' },
  { id: 'c', channel_id: 'kaduse-medikal', feed_id: 'noisy-feed', source_id: null, route: 'kaduse-news', triage_status: 'inbox' },
  { id: 'd', channel_id: 'hekimler-toplulugu', feed_id: 'x', source_id: 'noisy-feed', route: 'kaduse-news', triage_status: 'inbox' },
];
const fakeDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: hub.map((r) => ({ ...r })) }) }) }) };
const ids = (xs) => xs.map((x) => x.id).join('');

test('Worker /api/items ordering: unchanged without adjustments, changes after owner apply, restored after reversal', async () => {
  const s = sandbox();
  const before = await loadWorkerQueries(renderBundle([]));
  assert.equal(ids(await before.listItems(fakeDb, 'kaduse-news', 'inbox')), 'abcd');

  const pat = patterns(toEvents(rows)).find((x) => x.key === 'noisy-feed' && x.dimension === 'source').pattern_id;
  const applied = run(['apply', '--pattern', pat, '--reviewer', 'human:bulent', '--why', 'drill', '--apply'], s);
  assert.equal(applied.ok, true);
  assert.equal(run(['bundle', '--check'], s).bundle, 'IN_SYNC');
  const after = await loadWorkerQueries(readFileSync(s.bundlePath, 'utf8'));
  assert.equal(ids(await after.listItems(fakeDb, 'kaduse-news', 'inbox')), 'bdac', 'lowered source sinks only in its own channel; nothing removed');

  const ledgerRows = JSON.parse(readFileSync(s.ledgerPath, 'utf8')).rows;
  const universe = hub.map((h) => ({ ...h, source_id: h.source_id ?? h.feed_id }));
  assert.equal(ids(rankCandidates(universe, ledgerRows)), 'bdac', 'Worker ordering matches rankCandidates');

  assert.equal(run(['reverse', '--adjustment', applied.adjustment.adjustment_id, '--reviewer', 'human:bulent', '--apply'], s).ok, true);
  const restored = await loadWorkerQueries(readFileSync(s.bundlePath, 'utf8'));
  assert.equal(ids(await restored.listItems(fakeDb, 'kaduse-news', 'inbox')), 'abcd');
});

test('bundle drift is detected; committed bundle matches the committed ledger', () => {
  const s = sandbox();
  writeFileSync(s.bundlePath, renderBundle([{ kind: 'apply', adjustment_id: 'x', channel_id: 'c', dimension: 'source', key: 'k', direction: 'lower', delta: 20 }]));
  assert.equal(run(['bundle', '--check'], s).bundle, 'DRIFT');
  assert.equal(run(['bundle', '--check']).bundle, 'IN_SYNC');
});

test('measure: before/after outcome; INSUFFICIENT_EVIDENCE below floor (never fabricated)', () => {
  const adj = { adjustment_id: 'adj', channel_id: 'kaduse-medikal', applied_at: at(15) };
  assert.equal(measure(rows, adj).outcome, 'INSUFFICIENT_EVIDENCE');
  const more = [...rows];
  for (let i = 0; i < 10; i++) more.push({ ...rows[0], item_id: `n${i}`, decision: i < 9 ? 'accepted' : 'rejected', at: at(20) });
  for (let i = 0; i < 4; i++) more.push({ ...rows[0], item_id: `o${i}`, decision: 'rejected', at: at(9) });
  const m = measure(more, adj);
  assert.equal(m.before.decisions, 20);
  assert.equal(m.outcome, 'IMPROVED');
});
