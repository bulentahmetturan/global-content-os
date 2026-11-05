#!/usr/bin/env node
// Research source state under the wow-example paradigm (DEC-R-20261106-015, Bible v5 §5.6 lifecycle `paused`).
// Every Research feed is paused, never deleted: registry, rules and stored items stay, so a feed can come back in one step.
// A feed comes back only when the owner introduces a wow article from it.
//   node scripts/research-sources.mjs status
//   node scripts/research-sources.mjs which <article-url>          which paused feed (if any) serves this article's domain
//   node scripts/research-sources.mjs reactivate <feed-id> --article <url> [--note "..."]   record + write .logs/research/reactivate-<id>.sql
//   node scripts/research-sources.mjs pause-sql                    write .logs/research/pause.sql (idempotent)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const statePath = join(root, 'topics', 'research-sources-state.json');
const arg = (argv, n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const sq = (s) => String(s).replace(/'/g, "''");

export function readState(path = statePath) { return JSON.parse(readFileSync(path, 'utf8')); }
/** Feeds that must stay disabled in D1 and in config/feeds.json: paused and not reactivated. */
export function pausedIds(state) {
  const back = new Set((state.reactivated || []).map((r) => r.feed_id));
  return state.paused.map((p) => p.feed_id).filter((id) => !back.has(id));
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
/** Paused feeds whose endpoint domain matches the article domain (suffix match, e.g. jamanetwork.com). */
export function whichFeed(state, articleUrl) {
  const h = host(articleUrl);
  if (!h) return [];
  return state.paused.filter((p) => { const d = host(p.endpoint_url || ''); return d && (h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`)); });
}

export function main(argv, path = statePath) {
  const cmd = argv[0];
  const state = readState(path);
  if (cmd === 'status') {
    console.log(JSON.stringify({ mode: state.mode, paused: pausedIds(state).length, reactivated: (state.reactivated || []).map((r) => r.feed_id), kept: state.kept_enabled.map((k) => k.feed_id) }));
    return 0;
  }
  if (cmd === 'which') {
    const hits = whichFeed(state, argv[1]);
    console.log(hits.length ? hits.map((h) => `${h.feed_id} (${h.label})`).join('\n') : 'NO_PAUSED_FEED: new source -> source lifecycle onboarding (Bible §6.5)');
    return 0;
  }
  if (cmd === 'reactivate') {
    const id = argv[1];
    const article = arg(argv, '--article');
    if (!state.paused.some((p) => p.feed_id === id)) throw new Error(`${id} is not a paused Research feed`);
    if (!article) throw new Error('--article <url> required: a feed comes back only for an owner wow article');
    state.reactivated ||= [];
    if (!state.reactivated.some((r) => r.feed_id === id)) state.reactivated.push({ feed_id: id, at: new Date().toISOString().slice(0, 10), article, note: arg(argv, '--note') || null });
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
    const out = join(root, '.logs', 'research', `reactivate-${id}.sql`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `-- Reactivate ${id} for owner wow article ${article} (stored items kept; no backfill).\nUPDATE source_feeds SET enabled = 1 WHERE id = '${sq(id)}';\n`);
    console.log(`REACTIVATED ${id} -> run: npx wrangler d1 execute global-content-os --remote --file .logs/research/reactivate-${id}.sql`);
    return 0;
  }
  if (cmd === 'pause-sql') {
    const ids = pausedIds(state);
    const out = join(root, '.logs', 'research', 'pause.sql');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `-- Pause Research feeds (DEC-R-20261106-015): enabled=0 only; rows, rules and stored items stay. Rollback: enabled=1 for the same ids.\nUPDATE source_feeds SET enabled = 0 WHERE route = 'kaduse-research' AND enabled = 1 AND id IN (${ids.map((i) => `'${sq(i)}'`).join(', ')});\n`);
    console.log(`PAUSE_SQL ${ids.length} feeds -> .logs/research/pause.sql`);
    return 0;
  }
  if (cmd === 'discovery-sql') {
    // Topic-driven discovery (DEC-R-20261106-024): Europe PMC searches by the owner's topic relations (queries come from the Worker topic plan), not by journal.
    const feeds = JSON.parse(readFileSync(join(root, 'config', 'feeds.json'), 'utf8')).feeds;
    const f = feeds.find((x) => x.id === 'research-europe-pmc-rest');
    if (!f || f.rules.mode !== 'topics') throw new Error('research-europe-pmc-rest is not in topics mode in config/feeds.json (run node scripts/sync-feeds.mjs)');
    const out = join(root, '.logs', 'research', 'discovery.sql');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `-- Europe PMC topic discovery on (DEC-R-20261106-024). Rollback: enabled = 0 for the same ids.
UPDATE source_feeds SET enabled = 1, poll_minutes = ${f.pollMinutes}, rules_json = '${sq(JSON.stringify(f.rules))}' WHERE id IN ('research-europe-pmc-rest', 'europe-pmc-batch');
`);
    console.log('DISCOVERY_SQL -> .logs/research/discovery.sql');
    return 0;
  }
  console.log('usage: status | which <url> | reactivate <feed-id> --article <url> [--note ...] | pause-sql | discovery-sql');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`ERROR ${e.message}`); process.exit(1); }
}
