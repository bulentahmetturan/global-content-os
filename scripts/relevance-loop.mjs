#!/usr/bin/env node
// P5 practical loop over real editorial decisions. Feedback is evidence; only an owner-applied ledger row
// changes future ordering, and only through the generated Worker bundle (commit + deploy).
//   export   [--remote | --file rows.json]                   accept + reject events with channel/source/family
//   patterns [--remote | --file rows.json]                   aggregated patterns, noise-bucketed, proposals
//   apply    --pattern <id> --reviewer human:<name> [--why] [--remote|--file] [--apply]
//   reverse  --adjustment <id> --reviewer human:<name> [--apply]
//   measure  --adjustment <id> [--remote|--file]            before/after on the adjusted channel
//   bundle   [--check]                                       regenerate / drift-check the Worker bundle
// Remote reads are SELECT-only (`wrangler d1 execute --remote`). Nothing here writes D1.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorialFeedbackInput } from './editorial-feedback.mjs';
import { createRelevanceLedger } from './relevance-ledger.mjs';
import { activeAdjustments } from './relevance-selection.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const LEDGER = join(root, 'config/relevance-ledger.json');
export const BUNDLE = join(root, 'apps/worker/src/triage/relevance-adjustments.generated.ts');
export const FLOOR = { minEvents: 5, minSide: 3, ratio: 0.8, measureSide: 10, meaningful: 0.1 };
const OWNER = { kind: 'canonical_owner', id: 'global-content-os' };

// Latest promote/delete/undo per item; an undone decision is not evidence.
export const EXPORT_SQL = `SELECT d.source_item_id AS item_id,
  CASE d.action WHEN 'promote' THEN 'accepted' ELSE 'rejected' END AS decision,
  (SELECT f.reason_code FROM review_feedback f WHERE f.item_id = d.source_item_id ORDER BY f.created_at DESC LIMIT 1) AS reason_code,
  i.channel_id, COALESCE(i.source_id, i.feed_id) AS source_id, i.content_family, d.decided_at AS at
FROM (SELECT source_item_id, action, decided_at, ROW_NUMBER() OVER (PARTITION BY source_item_id ORDER BY decided_at DESC) AS rn
      FROM editorial_decisions WHERE action IN ('promote', 'delete', 'undo')) d
JOIN source_items i ON i.id = d.source_item_id
WHERE d.rn = 1 AND d.action != 'undo' ORDER BY d.decided_at`;

export function readRemote() {
  const cmd = `npx wrangler d1 execute global-content-os --remote --json --command "${EXPORT_SQL.replace(/\s+/g, ' ')}"`;
  const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

export const toEvents = (rows) => rows.map((r) =>
  editorialFeedbackInput(
    { id: r.item_id, channel_id: r.channel_id, source_id: r.source_id, content_family: r.content_family ?? undefined },
    { action: r.decision === 'accepted' ? 'promote' : 'delete', reason_code: r.reason_code ?? undefined, at: r.at },
  ));

const pid = (parts) => `pat_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12)}`;

export function patterns(events) {
  const groups = new Map();
  const families = new Map();
  for (const e of events) {
    if (e.channel_scope.kind !== 'channel') continue;
    const d = e.evidence.data;
    const ch = e.channel_scope.channel_id;
    for (const [dimension, key] of [['source', d.source_id], ['content_family', d.content_family]]) {
      if (!key) continue;
      const id = `${ch}|${dimension}|${key}`;
      const g = groups.get(id) || { channel_id: ch, dimension, key, accepted: 0, rejected: 0, reasons: {} };
      g[d.decision]++;
      if (d.reason_code) g.reasons[d.reason_code] = (g.reasons[d.reason_code] || 0) + 1;
      groups.set(id, g);
      if (dimension === 'content_family') families.set(ch, new Set([...(families.get(ch) || []), key]));
    }
  }
  return [...groups.values()].map((g) => {
    const count = g.accepted + g.rejected;
    const pattern_id = pid([g.channel_id, g.dimension, g.key]);
    let action = null;
    if (g.rejected >= FLOOR.minSide && count >= FLOOR.minEvents && g.rejected / count >= FLOOR.ratio) action = g.dimension === 'source' ? 'LOWER_SOURCE_PRIORITY' : 'LOWER_CONTENT_FAMILY_PRIORITY';
    else if (g.dimension === 'content_family' && (families.get(g.channel_id)?.size ?? 0) > 1 && g.accepted >= FLOOR.minSide && count >= FLOOR.minEvents && g.accepted / count >= FLOOR.ratio) action = 'RAISE_CONTENT_FAMILY_PRIORITY';
    const bucket = action ? 'PROPOSAL' : count < FLOOR.minEvents ? 'BELOW_NOISE_FLOOR' : 'NO_CLEAR_SIGNAL';
    return { pattern_id, ...g, count, bucket, ...(action ? { proposal: { status: 'PROPOSAL', action, channel_id: g.channel_id, scope: { dimension: g.dimension, key: g.key }, pattern_id } } : {}) };
  }).sort((a, b) => b.count - a.count || a.pattern_id.localeCompare(b.pattern_id));
}

const readLedger = (path = LEDGER) => JSON.parse(readFileSync(path, 'utf8'));
const parseActor = (s) => { const [kind, ...id] = String(s || '').split(':'); return { kind, id: id.join(':') }; };
const ledgerFor = (rows) => createRelevanceLedger({ rows, authorize: (owner) => owner?.kind === 'canonical_owner' && owner.id === OWNER.id });

export function applyPattern({ pats, patternId, reviewer, why, rows, now }) {
  const p = pats.find((x) => x.pattern_id === patternId);
  if (!p) return { ok: false, code: 'PATTERN_NOT_FOUND' };
  if (!p.proposal) return { ok: false, code: 'NOT_A_PROPOSAL', bucket: p.bucket };
  const r = parseActor(reviewer);
  if (!['human', 'review_gate'].includes(r.kind) || !r.id) return { ok: false, code: 'NOT_REVIEWED' };
  const ledger = ledgerFor(rows);
  const res = ledger.apply({
    owner: OWNER, why, pattern: { count: p.count, pattern_id: p.pattern_id }, proposal: p.proposal,
    feedback: { feedback_id: p.pattern_id, review_state: 'ACCEPTED', reviewed_by: r, proposed_adjustment: { action: p.proposal.action }, channel_scope: { kind: 'channel', channel_id: p.channel_id } },
  });
  if (!res.ok) return res;
  const all = ledger.rows();
  all[all.length - 1].applied_at = now;
  return { ok: true, adjustment: all[all.length - 1], rows: all };
}

export function reverseAdjustment({ adjustmentId, reviewer, why, rows, now }) {
  const r = parseActor(reviewer);
  if (!['human', 'review_gate'].includes(r.kind) || !r.id) return { ok: false, code: 'NOT_REVIEWED' };
  const ledger = ledgerFor(rows);
  const res = ledger.reverse({ owner: OWNER, adjustment_id: adjustmentId, why: why ?? `reversed by ${reviewer}` });
  if (!res.ok) return res;
  const all = ledger.rows();
  all[all.length - 1].applied_at = now;
  return { ok: true, reversal: all[all.length - 1], rows: all };
}

export function renderBundle(rows) {
  const active = activeAdjustments(rows).map(({ adjustment_id, channel_id, dimension, key, direction, delta }) => ({ adjustment_id, channel_id, dimension, key, direction, delta }));
  return `// Generated by \`node scripts/relevance-loop.mjs bundle\` from config/relevance-ledger.json. Do not edit by hand.
export type RelevanceAdjustment = { adjustment_id: string; channel_id: string; dimension: 'source' | 'content_family' | 'topic'; key: string; direction: 'lower' | 'raise'; delta: number };
export const RELEVANCE_ADJUSTMENTS: readonly RelevanceAdjustment[] = ${JSON.stringify(active, null, 2)};
`;
}

export function measure(rows, adjustment) {
  const at = adjustment.applied_at;
  const inChannel = rows.filter((r) => r.channel_id === adjustment.channel_id);
  const side = (xs) => ({ decisions: xs.length, accepted: xs.filter((r) => r.decision === 'accepted').length, accept_ratio: xs.length ? xs.filter((r) => r.decision === 'accepted').length / xs.length : null });
  const before = side(inChannel.filter((r) => r.at < at));
  const after = side(inChannel.filter((r) => r.at >= at));
  let outcome;
  if (before.decisions < FLOOR.measureSide || after.decisions < FLOOR.measureSide) outcome = 'INSUFFICIENT_EVIDENCE';
  else {
    const d = after.accept_ratio - before.accept_ratio;
    outcome = d >= FLOOR.meaningful ? 'IMPROVED' : d <= -FLOOR.meaningful ? 'REGRESSED' : 'NO_MEANINGFUL_CHANGE';
  }
  return { adjustment_id: adjustment.adjustment_id, channel_id: adjustment.channel_id, applied_at: at, before, after, floor: FLOOR.measureSide, outcome };
}

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--remote', '--apply', '--check'].includes(a)) o[a.slice(2)] = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

export function run(argv, { ledgerPath = LEDGER, bundlePath = BUNDLE, read = readRemote, now = new Date().toISOString() } = {}) {
  const o = parse(argv);
  const decisions = () => (o.file ? JSON.parse(readFileSync(o.file, 'utf8')) : read());
  const persist = (rows) => {
    writeFileSync(ledgerPath, `${JSON.stringify({ ...readLedger(ledgerPath), rows }, null, 2)}\n`);
    writeFileSync(bundlePath, renderBundle(rows));
  };
  switch (o._[0]) {
    case 'export': { const rows = decisions(); return { ok: true, decisions: rows.length, events: toEvents(rows) }; }
    case 'patterns': {
      const rows = decisions();
      const pats = patterns(toEvents(rows));
      const by = (b) => pats.filter((p) => p.bucket === b).length;
      return { ok: true, decisions: rows.length, accepted: rows.filter((r) => r.decision === 'accepted').length, rejected: rows.filter((r) => r.decision === 'rejected').length,
        buckets: { PROPOSAL: by('PROPOSAL'), NO_CLEAR_SIGNAL: by('NO_CLEAR_SIGNAL'), BELOW_NOISE_FLOOR: by('BELOW_NOISE_FLOOR') }, floor: FLOOR, patterns: pats };
    }
    case 'apply': {
      const res = applyPattern({ pats: patterns(toEvents(decisions())), patternId: o.pattern, reviewer: o.reviewer, why: o.why, rows: readLedger(ledgerPath).rows, now });
      if (res.ok && o.apply) persist(res.rows);
      return res.ok ? { ok: true, applied: Boolean(o.apply), adjustment: res.adjustment } : res;
    }
    case 'reverse': {
      const res = reverseAdjustment({ adjustmentId: o.adjustment, reviewer: o.reviewer, why: o.why, rows: readLedger(ledgerPath).rows, now });
      if (res.ok && o.apply) persist(res.rows);
      return res.ok ? { ok: true, applied: Boolean(o.apply), reversal: res.reversal } : res;
    }
    case 'measure': {
      const adj = readLedger(ledgerPath).rows.find((r) => r.adjustment_id === o.adjustment && r.kind === 'apply');
      return adj ? { ok: true, ...measure(decisions(), adj) } : { ok: false, code: 'NOT_FOUND' };
    }
    case 'bundle': {
      const want = renderBundle(readLedger(ledgerPath).rows);
      let have = '';
      try { have = readFileSync(bundlePath, 'utf8'); } catch {}
      if (o.check) return { ok: have.replace(/\r\n/g, '\n') === want, bundle: have.replace(/\r\n/g, '\n') === want ? 'IN_SYNC' : 'DRIFT' };
      writeFileSync(bundlePath, want);
      return { ok: true, bundle: 'WRITTEN' };
    }
    default: return { ok: false, code: 'USAGE', usage: 'export|patterns|apply|reverse|measure|bundle' };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = run(process.argv.slice(2));
  console.log(JSON.stringify(r, null, 1));
  process.exitCode = r.ok ? 0 : 1;
}
