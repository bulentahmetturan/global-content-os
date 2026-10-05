/**
 * Storage-level one-way outbox toward TIME_SENSITIVE (ADR-STAT-010). It only writes statistics_release_events.
 * Nothing here imports content/triage code, creates content rows, publishes, or calls the network. `markEmitted` is an explicit call that the
 * frozen trigger STAT_EVENT_EMIT_NOT_GOVERNED refuses unless the event is ELIGIBLE, the source policy is ACTIVE and the release is PRODUCTION.
 */
import { StatisticsError } from '../errors';
import { canonicalUrlKey, releaseEventDedupeKey, releaseEventIdFromDedupe } from '../identity';
import { assertNoSecretFields, assertSafeUrl } from '../rules';
import type { StatisticsStorage } from '../storage';

export type ReleaseEventType = 'NEW_RELEASE' | 'MATERIAL_REVISION' | 'NEW_EDITION' | 'IMPORTANT_SERIES_CHANGE';
export type EligibilityState = 'PENDING' | 'ELIGIBLE' | 'SUPPRESSED' | 'EMITTED' | 'REJECTED';
export type RepublicationGate = 'PASS' | 'NOT_PASS' | 'UNKNOWN';

export interface ReleaseEventInput {
  eventType: ReleaseEventType;
  sourceId: string;
  datasetId: string;
  releaseId: string;
  /** Official bulletin/release URL (https). Used for dedupe against the existing news sub-feed. */
  officialUrl: string;
  /** Bounded facts only (≤5 headline facts). Never article text. */
  payload: { facts?: Array<Record<string, string | number | null>>; [k: string]: unknown };
}

export interface ReleaseEventRow {
  event_id: string;
  dedupe_key: string;
  source_id: string;
  dataset_id: string;
  release_id: string;
  event_type: ReleaseEventType;
  official_url: string;
  canonical_url_key: string;
  republication_gate: RepublicationGate;
  eligibility_state: EligibilityState;
  eligibility_reason: string | null;
  payload_summary: string;
  created_at: string;
  emitted_at: string | null;
  emitted_ref: string | null;
}

export function outboxRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<ReleaseEventRow>('SELECT * FROM statistics_release_events WHERE event_id = ?1', id);

  return {
    get,

    /**
     * Deduplicated creation. Identity = sha256(event_type | canonical_url_key | release_id): the same bulletin URL for the same release can never
     * produce two events (concurrent creators converge). `urlCollisions` lists OTHER events that share the canonical URL key (e.g. a TÜİK bulletin
     * URL reused by a different release, or the same URL seen under another event type) so downstream dedupe against the news sub-feed can act;
     * they are reported, never silently merged or dropped.
     */
    async create(input: ReleaseEventInput): Promise<{ event: ReleaseEventRow; created: boolean; urlCollisions: Array<{ event_id: string; release_id: string; event_type: string }> }> {
      assertSafeUrl('officialUrl', input.officialUrl);
      if (!input.officialUrl.startsWith('https://')) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'officialUrl must be https');
      assertNoSecretFields('releaseEvent', input);
      const facts = input.payload.facts;
      if (facts && facts.length > 5) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'an event carries at most 5 headline facts');
      const payload = JSON.stringify(input.payload);
      if (payload.length > 2000) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'event payload exceeds 2000 chars; events never carry article text');
      const urlKey = canonicalUrlKey(input.officialUrl);
      const dedupe = await releaseEventDedupeKey(input.eventType, urlKey, input.releaseId);
      const id = releaseEventIdFromDedupe(dedupe);
      const inserted = await s.all<{ event_id: string }>(
        `INSERT INTO statistics_release_events (event_id, dedupe_key, source_id, dataset_id, release_id, event_type, official_url, canonical_url_key, payload_summary, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(dedupe_key) DO NOTHING RETURNING event_id`,
        id, dedupe, input.sourceId, input.datasetId, input.releaseId, input.eventType, input.officialUrl, urlKey, payload, s.now(),
      );
      const event = (await get(id))!;
      const urlCollisions = await s.all<{ event_id: string; release_id: string; event_type: string }>(
        'SELECT event_id, release_id, event_type FROM statistics_release_events WHERE canonical_url_key = ?1 AND event_id <> ?2 ORDER BY created_at, event_id LIMIT 10',
        urlKey, id,
      );
      return { event, created: inserted.length === 1, urlCollisions };
    },

    /** Bounded batch of events in a state, oldest first (idx_stat_events_state). */
    readBatch: (state: EligibilityState, limit: number) =>
      s.all<ReleaseEventRow>('SELECT * FROM statistics_release_events WHERE eligibility_state = ?1 ORDER BY created_at, event_id LIMIT ?2', state, s.requireLimit(limit)),

    byUrlKey: (canonicalKey: string, limit: number) => s.all<ReleaseEventRow>('SELECT * FROM statistics_release_events WHERE canonical_url_key = ?1 ORDER BY created_at, event_id LIMIT ?2', canonicalKey, s.requireLimit(limit)),

    /** Policy decision (owner-curated materiality). ELIGIBLE needs republication_gate PASS; otherwise the event can only be SUPPRESSED. */
    async decide(eventId: string, decision: { state: 'ELIGIBLE' | 'SUPPRESSED' | 'REJECTED'; republicationGate: RepublicationGate; reason: string }): Promise<ReleaseEventRow> {
      if (decision.state === 'ELIGIBLE' && decision.republicationGate !== 'PASS') throw new StatisticsError('STATISTICS_ACTIVATION_GATED', 'an event is ELIGIBLE only when the republication gate is PASS');
      if (!decision.reason || decision.reason.length > 300) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'reason is required (<=300 chars)');
      const n = await s.run(
        `UPDATE statistics_release_events SET eligibility_state = ?2, republication_gate = ?3, eligibility_reason = ?4 WHERE event_id = ?1 AND eligibility_state IN ('PENDING','ELIGIBLE','SUPPRESSED')`,
        eventId, decision.state, decision.republicationGate, decision.reason,
      );
      if (n !== 1) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'event is missing or already final', { detail: { eventId } });
      return (await get(eventId))!;
    },

    /** Explicit emit with the downstream receipt. Governed by the DB: ELIGIBLE + ACTIVE source policy + PRODUCTION release. */
    async markEmitted(eventId: string, receiptRef: string): Promise<ReleaseEventRow> {
      if (!receiptRef || receiptRef.length > 200) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'receiptRef is required (<=200 chars)');
      await s.run(`UPDATE statistics_release_events SET eligibility_state = 'EMITTED', emitted_at = ?2, emitted_ref = ?3 WHERE event_id = ?1`, eventId, s.now(), receiptRef);
      return (await get(eventId))!;
    },
  };
}
