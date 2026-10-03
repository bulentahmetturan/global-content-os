#!/usr/bin/env node
// LOCAL real-source proof of concept: ClinicalTrials.gov API v2 -> existing DOSSIER pipeline, in a disposable in-memory database.
//
//   node scripts/dossier-clinicaltrials-poc.mjs --live [--page-size 25] [--since YYYY-MM-DD]
//
// Safety: needs the explicit --live flag; makes exactly ONE bounded GET to clinicaltrials.gov (no secret, no key); writes only to an
// in-memory SQLite database and to .logs/ct-poc/; never touches D1, wrangler, a scheduler, a source registry or CCOS; activates nothing.
// The classification criteria below are a LOCAL POC policy so that the review-ready path can be exercised; they are NOT product defaults.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
if (!process.argv.includes('--live')) {
  console.error('refusing to run: pass --live to allow ONE bounded request to clinicaltrials.gov (in-memory database only)');
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
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'poc-policy');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  return { sqlite, db: d1FromSqlite(sqlite) };
}
let t = Date.parse(new Date().toISOString());
const ctx = { now: () => new Date((t += 1000)).toISOString(), id: (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${(t++).toString(36)}` };

// ---- the ONE network request, guarded to the official host ----
let requests = 0;
let raw = null;
const liveFetch = async (url, init) => {
  const u = new URL(url);
  if (u.host !== 'clinicaltrials.gov' || u.pathname !== '/api/v2/studies') throw new Error(`blocked request to ${u.host}${u.pathname}`);
  requests += 1;
  if (requests > 1) throw new Error('POC allows exactly one request');
  const res = await fetch(url, init);
  const body = res.ok ? await res.json() : null;
  raw = { status: res.status, url, body };
  return { ok: res.ok, status: res.status, json: async () => body };
};

const POC_ONLY_TEST_MIN_ORIGINS = 2;
const pocPolicy = {
  ...DEFAULT_POLICY,
  perRunItemCap: { status: 'SET', value: pageSize },
  perRunFetchCap: { status: 'SET', value: pageSize },
  provenanceRepresentativeCap: { status: 'SET', value: 3 },
  // POC_ONLY TEST CRITERION, not product policy and not a success criterion of the canary: it only lets the review-ready path be exercised.
  // Candidate eligibility is decided by editorial roles (eligibility.ts), never by this number.
  candidateClassCriteria: { status: 'SET', value: { FRONTIER: { frontierFamilies: ['GLOBAL_RESEARCH_ACTIVITY'], minIndependentOrigins: POC_ONLY_TEST_MIN_ORIGINS } } },
};
const capsOnly = { ...DEFAULT_POLICY, perRunItemCap: pocPolicy.perRunItemCap, perRunFetchCap: pocPolicy.perRunFetchCap };

const cfgFor = (reader, policy) => ({ policy, readers: [reader], classifier: CT.registryRecordClassifier, extractor: CT.registryRecordExtractor, aggregationVersion: 'agg-poc', algorithmVersion: 'cand-poc' });

// ---------- run A: real fetch, local POC criteria ----------
const A = openDb();
const repoA = new DossierRepo(A.db, ctx);
const resA = await O.runLocalPipeline(repoA, cfgFor(CT.createClinicalTrialsReader({ fetchImpl: liveFetch, since }), pocPolicy));
if (!raw || !raw.body) {
  console.log(JSON.stringify({ REAL_E2E: 'BLOCKED', reason: raw ? `HTTP ${raw.status}` : 'no response', readers: resA.readers }, null, 2));
  process.exit(1);
}
mkdirSync('.logs/ct-poc', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(`.logs/ct-poc/live-${stamp}.json`, JSON.stringify(raw, null, 1));

// ---------- run B: same real page replayed, only caps configured: must fail closed ----------
const B = openDb();
const repoB = new DossierRepo(B.db, ctx);
const replay = async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(raw.body)) });
const resB = await O.runLocalPipeline(repoB, cfgFor(CT.createClinicalTrialsReader({ fetchImpl: replay, since }), capsOnly));

// ---------- verification over the REAL data ----------
const q = (db, sql) => db.prepare(sql).all();
const studies = raw.body.studies ?? [];
const fromResponse = new Set();
for (const s of studies) {
  for (const c of s.protocolSection?.conditionsModule?.conditions ?? []) fromResponse.add(c.trim().toLowerCase());
  for (const i of s.protocolSection?.armsInterventionsModule?.interventions ?? []) fromResponse.add(String(i.name).trim().toLowerCase());
}
const concepts = q(A.sqlite, `SELECT concept_id, label, state, domain, concept_class FROM dossier_concepts`);
const notFromResponse = concepts.filter((c) => !fromResponse.has(c.label.toLowerCase()));
const cands = q(A.sqlite, `SELECT c.candidate_id, c.target_type, c.target_id, c.temporal_identity, c.state, s.candidate_class, s.snapshot_id FROM dossier_candidates c JOIN dossier_candidate_snapshots s ON s.candidate_id = c.candidate_id`);
const conceptLabel = new Map(concepts.map((c) => [c.concept_id, c.label]));
const sample = [];
for (const c of cands.slice(0, 3)) {
  const ex = await SN.explainWhyNow(repoA, c.snapshot_id);
  sample.push({ topic: conceptLabel.get(c.target_id) ?? c.target_id, class: c.candidate_class, state: c.state, windowKinds: Object.keys(ex.windowKinds), aggregates: ex.aggregateStates.map((a) => `${a.family}/${a.subfamily}/${a.windowKind} obs=${a.observations} origins=${a.independentSources}`), provenance: ex.provenance.map((p) => `${p.source} ${p.locator} ${p.evidenceSpan}`), reasonCodes: ex.reasonCodes });
}
const cnt = (db, sql, ...a) => db.prepare(sql).get(...a).n;
const states = {};
for (const e of resA.eligibility) states[e.state] = (states[e.state] ?? 0) + 1;
const conceptReasons = {};
for (const e of resA.eligibility) for (const r of e.reasonCodes) conceptReasons[`${e.state}/${r}`] = (conceptReasons[`${e.state}/${r}`] ?? 0) + 1;
const obsReasons = q(A.sqlite, `SELECT COALESCE(source_role,'(undeclared)') AS role, candidate_signal_eligible AS eligible, eligibility_reason AS reason, COUNT(*) AS n FROM dossier_observations GROUP BY 1,2,3 ORDER BY n DESC`);
const candTargets = new Set(q(A.sqlite, `SELECT target_id FROM dossier_candidates`).map((r) => r.target_id));
const stateOf = new Map(resA.eligibility.map((e) => [e.conceptId, e]));
const retainedNotCandidates = resA.eligibility.filter((e) => e.state !== 'ELIGIBLE');
const retainedSample = retainedNotCandidates.slice(0, 12).map((e) => ({ topic: conceptLabel.get(e.conceptId), state: e.state, reasons: e.reasonCodes, observations_retained: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE concept_id = ?`, e.conceptId), candidate_created: candTargets.has(e.conceptId) }));
const signalTotal = studies.reduce((n, s) => n + CT.normalizeStudy(s).signals.length, 0);
const evalStatuses = {};
for (const e of resA.evaluations) { const k = e.status === 'EVALUATED' ? `EVALUATED:${e.candidateClass}/${e.evaluationStatus}` : e.status; evalStatuses[k] = (evalStatuses[k] ?? 0) + 1; }
const classesNoCriteria = {};
for (const e of resB.evaluations) { const k = e.status === 'EVALUATED' ? `${e.candidateClass}/${e.evaluationStatus}` : e.status; classesNoCriteria[k] = (classesNoCriteria[k] ?? 0) + 1; }
const checks = {
  label: 'POC_ONLY (page size and every criterion below are local test values, not production configuration)',
  one_request: requests === 1,
  page_size_POC_ONLY: pageSize,
  studies_fetched: studies.length,
  total_in_registry: raw.body.totalCount,
  next_page_token_present: Boolean(raw.body.nextPageToken),
  items_new: resA.readers[0].itemsNew,
  signals_in_response: signalTotal,
  observations_written: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations`),
  concepts_discovered: concepts.length,
  all_concepts_PROPOSED: concepts.every((c) => c.state === 'PROPOSED'),
  active_identities: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_concepts WHERE state = 'ACTIVE'`),
  concept_labels_not_from_response: notFromResponse.length,
  concepts_by_editorial_eligibility: states,
  concept_eligibility_reasons: conceptReasons,
  observation_eligibility_distribution: obsReasons,
  candidates_created: cands.length,
  candidate_evaluations: evalStatuses,
  every_candidate_target_is_ELIGIBLE: [...candTargets].every((id) => stateOf.get(id)?.state === 'ELIGIBLE'),
  no_candidate_for_non_eligible_concept: retainedNotCandidates.every((e) => !candTargets.has(e.conceptId)),
  ineligible_observations_retained: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations WHERE candidate_signal_eligible <> 'TRUE'`),
  observations_equal_signals_no_loss: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_observations`) === signalTotal,
  all_candidates_EVERGREEN: cands.every((c) => c.temporal_identity === 'EVERGREEN'),
  review_ready_with_POC_ONLY_test_criterion: resA.reviewReady.length,
  review_ready_without_owner_criteria: resB.reviewReady.length,
  classes_without_owner_criteria: classesNoCriteria,
  eligibility_identical_with_caps_only_policy: JSON.stringify(resB.eligibility.map((e) => [e.state, e.reasonCodes]).sort()) === JSON.stringify(resA.eligibility.map((e) => [e.state, e.reasonCodes]).sort()),
  reviews_written: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`),
  hub_source_items_written: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM source_items`),
  evergreen_runtime_rows: cnt(A.sqlite, `SELECT COUNT(*) AS n FROM evergreen_runtime_state`),
};
// Success = SEMANTIC SEPARATION works. No candidate count, no review-ready count and no page size is a success criterion.
const REAL_E2E = checks.one_request && checks.items_new >= 1 && checks.all_concepts_PROPOSED && checks.active_identities === 0 && checks.concept_labels_not_from_response === 0
  && checks.observations_equal_signals_no_loss && checks.every_candidate_target_is_ELIGIBLE && checks.no_candidate_for_non_eligible_concept && checks.all_candidates_EVERGREEN
  && checks.review_ready_without_owner_criteria === 0 && checks.reviews_written === 0 && checks.hub_source_items_written === 0 ? 'PASS' : 'FAIL';
const report = { REAL_E2E, ran_at: new Date().toISOString(), request: raw.url, checks, retained_non_candidate_sample: retainedSample, sample_candidates: sample, run_a_readers: resA.readers, relation_refusals: resA.relationRefusals };
writeFileSync(`.logs/ct-poc/e2e-${stamp}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(REAL_E2E === 'PASS' ? 0 : 1);
