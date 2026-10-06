/**
 * Item 64: source-specific cadence. There is NO universal cadence: every source states its own interval, derived from how that source actually updates.
 *
 * EUROSTAT_HEALTH / DEMO_MLEXPEC evidence (legal/capacity gate, primary Eurostat web-services page): datasets are refreshed at most twice a day
 * (11:00 and 23:00 CET) and only the latest version is served; the frozen recorded response carries `updated = 2026-09-25T23:00:00+0200`, i.e. the
 * 23:00 slot. Life expectancy is an annual indicator, so the marker moves rarely. A NO_CHANGE poll costs 17 D1 calls (measured), a full unit 38.
 * Derived cadence: one poll per day, after the 23:00 CET slot has certainly completed, never more than one job per tick.
 */
export interface CadencePolicy {
  sourceId: string;
  /** Minimum time between two successful polls of the same source. */
  minIntervalMs: number;
  /** Earliest UTC time of day a poll may start (after the source's own refresh window). */
  notBeforeUtc: { hour: number; minute: number };
  /** After this long without a success an ACTIVE source is reported stale (WARNING), then ACTION_REQUIRED at twice that. */
  staleAfterMs: number;
  maxJobsPerTick: number;
  evidence: string;
}

const DAY = 24 * 60 * 60 * 1000;

export const SOURCE_CADENCE: Readonly<Record<string, CadencePolicy>> = Object.freeze({
  EUROSTAT_HEALTH: Object.freeze({
    sourceId: 'EUROSTAT_HEALTH',
    minIntervalMs: DAY,
    notBeforeUtc: Object.freeze({ hour: 3, minute: 0 }),
    staleAfterMs: 3 * DAY,
    maxJobsPerTick: 1,
    evidence: 'documented twice-daily refresh (11:00 and 23:00 CET), latest version only; DEMO_MLEXPEC is annual and its `updated` marker moves rarely; the poll uses the marker (no content hash needed)',
  }),
});

export function cadenceFor(sourceId: string): CadencePolicy | null {
  return SOURCE_CADENCE[sourceId] ?? null;
}

/** True when `nowMs` is at or after the source's not-before time of day (UTC). */
export function pastWindowStart(nowMs: number, c: CadencePolicy): boolean {
  const d = new Date(nowMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes() >= c.notBeforeUtc.hour * 60 + c.notBeforeUtc.minute;
}
