// Test-only harness for the Eurostat second-family reader (never imported by runtime code). A fresh deterministic local world whose research-activity
// family is the RECORDED real ClinicalTrials page replayed once through the frozen V1 path (an isolated in-memory database: nothing here touches
// production evidence, and DOSSIER_CANARY_V2 never refetches ClinicalTrials), plus the Eurostat reader under DOSSIER_CANARY_V2 on a RECORDED real response.
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, setTestCapacity } from './test-support.mjs';
import { CC, CR, CT, PF, P800, FIXTURES, TEST_REGISTRY, CT_ID, canonicalState, rawDigest, killableDb } from './burnin-support.mjs';

export { CC, CR, CT, PF, canonicalState, rawDigest, killableDb, openDossierDb, makeCtx };
export const EU = await bundle('apps/worker/src/dossier/eurostat.ts', 'eu-reader');
export const V2 = await bundle('apps/worker/src/dossier/canary-v2.ts', 'eu-v2');
export const EU_ID = V2.EUROSTAT_READER_ID;
export const EU_RECORDED = JSON.parse(readFileSync('apps/worker/src/dossier/recorded/eurostat-hlth-cd-asdr2-tr-2023.json', 'utf8'));
export const EU_FIXTURE = EU_RECORDED.response;
export const CT100 = FIXTURES.ct100;
export const clone = (x) => JSON.parse(JSON.stringify(x));

const okBody = (b) => async () => ({ ok: true, status: 200, json: async () => clone(b), headers: { get: () => null } });
export const euOk = okBody;
export const euFail = (status, headers = {}) => async () => ({ ok: false, status, json: async () => ({}), headers: { get: (k) => headers[k.toLowerCase()] ?? null } });

/** profile with the measured/under-test budget (never mutates the checked-in constant). */
export function v2Profile({ budget, lease } = {}) {
  const p = structuredClone(PF.DOSSIER_CANARY_V2);
  if (budget !== undefined) p.runtime.d1_statements_per_invocation.value = budget;
  if (lease !== undefined) p.runtime.lease_seconds.value = lease;
  return p;
}

/** Replays the recorded ClinicalTrials page once through the frozen V1 canary path inside this isolated database: the research-activity baseline as durable state. */
async function seedBaseline(w) {
  const set = (k, v) => CC.setControl(w.db, { key: k, value: v, updatedBy: 'eurostat-test-operator', now: '2026-10-03T00:00:00.000Z' });
  await set(CC.CONTROL_CANARY, '1');
  await set(CC.CONTROL_MANUAL_RUNS, '1');
  await set(CC.controlReaderEnabled(CT_ID), '1');
  await setTestCapacity(w.db);
  const createReader = (r) => CT.createClinicalTrialsReader({ fetchImpl: okBody(CT100), readerId: r.dossier_reader_id, legalStatus: r.legal_status });
  const deps = { db: w.db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile: P800, createReader, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, ctx: w.ctx, registry: TEST_REGISTRY };
  const r = await CR.runCanaryToCompletion(deps, { readerId: CT_ID, operator: 'eurostat-test-operator' }, 400);
  if (r.final.status !== 'COMPLETED') throw new Error(`baseline seeding failed: ${r.final.status}`);
  await set(CC.controlReaderEnabled(CT_ID), '0');
  return r;
}

/**
 * options: baseline (seed the CT family), body (the Eurostat response), fetchOverride, profile, promotion.
 * `calls.eu` counts source requests; `calls.ct` stays 0 after seeding (CT is never refetched by V2).
 */
export async function euWorld({ baseline = true, body = EU_FIXTURE, fetchOverride, profile = v2Profile(), promotion = true, readerEnabled = true, sleep = async () => {} } = {}) {
  const { sqlite, db } = openDossierDb();
  const ctx = makeCtx();
  const w = { sqlite, db, ctx, calls: { eu: 0, ct: 0 }, baselineResult: null };
  if (baseline) w.baselineResult = await seedBaseline(w);
  const set = (k, v) => CC.setControl(db, { key: k, value: v, updatedBy: 'eurostat-test-operator', now: '2026-10-05T00:00:00.000Z' });
  await set(CC.CONTROL_CANARY, '1');
  await set(CC.CONTROL_MANUAL_RUNS, '1');
  await set(CC.CONTROL_PROMOTION, promotion ? '1' : '0');
  if (!baseline) await setTestCapacity(db);
  if (readerEnabled) await set(CC.controlReaderEnabled(EU_ID), '1');
  w.set = set;
  w.baselineState = baseline ? canonicalState(sqlite) : null;
  // the fetch behind the reader is swappable between invocations (failure injection: fail first, recover later, serve a revised release)
  w.fetchImpl = fetchOverride ?? okBody(body);
  w.setBody = (b) => { w.fetchImpl = okBody(b); };
  const wrapped = async (...a) => { w.calls.eu += 1; return w.fetchImpl(...a); };
  const createReader = (r) => EU.createEurostatReader({ fetchImpl: wrapped, readerId: r.dossier_reader_id, legalStatus: r.legal_status, sleep });
  w.reader = null;
  w.deps = (over = {}) => ({ db: over.db ?? db, env: { DOSSIER_CANARY_ENABLED: 'true' }, profile, createReader: (r) => (w.reader = createReader(r)), classifier: EU.eurostatRowClassifier, extractor: EU.eurostatRowExtractor, ctx, registry: V2.DOSSIER_READER_REGISTRY_V2, ...over });
  w.run = (o = {}) => CR.runCanaryToCompletion(w.deps(o.deps), { readerId: EU_ID, operator: 'eurostat-test-operator' }, o.max ?? 400);
  return w;
}

export const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
export const n = (sqlite, sql, ...a) => sqlite.prepare(sql).get(...a).n;
/** Observations of the Eurostat family joined to concept labels (deterministic order). */
export const euObservations = (sqlite) => q(sqlite, `SELECT c.label AS label, o.value, o.value_unit, o.value_status, o.window_kind, o.window_start, o.window_end, o.geo_scope, o.signal_subfamily, o.source_role, o.candidate_signal_eligible, o.topic_granularity, e.identity_value, e.url
  FROM dossier_observations o JOIN dossier_concepts c ON c.concept_id = o.concept_id JOIN dossier_external_source_items e ON e.origin_item_id = o.origin_item_id WHERE o.signal_family = 'TURKEY_HEALTH_BURDEN' ORDER BY e.identity_value`);
