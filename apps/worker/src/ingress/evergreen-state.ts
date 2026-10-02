import type { Env } from '../db/queries';
import type { TemporalEntry } from '../temporal/registry';

export interface EvergreenState {
  cursor_json: string;
  run_id: string | null;
  lease_until: string | null;
  next_due: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  failure_count: number;
  evaluated: number;
  accepted: number;
  underfill: number;
  result_json: string | null;
}

export async function readEvergreenState(env: Env, sourceId: string) {
  return env.DB.prepare('SELECT * FROM evergreen_runtime_state WHERE source_id = ?').bind(sourceId).first<EvergreenState>();
}

/** Only configured archive keys and bounded executor bookkeeping may be persisted. */
export function validateCursor(raw: unknown, e: TemporalEntry): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 8192) throw new Error('invalid_cursor');
  const ids = new Set(e.evergreen.archives.map((a) => a.id));
  const out: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!ids.has(id) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_cursor');
    const state: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (['cursor', 'deep_cursor', 'page_cursor', 'archive_size_seen', 'archive_pool', 'pages_reachable'].includes(key)) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= 10_000_000) throw new Error('invalid_cursor');
      } else if (['last_rediscovery_at', 'last_deep_at'].includes(key)) {
        if (typeof v !== 'string' || v.length > 40 || !Number.isFinite(Date.parse(v))) throw new Error('invalid_cursor');
      } else if (key === 'cursor_mark') {
        if (typeof v !== 'string' || v.length > 200) throw new Error('invalid_cursor');
      } else throw new Error('invalid_cursor');
      state[key] = v;
    }
    out[id] = state;
  }
  return out;
}

export async function claimEvergreenRun(env: Env, sourceId: string, now: Date, familyIds: string[] = [sourceId]): Promise<string | null> {
  const at = now.toISOString();
  const runId = crypto.randomUUID();
  const until = new Date(now.getTime() + 30 * 60_000).toISOString();
  const result = await env.DB.prepare(`INSERT INTO evergreen_runtime_state (source_id, run_id, lease_until, last_attempt_at, updated_at)
    SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
      SELECT 1 FROM evergreen_runtime_state WHERE source_id IN (${familyIds.map(() => '?').join(',')}) AND lease_until > ?)
    ON CONFLICT(source_id) DO UPDATE SET
    run_id = excluded.run_id, lease_until = excluded.lease_until, last_attempt_at = excluded.last_attempt_at,
    result_json = NULL, updated_at = excluded.updated_at
    WHERE (evergreen_runtime_state.lease_until IS NULL OR evergreen_runtime_state.lease_until <= ?)
      AND (evergreen_runtime_state.next_due IS NULL OR evergreen_runtime_state.next_due <= ?)`)
    .bind(sourceId, runId, until, at, at, ...familyIds, at, at, at).run();
  return result.meta.changes === 1 ? runId : null;
}

export async function finishEvergreenRun(env: Env, e: TemporalEntry, runId: string, now: Date,
  data: { cursor: Record<string, unknown>; evaluated: number; accepted: number; underfill: boolean; error: string | null; result: unknown }) {
  const previous = await readEvergreenState(env, e.source_id);
  const failures = data.error ? (previous?.failure_count ?? 0) + 1 : 0;
  const delayHours = data.error ? Math.min(24, 2 ** Math.min(failures - 1, 5)) : e.evergreen.rediscovery_cadence_hours;
  const at = now.toISOString();
  const due = new Date(now.getTime() + delayHours * 3_600_000).toISOString();
  const r = await env.DB.prepare(`UPDATE evergreen_runtime_state SET
    cursor_json = CASE WHEN ? IS NULL THEN ? ELSE cursor_json END,
    lease_until = NULL, next_due = ?, last_success_at = CASE WHEN ? IS NULL THEN ? ELSE last_success_at END,
    last_error = ?, failure_count = ?, evaluated = ?, accepted = ?, underfill = ?, result_json = ?, updated_at = ?
    WHERE source_id = ? AND run_id = ? AND lease_until > ? AND result_json = 'PROCESSING'`)
    .bind(data.error, JSON.stringify(data.cursor), due, data.error, at, data.error, failures, data.evaluated,
      data.accepted, Number(data.underfill), JSON.stringify(data.result), at, e.source_id, runId, at).run();
  if (r.meta.changes !== 1) throw new Error('stale_run');
}
