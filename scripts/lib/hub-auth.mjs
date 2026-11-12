// Auth headers for operator scripts calling gated GCOS Worker routes (mirror of apps/worker/src/route-auth.ts;
// route-auth.test.mjs asserts the two tables agree). Tokens come from the environment and are never printed.

export const SECRET_BY_PATH = Object.freeze({
  '/api/ingress/news': 'HUB_OPERATOR_TOKEN',
  '/api/ingress/research': 'HUB_OPERATOR_TOKEN',
  '/api/ingress/generic': 'HUB_OPERATOR_TOKEN',
  '/api/ingress/tip-toplulugu-run': 'HUB_OPERATOR_TOKEN',
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
  '/api/evergreen/plan': 'TIP_RADAR_INGEST_TOKEN',
  '/api/ingress/evergreen-items': 'TIP_RADAR_INGEST_TOKEN',
  '/api/ops/doctor-activation': 'OPS_TOKEN',
  '/api/ops/doctor-audit': 'OPS_TOKEN',
  '/api/ops/doctor-bootstrap': 'OPS_TOKEN',
  '/api/ops/doctor-fetch': 'OPS_TOKEN',
  '/api/ops/doctor-onboarding': 'OPS_TOKEN',
  '/api/ops/doctor-readiness': 'OPS_TOKEN',
  '/api/health/watch': 'HUB_OPERATOR_TOKEN',
  '/api/hub/modules': 'HUB_OPERATOR_TOKEN',
  '/api/ratings': 'HUB_OPERATOR_TOKEN',
  '/api/ratings/latest': 'HUB_OPERATOR_TOKEN',
  '/api/wow/introduce': 'HUB_OPERATOR_TOKEN',
  '/api/wow/introduced': 'HUB_OPERATOR_TOKEN',
  '/api/wow/memory': 'HUB_OPERATOR_TOKEN',
  '/api/wow/candidates': 'HUB_OPERATOR_TOKEN',
  '/api/wow/insight': 'HUB_OPERATOR_TOKEN',
  '/api/wow/extraction': 'HUB_OPERATOR_TOKEN',
  '/api/wow/narrow-topic': 'HUB_OPERATOR_TOKEN',
  '/api/wow/extract': 'HUB_OPERATOR_TOKEN',
  '/api/wow/feedback': 'HUB_OPERATOR_TOKEN',
  '/api/wow/query': 'HUB_OPERATOR_TOKEN',
  '/api/wow/authority': 'HUB_OPERATOR_TOKEN',
  '/api/wow/questions': 'HUB_OPERATOR_TOKEN',
  '/api/wow/similar': 'HUB_OPERATOR_TOKEN',
  '/api/wow/sources': 'HUB_OPERATOR_TOKEN',
  '/api/topics/summary': 'HUB_OPERATOR_TOKEN',
  '/api/topics/items': 'HUB_OPERATOR_TOKEN',
  '/api/topics/questions': 'HUB_OPERATOR_TOKEN',
  '/api/topics/clarity': 'HUB_OPERATOR_TOKEN',
  '/api/topics/labels': 'HUB_OPERATOR_TOKEN',
  '/api/scoring/run': 'HUB_OPERATOR_TOKEN',
  '/api/scores/latest': 'HUB_OPERATOR_TOKEN',
  '/api/scoring/status': 'HUB_OPERATOR_TOKEN',
  '/api/lane/move': 'HUB_OPERATOR_TOKEN',
  '/api/rediscovery/promote': 'HUB_OPERATOR_TOKEN',
  '/api/lane/suggestions': 'HUB_OPERATOR_TOKEN',
});

export const AGENT_PATHS = new Set(['/api/wow/introduce', '/api/wow/memory', '/api/wow/extract']);
const warned = new Set();

/** Headers for a POST to `path` (query string allowed). Missing env token: warns once, the Worker answers 401/503. */
export function hubAuthHeaders(path, env = process.env) {
  const p = String(path).split('?')[0];
  // The agent key, when present, is used on the three routes that accept it (route-auth.ts HUB_OR_AGENT).
  if (AGENT_PATHS.has(p) && (env.AGENT_WOW_TOKEN || '').trim()) return { Authorization: `Bearer ${env.AGENT_WOW_TOKEN.trim()}` };
  const secret = SECRET_BY_PATH[p];
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
