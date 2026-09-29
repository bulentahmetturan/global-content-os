/**
 * S66 Phase B -- recomputes source_revalidation from live D1 evidence and
 * upserts recommendations. NEVER writes to source_feeds, hekimler_source_
 * telemetry, or any config table -- see revalidation.ts's evaluateRevalidation()
 * for the "NO AUTONOMOUS MUTATION" invariant this preserves. Mirrors the
 * existing pruneLowYieldSources() pattern (triage/actions.ts): a periodic
 * maintenance job that only writes to its own bookkeeping table.
 */
import { newId, type Env } from '../db/queries';
import { evaluateRevalidation, type RevalidationInput } from './revalidation';

interface KaduseFeedRow {
  id: string;
  route: string;
  enabled: number;
  poll_minutes: number | null;
  last_fetched_at: string | null;
  last_error: string | null;
  fetch_attempts: number | null;
}

interface HekimlerTelemetryRow {
  source_id: string;
  last_success_at: string | null;
  failure_count: number | null;
  poll_minutes: number | null;
}

export interface RevalidationRunResult {
  evaluated: number;
  requiresRevalidation: number;
  errors: string[];
}

async function reviewStats(
  env: Env,
  key: string
): Promise<{ reviewed: number; rejected: number; topReason: string | null }> {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM review_feedback WHERE (feed_id = ? OR source_id = ?) AND created_at >= datetime('now','-30 day')`
    )
      .bind(key, key)
      .first<{ n: number }>();
    const rejected = row?.n ?? 0;
    const topRow = await env.DB.prepare(
      `SELECT reason_code, COUNT(*) AS n FROM review_feedback
       WHERE (feed_id = ? OR source_id = ?) AND created_at >= datetime('now','-30 day')
       GROUP BY reason_code ORDER BY n DESC LIMIT 1`
    )
      .bind(key, key)
      .first<{ reason_code: string; n: number }>();
    // reviewed = rejected (from review_feedback) + promoted/completed (accepted) in the same window --
    // approximated here via editorial_decisions since "accepted" isn't in review_feedback (only rejects are).
    const acceptedRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM editorial_decisions d
       JOIN source_items i ON i.id = d.source_item_id
       WHERE (i.feed_id = ? OR i.source_id = ?) AND d.action IN ('promote','complete')
         AND d.decided_at >= datetime('now','-30 day')`
    )
      .bind(key, key)
      .first<{ n: number }>();
    const accepted = acceptedRow?.n ?? 0;
    return { reviewed: rejected + accepted, rejected, topReason: topRow?.reason_code ?? null };
  } catch {
    // review_feedback may not exist yet (migration 0023 not applied) -- fail closed to "no data", never throw.
    return { reviewed: 0, rejected: 0, topReason: null };
  }
}

export async function runSourceRevalidation(env: Env): Promise<RevalidationRunResult> {
  const errors: string[] = [];
  let evaluated = 0;
  let requiresRevalidation = 0;

  const { results: kaduseFeeds } = await env.DB.prepare(
    `SELECT id, route, enabled, poll_minutes, last_fetched_at, last_error, fetch_attempts
     FROM source_feeds WHERE route IN ('kaduse-news', 'kaduse-research')`
  ).all<KaduseFeedRow>();

  const { results: hekTelemetry } = await env.DB.prepare(
    `SELECT source_id, last_success_at, failure_count, poll_minutes FROM hekimler_source_telemetry`
  ).all<HekimlerTelemetryRow>();

  const now = Date.now();
  const rows: Array<{ key: string; heading: string; poll_minutes: number | null; lastSuccess: string | null; lastError: string | null; failureCount: number }> = [];

  for (const f of kaduseFeeds ?? []) {
    if (!f.enabled) continue;
    rows.push({
      key: f.id,
      heading: f.route === 'kaduse-news' ? 'HABER' : 'RESEARCH',
      poll_minutes: f.poll_minutes,
      lastSuccess: f.last_fetched_at,
      lastError: f.last_error,
      failureCount: f.last_error ? Math.max(1, f.fetch_attempts ?? 1) : 0,
    });
  }
  for (const h of hekTelemetry ?? []) {
    rows.push({
      key: h.source_id,
      heading: 'DUYURU', // Burs/Eğitim source_ids are distinguishable by prefix if needed later
      poll_minutes: h.poll_minutes,
      lastSuccess: h.last_success_at,
      lastError: null,
      failureCount: h.failure_count ?? 0,
    });
  }

  for (const r of rows) {
    try {
      const overdueMinutes =
        r.lastSuccess && r.poll_minutes
          ? Math.max(0, (now - new Date(r.lastSuccess).getTime()) / 60000 - r.poll_minutes)
          : null;
      const neverRunDays = !r.lastSuccess ? null : null; // registration date not tracked per-row here; left null (no false "never run X days" claim without real evidence)
      const stats = await reviewStats(env, r.key);
      const input: RevalidationInput = {
        canonical_source_key: r.key,
        primary_heading: r.heading,
        health: r.lastSuccess ? 'HEALTHY' : 'NEVER_RUN',
        consecutive_failures: r.failureCount,
        poll_minutes: r.poll_minutes,
        overdue_minutes: overdueMinutes,
        reject_count_30d: stats.rejected,
        reviewed_count_30d: stats.reviewed,
        top_reject_reason: stats.topReason,
        has_cross_heading_conflict: false, // static-only check, see scripts/check_source_identity.py in CI
        never_run_days_since_registered: neverRunDays,
      };
      const verdict = evaluateRevalidation(input);
      evaluated++;
      if (verdict.status === 'REVALIDATION_REQUIRED') requiresRevalidation++;

      await env.DB.prepare(
        `INSERT INTO source_revalidation
           (canonical_source_key, primary_heading, revalidation_status, revalidation_reason, recommendation, recommendation_detail, supporting_metrics_json, last_revalidated_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(canonical_source_key) DO UPDATE SET
           primary_heading = excluded.primary_heading,
           revalidation_status = excluded.revalidation_status,
           revalidation_reason = excluded.revalidation_reason,
           recommendation = excluded.recommendation,
           recommendation_detail = excluded.recommendation_detail,
           supporting_metrics_json = excluded.supporting_metrics_json,
           last_revalidated_at = excluded.last_revalidated_at,
           updated_at = excluded.updated_at`
      )
        .bind(
          r.key,
          r.heading,
          verdict.status,
          verdict.reason,
          verdict.recommendation,
          verdict.detail,
          JSON.stringify({ overdueMinutes, failureCount: r.failureCount, reviewed30d: stats.reviewed, rejected30d: stats.rejected })
        )
        .run();
    } catch (err) {
      errors.push(`${r.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { evaluated, requiresRevalidation, errors };
}

export async function getSourceRevalidation(env: Env, key: string) {
  return env.DB.prepare(`SELECT * FROM source_revalidation WHERE canonical_source_key = ?`).bind(key).first();
}

export async function listRevalidationRequired(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM source_revalidation WHERE revalidation_status = 'REVALIDATION_REQUIRED' ORDER BY updated_at DESC`
  ).all();
  return results ?? [];
}

/** Append-only: records an ACTUAL applied source config change (never called
 * automatically by revalidation itself -- only by a human/engineering-approved
 * code path, e.g. a future admin action, matching the same discipline as
 * review_feedback/editorial_decisions). */
export async function recordSourceChange(
  env: Env,
  params: {
    canonicalSourceKey: string;
    fieldChanged: string;
    oldValue?: string | null;
    newValue?: string | null;
    oldState?: string | null;
    newState?: string | null;
    reason: string;
    supportingMetrics?: unknown;
    feedbackSummary?: string | null;
    followedRecommendation?: string | null;
    actor?: string;
    commitRef?: string | null;
  }
): Promise<string> {
  const id = newId('chg');
  await env.DB.prepare(
    `INSERT INTO source_change_history
       (id, canonical_source_key, field_changed, old_value, new_value, old_state, new_state, reason, supporting_metrics_json, feedback_summary, followed_recommendation, actor, commit_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      params.canonicalSourceKey,
      params.fieldChanged,
      params.oldValue ?? null,
      params.newValue ?? null,
      params.oldState ?? null,
      params.newState ?? null,
      params.reason,
      params.supportingMetrics ? JSON.stringify(params.supportingMetrics) : null,
      params.feedbackSummary ?? null,
      params.followedRecommendation ?? null,
      params.actor ?? 'engineering',
      params.commitRef ?? null
    )
    .run();
  return id;
}
