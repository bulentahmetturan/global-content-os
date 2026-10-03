#!/usr/bin/env node
// LOCAL real-source proof of concept #2: OECD Health Statistics (Causes of mortality, Turkiye) -> TURKEY_HEALTH_BURDEN, then a REAL
// convergence test against the already-saved real ClinicalTrials.gov signal state (GLOBAL_RESEARCH_ACTIVITY).
//
//   node scripts/dossier-tr-health-poc.mjs --live  --ct-replay .logs/ct-poc/live-<stamp>.json
//   node scripts/dossier-tr-health-poc.mjs --oecd-replay .logs/tr-health/oecd-live-<stamp>.json --ct-replay .logs/ct-poc/live-<stamp>.json
//
// Safety: --live makes exactly ONE bounded GET to sdmx.oecd.org (no secret, no key, latest observation per series, Turkiye only);
// the ClinicalTrials side is ALWAYS a replay of a saved real response (no request). Writes only to an in-memory SQLite database and
// to .logs/tr-health/. Never touches D1, wrangler, a scheduler, a source registry or CCOS. Activates nothing.
// DEFAULT policy only (per-run caps, no promotion policy): promotion can happen ONLY by the default multi-signal-family convergence route.
// Overlap is whatever the real data gives; nothing is forced, widened or hard-coded. NO_OVERLAP is a valid result.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bundle, d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const ctReplayFile = arg('--ct-replay');
const oecdReplayFile = arg('--oecd-replay');
if (!ctReplayFile || (!process.argv.includes('--live') && !oecdReplayFile)) {
  console.error('usage: --ct-replay <saved ClinicalTrials response> and either --live (ONE OECD request) or --oecd-replay <saved OECD response>');
  process.exit(2);
}
// POC_ONLY bounds (NOT production values: row caps, backfill, lookback and cadence are OWNER_DECISION_REQUIRED)
const POC_ONLY_CAP = 100;

const OE = await bundle('apps/worker/src/dossier/oecd.ts', 'trh-oecd');
const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'trh-ct');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'trh-repo');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'trh-orch');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'trh-snap');
const AT = await bundle('apps/worker/src/dossier/attribution.ts', 'trh-attr');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'trh-policy');

const sqlite = new DatabaseSync(':memory:');
for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
let t = Date.now();
const tick = () => (t = Math.max(t + 1, Date.now()));
const ctx = { now: () => new Date(tick()).toISOString(), id: (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${tick().toString(36)}` };
const repo = new DossierRepo(d1FromSqlite(sqlite), ctx);

// ---- the ONE network request (OECD only), guarded to the official host ----
let requests = 0;
let rawOecd = null;
const oecdFetch = oecdReplayFile
  ? async () => { rawOecd = JSON.parse(readFileSync(oecdReplayFile, 'utf8')); return { ok: rawOecd.status === 200, status: rawOecd.status, json: async () => rawOecd.body }; }
  : async (url, init) => {
      const u = new URL(url);
      if (u.host !== 'sdmx.oecd.org' || !u.pathname.startsWith('/public/rest/data/')) throw new Error(`blocked request to ${u.host}${u.pathname}`);
      requests += 1;
      if (requests > 1) throw new Error('POC allows exactly one request');
      const res = await fetch(url, init);
      const body = res.ok ? await res.json() : null;
      rawOecd = { status: res.status, url, body };
      return { ok: res.ok, status: res.status, json: async () => body };
    };
const ctSaved = JSON.parse(readFileSync(ctReplayFile, 'utf8'));
const ctFetch = async () => ({ ok: ctSaved.status === 200, status: ctSaved.status, json: async () => JSON.parse(JSON.stringify(ctSaved.body)) });

// DEFAULT policy: only the per-run caps. No promotion policy, no class criteria, no provenance cap.
const policy = { ...DEFAULT_POLICY, perRunItemCap: { status: 'SET', value: POC_ONLY_CAP }, perRunFetchCap: { status: 'SET', value: POC_ONLY_CAP } };
const readers = [CT.createClinicalTrialsReader({ fetchImpl: ctFetch }), OE.createOecdHealthReader({ fetchImpl: oecdFetch })];
const res = await O.runLocalPipeline(repo, { policy, readers, classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-trh', algorithmVersion: 'cand-trh' });
const oecdReport = res.readers.find((r) => r.sourceRef === 'oecd-health');
if (!rawOecd || !rawOecd.body || oecdReport?.status !== 'SUCCEEDED') {
  console.log(JSON.stringify({ REAL_TURKEY_HEALTH_E2E: 'BLOCKED', reason: rawOecd ? `HTTP ${rawOecd.status} / ${oecdReport?.error}` : 'no response', readers: res.readers.map((r) => ({ ...r, attribution: undefined })) }, null, 2));
  process.exit(1);
}
mkdirSync('.logs/tr-health', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (!oecdReplayFile) writeFileSync(`.logs/tr-health/oecd-live-${stamp}.json`, JSON.stringify(rawOecd, null, 1));

// ---------- verification over the REAL data ----------
const q = (sql, ...a) => sqlite.prepare(sql).all(...a);
const cnt = (sql, ...a) => sqlite.prepare(sql).get(...a).n;
const label = new Map(q(`SELECT concept_id, label FROM dossier_concepts`).map((c) => [c.concept_id, c.label]));
const incomingOecd = new Set(rawOecd.body.data.structures[0].dimensions.observation.find((d) => d.id === 'DEATH_CAUSE').values.map((v) => v.name.toLowerCase()));
const fam = (f) => q(`SELECT DISTINCT concept_id FROM dossier_observations WHERE signal_family = ? AND candidate_signal_eligible = 'TRUE'`, f).map((r) => r.concept_id);
const ctConcepts = new Set(fam('GLOBAL_RESEARCH_ACTIVITY'));
const trConcepts = new Set(fam('TURKEY_HEALTH_BURDEN'));
const overlap = [...trConcepts].filter((id) => ctConcepts.has(id));
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// informational only (NOT used for any decision): label pairs that look related but were NOT merged
const nearMisses = [];
for (const a of trConcepts) for (const b of ctConcepts) {
  if (a === b) continue;
  const x = norm(label.get(a)); const y = norm(label.get(b));
  if (x.length >= 5 && y.length >= 5 && (y.includes(x) || x.includes(y))) nearMisses.push({ turkey_health: label.get(a), research_activity: label.get(b) });
}
const promotedTargets = q(`SELECT c.candidate_id, c.target_id, c.state FROM dossier_candidates c`);
const promotedSample = [];
for (const c of promotedTargets.slice(0, 3)) {
  const snap = (await repo.listSnapshots(c.candidate_id, 1))[0];
  const ex = await SN.explainWhyNow(repo, snap.snapshot_id);
  promotedSample.push({ topic: label.get(c.target_id), state: c.state, class: ex.candidateClass, reasonCodes: ex.reasonCodes, families: ex.signalFamilies, windowKinds: Object.keys(ex.windowKinds), aggregates: ex.aggregateStates.map((a) => `${a.family}/${a.subfamily}/${a.windowKind} obs=${a.observations} value=${a.value} (${a.valueStatus})`), provenanceSources: [...new Set(ex.provenance.map((p) => p.source))], provenanceStatus: ex.provenanceStatus });
}
const eligOf = (ids) => { const o = {}; for (const e of res.eligibility.filter((x) => ids.has(x.conceptId))) o[e.state] = (o[e.state] ?? 0) + 1; return o; };
const obsTr = q(`SELECT * FROM dossier_observations WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`);
const aggsTr = q(`SELECT * FROM dossier_signal_aggregates WHERE signal_family = 'TURKEY_HEALTH_BURDEN'`);
const watchTr = res.watchTargets.filter((w) => w.support.families.includes('TURKEY_HEALTH_BURDEN'));
const sampleTr = obsTr.slice(0, 5).map((o) => ({ topic: label.get(o.concept_id), value: o.value, unit: o.value_unit, window: `${o.window_kind} ${o.window_start}..${o.window_end}`, geo: o.geo_scope, provenance: o.measurement_provenance, span: o.evidence_span }));
const notice = oecdReport.attribution;
const oecdRows = Object.keys(rawOecd.body.data.dataSets[0].observations).length;

const checks = {
  label: 'POC_ONLY (caps and every bound are local test values; the default promotion route is the product behaviour)',
  mode: oecdReplayFile ? 'OECD: REPLAY of a saved real response (no network)' : 'OECD: LIVE (exactly one request)',
  oecd_one_request: oecdReplayFile ? requests === 0 : requests === 1,
  clinicaltrials_side: 'REPLAY of saved real response (no request)',
  oecd_rows_in_response: oecdRows,
  oecd_observations_written: obsTr.length,
  oecd_concepts: trConcepts.size,
  oecd_concept_labels_not_from_response: [...trConcepts].filter((id) => !incomingOecd.has(label.get(id).toLowerCase())).length,
  all_concepts_PROPOSED: q(`SELECT state FROM dossier_concepts`).every((c) => c.state === 'PROPOSED'),
  active_identities: cnt(`SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`),
  structural_windows_only: obsTr.every((o) => o.window_kind === 'SOURCE_PERIOD') && aggsTr.every((a) => a.window_kind === 'SOURCE_PERIOD'),
  no_momentum_or_persistence_inputs: aggsTr.every((a) => a.momentum_inputs_json === null && a.persistence_inputs_json === null),
  all_values_measured_with_unit: obsTr.every((o) => o.value_status === 'MEASURED' && o.value_unit),
  unknown_observations: obsTr.filter((o) => o.value_status === 'UNKNOWN').length,
  metadata_dimensions_never_topics: ![...trConcepts].some((id) => ['turkiye', 'türkiye', 'deaths', 'total', 'mortality', 'annual'].includes(label.get(id).toLowerCase())),
  reviews_written: cnt(`SELECT COUNT(*) AS n FROM dossier_reviews`),
  hub_source_items_written: cnt(`SELECT COUNT(*) AS n FROM source_items`),
  evergreen_runtime_rows: cnt(`SELECT COUNT(*) AS n FROM evergreen_runtime_state`),
  attribution_notice: notice ? { source: notice.source_id, line: AT.attributionLine(notice), retrieved_at: notice.retrieved_at, processed_at: notice.processed_at } : null,
};
const convergence = {
  clinicaltrials_eligible_concepts: ctConcepts.size,
  turkey_health_concepts: trConcepts.size,
  overlap_concepts_resolved_by_the_open_world_resolver: overlap.map((id) => label.get(id)),
  near_misses_not_merged_informational: nearMisses.slice(0, 12),
  near_miss_count: nearMisses.length,
  promoted_dossier_candidates: promotedTargets.length,
  every_promoted_candidate_is_an_overlap_concept: promotedTargets.every((c) => overlap.includes(c.target_id)),
  every_overlap_concept_is_promoted_by_default_route: overlap.every((id) => promotedTargets.some((c) => c.target_id === id)),
  candidate_snapshots: cnt(`SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`),
  candidates_by_state: Object.fromEntries(q(`SELECT state, COUNT(*) AS n FROM dossier_candidates GROUP BY state`).map((r) => [r.state, r.n])),
  watch_targets_total: res.watchTargets.length,
  watch_targets_turkey_health: watchTr.length,
  watch_multi_family: res.watchTargets.filter((w) => w.support.multiSignalFamilySupport).length,
  watch_reason_distribution: res.watchTargets.flatMap((w) => w.reasonCodes).reduce((o, c) => { o[c] = (o[c] ?? 0) + 1; return o; }, {}),
};
const REAL_CONVERGENCE = !convergence.every_promoted_candidate_is_an_overlap_concept || !convergence.every_overlap_concept_is_promoted_by_default_route ? 'FAIL' : overlap.length === 0 ? 'NO_OVERLAP' : 'PASS';
const E2E = checks.oecd_one_request && trConcepts.size > 0 && checks.all_concepts_PROPOSED && checks.active_identities === 0 && checks.oecd_concept_labels_not_from_response === 0 && checks.structural_windows_only && checks.no_momentum_or_persistence_inputs && checks.all_values_measured_with_unit && checks.metadata_dimensions_never_topics && checks.reviews_written === 0 && checks.hub_source_items_written === 0 && checks.evergreen_runtime_rows === 0 && Boolean(notice) ? 'PASS' : 'FAIL';
// ---------- PASS 2 (POC_ONLY): the SAME saved real responses with a provenance representative cap set, to show provenance from BOTH families ----------
// The default policy leaves the cap unset (an owner decision), so the default run stores no provenance representatives. This pass only
// demonstrates that, once a cap is configured, a converged candidate keeps bounded provenance from each signal family.
const sqlite2 = new DatabaseSync(':memory:');
for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite2.exec(readFileSync(`migrations/${f}`, 'utf8'));
// (migration file names are matched like in the first pass)
const repo2 = new DossierRepo(d1FromSqlite(sqlite2), ctx);
const policy2 = { ...policy, provenanceRepresentativeCap: { status: 'SET', value: 3 } }; // POC_ONLY value
const replayOecd = async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(rawOecd.body)) });
const res2 = await O.runLocalPipeline(repo2, { policy: policy2, readers: [CT.createClinicalTrialsReader({ fetchImpl: ctFetch }), OE.createOecdHealthReader({ fetchImpl: replayOecd })], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-trh', algorithmVersion: 'cand-trh' });
const label2 = new Map(sqlite2.prepare('SELECT concept_id, label FROM dossier_concepts').all().map((c) => [c.concept_id, c.label]));
const prov2 = [];
for (const c of sqlite2.prepare('SELECT candidate_id, target_id FROM dossier_candidates').all()) {
  const snap = (await repo2.listSnapshots(c.candidate_id, 1))[0];
  const ex = await SN.explainWhyNow(repo2, snap.snapshot_id);
  prov2.push({ topic: label2.get(c.target_id), families: ex.signalFamilies, provenanceStatus: ex.provenanceStatus, provenance: ex.provenance.map((x) => ({ source: x.source, locator: x.locator, evidenceSpan: x.evidenceSpan })), rawMembershipReconstructable: ex.rawMembershipReconstructable });
}
const provenanceBothFamilies = prov2.length > 0 && prov2.every((x) => new Set(x.provenance.map((y) => y.source)).size >= 2);
const report = { REAL_TURKEY_HEALTH_E2E: E2E, REAL_CONVERGENCE, ran_at: new Date().toISOString(), oecd_request: rawOecd.url, checks, oecd_eligibility: eligOf(trConcepts), clinicaltrials_eligibility: eligOf(ctConcepts), oecd_sample_observations: sampleTr, convergence, promoted_sample: promotedSample, poc_only_provenance_pass: { promoted: res2.promoted.length, provenance_from_both_families: provenanceBothFamilies, candidates: prov2 }, readers: res.readers.map((r) => ({ ...r, attribution: undefined })) };
writeFileSync(`.logs/tr-health/e2e-${stamp}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(E2E === 'PASS' && REAL_CONVERGENCE !== 'FAIL' ? 0 : 1);
