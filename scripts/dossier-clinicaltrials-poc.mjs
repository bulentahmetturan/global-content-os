#!/usr/bin/env node
// LOCAL real-source proof of concept: ClinicalTrials.gov API v2 -> existing DOSSIER pipeline, in a disposable in-memory database.
//
//   node scripts/dossier-clinicaltrials-poc.mjs --live [--page-size 100] [--since YYYY-MM-DD]
//   node scripts/dossier-clinicaltrials-poc.mjs --replay .logs/ct-poc/live-<stamp>.json   (no network: re-runs the pipeline on a saved REAL response)
//
// Safety: needs the explicit --live flag; makes exactly ONE bounded GET to clinicaltrials.gov (no secret, no key); writes only to an
// in-memory SQLite database and to .logs/ct-poc/; never touches D1, wrangler, a scheduler, a source registry or CCOS; activates nothing.
//
// Two passes over the SAME real page:
//   RUN A  DEFAULT behaviour (only per-run caps configured; no promotion policy)  -> expected: concepts + WATCH, NO candidate, NO snapshot
//   RUN B  POC_ONLY promotion policy (replay of the same page)                    -> proves WATCH -> candidate -> immutable snapshot still works
// Everything marked POC_ONLY is a local test value, never a product default. Success is the semantic / lifecycle separation, not a count.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const replayFile = arg('--replay');
if (!process.argv.includes('--live') && !replayFile) {
  console.error('refusing to run: pass --live to allow ONE bounded request to clinicaltrials.gov (in-memory database only), or --replay <saved response file> for no network at all');
  process.exit(2);
}
// POC_ONLY bound for this local canary (NOT a production value: pageSize / backfill / lookback / cadence are OWNER_DECISION_REQUIRED).
const POC_ONLY_DEFAULT_PAGE_SIZE = 100;
const pageSize = Number(arg('--page-size') ?? POC_ONLY_DEFAULT_PAGE_SIZE);
const since = arg('--since');
if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
  console.error('--page-size must be an integer between 1 and 100 for this POC');
  process.exit(2);
}

const CT = await bundle('apps/worker/src/dossier/clinicaltrials.ts', 'poc-ct');
const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'poc-repo');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'poc-orch');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'poc-snap');
const AT = await bundle('apps/worker/src/dossier/attribution.ts', 'poc-attr');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'poc-policy');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  return { sqlite, db: d1FromSqlite(sqlite) };
}
// real clock, strictly increasing (1 ms minimum step) so ordering keys never collide; processed_at is therefore a true processing time
let t = Date.now();
const tick = () => (t = Math.max(t + 1, Date.now()));
const ctx = { now: () => new Date(tick()).toISOString(), id: (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${tick().toString(36)}` };

// ---- the ONE network request, guarded to the official host ----
let requests = 0;
let raw = null;
const liveFetch = replayFile ? async () => {
  raw = JSON.parse(readFileSync(replayFile, 'utf8'));
  return { ok: raw.status === 200, status: raw.status, json: async () => raw.body };
} : async (url, init) => {
  const u = new URL(url);
  if (u.host !== 'clinicaltrials.gov' || u.pathname !== '/api/v2/studies') throw new Error(`blocked request to ${u.host}${u.pathname}`);
  requests += 1;
  if (requests > 1) throw new Error('POC allows exactly one request');
  const res = await fetch(url, init);
  const body = res.ok ? await res.json() : null;
  raw = { status: res.status, url, body };
  return { ok: res.ok, status: res.status, json: async () => body };
};

const caps = { perRunItemCap: { status: 'SET', value: pageSize }, perRunFetchCap: { status: 'SET', value: pageSize } };
// DEFAULT behaviour: only the per-run caps are configured. No promotion policy, no class criteria.
const defaultPolicy = { ...DEFAULT_POLICY, ...caps };
// POC_ONLY / TEST_ONLY: approves ONE signal family to promote alone and lets the review-ready path be exercised. NOT product policy,
// NOT a success criterion, never a default. Eligibility is decided by editorial roles (eligibility.ts), never by these.
const POC_ONLY_TEST_MIN_ORIGINS = 2;
const pocOnlyPolicy = {
  ...defaultPolicy,
  provenanceRepresentativeCap: { status: 'SET', value: 3 },
  candidatePromotion: { status: 'SET', value: { paths: ['SOURCE_SPECIFIC_FRONTIER'], sourceSpecificFrontier: { families: ['GLOBAL_RESEARCH_ACTIVITY'] } } },
  candidateClassCriteria: { status: 'SET', value: { FRONTIER: { frontierFamilies: ['GLOBAL_RESEARCH_ACTIVITY'], minIndependentOrigins: POC_ONLY_TEST_MIN_ORIGINS } } },
};
const cfgFor = (reader, policy) => ({ policy, readers: [reader], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-poc', algorithmVersion: 'cand-poc' });

// ---------- RUN A: real fetch, DEFAULT policy ----------
const A = openDb();
const repoA = new DossierRepo(A.db, ctx);
const resA = await O.runLocalPipeline(repoA, cfgFor(CT.createClinicalTrialsReader({ fetchImpl: liveFetch, since }), defaultPolicy));
if (!raw || !raw.body) {
  console.log(JSON.stringify({ REAL_E2E: 'BLOCKED', reason: raw ? `HTTP ${raw.status}` : 'no response', readers: resA.readers }, null, 2));
  process.exit(1);
}
mkdirSync('.logs/ct-poc', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (!replayFile) writeFileSync(`.logs/ct-poc/live-${stamp}.json`, JSON.stringify(raw, null, 1));

// ---------- RUN B: the SAME real page replayed, POC_ONLY promotion policy ----------
const B = openDb();
const repoB = new DossierRepo(B.db, ctx);
const replay = async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(raw.body)) });
const resB = await O.runLocalPipeline(repoB, cfgFor(CT.createClinicalTrialsReader({ fetchImpl: replay, since }), pocOnlyPolicy));

// ---------- verification over the REAL data ----------
const q = (db, sql, ...a) => db.prepare(sql).all(...a);
const cnt = (db, sql, ...a) => db.prepare(sql).get(...a).n;
const studies = raw.body.studies ?? [];
const fromResponse = new Set();
for (const s of studies) {
  for (const c of s.protocolSection?.conditionsModule?.conditions ?? []) fromResponse.add(c.trim().toLowerCase());
  for (const i of s.protocolSection?.armsInterventionsModule?.interventions ?? []) fromResponse.add(String(i.name).trim().toLowerCase());
}
const concepts = q(A.sqlite, `SELECT concept_id, label, state FROM dossier_concepts`);
const conceptLabel = new Map(concepts.map((c) => [c.concept_id, c.label]));
const notFromResponse = concepts.filter((c) => !fromResponse.has(c.label.toLowerCase()));
const signalTotal = studies.reduce((n, s) => n + CT.normalizeStudy(s).signals.length, 0);
const tally = (items, f) => items.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const eligStates = tally(resA.eligibility, (e) => e.state);
const eligReasons = tally(resA.eligibility.flatMap((e) => e.reasonCodes.map((r) => `${e.state}/${r}`)), (x) => x);
const watchReasons = tally(resA.watchTargets.flatMap((w) => w.reasonCodes), (x) => x);
const watchPromotion = tally(resA.watchTargets, (w) => w.promotion.status);
const obsDistribution = q(A.sqlite, `SELECT COALESCE(source_role,'(undeclared)') AS role, candidate_signal_eligible AS eligible, eligibility_reason AS reason, COUNT(*) AS n FROM dossier_observations GROUP BY 1,2,3 ORDER BY n DESC`);
const retained = resA.eligibility.filter((e) => e.state !== 'ELIGIBLE');
const watchSample = resA.watchTargets.slice(0, 8).map((w) => ({ topic: conceptLabel.get(w.targetId), state: w.state, promotion: w.promotion.status, eligibility: w.eligibility, families: w.support.families, independent_origins: w.support.independentOrigins, source_local_repetition: w.support.sourceLocalRepetition, multi_signal_family_support: w.support.multiSignalFamilySupport, reasons: w.reasonCodes, evaluated_at: w.evaluatedAt }));
const retainedSample = retained.slice(0, 8).map((e) => ({ topic: conceptLabel.get(e.conceptId), state: e.state, reasons: e.reasonCodes, observations_retained: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE concept_id = ?`, e.conceptId) }));

const bConcepts = q(B.sqlite, `SELECT concept_id, label FROM dossier_concepts`);
const bLabel = new Map(bConcepts.map((c) => [c.concept_id, c.label]));
const bCands = q(B.sqlite, `SELECT c.candidate_id, c.target_id, c.state, s.candidate_class, s.snapshot_id FROM dossier_candidates c JOIN dossier_candidate_snapshots s ON s.candidate_id = c.candidate_id`);
const bSample = [];
for (const c of bCands.slice(0, 3)) {
  const ex = await SN.explainWhyNow(repoB, c.snapshot_id);
  bSample.push({ topic: bLabel.get(c.target_id), class: c.candidate_class, state: c.state, reasonCodes: ex.reasonCodes, aggregates: ex.aggregateStates.map((a) => `${a.family}/${a.subfamily}/${a.windowKind} obs=${a.observations} origins=${a.independentSources}`), provenance: ex.provenance.map((p) => `${p.source} ${p.locator} ${p.evidenceSpan}`) });
}
const notice = resA.readers[0].attribution;

const runA = {
  label: 'RUN A: DEFAULT policy (only per-run caps; no promotion policy, no class criteria) on the real response',
  STUDIES_FETCHED: studies.length,
  OBSERVATIONS: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations`),
  DISCOVERED_CONCEPTS: concepts.length,
  ELIGIBLE: eligStates.ELIGIBLE ?? 0,
  REVIEW_REQUIRED: eligStates.REVIEW_REQUIRED ?? 0,
  WATCH_ONLY: eligStates.WATCH_ONLY ?? 0,
  NOT_EDITORIAL_TOPIC: eligStates.NOT_EDITORIAL_TOPIC ?? 0,
  WATCH_TARGETS: resA.watchTargets.length,
  PROMOTED_DOSSIER_CANDIDATES: resA.promoted.length,
  CANDIDATE_ROWS: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`),
  CANDIDATE_SNAPSHOTS: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`),
  REVIEW_READY_CANDIDATES: resA.reviewReady.length,
  watch_promotion_status: watchPromotion,
  eligibility_reason_distribution: eligReasons,
  watch_reason_distribution: watchReasons,
  watch_source_local_repetition: resA.watchTargets.filter((w) => w.support.sourceLocalRepetition).length,
  watch_multi_signal_family_support: resA.watchTargets.filter((w) => w.support.multiSignalFamilySupport).length,
  observation_eligibility_distribution: obsDistribution,
};
const runB = {
  label: 'RUN B: POC_ONLY promotion policy (one family approved to promote alone) + POC_ONLY class criterion, same real page replayed',
  WATCH_TARGETS: resB.watchTargets.length,
  PROMOTED_DOSSIER_CANDIDATES: resB.promoted.length,
  CANDIDATE_SNAPSHOTS: cnt(B.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`),
  REVIEW_READY_CANDIDATES: resB.reviewReady.length,
  promoted_reason_paths: tally(q(B.sqlite, `SELECT reason_codes_json FROM dossier_candidate_snapshots`).flatMap((r) => JSON.parse(r.reason_codes_json).filter((c) => c.startsWith('PROMOTED_BY'))), (x) => x),
  every_candidate_target_ELIGIBLE: bCands.every((c) => resB.eligibility.find((e) => e.conceptId === c.target_id)?.state === 'ELIGIBLE'),
  snapshots_equal_candidates: cnt(B.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots`) === cnt(B.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates`),
};
const checks = {
  label: 'POC_ONLY (page size and every criterion are local test values, not production configuration)',
  mode: replayFile ? 'REPLAY_OF_SAVED_REAL_RESPONSE (no network)' : 'LIVE (exactly one request)',
  one_request: replayFile ? requests === 0 : requests === 1,
  page_size_POC_ONLY: pageSize,
  total_in_registry: raw.body.totalCount ?? null,
  next_page_token_present: Boolean(raw.body.nextPageToken),
  signals_in_response: signalTotal,
  all_concepts_PROPOSED: concepts.every((c) => c.state === 'PROPOSED'),
  active_identities: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`),
  concept_labels_not_from_response: notFromResponse.length,
  observations_equal_signals_no_loss: runA.OBSERVATIONS === signalTotal,
  ineligible_observations_retained: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE candidate_signal_eligible <> 'TRUE'`),
  default_run_promotes_nothing: runA.PROMOTED_DOSSIER_CANDIDATES === 0 && runA.CANDIDATE_ROWS === 0 && runA.CANDIDATE_SNAPSHOTS === 0,
  watch_targets_are_eligible_concepts: resA.watchTargets.every((w) => resA.eligibility.find((e) => e.conceptId === w.targetId)?.state === 'ELIGIBLE'),
  reviews_written: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`) + cnt(B.sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`),
  hub_source_items_written: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM source_items`),
  evergreen_runtime_rows: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM evergreen_runtime_state`),
  attribution_notice: notice ? { source: notice.source_id, line: AT.attributionLine(notice), retrieved_at: notice.retrieved_at, processed_at: notice.processed_at } : null,
};
// Success = the lifecycle/semantic separation works. No candidate count, no review-ready count and no page size is a success criterion.
const REAL_E2E = checks.one_request && runA.OBSERVATIONS > 0 && checks.all_concepts_PROPOSED && checks.active_identities === 0 && checks.concept_labels_not_from_response === 0
  && checks.observations_equal_signals_no_loss && checks.default_run_promotes_nothing && checks.watch_targets_are_eligible_concepts
  && runB.every_candidate_target_ELIGIBLE && runB.snapshots_equal_candidates && checks.reviews_written === 0 && checks.hub_source_items_written === 0 && checks.evergreen_runtime_rows === 0 && Boolean(notice) ? 'PASS' : 'FAIL';
const report = { REAL_E2E, ran_at: new Date().toISOString(), request: raw.url, checks, run_a_default: runA, run_b_poc_only: runB, watch_sample: watchSample, retained_non_candidate_sample: retainedSample, poc_only_promoted_sample: bSample, run_a_readers: resA.readers.map((r) => ({ ...r, attribution: undefined })) };
writeFileSync(`.logs/ct-poc/e2e-${stamp}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(REAL_E2E === 'PASS' ? 0 : 1);
