// Temporal paths (V2): canonical vocabulary, validation and the lifecycle-owned registry of per-source path config.
//
// temporal_path = TIME_SENSITIVE | EVERGREEN. There is no third (HYBRID) class: a source that runs both paths has both
// path blocks enabled under ONE identity. The temporal path is a separate dimension from the semantic lane
// (Haber, Research, Duyuru, Burs, Eğitim); evergreen_view (health_reference | research_rediscovery) is a navigation view,
// not a lane; EVERGREEN_NEW / EVERGREEN_REDISCOVERY are discovery modes inside the EVERGREEN path, not temporal classes.
//
// Owner: scripts/source-lifecycle.mjs (inspect shows it, `recalibrate --temporal` writes it through store.writeCanonicalFiles).
// The Worker imports the registry read-only at build time; the evergreen runner only receives a plan derived from it.

export const TEMPORAL_REGISTRY_FILE = 'packages/source-catalog/data/temporal-paths.json';
export const TEMPORAL_POLICY_VERSION = 'temporal-v2';

export const TEMPORAL_PATHS = Object.freeze(['TIME_SENSITIVE', 'EVERGREEN']);
export const SEMANTIC_LANES = Object.freeze(['Haber', 'Research', 'Duyuru', 'Burs', 'Eğitim']);
export const EVERGREEN_VIEWS = Object.freeze(['health_reference', 'research_rediscovery']);
export const DISCOVERY_MODES = Object.freeze(['EVERGREEN_NEW', 'EVERGREEN_REDISCOVERY']);
export const UNKNOWN = 'UNKNOWN';
export const UNCLASSIFIED = 'UNCLASSIFIED';

/** Path activation: CANARY_ONLY = evaluated and dry-run admitted, never written; ACTIVE = written through the ingest path. */
export const PATH_ACTIVATIONS = Object.freeze(['DISABLED', 'CANARY_ONLY', 'ACTIVE']);

/** Soft daily bands (owner contract). A target outside its band is a warning, never silently clamped. */
export const EVERGREEN_TIERS = Object.freeze({
  SMALL: { target: [1, 2], evaluated: [10, 20] },
  MEDIUM: { target: [2, 4], evaluated: [20, 40] },
  LARGE: { target: [3, 5], evaluated: [40, 80] },
  FAMILY_POOL: { target: [10, 20], evaluated: [40, 100] },
});
export const SIGNAL_STRATEGIES = Object.freeze(['DIRECT_SIGNAL', 'INDIRECT_SIGNAL', 'EDITORIAL_RELEVANCE', 'CONTROLLED_EXPLORATION']);
/** Enrichment/signal providers, never content sources. A provider that answers nothing yields UNKNOWN, never 0. */
export const SIGNAL_PROVIDERS = Object.freeze(['icite', 'europepmc', 'crossref', 'openalex']);
export const ARCHIVE_KINDS = Object.freeze(['sitemap', 'wp_feed', 'europepmc', 'pubmed']);

/** Identity store -> semantic lane. The lane comes from the canonical identity, never from temporal config. */
export function semanticLaneForIdentity({ store, lane, heading, route }) {
  if (store === 'tip_toplulugu' || lane === 'tip_toplulugu') {
    return heading === 'BURS' ? 'Burs' : heading === 'EGITIM' ? 'Eğitim' : heading === 'DUYURU' ? 'Duyuru' : UNCLASSIFIED;
  }
  const r = route || lane;
  if (r === 'kaduse-news') return 'Haber';
  if (r === 'kaduse-research') return 'Research';
  return UNCLASSIFIED;
}

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const inRange = (v, lo, hi) => isInt(v) && v >= lo && v <= hi;
const httpsUrl = (v) => {
  try {
    return new URL(String(v)).protocol === 'https:';
  } catch {
    return false;
  }
};

function validateArchive(a, i, errors) {
  const at = `evergreen.archives[${i}]`;
  if (!a || typeof a !== 'object') return errors.push(`${at}:not_object`);
  if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(a.id)) errors.push(`${at}.id_invalid`);
  if (!ARCHIVE_KINDS.includes(a.kind)) return errors.push(`${at}.kind_invalid`);
  if (a.kind === 'sitemap') {
    if (!Array.isArray(a.urls) || !a.urls.length || !a.urls.every(httpsUrl)) errors.push(`${at}.urls_invalid`);
    if (typeof a.path_filter !== 'string') errors.push(`${at}.path_filter_missing`);
  }
  if (a.kind === 'wp_feed') {
    if (!httpsUrl(a.url)) errors.push(`${at}.url_invalid`);
    if (!inRange(a.max_pages_per_run, 1, 6)) errors.push(`${at}.max_pages_per_run_invalid`);
  }
  if (a.kind === 'europepmc') {
    if (typeof a.query !== 'string' || !a.query.trim()) errors.push(`${at}.query_missing`);
    if (typeof a.doi_prefix !== 'string' || !/^10\.\d{4,9}\//.test(a.doi_prefix)) errors.push(`${at}.doi_prefix_invalid`);
    if (typeof a.publisher !== 'string' || !a.publisher.trim()) errors.push(`${at}.publisher_missing`);
    if (a.discovery_proxy !== 'europepmc') errors.push(`${at}.discovery_proxy_must_be_europepmc`);
  }
  if (a.kind === 'pubmed') {
    // PubMed records through the Europe PMC search API (SRC:MED); the query bounds the scan, never the whole index.
    if (typeof a.query !== 'string' || !/\bSRC:MED\b/.test(a.query)) errors.push(`${at}.query_must_restrict_to_SRC:MED`);
    if (typeof a.publisher !== 'string' || !a.publisher.trim()) errors.push(`${at}.publisher_missing`);
    if (a.discovery_proxy !== 'europepmc') errors.push(`${at}.discovery_proxy_must_be_europepmc`);
  }
}

/**
 * Validate one registry entry. Returns { ok, errors, warnings, entry } where `entry` is normalised:
 * a missing or unrecognised evergreen_view becomes UNCLASSIFIED (and blocks writes), never a guessed view.
 */
export function validateTemporalEntry(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['entry_not_object'], warnings, entry: null };
  const e = JSON.parse(JSON.stringify(raw));
  if ('temporal_path' in e || 'hybrid' in e || 'HYBRID' in e || 'both' in e) errors.push('no_hybrid_class: a source carries one block per path (time_sensitive, evergreen), never a combined class');
  const pathKeys = Object.keys(e).filter((k) => /path/i.test(k) && k !== 'feed_id');
  if (pathKeys.length) errors.push(`unknown_path_keys:${pathKeys.join(',')}`);
  if (typeof e.source_id !== 'string' || !e.source_id) errors.push('source_id_missing');
  if (!['kaduse-news', 'kaduse-research', 'kaduse-d1-feed', 'tip_toplulugu'].includes(e.identity_store)) errors.push('identity_store_invalid');
  if (!SEMANTIC_LANES.includes(e.semantic_lane) && e.semantic_lane !== UNCLASSIFIED) errors.push('semantic_lane_invalid');
  if (e.identity_store !== 'tip_toplulugu' && (typeof e.feed_id !== 'string' || !e.feed_id)) errors.push('feed_id_missing');

  const ts = e.time_sensitive;
  if (!ts || typeof ts !== 'object' || typeof ts.enabled !== 'boolean') errors.push('time_sensitive.enabled_missing');

  const eg = e.evergreen;
  if (!eg || typeof eg !== 'object' || typeof eg.enabled !== 'boolean') {
    errors.push('evergreen.enabled_missing');
  } else if (eg.enabled) {
    if (!PATH_ACTIVATIONS.includes(eg.activation)) errors.push('evergreen.activation_invalid');
    if (!EVERGREEN_VIEWS.includes(eg.evergreen_view)) {
      if (eg.evergreen_view !== undefined && eg.evergreen_view !== UNCLASSIFIED) warnings.push(`evergreen_view_unrecognised:${String(eg.evergreen_view).slice(0, 40)}`);
      eg.evergreen_view = UNCLASSIFIED;
    }
    if (!(eg.tier in EVERGREEN_TIERS)) errors.push('evergreen.tier_invalid');
    if (eg.family !== null && (typeof eg.family !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(eg.family))) errors.push('evergreen.family_invalid');
    if (!inRange(eg.daily_target, 0, 20)) errors.push('evergreen.daily_target_invalid');
    if (!inRange(eg.max_items_evaluated_per_cycle, 1, 100)) errors.push('evergreen.max_items_evaluated_per_cycle_invalid');
    if (!inRange(eg.rediscovery_cadence_hours, 24, 720)) errors.push('evergreen.rediscovery_cadence_hours_invalid');
    if (!inRange(eg.deep_archive_cadence_hours, 24, 2160)) errors.push('evergreen.deep_archive_cadence_hours_invalid');
    if (!inRange(eg.cooldown_days, 1, 730)) errors.push('evergreen.cooldown_days_invalid');
    if (!SIGNAL_STRATEGIES.includes(eg.importance_signal_strategy)) errors.push('evergreen.importance_signal_strategy_invalid');
    if (!Array.isArray(eg.signal_providers) || !eg.signal_providers.every((p) => SIGNAL_PROVIDERS.includes(p))) errors.push('evergreen.signal_providers_invalid');
    if (!Array.isArray(eg.archives) || !eg.archives.length) errors.push('evergreen.archives_missing');
    else {
      eg.archives.forEach((a, i) => validateArchive(a, i, errors));
      const ids = eg.archives.map((a) => a?.id);
      if (new Set(ids).size !== ids.length) errors.push('evergreen.archive_ids_not_unique');
    }
    if (!errors.length) {
      const band = EVERGREEN_TIERS[eg.tier];
      if (eg.daily_target < band.target[0] || eg.daily_target > band.target[1]) warnings.push(`target_${eg.daily_target}_outside_${eg.tier}_band_${band.target[0]}-${band.target[1]}`);
      if (eg.max_items_evaluated_per_cycle < band.evaluated[0] || eg.max_items_evaluated_per_cycle > band.evaluated[1]) warnings.push(`evaluated_${eg.max_items_evaluated_per_cycle}_outside_${eg.tier}_band`);
      if (eg.evergreen_view === UNCLASSIFIED) warnings.push('evergreen_view_UNCLASSIFIED: writes blocked until classified');
    }
  }
  return { ok: errors.length === 0, errors, warnings, entry: errors.length ? null : e };
}

/** Whole registry: valid entries, unique source ids and unique feed ids (one identity, one entry). */
export function validateTemporalRegistry(doc) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.sources)) return { ok: false, errors: ['registry_shape_invalid'], warnings, entries: [] };
  const entries = [];
  const seenSource = new Set();
  const seenFeed = new Set();
  for (const raw of doc.sources) {
    const v = validateTemporalEntry(raw);
    if (!v.ok) {
      errors.push(`${raw?.source_id ?? '?'}: ${v.errors.join(', ')}`);
      continue;
    }
    warnings.push(...v.warnings.map((w) => `${v.entry.source_id}: ${w}`));
    // A second claim on an identity is refused and never reaches the entries the Worker reads.
    if (seenSource.has(v.entry.source_id)) {
      errors.push(`${v.entry.source_id}: duplicate_source_identity`);
      continue;
    }
    if (v.entry.feed_id && seenFeed.has(v.entry.feed_id)) {
      errors.push(`${v.entry.source_id}: feed_id_claimed_twice:${v.entry.feed_id}`);
      continue;
    }
    seenSource.add(v.entry.source_id);
    if (v.entry.feed_id) seenFeed.add(v.entry.feed_id);
    entries.push(v.entry);
  }
  return { ok: errors.length === 0, errors, warnings, entries };
}

/** Effective per-path state of one entry. A source without an entry keeps its legacy single (time-sensitive) path. */
export function effectivePaths(entry, { identityActive = true } = {}) {
  if (!entry) return { configured: false, time_sensitive: { enabled: true, effective: identityActive }, evergreen: { enabled: false, effective: 'DISABLED' } };
  const eg = entry.evergreen || {};
  return {
    configured: true,
    time_sensitive: { enabled: entry.time_sensitive.enabled, effective: identityActive && entry.time_sensitive.enabled },
    evergreen: { enabled: eg.enabled === true, effective: !identityActive || eg.enabled !== true ? 'DISABLED' : eg.activation },
  };
}
