// Operator surface of the DOSSIER canary (the ONLY place the Worker touches ./dossier). Not public, not scheduled, not run on deploy.
//
// Every route needs the OPS_TOKEN bearer (unset = 503, mismatch = 401), exactly like /api/ops/summary. A run additionally needs the
// environment master switch DOSSIER_CANARY_ENABLED=true and the operator controls (all absent = OFF), and executes ONE bounded invocation
// of the shared canary runner; the operator calls it again until the run reports COMPLETED. There is no cron path to any of this.
import type { Env } from './db/queries';
import { authorizeToken, bearerToken } from './handoff-security';
import { registryRecordClassifier, registryRecordExtractor, createClinicalTrialsReader } from './dossier/clinicaltrials';
import { createOecdHealthReader } from './dossier/oecd';
import { DOSSIER_CANARY_V1, validateCanaryProfile, type DossierCanaryProfile } from './dossier/canary-profile';
import { createBudgetedD1, DOSSIER_READER_REGISTRY, setControl, type DossierReaderRegistration } from './dossier/canary-control';
import { invokeCanary } from './dossier/canary';
import { candidateSummary, canaryStatus, errorSummary, runHistory, watchSummary } from './dossier/canary-inspect';
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

export function createProductionReader(reg: DossierReaderRegistration): Connector {
  if (reg.canonical_source_id === 'clinicaltrials-gov-api-v2') return createClinicalTrialsReader({ fetchImpl: guardedFetch('clinicaltrials.gov', '/api/v2/studies'), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }) as unknown as Connector;
  if (reg.canonical_source_id === 'oecd-health') return createOecdHealthReader({ fetchImpl: guardedFetch('sdmx.oecd.org', '/public/rest/data/'), readerId: reg.dossier_reader_id, legalStatus: reg.legal_status }) as unknown as Connector;
  throw new DossierError('reader_not_available_in_canary', reg.canonical_source_id);
}

const num = (v: string | null): number | undefined => (v && /^\d{1,3}$/.test(v) ? Number(v) : undefined);

/** Returns a Response for /api/dossier/canary/* or null when the path is not ours. */
export async function handleDossierCanary(request: Request, env: Env, path: string, opts: { profile?: DossierCanaryProfile } = {}): Promise<Response | null> {
  const profile = opts.profile ?? DOSSIER_CANARY_V1;
  if (!path.startsWith('/api/dossier/canary/')) return null;
  const auth = authorizeToken(env.OPS_TOKEN, bearerToken(request.headers.get('Authorization')), 'OPS_TOKEN_NOT_CONFIGURED');
  if (!auth.ok) return j({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const deps = { db: env.DB as never, profile, env: { DOSSIER_CANARY_ENABLED: env.DOSSIER_CANARY_ENABLED } };
  // read-only inspection is bounded by the same per-invocation D1 statement budget as a run (a refused statement is an error, never an overrun)
  const readDeps = { ...deps, db: createBudgetedD1(env.DB as never, profile.runtime.d1_statements_per_invocation.value).db };
  const sub = path.slice('/api/dossier/canary/'.length);
  try {
    if (request.method === 'GET') {
      if (sub === 'status') return j({ ok: true, ...(await canaryStatus(readDeps)) });
      if (sub === 'runs') return j({ ok: true, runs: await runHistory(readDeps, { readerId: url.searchParams.get('reader') ?? undefined, limit: num(url.searchParams.get('limit')) }) });
      if (sub === 'watch') return j({ ok: true, ...(await watchSummary(readDeps, { limit: num(url.searchParams.get('limit')), after: url.searchParams.get('after') ?? undefined })) });
      if (sub === 'candidates') return j({ ok: true, candidates: await candidateSummary(readDeps, { limit: num(url.searchParams.get('limit')) }) });
      if (sub === 'errors') return j({ ok: true, ...(await errorSummary(readDeps, { limit: num(url.searchParams.get('limit')) })) });
      if (sub === 'readiness') return j({ ok: true, readiness: await gatherDossierReadiness(env.DB as never, { environment: env.ENVIRONMENT === 'production' ? 'LIVE' : 'LOCAL', envMasterSwitch: env.DOSSIER_CANARY_ENABLED === 'true', profile }), profile_errors: validateCanaryProfile(profile) });
    }
    if (request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { reader_id?: unknown; run_id?: unknown; key?: unknown; value?: unknown; operator?: unknown } | null;
      const operator = typeof body?.operator === 'string' ? body.operator.trim() : '';
      if (!operator || operator.length > 80) return j({ error: 'OPERATOR_REQUIRED' }, 400);
      if (sub === 'control') {
        if (typeof body?.key !== 'string' || typeof body?.value !== 'string') return j({ error: 'INVALID_BODY' }, 400);
        await setControl(env.DB as never, { key: body.key, value: body.value, updatedBy: operator, now: new Date().toISOString() });
        return j({ ok: true, key: body.key, value: body.value, updated_by: operator });
      }
      if (sub === 'run') {
        if (typeof body?.reader_id !== 'string' || !DOSSIER_READER_REGISTRY.some((r) => r.dossier_reader_id === body.reader_id)) return j({ error: 'READER_NOT_REGISTERED' }, 400);
        const out = await invokeCanary({ ...deps, createReader: createProductionReader, classifier: registryRecordClassifier, extractor: registryRecordExtractor }, { readerId: body.reader_id, operator, runId: typeof body.run_id === 'string' ? body.run_id : undefined });
        return j({ ok: out.status !== 'REFUSED', ...out }, out.status === 'REFUSED' ? 409 : 200);
      }
    }
    return j({ error: 'NOT_FOUND' }, 404);
  } catch (e) {
    return j({ error: 'DOSSIER_CANARY_ERROR', message: e instanceof Error ? e.message.slice(0, 300) : 'unknown' }, e instanceof DossierError ? 400 : 500);
  }
}
