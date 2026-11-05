#!/usr/bin/env node
// Topic dry-run (Bible v5 §6.4): classify real stored items with the same classifier the Worker runs, read-only.
//   node scripts/topics-dryrun.mjs --export <items.json>           read research items from D1 (one SELECT, read-only)
//   node scripts/topics-dryrun.mjs --items <items.json> [--out report.json] [--md report.md] [--topic UYK]
//   node scripts/topics-dryrun.mjs --items <items.json> --sql <tags.sql> [--feeds a,b|*]   write idempotent tag INSERTs (backfill)
// Stored summaries are already translated to Turkish, so stored items are classified on the original English title only
// (matched_on = 'title'); new items are classified at ingest on title + English abstract. No LLM, no network besides --export.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };

export async function loadClassifier() {
  const out = join(mkdtempSync(join(tmpdir(), 'topics-')), 'classify.mjs');
  await build({ entryPoints: [join(root, 'apps/worker/src/topics/classify.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

export function exportItems(path) {
  const sql = "SELECT id, feed_id, triage_status, published_at, COALESCE(title_orig, title) AS t, canonical_url AS u FROM source_items WHERE route = 'kaduse-research'";
  const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', 'global-content-os', '--remote', '--json', '--command', sql], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 << 20 });
  writeFileSync(path, raw);
  const j = JSON.parse(raw);
  return { rows: j[0].results.length, rowsRead: j[0].meta.rows_read };
}

export function report(items, classify, topicId = null) {
  const tagged = [];
  for (const it of items) {
    const c = classify(it.t || '', null);
    for (const t of c.topics) {
      if (topicId && t.topicId !== topicId) continue;
      tagged.push({ id: it.id, feed: it.feed_id, status: it.triage_status, pub: it.published_at, title: it.t, url: it.u, topic: t.topicId, anchors: t.anchors, units: t.units.map((u) => u.unitId), clusters: [...new Set(t.units.map((u) => u.clusterId).filter(Boolean))], tiers: [...new Set(t.units.map((u) => u.tier).filter(Boolean))], planVersion: c.planVersion });
    }
  }
  const count = (f) => tagged.reduce((m, x) => { for (const k of f(x)) m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    generated_at: new Date().toISOString(), total_items: items.length, topic_items: tagged.length,
    without_unit: tagged.filter((x) => !x.units.length).length,
    by_cluster: count((x) => x.clusters), by_feed: count((x) => [x.feed]), by_status: count((x) => [x.status]), by_unit: count((x) => x.units),
    items: tagged,
  };
}

const q = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
export function tagSql(items, classify, feeds = ['*']) {
  const rows = [];
  for (const it of items) {
    if (!feeds.includes('*') && !feeds.includes(it.feed_id)) continue;
    const c = classify(it.t || '', null);
    for (const t of c.topics) {
      const units = t.units.length ? t.units : [{ unitId: `${t.topicId}-?`, kind: 'unassigned', clusterId: null, tier: null, terms: [] }];
      for (const u of units) rows.push(`(${[q(it.id), q(t.topicId), q(u.unitId), q(u.kind), q(u.clusterId), q(u.tier), q(it.feed_id), q(JSON.stringify([...t.anchors, ...u.terms])), q('title'), q(c.planVersion)].join(', ')})`);
    }
  }
  const head = 'INSERT OR IGNORE INTO topic_item_tags (item_id, topic_id, unit_id, unit_kind, cluster_id, tier, feed_id, matched_terms, matched_on, plan_version) VALUES\n';
  const chunks = [];
  for (let i = 0; i < rows.length; i += 50) chunks.push(head + rows.slice(i, i + 50).join(',\n') + ';');
  return { sql: chunks.join('\n') + '\n', rows: rows.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (arg('--export')) { console.log(JSON.stringify(exportItems(arg('--export')))); process.exit(0); }
  const items = JSON.parse(readFileSync(arg('--items'), 'utf8'))[0].results;
  const { classify } = await loadClassifier();
  if (arg('--sql')) {
    const { sql, rows } = tagSql(items, classify, (arg('--feeds') || '*').split(','));
    writeFileSync(arg('--sql'), sql);
    console.log(`TAG_ROWS=${rows}`);
    process.exit(0);
  }
  const r = report(items, classify, arg('--topic'));
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ total: r.total_items, topic_items: r.topic_items, without_unit: r.without_unit, by_cluster: r.by_cluster, by_status: r.by_status }));
  console.log('by_feed', JSON.stringify(Object.entries(r.by_feed).sort((a, b) => b[1] - a[1])));
}
