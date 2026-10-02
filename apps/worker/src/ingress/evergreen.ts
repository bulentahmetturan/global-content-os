/**
 * EVERGREEN path admission (temporal-v2) on the canonical 0028 model.
 *
 * Authority split:
 *  - Config (enablement, activation, view, tier, daily target, cadence, cooldown, signal strategy, archives) comes only
 *    from the lifecycle-owned registry (temporal/registry.ts). Nothing here writes config.
 *  - This module decides NEW vs REDISCOVERY from canonical item state and spends the soft daily budget.
 *    NEW = one source_items row through upsertSourceItem (acquisition_path EVERGREEN, all ingest gates apply).
 *    REDISCOVERY = one item_path_membership row on the existing item; the item row (published_at, title, DOI, source,
 *    first path) is never updated.
 *  - The executor (adapters/tip-toplulugu-radar/radar/evergreen_runner.py) only runs a plan from evergreenPlan().
 * No cursor table exists in 0028: plans carry an empty cursor, so every run starts at the archive head (bounded).
 */
import { addPathMembership, dedupeKeyFromUrl, upsertSourceItem, type Env, type RouteId } from '../db/queries';
import { canonicalWorkIdFor, DISCOVERY_REASONS, EVERGREEN_VIEW_ROUTE, normalizeSignal, type SignalObservation } from '../db/temporal';
import { hasImpossibleYear } from './ingest-gate';
import { evergreenEntries, LANE_WRITE_TARGET, temporalRegistry, type TemporalEntry } from '../temporal/registry';

export const EVERGREEN_POLICY_VERSION = 'temporal-v2';
const MAX_ITEMS_PER_CALL = 30;
const DAY_MS = 86_400_000;

export interface EvergreenItemInput {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string | null;
  /** The source's own last-modified date: provenance only, never used as published_at. */
  updatedAtSource?: string | null;
  publisher?: string;
  discoveryReason?: string;
  signal?: unknown;
  whySelected?: string;
  /** Discovery/metadata proxy (e.g. 'europepmc' for Cochrane); provenance stays the original publisher's. */
  discoveredVia?: string | null;
  archiveId?: string | null;
  topicCluster?: string | null;
  evidence?: { doi?: string | null; pmid?: string | null; pmcid?: string | null } | null;
}

export type EvergreenOutcome =
  | 'created'
  | 'rediscovered'
  | 'already_evergreen'
  | 'cooldown'
  | 'known_on_other_route'
  | 'budget_exhausted'
  | 'duplicate_in_batch'
  | 'rejected';

export interface EvergreenDecision {
  url: string;
  outcome: EvergreenOutcome;
  discoveryMode?: 'EVERGREEN_NEW' | 'EVERGREEN_REDISCOVERY';
  canonicalWorkId?: string | null;
  itemId?: string;
  reason?: string;
  signal?: SignalObservation;
  whySelected?: string;
}

export interface EvergreenIngestResult {
  sourceId: string;
  dryRun: boolean;
  semanticLane: string;
  evergreenView: string;
  writeBlockers: string[];
  budget: { dailyTarget: number; usedBefore: number; remainingAfter: number; underfilled: boolean; flag: 'DAILY_TARGET_UNDERFILLED' | null };
  created: number;
  rediscovered: number;
  decisions: EvergreenDecision[];
}

const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
const familyKey = (e: TemporalEntry) => e.evergreen.family ?? e.source_id;

/** Route the source's EVERGREEN view lives on, if its semantic lane can write there. */
function writeTarget(e: TemporalEntry): { route: RouteId; channelId: string } | null {
  const lane = e.semantic_lane === 'UNCLASSIFIED' ? undefined : LANE_WRITE_TARGET[e.semantic_lane];
  const view = e.evergreen.evergreen_view;
  if (!lane || view === 'UNCLASSIFIED') return null;
  return EVERGREEN_VIEW_ROUTE[view] === lane.route ? lane : null;
}

async function feedRow(env: Env, feedId: string | undefined) {
  if (!feedId) return null;
  return env.DB.prepare(`SELECT id, route, label, enabled FROM source_feeds WHERE id = ?`)
    .bind(feedId)
    .first<{ id: string; route: RouteId; label: string; enabled: number }>();
}

/** Why this source's EVERGREEN path may not write now (empty = writes allowed). */
export async function writeBlockers(env: Env, e: TemporalEntry): Promise<string[]> {
  const out: string[] = [];
  if (e.evergreen.activation !== 'ACTIVE') out.push(`EVERGREEN_PATH_NOT_ACTIVE:${e.evergreen.activation}`);
  if (e.evergreen.evergreen_view === 'UNCLASSIFIED') out.push('EVERGREEN_VIEW_UNCLASSIFIED');
  const lane = e.semantic_lane === 'UNCLASSIFIED' ? undefined : LANE_WRITE_TARGET[e.semantic_lane];
  if (!lane) out.push(`LANE_WRITE_UNSUPPORTED:${e.semantic_lane}`);
  else if (e.evergreen.evergreen_view !== 'UNCLASSIFIED' && EVERGREEN_VIEW_ROUTE[e.evergreen.evergreen_view] !== lane.route) {
    out.push(`VIEW_ROUTE_MISMATCH:${e.evergreen.evergreen_view}->${EVERGREEN_VIEW_ROUTE[e.evergreen.evergreen_view]}`);
  } else {
    const feed = await feedRow(env, e.feed_id);
    if (!feed || feed.enabled !== 1) out.push('SOURCE_FEED_DISABLED_OR_MISSING');
    else if (feed.route !== lane.route) out.push(`SOURCE_FEED_ROUTE_MISMATCH:${feed.route}`);
  }
  return out;
}

/** Distinct works these sources surfaced on the EVERGREEN path since `since` (new rows + rediscovery memberships). */
async function surfacedSince(env: Env, sourceIds: string[], since: string): Promise<number> {
  if (!sourceIds.length) return 0;
  const marks = sourceIds.map(() => '?').join(',');
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT COALESCE(canonical_work_id, id) AS w FROM source_items
        WHERE acquisition_path = 'EVERGREEN' AND source_id IN (${marks}) AND fetched_at >= ?
       UNION
       SELECT COALESCE(i.canonical_work_id, i.id) FROM item_path_membership m JOIN source_items i ON i.id = m.source_item_id
        WHERE m.temporal_path = 'EVERGREEN' AND m.source_id IN (${marks}) AND m.first_at >= ?)`
  )
    .bind(...sourceIds, since, ...sourceIds, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Dedupe keys / work ids this source surfaced inside its cooldown: the executor skips them before fetching. */
async function seenKeys(env: Env, e: TemporalEntry, since: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT dedupe_key AS k, canonical_work_id AS w FROM source_items
      WHERE acquisition_path = 'EVERGREEN' AND source_id = ? AND fetched_at >= ?
     UNION ALL
     SELECT i.dedupe_key, i.canonical_work_id FROM item_path_membership m JOIN source_items i ON i.id = m.source_item_id
      WHERE m.temporal_path = 'EVERGREEN' AND m.source_id = ? AND m.first_at >= ?
     LIMIT 2000`
  )
    .bind(e.source_id, since, e.source_id, since)
    .all<{ k: string; w: string | null }>();
  const out = new Set<string>();
  for (const r of results ?? []) {
    out.add(r.k);
    if (r.w) out.add(r.w);
  }
  return [...out];
}

/** Executor plan: everything it may do, derived from canonical config and item state. Read-only. */
export async function evergreenPlan(env: Env, now: Date = new Date(), opts: { sourceId?: string; entries?: TemporalEntry[] } = {}) {
  const all = evergreenEntries(opts.entries ?? temporalRegistry().entries);
  const chosen = opts.sourceId ? all.filter((e) => e.source_id === opts.sourceId) : all;
  const today = dayStart(now);
  const famUsed = new Map<string, number>();
  const handed = new Set<string>();
  const sources = [];
  for (const e of chosen) {
    const eg = e.evergreen;
    const fam = familyKey(e);
    if (!famUsed.has(fam)) famUsed.set(fam, await surfacedSince(env, all.filter((x) => familyKey(x) === fam).map((x) => x.source_id), today));
    const blockers = await writeBlockers(env, e);
    // Pool members share one budget: only the first member of a family is handed what is left today.
    const budget = handed.has(fam) ? 0 : Math.max(0, eg.daily_target - (famUsed.get(fam) ?? 0));
    handed.add(fam);
    sources.push({
      source_id: e.source_id,
      feed_id: e.feed_id ?? null,
      semantic_lane: e.semantic_lane,
      evergreen_view: eg.evergreen_view,
      activation: eg.activation,
      write_allowed: blockers.length === 0,
      write_blockers: blockers,
      tier: eg.tier,
      family: eg.family,
      daily_target: eg.daily_target,
      budget_remaining_today: budget,
      evaluation_cap: eg.max_items_evaluated_per_cycle,
      rediscovery_cadence_hours: eg.rediscovery_cadence_hours,
      deep_archive_cadence_hours: eg.deep_archive_cadence_hours,
      cooldown_days: eg.cooldown_days,
      importance_signal_strategy: eg.importance_signal_strategy,
      signal_providers: eg.signal_providers,
      archives: eg.archives,
      cursor: {},
      seen_keys: await seenKeys(env, e, new Date(now.getTime() - eg.cooldown_days * DAY_MS).toISOString()),
      recent_clusters: {},
    });
  }
  return { ok: true, generatedAt: now.toISOString(), policyVersion: EVERGREEN_POLICY_VERSION, sources };
}

interface KnownWork {
  id: string;
  route: string;
  acquisition_path: string | null;
  fetched_at: string | null;
  ev_first_at: string | null;
}

/** The canonical item behind a URL / DOI on any Global Hub route, with its EVERGREEN membership date if any. */
async function findKnownWork(env: Env, url: string, workId: string | null): Promise<KnownWork | null> {
  const key = dedupeKeyFromUrl(url);
  return env.DB.prepare(
    `SELECT i.id, i.route, i.acquisition_path, i.fetched_at,
            (SELECT m.first_at FROM item_path_membership m WHERE m.source_item_id = i.id AND m.temporal_path = 'EVERGREEN') AS ev_first_at
       FROM source_items i
      WHERE i.route IN ('kaduse-news', 'kaduse-research', 'tip-ogrencileri')
        AND (i.dedupe_key = ?${workId ? ' OR i.canonical_work_id = ?' : ''})
      ORDER BY i.fetched_at ASC LIMIT 1`
  )
    .bind(key, ...(workId ? [workId] : []))
    .first<KnownWork>();
}

function whyText(e: TemporalEntry, it: EvergreenItemInput, signal: SignalObservation, reason: string, mode: string): string {
  const given = (it.whySelected || '').trim();
  if (given) return given.slice(0, 400);
  const sig = signal.value === null ? 'no direct popularity metric' : `${signal.type}=${signal.value} via ${signal.source} (${signal.normalization})`;
  return `${e.evergreen.tier} ${mode}; ${reason}; ${signal.tier}: ${sig}; strategy ${e.evergreen.importance_signal_strategy}`.slice(0, 400);
}

/**
 * Admit executor candidates for one source. dryRun computes every verdict and writes nothing. `localCanaryWrite`
 * (code-only, no HTTP route) lets a local in-memory canary write past CANARY_ONLY; every other blocker still applies.
 */
export async function ingestEvergreenItems(
  env: Env,
  sourceId: string,
  body: { items?: EvergreenItemInput[]; dryRun?: boolean },
  now: Date = new Date(),
  opts: { entries?: TemporalEntry[]; localCanaryWrite?: boolean } = {}
): Promise<EvergreenIngestResult> {
  const entries = opts.entries ?? temporalRegistry().entries;
  const all = evergreenEntries(entries);
  const e = all.find((x) => x.source_id === sourceId);
  if (!e) throw new Error(`source_not_evergreen:${sourceId}`);
  const dryRun = body.dryRun === true;
  const blockers = await writeBlockers(env, e);
  const hardBlockers = opts.localCanaryWrite ? blockers.filter((b) => !b.startsWith('EVERGREEN_PATH_NOT_ACTIVE')) : blockers;
  if (!dryRun && hardBlockers.length) throw new Error(`write_blocked:${hardBlockers.join(',')}`);
  const target = writeTarget(e);
  const feed = await feedRow(env, e.feed_id);
  const view = e.evergreen.evergreen_view;

  const fam = familyKey(e);
  const usedBefore = await surfacedSince(env, all.filter((x) => familyKey(x) === fam).map((x) => x.source_id), dayStart(now));
  let remaining = Math.max(0, e.evergreen.daily_target - usedBefore);
  const cooldownMs = e.evergreen.cooldown_days * DAY_MS;
  const out: EvergreenIngestResult = {
    sourceId,
    dryRun,
    semanticLane: e.semantic_lane,
    evergreenView: view,
    writeBlockers: blockers,
    budget: { dailyTarget: e.evergreen.daily_target, usedBefore, remainingAfter: remaining, underfilled: false, flag: null },
    created: 0,
    rediscovered: 0,
    decisions: [],
  };
  const batch = new Set<string>();

  for (const it of (body.items ?? []).slice(0, MAX_ITEMS_PER_CALL)) {
    const title = (it.title || '').trim();
    const url = (it.url || '').trim();
    if (!title || !/^https:\/\//i.test(url)) {
      out.decisions.push({ url, outcome: 'rejected', reason: 'invalid_item' });
      continue;
    }
    if (it.publishedAt && hasImpossibleYear(it.publishedAt)) {
      out.decisions.push({ url, outcome: 'rejected', reason: 'invalid_date' });
      continue;
    }
    const workId = canonicalWorkIdFor(url, it.evidence?.doi ?? null);
    const batchKey = workId ?? dedupeKeyFromUrl(url);
    if (batch.has(batchKey)) {
      out.decisions.push({ url, outcome: 'duplicate_in_batch', canonicalWorkId: workId });
      continue;
    }
    batch.add(batchKey);
    const signal = normalizeSignal(it.signal, now);
    const reason = (DISCOVERY_REASONS as readonly string[]).includes(String(it.discoveryReason)) ? String(it.discoveryReason) : 'evergreen_relevance';
    const known = await findKnownWork(env, url, workId);

    if (known) {
      // A view lists one route; a membership on another route's item would be invisible, so it is reported, not written.
      if (!target || known.route !== target.route) {
        out.decisions.push({ url, outcome: 'known_on_other_route', canonicalWorkId: workId, itemId: known.id, reason: known.route });
        continue;
      }
      const inEvergreen = known.acquisition_path === 'EVERGREEN' || !!known.ev_first_at;
      const lastSurfaced = Date.parse((known.ev_first_at ?? known.fetched_at) || '');
      if (inEvergreen) {
        const recent = Number.isFinite(lastSurfaced) && now.getTime() - lastSurfaced < cooldownMs;
        out.decisions.push({ url, outcome: recent ? 'cooldown' : 'already_evergreen', canonicalWorkId: workId, itemId: known.id });
        continue;
      }
      if (remaining <= 0) {
        out.decisions.push({ url, outcome: 'budget_exhausted', canonicalWorkId: workId, itemId: known.id });
        continue;
      }
      const why = whyText(e, it, signal, reason, 'EVERGREEN_REDISCOVERY');
      if (!dryRun) {
        const m = await addPathMembership(env.DB, known.id, {
          path: 'EVERGREEN',
          evergreenView: view === 'UNCLASSIFIED' ? null : view,
          discoveryMode: 'EVERGREEN_REDISCOVERY',
          discoveryReason: reason,
          sourceId: e.source_id,
          importanceSignal: it.signal ?? null,
        });
        if (m.status !== 'added') {
          out.decisions.push({ url, outcome: 'already_evergreen', canonicalWorkId: workId, itemId: known.id, reason: m.status });
          continue;
        }
      }
      remaining -= 1;
      out.rediscovered += 1;
      out.decisions.push({ url, outcome: 'rediscovered', discoveryMode: 'EVERGREEN_REDISCOVERY', canonicalWorkId: workId, itemId: known.id, signal, whySelected: why });
      continue;
    }

    if (remaining <= 0) {
      out.decisions.push({ url, outcome: 'budget_exhausted', canonicalWorkId: workId });
      continue;
    }
    const why = whyText(e, it, signal, reason, 'EVERGREEN_NEW');
    if (dryRun || !target || !feed) {
      remaining -= 1;
      out.created += 1;
      out.decisions.push({ url, outcome: 'created', discoveryMode: 'EVERGREEN_NEW', canonicalWorkId: workId, signal, whySelected: why });
      continue;
    }
    const summary = (it.summary || title).trim().slice(0, 500);
    const r = await upsertSourceItem(env.DB, {
      feedId: feed.id,
      route: target.route,
      channelId: target.channelId,
      title,
      titleOrig: title,
      summary,
      gists: [summary],
      canonicalUrl: url,
      publisher: it.publisher || feed.label,
      publishedAt: it.publishedAt ?? null,
      sourceId: e.source_id,
      enrichmentStatus: 'pending',
      intakeMetaJson: JSON.stringify({
        evergreen: {
          surfaced_by: e.source_id,
          archive_id: it.archiveId ?? null,
          why_selected: why,
          discovered_via: it.discoveredVia ?? null,
          updated_at_source: it.updatedAtSource ?? null,
          topic_cluster: it.topicCluster ?? null,
          policy_version: EVERGREEN_POLICY_VERSION,
        },
        ...(it.publishedAt ? { published_at_source: String(it.publishedAt).slice(0, 80) } : {}),
      }),
      acquisitionPath: 'EVERGREEN',
      evergreenView: view === 'UNCLASSIFIED' ? null : view,
      discoveryMode: 'EVERGREEN_NEW',
      discoveryReason: reason,
      canonicalWorkId: workId,
      importanceSignal: it.signal ?? null,
      evidence: it.evidence ? { doi: workId, pmid: it.evidence.pmid ?? null, pmcid: it.evidence.pmcid ?? null } : null,
    });
    if (r.rejected) {
      out.decisions.push({ url, outcome: 'rejected', reason: r.rejected, canonicalWorkId: workId });
      continue;
    }
    remaining -= 1;
    out.created += 1;
    out.decisions.push({ url, outcome: 'created', discoveryMode: 'EVERGREEN_NEW', canonicalWorkId: workId, itemId: r.id, signal, whySelected: why });
  }

  out.budget.remainingAfter = remaining;
  out.budget.underfilled = remaining > 0;
  out.budget.flag = remaining > 0 ? 'DAILY_TARGET_UNDERFILLED' : null;
  return out;
}
