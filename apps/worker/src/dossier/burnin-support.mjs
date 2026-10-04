// Test-only burn-in harness (never imported by runtime code): a fresh, fully deterministic local canary world on RECORDED REAL responses,
// a canonical (id-independent) digest of the durable dossier state, and a process-kill injector.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, setTestCapacity } from './test-support.mjs';

export const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'burn-profile');
export const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'burn-control');
export const CR = await bundle('apps/worker/src/dossier/canary.ts', 'burn-runner');
export const CI = await bundle('apps/worker/src/dossier/canary-inspect.ts', 'burn-inspect');
export const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'burn-ct');
export const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'burn-oecd');

export const CT_ID = 'dossier-clinicaltrials-frontier';
export const OE_ID = 'dossier-oecd-turkiye-mortality';
const rec = (f) => JSON.parse(readFileSync(`apps/worker/src/dossier/recorded/${f}`, 'utf8')).response;
export const FIXTURES = {
  ct100: rec('clinicaltrials-page100.json'),
  ctOverlap: rec('clinicaltrials-neoplasms-overlap.json'),
  ct8: rec('clinicaltrials-roles-page.json'),
  oecd48: rec('oecd-health-mortality-tur.json'),
};
// TEST_ONLY: as if an operator had verified the OECD terms. The checked-in registry keeps OECD blocked; this exists only in tests.
export const TEST_REGISTRY = CC.DOSSIER_READER_REGISTRY.map((r) => (r.canonical_source_id === 'oecd-health' ? { ...r, legal_status: 'APPROVED', usage_terms: 'VERIFIED', rate_guidance: 'NOT_PUBLISHED', blocker: null } : r));

const ok = (b) => async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(b)) });

/** A fresh deterministic world. `fail` maps a reader to a fetch implementation that fails (failure injection). */
export async function freshWorld({ ct = FIXTURES.ct100, oecd = FIXTURES.oecd48, readers = [CT_ID, OE_ID], profile = PF.DOSSIER_CANARY_V1, capacity = true, promotion = true, fetchOverride = {}, registry = TEST_REGISTRY } = {}) {
  const { sqlite, db } = openDossierDb();
  const ctx = makeCtx();
  const calls = { ct: 0, oecd: 0 };
  const set = (key, value) => CC.setControl(db, { key, value, updatedBy: 'burnin-operator', now: '2026-10-03T00:00:00.000Z' });
  await set(CC.CONTROL_CANARY, '1');
  await set(CC.CONTROL_MANUAL_RUNS, '1');
  await set(CC.CONTROL_PROMOTION, promotion ? '1' : '0');
  for (const id of readers) await set(CC.controlReaderEnabled(id), '1');
  if (capacity) await setTestCapacity(db);
  const wrap = (name, f) => async (...a) => { calls[name] += 1; return f(...a); };
  const createReader = (r) => (r.canonical_source_id === 'oecd-health'
    ? OE.createOecdHealthReader({ fetchImpl: wrap('oecd', fetchOverride.oecd ?? ok(oecd)), readerId: r.dossier_reader_id, legalStatus: r.legal_status })
    : CT.createClinicalTrialsReader({ fetchImpl: wrap('ct', fetchOverride.ct ?? ok(ct)), readerId: r.dossier_reader_id, legalStatus: r.legal_status }));
  const w = { sqlite, db, ctx, calls, set, registry };
  w.deps = (over = {}) => ({ db: over.db ?? db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile, createReader, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx, registry, ...over });
  w.run = (readerId, o = {}) => CR.runCanaryToCompletion(w.deps(o.deps), { readerId, operator: 'burnin-operator' }, o.max ?? 120);
  return w;
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const rows = (sqlite, sql) => sqlite.prepare(sql).all();

/** Canonical durable state: content only (no generated ids, clocks, leases, invocation counters), joined through labels so an interrupted-and-resumed run compares equal to an uninterrupted one. */
export function canonicalState(sqlite) {
  const obs = rows(sqlite, `SELECT o.dedupe_key AS dedupe_key_raw, COALESCE(c.normalized_label, '') AS concept, o.unresolved_label, o.signal_family, o.signal_subfamily, o.observation_kind, o.value, o.value_unit, o.value_status, o.source_role, o.candidate_signal_eligible, o.topic_granularity, o.observed_at, e.external_ref, e.content_hash
    FROM dossier_observations o LEFT JOIN dossier_concepts c ON c.concept_id = o.concept_id LEFT JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id`).map(({ dedupe_key_raw, ...r }) => JSON.stringify({ ...r, dedupe_rest: dedupe_key_raw.split('|').slice(2).join('|') })).sort(); // generated ids (oi_/con_) are not content
  const concepts = rows(sqlite, `SELECT normalized_label, domain, concept_class, proposal_family, state FROM dossier_concepts`).map((r) => JSON.stringify(r)).sort();
  const aliases = rows(sqlite, `SELECT c.normalized_label AS concept, a.normalized_alias, a.language, a.alias_type, a.status FROM dossier_aliases a JOIN dossier_concepts c ON c.concept_id = a.concept_id`).map((r) => JSON.stringify(r)).sort();
  const aggregates = rows(sqlite, `SELECT c.normalized_label AS concept, g.signal_family, g.signal_subfamily, g.geo_scope, g.window_kind, g.measurement_provenance, g.aggregation_version, g.observation_count, g.independent_source_count, g.unique_actor_count, g.unique_platform_count, g.persistence_inputs_json, g.momentum_inputs_json, g.value, g.value_status FROM dossier_signal_aggregates g LEFT JOIN dossier_concepts c ON c.concept_id = g.target_id`).map((r) => JSON.stringify(r)).sort();
  const items = rows(sqlite, `SELECT identity_strategy, identity_value, external_ref, content_hash, published_at, content_class FROM dossier_external_source_items`).map((r) => JSON.stringify(r)).sort();
  const candidates = rows(sqlite, `SELECT c.normalized_label AS concept, k.state, (SELECT COUNT(*) FROM dossier_candidate_snapshots s WHERE s.candidate_id = k.candidate_id) AS snapshots FROM dossier_candidates k LEFT JOIN dossier_concepts c ON c.concept_id = k.target_id`).map((r) => JSON.stringify(r)).sort();
  const reviews = rows(sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`)[0].n;
  const signalRuns = rows(sqlite, `SELECT reader_id, source_ref, status, items_seen, items_new, observations_written FROM dossier_signal_runs`).map((r) => JSON.stringify(r)).sort();
  const state = { obs, concepts, aliases, aggregates, items, candidates, reviews, signalRuns };
  return { state, digest: sha(JSON.stringify(state)), counts: { observations: obs.length, concepts: concepts.length, aliases: aliases.length, aggregates: aggregates.length, source_items: items.length, candidates: candidates.length, reviews } };
}

/** Raw digest of every dossier table row-for-row (only comparable between runs with identical clocks / ids / invocation shapes). */
export function rawDigest(sqlite) {
  const tables = rows(sqlite, `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'dossier_%' ORDER BY name`).map((t) => t.name);
  return sha(JSON.stringify(tables.map((t) => [t, rows(sqlite, `SELECT * FROM ${t} ORDER BY rowid`)])));
}

/** Everything the burn-in compares between independent runs. */
export function runMetrics(w, results) {
  const c = canonicalState(w.sqlite);
  const n = (sql) => w.sqlite.prepare(sql).get().n;
  return {
    per_reader: Object.fromEntries(Object.entries(results).map(([id, r]) => [id, { final: r.final.status, invocations: r.outcomes.length, statements: r.outcomes.map((o) => o.statementsThisInvocation), items_seen: r.final.progress?.itemsSeen, watch: r.final.progress?.watch, promoted: r.final.progress?.promoted }])),
    counts: c.counts,
    canary_runs: n(`SELECT COUNT(*) AS n FROM dossier_canary_runs`),
    signal_runs: n(`SELECT COUNT(*) AS n FROM dossier_signal_runs`),
    work_rows: n(`SELECT COUNT(*) AS n FROM dossier_canary_work`),
    work_done: n(`SELECT COUNT(*) AS n FROM dossier_canary_work WHERE status = 'DONE'`),
    checkpoints: n(`SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE checkpoint_json IS NOT NULL`),
    errors: n(`SELECT COUNT(*) AS n FROM dossier_canary_runs WHERE error_summary IS NOT NULL`) + n(`SELECT COUNT(*) AS n FROM dossier_signal_runs WHERE status <> 'SUCCEEDED'`),
    total_statements: Object.values(results).reduce((a, r) => a + r.outcomes.reduce((x, o) => x + (o.statementsThisInvocation ?? 0), 0), 0),
    canonical_digest: c.digest,
    raw_digest: rawDigest(w.sqlite),
  };
}

/** Wraps a D1 so that after `limit` statements every further statement throws: a process killed mid-invocation (the catch-handlers cannot persist either). */
export function killableDb(db) {
  const state = { count: 0, limit: Infinity, killed: false };
  const wrapped = { prepare(sql) { state.count += 1; if (state.count > state.limit) { state.killed = true; throw new Error('SIMULATED_PROCESS_KILL'); } return db.prepare(sql); }, ...(db.batch ? { batch: (s) => db.batch(s) } : {}) };
  return { db: wrapped, arm: (afterStatements) => { state.count = 0; state.limit = afterStatements; state.killed = false; }, disarm: () => { state.limit = Infinity; }, get killed() { return state.killed; } };
}
