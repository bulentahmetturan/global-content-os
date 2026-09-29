// Auth headers for operator scripts calling gated GCOS Worker routes (mirror of apps/worker/src/route-auth.ts;
// route-auth.test.mjs asserts the two tables agree). Tokens come from the environment and are never printed.

export const SECRET_BY_PATH = Object.freeze({
  '/api/ingress/news': 'HUB_OPERATOR_TOKEN',
  '/api/ingress/research': 'HUB_OPERATOR_TOKEN',
  '/api/ingress/generic': 'HUB_OPERATOR_TOKEN',
  '/api/ingress/journal-fallback': 'HUB_OPERATOR_TOKEN',
  '/api/enrich': 'HUB_OPERATOR_TOKEN',
  '/api/localize': 'HUB_OPERATOR_TOKEN',
  '/api/localize/apply': 'HUB_OPERATOR_TOKEN',
  '/api/cron/run': 'OPS_TOKEN',
  '/api/purge/trash': 'OPS_TOKEN',
  '/api/expire/stale-inbox': 'OPS_TOKEN',
  '/api/source-health/low-yield': 'OPS_TOKEN',
  '/api/source-revalidation/run': 'OPS_TOKEN',
  '/api/ingress/feed-items': 'TIP_RADAR_INGEST_TOKEN',
});

const warned = new Set();

/** Headers for a POST to `path` (query string allowed). Missing env token: warns once, the Worker answers 401/503. */
export function hubAuthHeaders(path, env = process.env) {
  const secret = SECRET_BY_PATH[String(path).split('?')[0]];
  if (!secret) return {};
  const token = (env[secret] || '').trim();
  if (!token) {
    if (!warned.has(secret)) {
      warned.add(secret);
      console.warn(`[hub-auth] ${secret} is not set; ${path} will be rejected by the Worker (401/503).`);
    }
    return {};
  }
  return secret === 'TIP_RADAR_INGEST_TOKEN' ? { 'X-Ingest-Token': token } : { Authorization: `Bearer ${token}` };
}
