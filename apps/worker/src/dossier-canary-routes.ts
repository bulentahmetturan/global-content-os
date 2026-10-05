// Operator surface of the DOSSIER canary (the ONLY place the Worker touches ./dossier). Not public, not scheduled, not run on deploy.
//
// Every route needs the OPS_TOKEN bearer (unset = 503, mismatch = 401), exactly like /api/ops/summary. A run additionally needs the
// environment master switch DOSSIER_CANARY_ENABLED=true and the operator controls (all absent = OFF), and executes ONE bounded invocation
// of the shared canary runner; the operator calls it again until the run reports COMPLETED. There is no cron path to any of this.
import type { Env } from './db/queries';
import { authorizeToken, bearerToken } from './handoff-security';
import { registryRecordClassifier, registryRecordExtractor, createClinicalTrialsReader } from './dossier/clinicaltrials';
import { createOecdHealthReader } from './dossier/oecd';
import { createEurostatReader, eurostatRowClassifier, eurostatRowExtractor, EUROSTAT_GEO_TURKIYE, EUROSTAT_SOURCE_ID, type EurostatFetch } from './dossier/eurostat';
import { DOSSIER_READER_REGISTRY_V2 } from './dossier/canary-v2';
import { DOSSIER_CANARY_V1, DOSSIER_CANARY_V2, validateCanaryProfile, validateCanaryProfileV2, type CanaryProfile } from './dossier/canary-profile';
import { createBudgetedD1, DOSSIER_READER_REGISTRY, setControl, type DossierReaderRegistration } from './dossier/canary-control';
import { invokeCanary } from './dossier/canary';
import { candidateSummary, canaryStatus, errorSummary, eurostatCanaryReport, runHistory, watchSummary } from './dossier/canary-inspect';
import { gatherDossierReadiness } from './dossier/canary-readiness';
import type { Connector } from './dossier/connectors';
import { DossierError } from './dossier/types';

const j = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Network access of a production reader is limited to its one official endpoint. */
function guardedFetch(host: string, pathPrefix: string): (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  return async (url, init) => {
    const u = new URL(url);
    if (u.host !== host || !u.pathname.startsWith(pathPrefix)) throw new Error(`blocked request to ${u.host}${u.pathname}`);
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status, json: () => res.json() };
  };
}

/** The Eurostat reader may only ever request Turkiye from the one official dataset over https (any other host, path, protocol or geography is refused before the request leaves). */
export function guardedEurostatFetch(): EurostatFetch {
  return async (url, init) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.host !== 'ec.europa.eu' || !u.pathname.startsWith('/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2') || u.searchParams.get('geo') !== EUROSTAT_GEO_TURKIYE) throw new Error(`blocked request to ${u.host}${u.pathname}`);
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status, json: () => res.json(), headers: { get: (n: string) => res.headers.get(n) } };
  };
}

export function createProductionReader(reg: DossierReaderRegistration): Connector {
  if (reg.canonical_source_id === EUROSTAT_SOURCE_ID) return createEurostatReader({ fetchImpl: guardedEurostatFetch(), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }) as unknown as Connector;
  if (reg.canonical_source_id === 'clinicaltrials-gov-api-v2') return createClinicalTrialsReader({ fetchImpl: guardedFetch('clinicaltrials.gov', '/api/v2/studies'), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }) as unknown as Connector;
  if (reg.canonical_source_id === 'oecd-health') return createOecdHealthReader({ fetchImpl: guardedFetch('sdmx.oecd.org', '/public/rest/data/'), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }) as unknown as Connector;
  throw new DossierError('reader_not_available_in_canary', reg.canonical_source_id);
}

/** Operator bodies are tiny (a reader id, an operator name, a control key/value): anything larger is refused before parsing. */
export const MAX_OPERATOR_BODY_BYTES = 2048;
const RUN_ID_OK = /^crun_[0-9a-f-]{36}$/;
const MAX_QUERY_VALUE = 120;

async function readOperatorBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> | null } | { ok: false; res: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_OPERATOR_BODY_BYTES) return { ok: false, res: j({ error: 'BODY_TOO_LARGE' }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_OPERATOR_BODY_BYTES) return { ok: false, res: j({ error: 'BODY_TOO_LARGE' }, 413) };
  try {
    const v = JSON.parse(text) as unknown;
    return { ok: true, body: v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null };
  } catch {
    return { ok: true, body: null };
  }
}

const num = (v: string | null): number | undefined => (v && /^\d{1,3}$/.test(v) ? Number(v) : undefined);

/** Returns a Response for /api/dossier/canary/* or null when the path is not ours. */
/**
 * Statement budget of ONE read-only inspection request. It is deliberately independent of the run slice (`d1_statements_per_invocation`, 200): an operator read such as
 * `watch --limit 25` needs several hundred statements, and the platform limit it protects (1000 per invocation on Workers Paid) is the same for every request.
 */
export const INSPECTION_D1_STATEMENT_BUDGET = 800;

export async function handleDossierCanary(request: Request, env: Env, path: string, opts: { profile?: CanaryProfile; inspectionBudget?: number } = {}): Promise<Response | null> {
  let profile: CanaryProfile = opts.profile ?? DOSSIER_CANARY_V1;
  if (!path.startsWith('/api/dossier/canary/')) return null;
  // authentication comes FIRST: nothing below (body parsing, validation, D1) runs for an unauthenticated caller. Header only: a token in the URL is never read.
  const auth = authorizeToken(env.OPS_TOKEN, bearerToken(request.headers.get('Authorization')), 'OPS_TOKEN_NOT_CONFIGURED');
  if (!auth.ok) return j({ error: auth.error }, auth.status);
  if (request.method !== 'GET' && request.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { allow: 'GET, POST', 'content-type': 'application/json; charset=utf-8' } });
  const url = new URL(request.url);
  for (const v of url.searchParams.values()) if (v.length > MAX_QUERY_VALUE) return j({ error: 'QUERY_VALUE_TOO_LONG' }, 400);
  // V2 (second family) is selected explicitly: `?profile=v2` for reads, or by a V2 reader id for runs. Everything else is the frozen V1 behaviour.
  const v2Read = url.searchParams.get('profile') === 'v2';
  if (v2Read) profile = DOSSIER_CANARY_V2;
  const deps = { db: env.DB as never, profile, env: { DOSSIER_CANARY_ENABLED: env.DOSSIER_CANARY_ENABLED }, ...(v2Read ? { registry: DOSSIER_READER_REGISTRY_V2 } : {}) };
  // read-only inspection is bounded by its own per-request D1 statement budget (a refused statement is an error, never an overrun of the platform limit)
  const readDeps = { ...deps, db: createBudgetedD1(env.DB as never, opts.inspectionBudget ?? INSPECTION_D1_STATEMENT_BUDGET).db };
  const sub = path.slice('/api/dossier/canary/'.length);
  try {
    if (request.method === 'GET') {
      if (sub === 'status') return j({ ok: true, ...(await canaryStatus(readDeps)) });
      if (sub === 'runs') return j({ ok: true, runs: await runHistory(readDeps, { readerId: url.searchParams.get('reader') ?? undefined, limit: num(url.searchParams.get('limit')) }) });
      if (sub === 'watch') return j({ ok: true, ...(await watchSummary(readDeps, { limit: num(url.searchParams.get('limit')), after: url.searchParams.get('after') ?? undefined })) });
      if (sub === 'candidates') return j({ ok: true, candidates: await candidateSummary(readDeps, { limit: num(url.searchParams.get('limit')) }) });
      if (sub === 'errors') return j({ ok: true, ...(await errorSummary(readDeps, { limit: num(url.searchParams.get('limit')) })) });
      if (sub === 'eurostat-report') {
        const rid = url.searchParams.get('run_id') ?? '';
        if (!RUN_ID_OK.test(rid)) return j({ error: 'INVALID_RUN_ID' }, 400);
        return j(await eurostatCanaryReport({ ...readDeps, profile: DOSSIER_CANARY_V2 }, { runId: rid }));
      }
      if (sub === 'readiness') {
        if (profile.profile_id === 'DOSSIER_CANARY_V2') return j({ ok: true, profile: profile.profile_id, profile_errors: validateCanaryProfileV2(profile), note: 'V2 readiness is the status read model plus the Eurostat report; the V1 readiness level is not defined for V2' });
        return j({ ok: true, readiness: await gatherDossierReadiness(env.DB as never, { environment: env.ENVIRONMENT === 'production' ? 'LIVE' : 'LOCAL', envMasterSwitch: env.DOSSIER_CANARY_ENABLED === 'true', profile }), profile_errors: validateCanaryProfile(profile) });
      }
    }
    if (request.method === 'POST') {
      const parsed = await readOperatorBody(request);
      if (!parsed.ok) return parsed.res;
      const body = parsed.body as { reader_id?: unknown; run_id?: unknown; key?: unknown; value?: unknown; operator?: unknown } | null;
      const operator = typeof body?.operator === 'string' ? body.operator.trim() : '';
      if (!operator || operator.length > 80) return j({ error: 'OPERATOR_REQUIRED' }, 400);
      if (sub === 'control') {
        if (typeof body?.key !== 'string' || typeof body?.value !== 'string') return j({ error: 'INVALID_BODY' }, 400);
        await setControl(env.DB as never, { key: body.key, value: body.value, updatedBy: operator, now: new Date().toISOString() });
        return j({ ok: true, key: body.key, value: body.value, updated_by: operator });
      }
      if (sub === 'run') {
        const isV2Reader = typeof body?.reader_id === 'string' && DOSSIER_READER_REGISTRY_V2.some((r) => r.dossier_reader_id === body.reader_id);
        if (typeof body?.reader_id !== 'string' || !(isV2Reader || DOSSIER_READER_REGISTRY.some((r) => r.dossier_reader_id === body.reader_id))) return j({ error: 'READER_NOT_REGISTERED' }, 400);
        if (body.run_id !== undefined && (typeof body.run_id !== 'string' || !RUN_ID_OK.test(body.run_id))) return j({ error: 'INVALID_RUN_ID' }, 400);
        // a V2 reader always runs under DOSSIER_CANARY_V2 with its own registry, classifier and extractor; a V1 reader is untouched
        const runDeps = isV2Reader ? { ...deps, profile: DOSSIER_CANARY_V2, registry: DOSSIER_READER_REGISTRY_V2, classifier: eurostatRowClassifier, extractor: eurostatRowExtractor } : { ...deps, classifier: registryRecordClassifier, extractor: registryRecordExtractor };
        const out = await invokeCanary({ ...runDeps, createReader: createProductionReader }, { readerId: body.reader_id, operator, runId: body.run_id === undefined ? undefined : (body.run_id as string) });
        return j({ ok: out.status !== 'REFUSED', ...out }, out.status === 'REFUSED' ? 409 : 200);
      }
    }
    return j({ error: 'NOT_FOUND' }, 404);
  } catch (e) {
    // only our own typed errors carry an operator-safe message; anything else (driver/SQL text) is not echoed
    if (e instanceof DossierError) return j({ error: 'DOSSIER_CANARY_ERROR', message: e.message.slice(0, 300) }, 400);
    // migration 0031 not applied yet (expected before the approved migration): a clear refusal, never a 500 and never a mutation
    if (/no such table: dossier_/i.test(String((e as { message?: unknown })?.message ?? ''))) return j({ error: 'DOSSIER_SCHEMA_NOT_APPLIED' }, 409);
    return j({ error: 'DOSSIER_CANARY_ERROR', message: 'internal_error' }, 500);
  }
}
