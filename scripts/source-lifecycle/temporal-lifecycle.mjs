// Lifecycle side of temporal paths: read the canonical registry, resolve the identity a temporal entry belongs to,
// and prepare (dry run) or write (authorized apply) one entry. Writes go only through store.writeCanonicalFiles.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPORAL_REGISTRY_FILE, validateTemporalEntry, validateTemporalRegistry, semanticLaneForIdentity, effectivePaths } from './temporal.mjs';
import { authorizeLifecycle, writeCanonicalFiles } from './store.mjs';

export function readTemporalRegistry(root) {
  const abs = join(root, TEMPORAL_REGISTRY_FILE);
  if (!existsSync(abs)) return { doc: { schemaVersion: '1.0.0', sources: [] }, eol: '\n', exists: false, stable: true };
  const raw = readFileSync(abs, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.split('\r\n').join('\n');
  const doc = JSON.parse(text);
  return { doc, eol, exists: true, stable: JSON.stringify(doc, null, 2) + '\n' === text };
}

export function temporalEntryFor(root, sourceId) {
  const { doc } = readTemporalRegistry(root);
  return (doc.sources || []).find((e) => e.source_id === sourceId) ?? null;
}

/**
 * Kaduse feed rows that exist only in D1 (declared by a migration, not by the catalog: e.g. the 0016 sitemap feeds).
 * The catalog cannot represent them yet (E86), so the lifecycle resolves them from the migration that created them.
 */
export function d1FeedIdentity(root, feedId) {
  if (!/^(news|research)-[a-z0-9-]+$/.test(String(feedId))) return null;
  let names = [];
  try {
    names = readdirSync(join(root, 'migrations')).filter((n) => n.endsWith('.sql')).sort();
  } catch {
    return null;
  }
  const esc = feedId.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const tuple = new RegExp(`\\(\\s*'${esc}'\\s*,\\s*'((?:[^']|'')*)'\\s*,\\s*'(kaduse-news|kaduse-research)'\\s*,\\s*'[^']*'\\s*,\\s*'[^']*'\\s*,\\s*(?:NULL|'[^']*')\\s*,\\s*\\d+\\s*,\\s*([01])`);
  let found = null;
  for (const n of names) {
    const sql = readFileSync(join(root, 'migrations', n), 'utf8');
    const m = tuple.exec(sql);
    if (m) found = { migration: n, label: m[1].replace(/''/g, "'"), route: m[2], enabled: m[3] === '1' };
    if (found && new RegExp(`UPDATE source_feeds SET enabled = 0 WHERE id = '${esc}'`).test(sql)) found = { ...found, enabled: false, disabled_by: n };
  }
  if (!found) return null;
  return {
    store: 'kaduse-d1-feed',
    lane: found.route,
    source_id: feedId,
    feed_id: feedId,
    name: found.label,
    urls: [],
    heading: found.route === 'kaduse-news' ? 'HABER' : 'RESEARCH',
    active: found.enabled,
    retired: !found.enabled,
    declared_in: `migrations/${found.migration}`,
  };
}

/** The identity facts a temporal entry derives (never accepted from the operator's patch). */
export function identityFacts(match) {
  const store = match.store === 'kaduse-d1-feed' ? 'kaduse-d1-feed' : match.store === 'tip_toplulugu' ? 'tip_toplulugu' : match.lane;
  return {
    source_id: match.source_id,
    identity_store: store,
    ...(store === 'tip_toplulugu' ? {} : { feed_id: match.feed_id }),
    semantic_lane: semanticLaneForIdentity({ store: match.store, lane: match.lane, heading: match.heading }),
  };
}

export function inspectTemporal(root, match) {
  const entry = temporalEntryFor(root, match.source_id);
  const v = entry ? validateTemporalEntry(entry) : null;
  return {
    registry: TEMPORAL_REGISTRY_FILE,
    semantic_lane: semanticLaneForIdentity({ store: match.store, lane: match.lane, heading: match.heading }),
    ...effectivePaths(v?.entry ?? null, { identityActive: !!match.active && !match.retired }),
    ...(entry ? { config: entry, validation: { ok: v.ok, errors: v.errors, warnings: v.warnings } } : {}),
  };
}

const IDENTITY_KEYS = ['source_id', 'identity_store', 'feed_id', 'semantic_lane'];

/**
 * Prepare one temporal change. `patch` may carry `time_sensitive` and `evergreen` only; identity keys are derived.
 * Returns { outcome: TEMPORAL_DRY_RUN | TEMPORAL_APPLIED | NO_CHANGE | INVALID_TEMPORAL_CONFIG | BASIS_REQUIRED | DENIED | REQUIRES_MANUAL_EDIT }.
 */
export function prepareTemporalChange({ root, match, patch, basis, apply = false, actor, authorize, now, requestId }) {
  if (!patch || typeof patch !== 'object') return { outcome: 'INVALID_TEMPORAL_CONFIG', errors: ['patch_not_object'] };
  const foreign = Object.keys(patch).filter((k) => !['time_sensitive', 'evergreen'].includes(k));
  if (foreign.length) return { outcome: 'INVALID_TEMPORAL_CONFIG', errors: [`not_operator_settable:${foreign.join(',')}`, ...(foreign.some((k) => IDENTITY_KEYS.includes(k)) ? ['identity_and_semantic_lane_are_derived_from_the_canonical_identity'] : [])] };
  if (!basis || !String(basis).trim()) return { outcome: 'BASIS_REQUIRED', reason: 'temporal config needs --basis "<evidence or owner decision>"' };
  const reg = readTemporalRegistry(root);
  const sources = reg.doc.sources || [];
  const idx = sources.findIndex((e) => e.source_id === match.source_id);
  const before = idx >= 0 ? sources[idx] : null;
  const next = {
    ...identityFacts(match),
    time_sensitive: patch.time_sensitive ?? before?.time_sensitive ?? { enabled: true },
    evergreen: patch.evergreen ?? before?.evergreen ?? { enabled: false },
  };
  const v = validateTemporalEntry(next);
  if (!v.ok) return { outcome: 'INVALID_TEMPORAL_CONFIG', errors: v.errors };
  const strip = (e) => (e ? JSON.stringify({ ...e, basis: undefined, updated_at: undefined, history: undefined }) : null);
  if (strip(before) === strip(v.entry)) return { outcome: 'NO_CHANGE', entry: before };
  const history = [...(before?.history || []), { op: 'recalibrate-temporal', request_id: requestId, at: now, by: actor?.id ?? null, basis: String(basis).trim().slice(0, 400) }].slice(-20);
  const stored = { ...v.entry, basis: String(basis).trim().slice(0, 400), updated_at: now, history };
  const nextSources = idx >= 0 ? sources.map((e, i) => (i === idx ? stored : e)) : [...sources, stored].sort((a, b) => a.source_id.localeCompare(b.source_id));
  const nextDoc = { ...reg.doc, sources: nextSources };
  const whole = validateTemporalRegistry(nextDoc);
  if (!whole.ok) return { outcome: 'INVALID_TEMPORAL_CONFIG', errors: whole.errors };
  const summary = { file: TEMPORAL_REGISTRY_FILE, before: before ? { time_sensitive: before.time_sensitive, evergreen: before.evergreen } : null, after: { time_sensitive: stored.time_sensitive, evergreen: stored.evergreen }, warnings: v.warnings };
  if (apply !== true) return { outcome: 'TEMPORAL_DRY_RUN', ...summary };
  const auth = authorizeLifecycle({ actor, authorize, op: 'recalibrate-temporal' });
  if (!auth.ok) return { outcome: 'DENIED', ...summary, ...auth };
  if (!reg.stable) return { outcome: 'REQUIRES_MANUAL_EDIT', ...summary, reason: 'temporal registry is not byte-stable under JSON round trip' };
  writeCanonicalFiles(root, [{ file: TEMPORAL_REGISTRY_FILE, text: (JSON.stringify(nextDoc, null, 2) + '\n').split('\n').join(reg.eol) }]);
  return {
    outcome: 'TEMPORAL_APPLIED',
    ...summary,
    review_gate: [`Review + commit: ${TEMPORAL_REGISTRY_FILE}`, 'The Worker reads this file at build time: the change takes effect only with a reviewed deploy.'],
  };
}
