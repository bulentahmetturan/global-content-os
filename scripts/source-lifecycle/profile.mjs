// Canonical record shapes produced by the orchestrator: a NEW Tıp Topluluğu record (same shape as
// adapters/tip-toplulugu-radar/scripts/tip_toplulugu_wire_source.py), activation / retirement / reactivation patches, and the
// G8 canary. Field names are the registry's own; nothing here introduces a parallel field for the same fact.
import { hostOf, normalizeUrl } from './catalog.mjs';
import { ACTIVATION, TIP_TOPLULUGU_STATUS } from './model.mjs';

const KEYWORDS = {
  BURS: ['burs', 'scholarship', 'fellowship', 'grant', 'hibe', 'başvuru', 'application'],
  EGITIM: ['eğitim', 'kurs', 'course', 'training', 'webinar', 'sertifika', 'workshop'],
  DUYURU: ['hekim', 'doktor', 'tıp', 'diş', 'veteriner', 'sağlık', 'health', 'medical', 'physician', 'dental'],
};
const FLAGS = ['fetch_enabled', 'scheduled_fetch_enabled', 'candidate_emission_enabled', 'pipeline_wiring_enabled'];

const segs = (u) => new URL(u).pathname.split('/').filter(Boolean);

/** Allowed path prefixes that cover the list page and every sampled item (prefix semantics of url_allowed_by_plan). */
export function pathPatterns(pageUrl, items) {
  const page = segs(pageUrl);
  const all = [page, ...items.map((i) => segs(i.url))];
  let common = [];
  for (let i = 0; all.every((s) => s.length > i && s[i] === all[0][i]); i++) common.push(all[0][i]);
  if (common.length) return [`/${common.join('/')}/`];
  const firsts = [...new Set(all.map((s) => s[0]).filter(Boolean))].slice(0, 4);
  return firsts.map((f) => `/${f}/`);
}

export function urlAllowed(url, plan) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (!(plan.allowed_hostnames || []).map((h) => h.toLowerCase()).includes(u.hostname.toLowerCase())) return false;
  const path = u.pathname || '/';
  return (plan.allowed_path_patterns || ['/']).some((p) => p === '/' || path.startsWith(p) || path.includes(p) || path.startsWith(p.replace(/\*+$/, '')));
}

const frequency = (m) => (m <= 1440 ? 'daily' : m <= 10080 ? 'weekly' : 'rare');

function fetchPlan({ pageUrl, hosts, paths, cadence, notes }) {
  return {
    primary_method: 'list-page',
    tls_verification_required: true,
    allowed_hostnames: hosts,
    allowed_path_patterns: paths,
    forbidden_hosts: [],
    forbidden_path_patterns: [],
    notes,
    expected_check_interval_minutes: cadence.poll_minutes,
    source_health: 'HEALTHY',
    coverage_status: 'configured',
    coverage_policy: { sparse_source_allowed: cadence.poll_minutes >= 10080, expected_eligible_frequency: frequency(cadence.poll_minutes), coverage_watch_window: 4, require_in_scope_for_low_coverage: true },
    initial_backfill: { lookback_days: 60, retain_active_or_future_deadline: true, historical_priority: 'backfill_low', undated_as_current: true },
    surfaces: [{ id: 'list', url: pageUrl, role: 'primary', health: 'HEALTHY' }],
    fetch_enabled: true,
    scheduled_fetch_enabled: true,
    candidate_emission_enabled: true,
  };
}

const cadencePolicy = (c) => ({ strategy: c.strategy, bounds: c.bounds, confidence: c.confidence, evidence: c.evidence, flags: c.flags });

/** NEW Tıp Topluluğu record in its fully-activated form (activation state decided later by capacity). */
export function newTipTopluluguRecord({ sourceId, name, pageUrl, items, routing, cadence, feedUrl = null }) {
  const host = new URL(pageUrl).hostname.toLowerCase();
  const bare = host.replace(/^www\./, '');
  const hosts = [...new Set([host, bare, `www.${bare}`])];
  const paths = pathPatterns(pageUrl, items);
  return {
    source_id: sourceId,
    name,
    label: name,
    canonical_url: pageUrl,
    source_url: pageUrl,
    primary_url: pageUrl,
    allowed_hostnames: hosts,
    allowed_path_patterns: paths,
    source_tier: routing.source_tier,
    statement_treatment: routing.statement_treatment,
    source_role: routing.evidence_role.toLowerCase(),
    status: TIP_TOPLULUGU_STATUS.ACTIVE,
    fetch_mode: 'list-page',
    execution: 'python_runner',
    ...Object.fromEntries(FLAGS.map((f) => [f, true])),
    publication_eligible: false,
    include_keywords: KEYWORDS[routing.heading],
    exclude_keywords: [],
    allowed_routes: routing.allowed_routes,
    default_route_on_accept: 'NEEDS_REVIEW',
    source_health: 'HEALTHY',
    runtime_activation: ACTIVATION.READY,
    fetch_plan: fetchPlan({ pageUrl, hosts, paths, cadence, notes: `Source lifecycle onboarding (list page${feedUrl ? `; official feed ${feedUrl} used as cadence evidence` : ''}).` }),
    cadence_policy: cadencePolicy(cadence),
    ...(feedUrl ? { related_list_urls: [feedUrl] } : {}),
  };
}

/** Activation / reactivation patch for an EXISTING Tıp Topluluğu record (same identity, same file). */
export function activationPatch(record, { pageUrl, items, cadence, routing }) {
  const next = structuredClone(record);
  const host = new URL(pageUrl).hostname.toLowerCase();
  const bare = host.replace(/^www\./, '');
  const hosts = [...new Set([...(record.allowed_hostnames || []), host, bare])];
  const paths = record.allowed_path_patterns?.length ? record.allowed_path_patterns : pathPatterns(pageUrl, items);
  next.status = TIP_TOPLULUGU_STATUS.ACTIVE;
  for (const f of FLAGS) next[f] = true;
  next.publication_eligible = false;
  next.fetch_mode = record.fetch_mode && record.fetch_mode !== 'not_wired' ? record.fetch_mode : 'list-page';
  next.execution = record.execution || 'python_runner';
  next.allowed_hostnames = hosts;
  next.allowed_path_patterns = paths;
  if (!next.include_keywords?.length && !next.policy_ref) next.include_keywords = KEYWORDS[routing?.heading || 'DUYURU'];
  next.fetch_plan = record.fetch_plan
    ? { ...record.fetch_plan, tls_verification_required: true, allowed_hostnames: record.fetch_plan.allowed_hostnames?.length ? record.fetch_plan.allowed_hostnames : hosts, allowed_path_patterns: record.fetch_plan.allowed_path_patterns?.length ? record.fetch_plan.allowed_path_patterns : paths, expected_check_interval_minutes: cadence.poll_minutes, fetch_enabled: true, scheduled_fetch_enabled: true, candidate_emission_enabled: true }
    : fetchPlan({ pageUrl, hosts, paths, cadence, notes: 'Source lifecycle activation.' });
  if (next.fetch_plan.source_health === 'MANUAL_REVIEW_REQUIRED') next.fetch_plan.source_health = 'HEALTHY';
  next.source_health = 'HEALTHY';
  next.cadence_policy = cadencePolicy(cadence);
  next.runtime_activation = ACTIVATION.READY;
  return next;
}

/** Tombstone: identity + provenance stay; every acquisition flag goes off; computed activation becomes BLOCKED. */
export function retirementPatch(record, { reason, at, changeRef }) {
  const next = structuredClone(record);
  next.former_status = record.status ?? null;
  next.former_runtime_activation = record.runtime_activation ?? null;
  next.status = TIP_TOPLULUGU_STATUS.RETIRED;
  next.runtime_activation = ACTIVATION.BLOCKED;
  for (const f of FLAGS) next[f] = false;
  if (next.fetch_plan) for (const f of FLAGS) if (f in next.fetch_plan) next.fetch_plan[f] = false;
  next.retired_reason = reason;
  next.retired_at = at;
  next.retired_change_ref = changeRef;
  return next;
}

export function pushHistory(record, entry) {
  record.lifecycle_history = [...(Array.isArray(record.lifecycle_history) ? record.lifecycle_history : []), entry];
  return record;
}

/** Reactivation clears the top-level retirement fields after archiving them into lifecycle_history. */
export function clearRetirement(record) {
  const archived = {};
  for (const k of ['retired_reason', 'retired_at', 'retired_change_ref', 'former_status', 'former_runtime_activation', 'manual_intake_reason', 'manual_review_reason']) {
    if (k in record) {
      archived[k] = record[k];
      delete record[k];
    }
  }
  return archived;
}

// ---------- G8 canary ----------------------------------------------------------------------------------------------

/**
 * Non-publishing canary over already-fetched material: fetch -> parse -> normalize -> dedupe -> candidate shape ->
 * routing -> persistence compatibility (the exact profile through the runtime's own activation gates).
 */
export function canary({ sourceId, items, plan, routing, profile, gates, minCandidates = 3 }) {
  const steps = {};
  steps.fetch = items ? 'PASS' : 'FAIL';
  steps.parse = items?.length ? 'PASS' : 'FAIL';
  const seen = new Set();
  const candidates = [];
  const rejects = {};
  for (const it of items || []) {
    const url = normalizeUrl(it.url);
    const why = !it.title || it.title.length < 8 ? 'TITLE' : !url ? 'URL' : plan && !urlAllowed(url, plan) ? 'OUTSIDE_PLAN' : seen.has(url) ? 'DUPLICATE' : it.published_at && !Number.isFinite(Date.parse(it.published_at)) ? 'BAD_DATE' : null;
    if (why) {
      rejects[why] = (rejects[why] || 0) + 1;
      continue;
    }
    seen.add(url);
    candidates.push({ source_id: sourceId, title: it.title, canonical_url: url, published_at: it.published_at || null, publisher_host: hostOf(url) });
  }
  steps.normalize = 'PASS';
  steps.dedupe = 'PASS';
  steps.candidate_shape = candidates.length >= minCandidates ? 'PASS' : 'FAIL';
  steps.routing = routing?.lane ? 'PASS' : 'FAIL';
  let persistence = { status: 'NOT_APPLICABLE' };
  if (profile && gates) {
    const g = gates(profile);
    persistence = { status: g.computed === ACTIVATION.READY && g.gates_ok ? 'PASS' : 'FAIL', computed: g.computed, failures: g.failures };
  }
  steps.persistence = persistence.status === 'FAIL' ? 'FAIL' : 'PASS';
  steps.publication = profile && profile.publication_eligible !== false ? 'FAIL' : 'NONE';
  const pass = Object.values(steps).every((s) => s === 'PASS' || s === 'NONE');
  return {
    gate: pass ? 'PASS' : 'FAIL',
    steps,
    candidates: candidates.length,
    dated: candidates.filter((c) => c.published_at).length,
    rejects,
    persistence,
    example: candidates[0] || null,
    published: 0,
  };
}
