import { APPROVED_BRIEF_CONTRACT_VERSION } from '../../../packages/contracts/src/index';
import { newId, type Env } from './db/queries';
import { resolveOutbound } from './handoff-security';

// Same-briefId resend of a FAILED approved_brief handoff.
//
// The stored approved_briefs.payload_json is re-POSTed byte-for-byte: the payload is immutable and is never
// rebuilt from the (possibly changed) source item. CCOS is idempotent by briefId, so a brief it already holds
// answers 200 duplicate with the same job (one job per brief); a different payload under the same briefId
// answers 409 and is recorded as BRIEF_ID_CONFLICT, never retried into a match.
// Bounded by MAX_HANDOFF_ATTEMPTS outbound attempts per brief (the original send counts), observable through
// handoff_log (one outbound row per attempt) and approved_briefs.handoff_status/handoff_detail.

export const MAX_HANDOFF_ATTEMPTS = 5;
const RESEND_CLAIM = 'RESEND_IN_PROGRESS';

export type ResendResult =
  | { ok: true; outcome: 'resent' | 'already_sent'; briefId: string; handoffStatus: 'sent'; detail: string; attempt?: number; ccos?: unknown }
  | { ok: false; status: 400 | 404 | 409 | 429 | 502 | 503; error: string; detail?: string; briefId?: string; attempt?: number };

function changesOf(result: unknown): number {
  return Number((result as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0);
}

export async function resendApprovedBrief(env: Env, briefId: string): Promise<ResendResult> {
  const row = await env.DB.prepare(`SELECT brief_id, payload_json, handoff_status, handoff_detail FROM approved_briefs WHERE brief_id = ?`)
    .bind(briefId)
    .first<{ brief_id: string; payload_json: string; handoff_status: string; handoff_detail: string | null }>();
  if (!row) return { ok: false, status: 404, error: 'BRIEF_NOT_FOUND' };
  if (row.handoff_status === 'sent') {
    return { ok: true, outcome: 'already_sent', briefId, handoffStatus: 'sent', detail: row.handoff_detail ?? 'delivered' };
  }
  if (row.handoff_status !== 'failed') return { ok: false, status: 409, error: 'BRIEF_NOT_FAILED', briefId };
  if (row.handoff_detail === RESEND_CLAIM) return { ok: false, status: 409, error: RESEND_CLAIM, briefId };

  const outbound = resolveOutbound(env);
  if (outbound.mode === 'stub') return { ok: false, status: 409, error: 'HANDOFF_STUBBED', briefId };
  // Misconfiguration sends nothing and consumes no attempt.
  if (outbound.mode === 'misconfigured') return { ok: false, status: 503, error: outbound.reason, briefId };

  let payload: { briefId?: unknown; contractVersion?: unknown };
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    return { ok: false, status: 409, error: 'STORED_PAYLOAD_INVALID', briefId };
  }
  if (payload.briefId !== briefId || payload.contractVersion !== APPROVED_BRIEF_CONTRACT_VERSION) {
    return { ok: false, status: 409, error: 'STORED_PAYLOAD_INVALID', briefId };
  }

  const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM handoff_log WHERE brief_id = ? AND direction = 'outbound'`)
    .bind(briefId)
    .first<{ n: number }>();
  const attempt = Number(used?.n ?? 0) + 1;
  if (attempt > MAX_HANDOFF_ATTEMPTS) return { ok: false, status: 429, error: 'RESEND_BUDGET_EXHAUSTED', briefId, attempt: attempt - 1 };

  // Claim: compare-and-set on the exact failed row just read, so concurrent resends never both send.
  const claim = await env.DB.prepare(
    `UPDATE approved_briefs SET handoff_detail = ? WHERE brief_id = ? AND handoff_status = 'failed' AND handoff_detail IS ?`
  )
    .bind(RESEND_CLAIM, briefId, row.handoff_detail)
    .run();
  if (changesOf(claim) !== 1) return { ok: false, status: 409, error: RESEND_CLAIM, briefId };

  let handoffStatus: 'sent' | 'failed' = 'failed';
  let handoffDetail: string;
  let ccos: unknown = null;
  try {
    const res = await fetch(outbound.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outbound.token}` },
      body: row.payload_json,
    });
    ccos = await res.json().catch(() => null);
    const outcome = (ccos as { outcome?: string } | null)?.outcome;
    if (res.status === 201 || (res.ok && outcome === 'created')) {
      handoffStatus = 'sent';
      handoffDetail = 'delivered (resend)';
    } else if (res.ok) {
      handoffStatus = 'sent';
      handoffDetail = 'delivered (resend: CCOS already held this brief)';
    } else if (res.status === 409) {
      handoffDetail = 'BRIEF_ID_CONFLICT';
    } else {
      handoffDetail = `HTTP ${res.status}`;
    }
  } catch (err) {
    handoffDetail = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  }

  await env.DB.prepare(`UPDATE approved_briefs SET handoff_status = ?, handoff_detail = ? WHERE brief_id = ?`)
    .bind(handoffStatus, handoffDetail, briefId)
    .run();
  await env.DB.prepare(`INSERT INTO handoff_log (id, brief_id, direction, body_json) VALUES (?, ?, 'outbound', ?)`)
    .bind(newId('log'), briefId, JSON.stringify({ resend: true, attempt, handoffStatus, handoffDetail }))
    .run();

  if (handoffStatus === 'sent') {
    const c = (ccos ?? {}) as { outcome?: unknown; jobId?: unknown; status?: unknown };
    return { ok: true, outcome: 'resent', briefId, handoffStatus, detail: handoffDetail, attempt, ccos: { outcome: c.outcome ?? null, jobId: c.jobId ?? null, status: c.status ?? null } };
  }
  const conflict = handoffDetail === 'BRIEF_ID_CONFLICT';
  return { ok: false, status: conflict ? 409 : 502, error: conflict ? 'BRIEF_ID_CONFLICT' : 'RESEND_FAILED', detail: handoffDetail, briefId, attempt };
}
