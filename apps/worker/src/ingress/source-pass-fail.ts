/**
 * Bible v4 Source Pass/Fail (Kitap II). Editorial PASS ≠ ingest capability ≠ lifecycle.
 * Fetch/health failures are recorded as revalidation events; they are not SOURCE FAIL.
 */
import type { Env } from '../db/queries';

export const SPF_RULESET_VERSION = 'source-pass-fail-v1';
export const SPF_SCHEMA_VERSION = 'spf-1.0.0';
export const SPF_DOCUMENT = '/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md';

export const EVALUATION_TRACKS = {
  haber: 'ENGAGEMENT',
  research: 'ENGAGEMENT',
  duyuru: 'PRAGMATIC_UTILITY',
  burs: 'PRAGMATIC_UTILITY',
  egitim: 'PRAGMATIC_UTILITY',
} as const;

export const REVALIDATION_TRIGGERS = [
  'domain_change',
  'publisher_change',
  'ownership_change',
  'rss_api_loss',
  'robots_change',
  'tos_change',
  'parser_break',
  'health_drop',
  'redirect_change',
  'canonical_change',
  'cadence_change',
  'retraction_correction',
  'security_issue',
] as const;

export function biblePublicMeta(env: Env) {
  return {
    bibleVersion: env.BIBLE_VERSION || '4.0',
    rulesetVersion: SPF_RULESET_VERSION,
    schemaVersion: SPF_SCHEMA_VERSION,
    document: SPF_DOCUMENT,
    evaluationTracks: EVALUATION_TRACKS,
    revalidation: {
      scheduled_days: 30,
      event_triggers: [...REVALIDATION_TRIGGERS],
    },
    notes: [
      'haber/research → ENGAGEMENT (turkey eligibility N/A)',
      'duyuru/burs/egitim → PRAGMATIC_UTILITY',
      'soft score never produces FAIL',
      'technical fetch issues are not SOURCE FAIL',
    ],
  };
}

export type SpfCategory = keyof typeof EVALUATION_TRACKS;

export function categoryFromSourceId(sourceId: string): SpfCategory {
  const id = String(sourceId || '');
  if (id.startsWith('burs_')) return 'burs';
  if (id.startsWith('egitim_')) return 'egitim';
  return 'duyuru';
}

function newId(): string {
  return `spf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordSourcePassFail(
  env: Env,
  input: {
    sourceId: string;
    category?: SpfCategory;
    decisionScope?: string;
    sourceRole?: string;
    editorialDecision: string;
    previousDecision?: string | null;
    itemDecision?: string | null;
    ingestionMode?: string | null;
    lifecycleStatus?: string | null;
    hardFail?: boolean;
    normalizedScore?: number | null;
    scoreConfidence?: string | null;
    healthStatus?: string | null;
    reasonCodes?: string[];
    evidence?: unknown;
    warnings?: string[];
    reviewTrigger?: string[];
  }
): Promise<void> {
  const category = input.category || categoryFromSourceId(input.sourceId);
  const track = EVALUATION_TRACKS[category];
  try {
    await env.DB.prepare(
      `INSERT INTO source_pass_fail_decisions
       (id, source_id, decision_scope, category, evaluation_track, source_role,
        editorial_decision, previous_decision, item_decision, ingestion_mode, lifecycle_status,
        hard_fail, normalized_score, score_confidence, health_status, reason_codes, evidence, warnings,
        review_trigger, bible_version, ruleset_version, schema_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    )
      .bind(
        newId(),
        input.sourceId,
        input.decisionScope || 'source_category',
        category,
        track,
        input.sourceRole || 'discovery',
        input.editorialDecision,
        input.previousDecision ?? null,
        input.itemDecision ?? null,
        input.ingestionMode ?? null,
        input.lifecycleStatus ?? null,
        input.hardFail ? 1 : 0,
        input.normalizedScore ?? null,
        input.scoreConfidence ?? null,
        input.healthStatus ?? null,
        JSON.stringify(input.reasonCodes || []),
        JSON.stringify(input.evidence ?? []),
        JSON.stringify(input.warnings || []),
        JSON.stringify(input.reviewTrigger || []),
        env.BIBLE_VERSION || '4.0',
        SPF_RULESET_VERSION,
        SPF_SCHEMA_VERSION
      )
      .run();
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'source_pass_fail_record_failed',
        source_id: input.sourceId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/** Health drop is a revalidation trigger, not SOURCE FAIL (SPF-6 / SPF-27). */
export async function recordHealthRevalidation(
  env: Env,
  input: { sourceId: string; healthStatus: string; httpStatus?: number | null; error?: string | null }
): Promise<void> {
  const unhealthy = /degraded|unhealthy|warning/i.test(input.healthStatus);
  if (!unhealthy) return;
  await recordSourcePassFail(env, {
    sourceId: input.sourceId,
    editorialDecision: 'CONDITIONAL',
    ingestionMode: 'MANUAL_ONLY',
    lifecycleStatus: 'degraded',
    hardFail: false,
    healthStatus: 'unhealthy',
    reasonCodes: ['TECHNICAL_NOT_HARD_FAIL', 'HEALTH_DROP_REVALIDATION'],
    warnings: ['fetch_error_is_not_source_fail'],
    reviewTrigger: ['health_drop'],
    evidence: {
      http_status: input.httpStatus ?? null,
      error: input.error ? String(input.error).slice(0, 240) : null,
    },
  });
}

export async function listSourcePassFail(env: Env, limit = 40): Promise<Record<string, unknown>[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, source_id, decision_scope, category, evaluation_track, source_role,
              editorial_decision, previous_decision, item_decision, ingestion_mode, lifecycle_status,
              hard_fail, normalized_score, score_confidence, health_status, reason_codes, warnings,
              review_trigger, bible_version, ruleset_version, created_at
       FROM source_pass_fail_decisions
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(Math.max(1, Math.min(limit, 100)))
      .all<Record<string, unknown>>();
    return results || [];
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'source_pass_fail_list_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return [];
  }
}

const REVALIDATION_COOLDOWN_HOURS = 24;

/** Scheduled SPF-28 sweep for already-degraded sources (housekeeping tick). */
export async function revalidateUnhealthySources(env: Env, limit = 8): Promise<{ recorded: number }> {
  let recorded = 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT t.source_id, t.source_health, t.failure_count, t.last_operator_status
       FROM tip_toplulugu_source_telemetry t
       WHERE t.source_health IN ('DEGRADED', 'UNHEALTHY', 'WARNING')
       LIMIT ?`
    )
      .bind(limit)
      .all<{ source_id: string; source_health: string; failure_count: number; last_operator_status: string | null }>();

    for (const row of results || []) {
      const recent = await env.DB.prepare(
        `SELECT created_at FROM source_pass_fail_decisions
         WHERE source_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
         LIMIT 1`
      )
        .bind(row.source_id, `-${REVALIDATION_COOLDOWN_HOURS} hours`)
        .first<{ created_at: string }>();
      if (recent) continue;
      await recordHealthRevalidation(env, {
        sourceId: row.source_id,
        healthStatus: row.source_health,
        error: row.last_operator_status,
      });
      recorded += 1;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'source_pass_fail_revalidate_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
  return { recorded };
}
