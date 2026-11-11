import { authorizeToken, bearerToken, type AuthResult } from './handoff-security';

// Fail-closed gates for every state-changing HTTP route that has no inline auth of its own (E7, AUTH_FAIL_CLOSED).
// Scheduled (cron) jobs call the underlying functions directly and never pass through here.
// Inline-gated routes (/api/triage, /api/handoff/*, /api/ingress/tip, /api/ingress/tip_toplulugu-*, /api/ops/summary)
// keep their own checks; this table must not list them twice.

export type GateSecret = 'HUB_OPERATOR_TOKEN' | 'OPS_TOKEN' | 'TIP_RADAR_INGEST_TOKEN';

type GateSpec = { secret: GateSecret; header: 'authorization' | 'x-ingest-token'; notConfigured: string };

const HUB: GateSpec = { secret: 'HUB_OPERATOR_TOKEN', header: 'authorization', notConfigured: 'HUB_OPERATOR_TOKEN_NOT_CONFIGURED' };
const OPS: GateSpec = { secret: 'OPS_TOKEN', header: 'authorization', notConfigured: 'OPS_TOKEN_NOT_CONFIGURED' };
const INGEST: GateSpec = { secret: 'TIP_RADAR_INGEST_TOKEN', header: 'x-ingest-token', notConfigured: 'INGEST_TOKEN_NOT_CONFIGURED' };

/** Keyed by `${METHOD} ${path}`. Hub-triggered and operator content actions use the Hub operator token;
 * housekeeping mirrors of cron jobs use OPS_TOKEN; data-push ingress uses the ingest token. */
export const ROUTE_GATES: Readonly<Record<string, GateSpec>> = {
  'POST /api/ingress/news': HUB,
  'POST /api/ingress/research': HUB,
  'POST /api/ingress/generic': HUB,
  'POST /api/ingress/tip-toplulugu-run': HUB,
  'POST /api/ingress/journal-fallback': HUB,
  'POST /api/enrich': HUB,
  'POST /api/localize': HUB,
  'POST /api/localize/apply': HUB,
  'POST /api/cron/run': OPS,
  'POST /api/purge/trash': OPS,
  'POST /api/expire/stale-inbox': OPS,
  'POST /api/source-health/low-yield': OPS,
  'POST /api/source-revalidation/run': OPS,
  'POST /api/ingress/feed-items': INGEST,
  'POST /api/evergreen/plan': INGEST,
  'POST /api/ingress/evergreen-items': INGEST,
  'POST /api/ops/doctor-activation': OPS,
  'GET /api/ops/doctor-audit': OPS,
  'POST /api/ops/doctor-bootstrap': OPS,
  'POST /api/ops/doctor-fetch': OPS,
  'POST /api/ops/doctor-onboarding': OPS,
  'GET /api/ops/doctor-readiness': OPS,
  'GET /api/health/watch': HUB,
  'GET /api/hub/modules': HUB,
  'POST /api/ratings': HUB,
  'POST /api/wow/introduce': HUB,
  'GET /api/wow/introduced': HUB,
  'GET /api/wow/memory': HUB,
  'GET /api/wow/candidates': HUB,
  'POST /api/wow/extraction': HUB,
  'POST /api/wow/extract': HUB,
  'POST /api/wow/feedback': HUB,
  'POST /api/wow/query': HUB,
  'GET /api/wow/questions': HUB,
  'GET /api/wow/similar': HUB,
  'GET /api/wow/sources': HUB,
  'GET /api/topics/summary': HUB,
  'GET /api/topics/items': HUB,
  'GET /api/topics/questions': HUB,
  'GET /api/topics/clarity': HUB,
  'POST /api/topics/labels': HUB,
  'GET /api/ratings/latest': HUB,
  'POST /api/scoring/run': HUB,
  'GET /api/scores/latest': HUB,
  'GET /api/scoring/status': HUB,
  'POST /api/lane/move': HUB,
  'POST /api/rediscovery/promote': HUB,
  'GET /api/lane/suggestions': HUB,
};

/** null = route is not gated here (either read-only or gated inline). */
export function authorizeRoute(
  env: Partial<Record<GateSecret, string>>,
  request: Request,
  path: string
): AuthResult | null {
  const spec = ROUTE_GATES[`${request.method} ${path}`];
  if (!spec) return null;
  const raw = request.headers.get(spec.header);
  const presented = spec.header === 'authorization' ? bearerToken(raw) : raw;
  return authorizeToken(env[spec.secret], presented, spec.notConfigured);
}
