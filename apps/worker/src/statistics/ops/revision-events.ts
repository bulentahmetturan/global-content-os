/**
 * Items 71 + 72 + 73: revision classification, the one-way release-event outbox plan, and bulletin dedupe. Statistics stays SEPARATE from TIME_SENSITIVE
 * and EVERGREEN: this module only classifies and writes the storage-level outbox (statistics_release_events). It creates no content, calls no network,
 * publishes nothing and never marks an event ELIGIBLE or EMITTED (the owner decides materiality; the frozen trigger refuses emit unless ELIGIBLE +
 * ACTIVE source + PRODUCTION release).
 */
import { canonicalUrlKey } from '../identity';
import type { ReleaseEventInput, ReleaseEventType } from '../repositories/outbox';
import type { StatisticsRepositories } from '../index';
import type { StatisticsStorage } from '../storage';
import type { AlertClass } from './health';

// ------------------------------------------------------------------ 71 revision alerting

export type RevisionAlertKind = 'NEW_RELEASE' | 'CONFIRMATION' | 'REVISION' | 'LATE_BACKFILL' | 'FLAG_CHANGE' | 'MISSING' | 'SCHEMA_DRIFT';

export interface RevisionAlert {
  kind: RevisionAlertKind;
  severity: AlertClass;
  count: number;
  samples: Array<{ seriesId: string; periodKey: string; detail: string }>;
}

export const MAX_SAMPLES = 5;
export const MAX_EXAMINED = 200;

/** Cheap, DB-free classification of a finished unit (counts only). */
export function alertsFromRunCounts(c: { inserted: number; revised: number; backfilled: number; confirmed: number; unchanged: number; readerFailureClass?: string | null }): RevisionAlert[] {
  const out: RevisionAlert[] = [];
  if (c.readerFailureClass === 'SCHEMA_DRIFT') out.push({ kind: 'SCHEMA_DRIFT', severity: 'HARD_STOP', count: 1, samples: [] });
  if (c.inserted > 0 && c.revised === 0 && c.backfilled === 0) out.push({ kind: 'NEW_RELEASE', severity: 'INFO', count: c.inserted, samples: [] });
  if (c.revised > 0) out.push({ kind: 'REVISION', severity: 'WARNING', count: c.revised, samples: [] });
  if (c.backfilled > 0) out.push({ kind: 'LATE_BACKFILL', severity: 'WARNING', count: c.backfilled, samples: [] });
  if (c.confirmed > 0) out.push({ kind: 'CONFIRMATION', severity: 'INFO', count: c.confirmed, samples: [] });
  return out;
}

interface VersionDelta {
  series_id: string;
  period_key: string;
  revision_class: string;
  value_state: string;
  numeric_value: number | null;
  status_flag_native: string | null;
  prev_value_state: string | null;
  prev_numeric_value: number | null;
  prev_flag: string | null;
}

/**
 * Detail for one release: reads at most MAX_EXAMINED versions of that release (idx_stat_obsver_release) and joins each to the version it superseded by
 * primary key. Aggregated per kind with at most MAX_SAMPLES samples each; `capped` says the release had more versions than were examined.
 */
export async function revisionAlertsForRelease(storage: StatisticsStorage, releaseId: string): Promise<{ alerts: RevisionAlert[]; examined: number; capped: boolean }> {
  const rows = await storage.all<VersionDelta>(
    `SELECT v.series_id, v.period_key, v.revision_class, v.value_state, v.numeric_value, v.status_flag_native,
            p.value_state AS prev_value_state, p.numeric_value AS prev_numeric_value, p.status_flag_native AS prev_flag
       FROM statistics_observation_versions v
       LEFT JOIN statistics_observation_versions p ON p.series_id = v.series_id AND p.period_key = v.period_key AND p.release_id = v.previous_release_id
      WHERE v.release_id = ?1 ORDER BY v.series_id, v.period_key LIMIT ?2`,
    releaseId, MAX_EXAMINED + 1,
  );
  const capped = rows.length > MAX_EXAMINED;
  const examined = rows.slice(0, MAX_EXAMINED);
  const by = new Map<RevisionAlertKind, RevisionAlert>();
  const add = (kind: RevisionAlertKind, severity: AlertClass, r: VersionDelta, detail: string) => {
    const a = by.get(kind) ?? { kind, severity, count: 0, samples: [] };
    a.count++;
    if (a.samples.length < MAX_SAMPLES) a.samples.push({ seriesId: r.series_id, periodKey: r.period_key, detail });
    by.set(kind, a);
  };
  for (const r of examined) {
    if (r.revision_class === 'NEW_RELEASE') { add('NEW_RELEASE', 'INFO', r, 'first version of the cell'); continue; }
    if (r.revision_class === 'BACKFILL') { add('LATE_BACKFILL', 'WARNING', r, 'older release arrived late; never current'); continue; }
    if (r.prev_value_state === 'PRESENT' && r.value_state !== 'PRESENT') { add('MISSING', 'ACTION_REQUIRED', r, `${r.prev_value_state} -> ${r.value_state}`); continue; }
    if (r.prev_value_state === 'PRESENT' && r.value_state === 'PRESENT' && r.prev_numeric_value === r.numeric_value && r.prev_flag !== r.status_flag_native) { add('FLAG_CHANGE', 'INFO', r, `flag ${r.prev_flag ?? '-'} -> ${r.status_flag_native ?? '-'}`); continue; }
    const severity: AlertClass = r.revision_class === 'SOURCE_REVISION' ? 'WARNING' : 'ACTION_REQUIRED';
    add('REVISION', severity, r, `${r.revision_class}: ${r.prev_numeric_value ?? r.prev_value_state} -> ${r.numeric_value ?? r.value_state}`);
  }
  return { alerts: [...by.values()], examined: examined.length, capped };
}

// ------------------------------------------------------------------ 72/73 release-event outbox plan and bulletin dedupe

/** Source-owned canonical bulletin URL per dataset. Mirrors and aliases normalise to it, so a mirror is never an independent event. */
export const CANONICAL_BULLETIN_URL: Readonly<Record<string, string>> = Object.freeze({
  'EUROSTAT_HEALTH:DEMO_MLEXPEC': 'https://ec.europa.eu/eurostat/databrowser/view/demo_mlexpec/default/table',
});

/** Known mirror/alias hosts and their canonical host (extend only with owner-reviewed evidence). */
export const MIRROR_HOSTS: Readonly<Record<string, string>> = Object.freeze({
  'appsso.eurostat.ec.europa.eu': 'ec.europa.eu',
  'europa.eu': 'ec.europa.eu',
});

/** Canonical bulletin identity: the dataset's canonical URL when known, else the normalised URL with mirror hosts folded. */
export function bulletinIdentity(datasetId: string, officialUrl: string): { canonicalUrl: string; urlKey: string; viaMirror: boolean } {
  const known = CANONICAL_BULLETIN_URL[datasetId];
  const u = new URL(officialUrl);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const viaMirror = host in MIRROR_HOSTS;
  if (known && (viaMirror || canonicalUrlKey(officialUrl) === canonicalUrlKey(known))) return { canonicalUrl: known, urlKey: canonicalUrlKey(known), viaMirror };
  const folded = viaMirror ? `https://${MIRROR_HOSTS[host]}${u.pathname}${u.search}` : officialUrl;
  return { canonicalUrl: folded, urlKey: canonicalUrlKey(folded), viaMirror };
}

export interface ReleaseFacts {
  releaseId: string;
  releaseClass: 'PRODUCTION' | 'CANARY';
  datasetId: string;
  sourceId: string;
  upstreamMarker: string;
}

/** One bounded editorial event per production release; never for a CANARY release; never carries article text (<= 5 headline facts). */
export function planReleaseEvent(rel: ReleaseFacts, alerts: readonly RevisionAlert[], officialUrl?: string): ReleaseEventInput | null {
  if (rel.releaseClass !== 'PRODUCTION') return null;
  const material = alerts.find((a) => a.kind === 'REVISION' && a.severity !== 'INFO');
  const type: ReleaseEventType = material ? 'MATERIAL_REVISION' : 'NEW_RELEASE';
  if (!material && alerts.some((a) => a.kind === 'LATE_BACKFILL') && !alerts.some((a) => a.kind === 'NEW_RELEASE')) return null; // a late backfill alone is history, not news
  const url = bulletinIdentity(rel.datasetId, officialUrl ?? CANONICAL_BULLETIN_URL[rel.datasetId] ?? 'https://ec.europa.eu/eurostat').canonicalUrl;
  const facts = alerts.slice(0, 5).map((a) => ({ kind: a.kind, count: a.count }));
  return { eventType: type, sourceId: rel.sourceId, datasetId: rel.datasetId, releaseId: rel.releaseId, officialUrl: url, payload: { facts, upstreamMarker: rel.upstreamMarker } };
}

/** Writes the PENDING event through the storage-level outbox only (dedupe by event type + canonical URL key + release). Returns collisions, never merges. */
export async function recordPlannedEvent(repos: StatisticsRepositories, plan: ReleaseEventInput | null) {
  if (!plan) return null;
  return repos.outbox.create(plan);
}
