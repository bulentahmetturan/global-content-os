#!/usr/bin/env node
// registry-find <source-id>  --  READ-ONLY record lookup against the canonical source stores.
//
// The canonical files remain the only editable truth; this tool builds no index and writes nothing.
// It returns ONLY the matching record(s) (plus file + JSON path), so ordinary lookups never need a whole registry
// in context. Stores searched (package 2 ownership): packages/source-catalog/data (news, research, Kaduse
// subscriptions), adapters/hekimler-radar/content/source-registry-*.json (Hekimler), config/feeds.json (Kaduse feeds).
//
//   node scripts/registry-find.mjs <source-id> | --files        exit 0 found, 1 not found, 2 usage
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID_KEYS = ['source_id', 'sourceId', 'id'];
const rel = (f) => relative(root, f).split(sep).join('/');

export function stores() {
  const out = [];
  const cat = join(root, 'packages', 'source-catalog', 'data');
  if (existsSync(cat)) for (const f of readdirSync(cat).filter((n) => n.endsWith('.json')).sort()) out.push(join(cat, f));
  const hek = join(root, 'adapters', 'hekimler-radar', 'content');
  if (existsSync(hek)) {
    for (const f of readdirSync(hek).filter((n) => n.startsWith('source-registry-') && n.endsWith('.json')).sort()) out.push(join(hek, f));
  }
  const feeds = join(root, 'config', 'feeds.json');
  if (existsSync(feeds)) out.push(feeds);
  return out;
}

const isRecord = (v) => v && typeof v === 'object' && !Array.isArray(v) && ID_KEYS.some((k) => typeof v[k] === 'string');

function* records(node, path, depth = 0) {
  if (depth > 2 || node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) if (isRecord(node[i])) yield { path: `${path}[${i}]`, record: node[i] };
    return;
  }
  for (const k of Object.keys(node)) yield* records(node[k], path ? `${path}.${k}` : k, depth + 1);
}

export function find(sourceId) {
  const hits = [];
  for (const file of stores()) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const { path, record } of records(data, '')) {
      if (ID_KEYS.some((k) => record[k] === sourceId)) hits.push({ file: rel(file), path, record });
    }
  }
  return hits;
}

if (process.argv[1] && process.argv[1].endsWith('registry-find.mjs')) {
  const a = process.argv.slice(2);
  if (a.includes('--files')) {
    console.log(stores().map(rel).join('\n'));
  } else if (!a[0] || a[0].startsWith('--')) {
    console.error('usage: registry-find <source-id> | --files');
    process.exit(2);
  } else {
    const hits = find(a[0]);
    if (!hits.length) {
      console.error(`NOT_FOUND ${a[0]}`);
      process.exit(1);
    }
    console.log(JSON.stringify(hits.length === 1 ? hits[0] : hits, null, 1));
  }
}
