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
  'POST /api/localize/canary': HUB,
  'POST /api/localize/feedback': HUB,
  'POST /api/localize/review': HUB,
  'POST /api/cron/run': OPS,
  'POST /api/purge/trash': OPS,
  'POST /api/expire/stale-inbox': OPS,
  'POST /api/source-health/low-yield': OPS,
  'POST /api/source-revalidation/run': OPS,
  'POST /api/ingress/feed-items': INGEST,
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
