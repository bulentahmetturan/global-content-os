#!/usr/bin/env node
/**
 * One-off operator backfill for the journal Crossref fallback (Phase 6, owner-approved 2026-09-30): the scheduled
 * job only ever takes the newest 12 works per journal, so the 14 journals starved 2026-09-22..30 by the rotation
 * bug (scheduled-jobs.ts journalFallbackOffset) miss everything older. This pages Crossref per journal for a
 * publication-date window through POST /api/ingress/journal-fallback {backfill}; the Worker applies the same
 * filters, DOI dedupe key and ingest gate as the scheduled job (idempotent: a re-run creates nothing new).
 *
 *   node scripts/journal-backfill.mjs --preflight              Crossref only (no token, no Worker call): DOIs + counts
 *   node scripts/journal-backfill.mjs --dry-run                Worker dedupe lookup only, no writes (HUB_OPERATOR_TOKEN)
 *   node scripts/journal-backfill.mjs --execute                write through the normal ingest path (HUB_OPERATOR_TOKEN)
 * Options: --from 2026-09-22 --until 2026-09-30 --feeds id1,id2 --rows 20 --sleep-ms 1500 --max-items 2000
 *          --hub https://global-content-os.channel-content-os-mcp.workers.dev --out <file.json>
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hubAuthHeaders } from './lib/hub-auth.mjs';

export const STARVED_JOURNALS = Object.freeze({
  'research-bmj': '1756-1833',
  'research-circulation-aha': '1524-4539',
  'research-jaha': '2047-9980',
  'research-jacc': '0735-1097',
  'research-european-heart-journal': '1522-9645',
  'research-cochrane-library': '1469-493X',
  'research-cell': '0092-8674',
  'research-chest-journal': '0012-3692',
  'research-european-respiratory-journal': '1399-3003',
  'research-ieee-jbhi': '2168-2208',
  'research-ieee-tbme': '1558-2531',
  'research-jmir': '1438-8871',
  'research-lancet-digital-health': '2589-7500',
  'research-the-lancet': '0140-6736',
});

export function parseArgs(argv) {
  const a = {
    mode: null, from: '2026-09-22', until: '2026-09-30', feeds: Object.keys(STARVED_JOURNALS), rows: 20,
    sleepMs: 1500, maxItems: 2000, hub: 'https://global-content-os.channel-content-os-mcp.workers.dev', out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--preflight') a.mode = 'preflight';
    else if (k === '--dry-run') a.mode = 'dry-run';
    else if (k === '--execute') a.mode = 'execute';
    else if (k === '--from') a.from = v();
    else if (k === '--until') a.until = v();
    else if (k === '--feeds') a.feeds = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--rows') a.rows = Number(v());
    else if (k === '--sleep-ms') a.sleepMs = Number(v());
    else if (k === '--max-items') a.maxItems = Number(v());
    else if (k === '--hub') a.hub = v();
    else if (k === '--out') a.out = v();
    else throw new Error(`unknown argument: ${k}`);
  }
  if (!a.mode) throw new Error('choose one of --preflight | --dry-run | --execute');
  const unknown = a.feeds.filter((f) => !STARVED_JOURNALS[f]);
  if (unknown.length) throw new Error(`not a backfill journal: ${unknown.join(',')}`);
  return a;
}

/** Same URL shape as the Worker's crossrefWindowUrl (research-quality.ts); used only by --preflight. */
export function preflightUrl(issn, from, until, rows, cursor) {
  const u = new URL('https://api.crossref.org/works');
  u.searchParams.set('filter', `issn:${issn},from-pub-date:${from},until-pub-date:${until}`);
  u.searchParams.set('rows', String(rows));
  u.searchParams.set('cursor', cursor || '*');
  return u.toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function preflightJournal(a, feedId) {
  const dois = [];
  let cursor = '*';
  let total = null;
  for (let page = 0; page < 200; page++) {
    const res = await fetch(preflightUrl(STARVED_JOURNALS[feedId], a.from, a.until, Math.max(a.rows, 100), cursor), {
      headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.2 journal-backfill (mailto:ops@local)' },
    });
    if (!res.ok) throw new Error(`${feedId}: crossref_${res.status}`);
    const m = (await res.json()).message || {};
    total = m['total-results'] ?? total;
    const items = m.items || [];
    for (const it of items) if (it.DOI) dois.push(String(it.DOI).toLowerCase());
    if (!items.length || !m['next-cursor']) break;
    cursor = m['next-cursor'];
    await sleep(a.sleepMs);
  }
  return { feedId, totalResults: total, dois };
}

async function workerJournal(a, feedId, dryRun) {
  const sum = { feedId, pages: 0, fetched: 0, candidates: 0, created: 0, updated: 0, rejected: 0, existing: 0, wouldCreate: 0, totalResults: null };
  let cursor = '*';
  for (let page = 0; page < 200; page++) {
    const res = await fetch(`${a.hub}/api/ingress/journal-fallback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...hubAuthHeaders('/api/ingress/journal-fallback') },
      body: JSON.stringify({ backfill: { feedId, from: a.from, until: a.until, cursor, rows: a.rows, dryRun } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.backfill) throw new Error(`${feedId}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    const p = body.backfill;
    sum.pages += 1;
    for (const k of ['fetched', 'candidates', 'created', 'updated', 'rejected', 'existing', 'wouldCreate']) sum[k] += p[k] || 0;
    sum.totalResults = p.totalResults ?? sum.totalResults;
    if (!p.nextCursor || !p.fetched) break;
    cursor = p.nextCursor;
    await sleep(a.sleepMs);
  }
  return sum;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const results = [];
  let items = 0;
  for (const feedId of a.feeds) {
    const r = a.mode === 'preflight' ? await preflightJournal(a, feedId) : await workerJournal(a, feedId, a.mode !== 'execute');
    items += a.mode === 'preflight' ? r.dois.length : r.candidates;
    results.push(r);
    const { dois, ...shown } = r;
    console.log(JSON.stringify(a.mode === 'preflight' ? { ...shown, dois: dois.length, unique: new Set(dois).size } : shown));
    if (items > a.maxItems) throw new Error(`STOP: ${items} items exceed --max-items ${a.maxItems}`);
    await sleep(a.sleepMs);
  }
  const summary = { mode: a.mode, from: a.from, until: a.until, journals: results.length, items };
  if (a.mode !== 'preflight') for (const k of ['created', 'updated', 'rejected', 'existing', 'wouldCreate']) summary[k] = results.reduce((s, r) => s + r[k], 0);
  console.log(JSON.stringify({ summary }));
  if (a.out) writeFileSync(a.out, JSON.stringify({ summary, results }, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
