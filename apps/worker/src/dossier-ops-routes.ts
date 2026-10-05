// Operator surface and cron entry of the DOSSIER RECURRING operation (with dossier-canary-routes.ts, the only places the Worker touches ./dossier).
//
// Tokens (R15, least privilege): GET routes need DOSSIER_OPS_READ_TOKEN (the write token also reads); every state change (controls, source states, reviews, promotion)
// needs DOSSIER_OPS_WRITE_TOKEN. Both are distinct from each other and from the GCOS OPS_TOKEN; identical or reused values fail closed (503), unset = 503, mismatch = 401.
// The cron tick uses NO token (internal call) and does nothing unless DOSSIER_RECURRING_ENABLED="true" AND the owner switched recurring on.
import type { Env } from './db/queries';
import { authorizeToken, bearerToken } from './handoff-security';
import { guardedEurostatFetch, guardedFetch } from './dossier-canary-routes';
import { setControl } from './dossier/canary-control';
import { canaryPolicy } from './dossier/canary-profile';
import { DOSSIER_RECURRING_V1 } from './dossier/recurring-profile';
import { CONTROL_RECURRING_ENABLED, CONTROL_RECURRING_PERSISTENCE, RECURRING_STATES, setRecurringFlag, setRecurringState, type RecurringState } from './dossier/recurring-control';
import { opsAlerts, opsCandidates, opsChanges, opsRuns, opsSourceHealth, opsSummary } from './dossier/recurring-ops';
import { runRecurringTick, type TickReport } from './dossier/recurring-scheduler';
import { CANARY_ALGORITHM_VERSION } from './dossier/canary';
import { DossierRepo } from './dossier/repo';
import { promoteWatchTarget, submitReview } from './dossier/review';
import { explainWhyNow } from './dossier/snapshots';
import { DossierError, type D1Like } from './dossier/types';

export const DOSSIER_RECURRING_CRON = '*/5 * * * *';
const OPS_PREFIX = '/api/dossier/ops/';
export const MAX_OPS_BODY_BYTES = 4096;
const RUN_ID_OK = /^crun_[0-9a-f-]{36}$/;
const READER_OK = /^dossier-[a-z0-9-]{1,60}$/;
const ID_OK = /^[A-Za-z0-9_:.-]{1,120}$/;
const j = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

type OpsEnv = Pick<Env, 'DB' | 'OPS_TOKEN' | 'DOSSIER_OPS_READ_TOKEN' | 'DOSSIER_OPS_WRITE_TOKEN' | 'DOSSIER_RECURRING_ENABLED' | 'DOSSIER_CANARY_ENABLED'>;

/** Distinct, configured, non-reused tokens or a fail-closed refusal. Pure over the environment. */
export function authorizeDossierOps(env: Pick<Env, 'OPS_TOKEN' | 'DOSSIER_OPS_READ_TOKEN' | 'DOSSIER_OPS_WRITE_TOKEN'>, method: string, presented: string | null): { ok: true; scope: 'read' | 'write' } | { ok: false; status: number; error: string } {
  const read = (env.DOSSIER_OPS_READ_TOKEN ?? '').trim();
  const write = (env.DOSSIER_OPS_WRITE_TOKEN ?? '').trim();
  const gcos = (env.OPS_TOKEN ?? '').trim();
  if ((read && write && read === write) || (read && gcos && read === gcos) || (write && gcos && write === gcos)) return { ok: false, status: 503, error: 'DOSSIER_OPS_TOKENS_NOT_DISTINCT' };
  if (method === 'GET') {
    const w = authorizeToken(write, presented, 'x');
    if (w.ok) return { ok: true, scope: 'write' };
    const r = authorizeToken(read, presented, 'DOSSIER_OPS_READ_TOKEN_NOT_CONFIGURED');
    if (r.ok) return { ok: true, scope: 'read' };
    // an unconfigured read token is a misconfiguration (503) unless the write token is configured and simply did not match
    return !read && !write ? { ok: false, status: 503, error: 'DOSSIER_OPS_READ_TOKEN_NOT_CONFIGURED' } : { ok: false, status: 401, error: 'UNAUTHORIZED' };
  }
  const w = authorizeToken(write, presented, 'DOSSIER_OPS_WRITE_TOKEN_NOT_CONFIGURED');
  return w.ok ? { ok: true, scope: 'write' } : { ok: false, status: w.status, error: w.error };
}

async function readBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> | null } | { ok: false; res: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_OPS_BODY_BYTES) return { ok: false, res: j({ error: 'BODY_TOO_LARGE' }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_OPS_BODY_BYTES) return { ok: false, res: j({ error: 'BODY_TOO_LARGE' }, 413) };
  try {
    const v = JSON.parse(text) as unknown;
    return { ok: true, body: v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null };
  } catch { return { ok: true, body: null }; }
}
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const num = (v: string | null): number | undefined => (v && /^\d{1,3}$/.test(v) ? Number(v) : undefined);

/** /api/dossier/ops/* or null when the path is not ours. Authentication comes first: nothing below runs for an unauthenticated caller. Header only: a token in the URL is never read. */
export async function handleDossierOps(request: Request, env: OpsEnv, path: string): Promise<Response | null> {
  if (!path.startsWith(OPS_PREFIX)) return null;
  if (request.method !== 'GET' && request.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { allow: 'GET, POST', 'content-type': 'application/json; charset=utf-8' } });
  const auth = authorizeDossierOps(env, request.method, bearerToken(request.headers.get('Authorization')));
  if (!auth.ok) return j({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  for (const v of url.searchParams.values()) if (v.length > 120) return j({ error: 'QUERY_VALUE_TOO_LONG' }, 400);
  const sub = path.slice(OPS_PREFIX.length);
  const db = env.DB as unknown as D1Like;
  const nowIso = new Date().toISOString();
  try {
    if (request.method === 'GET') {
      if (sub === 'summary') return j({ ok: true, ...(await opsSummary(db, { env, nowIso })) });
      if (sub === 'alerts') return j({ ok: true, ...(await opsAlerts(db, { env, nowIso })) });
      if (sub === 'runs') {
        const reader = url.searchParams.get('reader') ?? undefined;
        if (reader !== undefined && !READER_OK.test(reader)) return j({ error: 'INVALID_READER' }, 400);
        return j({ ok: true, runs: await opsRuns(db, { readerId: reader, limit: num(url.searchParams.get('limit')) }) });
      }
      const health = /^source\/([a-z0-9-]+)\/health$/.exec(sub);
      if (health) {
        const h = await opsSourceHealth(db, health[1], { nowIso });
        return h ? j({ ok: true, ...h }) : j({ error: 'READER_NOT_RECURRING' }, 404);
      }
      if (sub === 'changes') {
        const rid = url.searchParams.get('run_id') ?? '';
        if (!RUN_ID_OK.test(rid)) return j({ error: 'INVALID_RUN_ID' }, 400);
        const c = await opsChanges(db, rid);
        return c ? j({ ok: true, ...c }) : j({ error: 'RUN_NOT_FOUND' }, 404);
      }
      if (sub === 'candidates') return j({ ok: true, candidates: await opsCandidates(db, { limit: num(url.searchParams.get('limit')), state: url.searchParams.get('state') ?? undefined }) });
      const snap = /^snapshot\/([A-Za-z0-9_-]{1,80})$/.exec(sub);
      if (snap) {
        const ex = await explainWhyNow(new DossierRepo(db), snap[1]);
        return ex ? j({ ok: true, why_now: ex }) : j({ error: 'SNAPSHOT_NOT_FOUND' }, 404);
      }
      return j({ error: 'NOT_FOUND' }, 404);
    }

    // ---- state changes: the write token only
    const parsed = await readBody(request);
    if (!parsed.ok) return parsed.res;
    const b = parsed.body;
    if (sub === 'control') {
      const operator = str(b?.operator, 80);
      const key = str(b?.key), value = str(b?.value, 10);
      if (!operator) return j({ error: 'OPERATOR_REQUIRED' }, 400);
      if (!key || !value) return j({ error: 'INVALID_BODY' }, 400);
      if (key === CONTROL_RECURRING_ENABLED || key === CONTROL_RECURRING_PERSISTENCE) {
        if (value !== '0' && value !== '1') return j({ error: 'INVALID_BODY' }, 400);
        await setRecurringFlag(db, { key, value, by: 'owner', actor: operator, now: nowIso });
        return j({ ok: true, key, value, updated_by: operator });
      }
      if (key.startsWith('platform:')) { await setControl(db, { key, value, updatedBy: operator, now: nowIso }); return j({ ok: true, key, value, updated_by: operator }); }
      return j({ error: 'CONTROL_KEY_NOT_ALLOWED_HERE' }, 400);
    }
    if (sub === 'source-state') {
      const operator = str(b?.operator, 80), reader = str(b?.reader_id, 80), to = str(b?.to, 20);
      if (!operator) return j({ error: 'OPERATOR_REQUIRED' }, 400);
      if (!reader || !READER_OK.test(reader) || !to || !(RECURRING_STATES as readonly string[]).includes(to)) return j({ error: 'INVALID_BODY' }, 400);
      const r = await setRecurringState(db, { readerId: reader, to: to as RecurringState, by: 'owner', actor: operator, reason: str(b?.reason, 200) ?? undefined, now: nowIso });
      return j({ ok: true, reader_id: reader, ...r });
    }
    if (sub === 'review' || sub === 'promote') {
      const reviewerId = str(b?.reviewer_id, 80);
      if (!reviewerId) return j({ error: 'REVIEWER_REQUIRED' }, 400);
      const repo = new DossierRepo(db);
      const reviewer = { kind: 'HUMAN' as const, id: reviewerId };
      if (sub === 'review') {
        const targetType = str(b?.target_type, 40), targetId = str(b?.target_id, 120), decision = str(b?.decision, 20);
        if (!targetType || !targetId || !ID_OK.test(targetId) || !decision) return j({ error: 'INVALID_BODY' }, 400);
        const r = await submitReview(repo, { targetType, targetId, decision, reasonCode: str(b?.reason_code, 60), reasonNote: str(b?.reason_note, 400), reviewer });
        return j(r, r.ok ? 200 : 409);
      }
      const targetId = str(b?.target_id, 120);
      if (!targetId || !ID_OK.test(targetId)) return j({ error: 'INVALID_BODY' }, 400);
      // human promotion creates a durable candidate: it belongs to stage 2, so it needs the owner's persistence control
      const on = await db.prepare(`SELECT control_value AS v FROM dossier_control WHERE control_key = ?`).bind(CONTROL_RECURRING_PERSISTENCE).first();
      if ((on as { v?: string } | null)?.v !== '1') return j({ error: 'CANDIDATE_PERSISTENCE_OFF' }, 409);
      const policy = canaryPolicy(DOSSIER_RECURRING_V1, { promotionEnabled: true, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
      const r = await promoteWatchTarget(repo, { targetType: 'CONCEPT', targetId, reviewer, reasonNote: str(b?.reason_note, 400) }, policy, { now: nowIso, algorithmVersion: CANARY_ALGORITHM_VERSION, observationLimit: 2000 });
      return j(r, r.ok ? 200 : 409);
    }
    return j({ error: 'NOT_FOUND' }, 404);
  } catch (e) {
    if (e instanceof DossierError) return j({ error: 'DOSSIER_OPS_ERROR', message: e.message.slice(0, 300) }, 400);
    if (/no such table: dossier_/i.test(String((e as { message?: unknown })?.message ?? ''))) return j({ error: 'DOSSIER_SCHEMA_NOT_APPLIED' }, 409);
    return j({ error: 'DOSSIER_OPS_ERROR', message: 'internal_error' }, 500);
  }
}

/** The dedicated five-minute cron entry. Isolated by the caller (runIsolatedScheduledJobs): a dossier failure never touches the GCOS jobs. A disabled deployment reads nothing. */
export async function runDossierRecurringTick(env: Pick<Env, 'DB' | 'DOSSIER_RECURRING_ENABLED'>): Promise<TickReport> {
  return runRecurringTick({
    db: env.DB as never,
    env: { DOSSIER_RECURRING_ENABLED: env.DOSSIER_RECURRING_ENABLED },
    ctFetch: guardedFetch('clinicaltrials.gov', '/api/v2/studies'),
    euFetch: guardedEurostatFetch(),
    log: (event) => console.log(JSON.stringify(event)),
  });
}
