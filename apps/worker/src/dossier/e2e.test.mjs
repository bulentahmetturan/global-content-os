// Phases P + Q: deterministic local end-to-end run over fictional multi-domain fixtures, and reader failure isolation.
// LOCAL ONLY: mock readers, node:sqlite, test-only policy, a network that throws if touched. Nothing here is a production result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, testPolicy } from './test-support.mjs';
import { buildWorld, LABELS } from './fixtures.mjs';

const { DossierRepo } = await bundle('apps/worker/src/dossier/repo.ts', 'dossier-repo-e2e');
const CN = await bundle('apps/worker/src/dossier/connectors.ts', 'dossier-connectors-e2e');
const K = await bundle('apps/worker/src/dossier/classifier.ts', 'dossier-classifier-e2e');
const O = await bundle('apps/worker/src/dossier/orchestrator.ts', 'dossier-orchestrator');
const RV = await bundle('apps/worker/src/dossier/review.ts', 'dossier-review-e2e');
const H = await bundle('apps/worker/src/dossier/handoff.ts', 'dossier-handoff-e2e');
const SN = await bundle('apps/worker/src/dossier/snapshots.ts', 'dossier-snapshots-e2e');
const AC = await bundle('apps/worker/src/dossier/actors.ts', 'dossier-actors-e2e');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-e2e');

const human = { kind: 'HUMAN', id: 'hub-user' };
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const CONFIG = ['packages/source-catalog/data/temporal-paths.json', 'config/feeds.json', 'config/routes.json', 'wrangler.toml'];
const all = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);

async function fresh() {
  const { sqlite, db } = openDossierDb();
  const repo = new DossierRepo(db, makeCtx());
  const a1 = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Panelist One' });
  const a2 = await repo.createActor({ actor_kind: 'PERSON', display_name: 'Fictional Panelist Two' });
  const world = buildWorld({ createMockConnector: CN.createMockConnector, createFixtureClassifier: K.createFixtureClassifier }, [a1, a2]);
  return { sqlite, repo, a1, a2, ...world };
}
const cfgOf = (w, over = {}) => ({ policy: testPolicy(), readers: w.readers, classifier: w.classifier, extractor: K.createFixtureExtractor(), aggregationVersion: 'agg-e2e', algorithmVersion: 'cand-e2e', ...over });
const byLabel = async (repo, label) => (await repo.db.prepare(`SELECT * FROM dossier_concepts WHERE label = ?`).bind(label).first());
const evalOf = async (repo, conceptId) => repo.getCandidateByTarget('CONCEPT', conceptId);
const latestClass = async (repo, candidateId) => (await repo.listSnapshots(candidateId, 1))[0].candidate_class;

test('P local multi-domain end-to-end: all five domains traverse signal -> observation -> concept -> aggregate -> candidate -> snapshot -> review-ready; nothing is canonical, live or EVERGREEN-violating', async () => {
  const w = await fresh();
  const cfgFiles = CONFIG.map(hash);
  const feedsBefore = JSON.stringify(all(w.sqlite, 'SELECT * FROM source_feeds ORDER BY id'));
  const real = globalThis.fetch;
  let netCalls = 0;
  globalThis.fetch = () => { netCalls += 1; throw new Error('network forbidden'); };
  let res;
  try { res = await O.runLocalPipeline(w.repo, cfgOf(w)); } finally { globalThis.fetch = real; }
  assert.equal(netCalls, 0, 'the whole run used no network');
  assert.equal(res.status, 'OK');
  assert.equal(res.readers.length, 10);
  assert.ok(res.readers.every((r) => r.status === 'SUCCEEDED' && r.runId && r.error === null), JSON.stringify(res.readers.filter((r) => r.status !== 'SUCCEEDED')));
  assert.ok(res.readers.every((r) => r.itemsSeen >= 1 && r.itemsNew >= 1));

  // every discovered concept is PROPOSED (provisional, human-reviewable); nothing is ACTIVE
  const states = all(w.sqlite, `SELECT DISTINCT state FROM dossier_concepts`).map((r) => r.state);
  assert.deepEqual(states, ['PROPOSED']);
  // the personal item produced no observation and no concept
  assert.equal(await byLabel(w.repo, 'Personal Trip Fiction'), null);

  // one candidate per domain, class from the (test) policy; classes are discovery states, not verdicts
  const health = await byLabel(w.repo, LABELS.health);
  const protocol = await byLabel(w.repo, LABELS.protocol);
  const supplement = await byLabel(w.repo, LABELS.supplement);
  const form = await byLabel(w.repo, LABELS.supplementForm);
  const tech = await byLabel(w.repo, LABELS.tech);
  const phA = await byLabel(w.repo, LABELS.phAnchored);
  const phS = await byLabel(w.repo, LABELS.phSocialOnly);
  assert.deepEqual([health.domain, protocol.domain, supplement.domain, tech.domain, phA.domain], ['HEALTH', 'NUTRITION_PROTOCOL', 'SUPPLEMENT', 'LONGEVITY_TECHNOLOGY', 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH']);
  assert.equal(await latestClass(w.repo, (await evalOf(w.repo, health.concept_id)).candidate_id), 'STRONG', 'HEALTH: several independent origins, creators and signal worlds');
  assert.equal(await latestClass(w.repo, (await evalOf(w.repo, protocol.concept_id)).candidate_id), 'EMERGING', 'NUTRITION_PROTOCOL: creator + TikTok-CSI-style demand');
  assert.equal(await latestClass(w.repo, (await evalOf(w.repo, supplement.concept_id)).candidate_id), 'CORRECTIVE', 'SUPPLEMENT: commercially concentrated, researched carefully, not rejected');
  assert.equal(await latestClass(w.repo, (await evalOf(w.repo, tech.concept_id)).candidate_id), 'FRONTIER', 'LONGEVITY_TECHNOLOGY: frontier signal with no Turkish demand');
  assert.equal(await latestClass(w.repo, (await evalOf(w.repo, phA.concept_id)).candidate_id), 'STRONG', 'PUBLIC HEALTH: official/measured anchor present');
  assert.equal(await evalOf(w.repo, phS.concept_id), null, 'PUBLIC HEALTH: social-only never becomes a candidate (integrity gate)');
  const socialOnly = res.watchTargets.find((x) => x.targetId === phS.concept_id);
  assert.ok(socialOnly && socialOnly.reasonCodes.includes('NO_CREDIBLE_ANCHOR') && socialOnly.promotion.reasonCodes.includes('INTEGRITY_NOT_SATISFIED'), 'it stays a WATCH target with the reason');
  // the supplement FORM is its own topic (its own proposal), with no inferred superiority
  assert.equal(form.domain, 'SUPPLEMENT');
  assert.notEqual(form.concept_id, supplement.concept_id);

  // cross-domain pair + direct triple, both PROPOSED relations with explicit members; the pair is aggregated and evaluated
  const rels = all(w.sqlite, `SELECT * FROM dossier_relations ORDER BY depth`);
  assert.deepEqual(rels.map((r) => [r.depth, r.state]), [[2, 'PROPOSED'], [3, 'PROPOSED']]);
  assert.equal(all(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_relation_members`)[0].n, 5);
  const pair = rels[0];
  const pairCand = await w.repo.getCandidateByTarget('RELATION', pair.relation_id);
  assert.ok(pairCand, 'the cross-domain pair has its own stable candidate');
  assert.equal(await latestClass(w.repo, pairCand.candidate_id), 'EMERGING', 'two independent origins co-mention the pair');
  const pairAgg = (await w.repo.listAggregates('RELATION', pair.relation_id)).find((a) => a.window_kind === 'FAST_7D');
  assert.deepEqual([pairAgg.signal_family, pairAgg.signal_subfamily, pairAgg.observation_count], ['RELATION_SIGNAL', 'JOINT_SOURCE_MENTION', 2]);
  assert.equal(all(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_relation_observations WHERE joint_signal_kind = 'TITLE_OR_CAPTION_CO_OCCURRENCE'`)[0].n, 1, 'the direct triple signal was recorded');
  assert.equal(res.relationRefusals.length, 0);

  // commercial context kept; clinician-reported question kept separate from prevalence
  assert.ok(all(w.sqlite, `SELECT 1 FROM dossier_observations WHERE observation_kind = 'CLINICIAN_REPORTED_PUBLIC_QUESTION'`).length >= 1);
  assert.deepEqual(all(w.sqlite, `SELECT commercial_context AS c, COUNT(*) AS n FROM dossier_external_source_items WHERE commercial_context <> 'NONE' AND commercial_context <> 'UNKNOWN' GROUP BY 1 ORDER BY 1`).map((r) => r.c), ['AFFILIATE', 'OWN_PRODUCT', 'SPONSORED']);

  // measured and administrative anchors, plus the fast creator signals, are distinct aggregates
  const phAggs = await w.repo.listAggregates('CONCEPT', phA.concept_id);
  assert.ok(phAggs.some((a) => a.window_kind === 'SOURCE_PERIOD' && a.measurement_provenance === 'MEASURED' && a.value === 21));
  assert.ok(phAggs.some((a) => a.window_kind === 'RELEASE_PERIOD' && a.measurement_provenance === 'ADMINISTRATIVE' && a.value === 3.2));
  assert.ok(phAggs.some((a) => a.window_kind === 'FAST_7D' && a.signal_family === 'TURKEY_SOCIAL_MOMENTUM'));
  assert.ok(!phAggs.some((a) => ['ENVIRONMENTAL_MEASUREMENT', 'TURKEY_PUBLIC_HEALTH_DATA'].includes(a.signal_family) && a.window_kind.startsWith('FAST') || a.window_kind === 'BASELINE_90D' && a.signal_family === 'ENVIRONMENTAL_MEASUREMENT'), 'structural data is not forced into fast windows');

  // every candidate is a stable EVERGREEN identity with a frozen, explainable WHY-NOW; nothing is auto-promoted or sent
  const cands = all(w.sqlite, `SELECT * FROM dossier_candidates`);
  assert.ok(cands.length >= 8);
  assert.ok(cands.every((c) => c.temporal_identity === 'EVERGREEN'));
  for (const c of cands) {
    const sn = (await w.repo.listSnapshots(c.candidate_id, 1))[0];
    const ex = await SN.explainWhyNow(w.repo, sn.snapshot_id);
    assert.ok(ex.aggregateStates.length >= 1 && ex.rawMembershipReconstructable === false);
  }
  assert.ok(res.reviewReady.length >= 5 && res.reviewReady.every((r) => ['STRONG', 'EMERGING', 'CORRECTIVE', 'FRONTIER'].includes(r.candidateClass)));
  assert.ok(res.reviewReady.every((r) => !['WATCH'].includes(r.candidateClass)));
  assert.equal(all(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_reviews`)[0].n, 0, 'the pipeline never reviews anything');
  assert.equal(all(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_candidates WHERE state IN ('ACCEPTED','REJECTED','RESEARCH_REQUESTED')`)[0].n, 0);

  // no source, config, scheduler or registry change
  assert.equal(JSON.stringify(all(w.sqlite, 'SELECT * FROM source_feeds ORDER BY id')), feedsBefore);
  assert.equal(all(w.sqlite, 'SELECT COUNT(*) AS n FROM evergreen_runtime_state')[0].n, 0);
  assert.deepEqual(CONFIG.map(hash), cfgFiles);

  // the human step: ACCEPT one candidate, then (and only then) a local research hand-off can be built
  const healthCand = await evalOf(w.repo, health.concept_id);
  const accepted = await RV.submitReview(w.repo, { targetType: 'DOSSIER_CANDIDATE', targetId: healthCand.candidate_id, decision: 'ACCEPT', reviewer: human });
  assert.equal(accepted.applied.to, 'ACCEPTED');
  assert.equal((await byLabel(w.repo, LABELS.health)).state, 'PROPOSED', 'accepting the candidate did not canonicalize the concept');
  const dto = await H.buildResearchHandoff(w.repo, healthCand.candidate_id);
  assert.equal(dto.canonical_topic, LABELS.health);
  assert.equal(dto.domain, 'HEALTH');
  assert.ok(dto.related_concepts.length >= 2, 'related concepts come from the discovered relations');
  assert.deepEqual(H.findForbiddenKeys(dto), []);
  H.serializeHandoff(dto);
});

test('P the run is idempotent: a second identical run adds no observation, no candidate and no snapshot', async () => {
  const w = await fresh();
  const cfg = cfgOf(w);
  await O.runLocalPipeline(w.repo, cfg);
  const count = (t) => all(w.sqlite, `SELECT COUNT(*) AS n FROM ${t}`)[0].n;
  const before = ['dossier_observations', 'dossier_candidates', 'dossier_candidate_snapshots', 'dossier_concepts', 'dossier_relations', 'dossier_external_source_items', 'dossier_signal_aggregates'].map(count);
  const second = await O.runLocalPipeline(w.repo, cfg);
  const after = ['dossier_observations', 'dossier_candidates', 'dossier_candidate_snapshots', 'dossier_concepts', 'dossier_relations', 'dossier_external_source_items', 'dossier_signal_aggregates'].map(count);
  assert.deepEqual(after, before);
  assert.ok(second.readers.every((r) => r.itemsNew === 0 && r.observationsWritten === 0), 'dedupe: every item and observation already existed');
  assert.ok(second.evaluations.every((e) => e.status === 'NO_SIGNAL' || e.status === 'WATCH' || e.status === 'NOT_ELIGIBLE' || e.snapshot.reason === 'UNCHANGED'));
  assert.equal(count('dossier_signal_runs'), 20, 'but each execution is attributed: one run row per reader per run');
});

test('P fail closed: without the owner-configured per-run caps (or an approved extraction method) nothing is read at all', async () => {
  const w = await fresh();
  let fetches = 0;
  const spy = w.readers.map((r) => ({ ...r, fetch: async (p) => { fetches += 1; return r.fetch(p); } }));
  const noCaps = await O.runLocalPipeline(w.repo, cfgOf({ ...w, readers: spy }, { policy: DEFAULT_POLICY }));
  assert.equal(noCaps.status, 'POLICY_NOT_SET');
  assert.deepEqual(noCaps.policyMissing, ['per_run_item_cap', 'per_run_fetch_cap']);
  const onlyItems = await O.runLocalPipeline(w.repo, cfgOf({ ...w, readers: spy }, { policy: testPolicy({ perRunFetchCap: { status: 'CONFIG_REQUIRED' } }) }));
  assert.deepEqual(onlyItems.policyMissing, ['per_run_fetch_cap']);
  const prod = await O.runLocalPipeline(w.repo, cfgOf({ ...w, readers: spy }, { extractor: { method: 'SOME_LLM_METHOD', extract: () => ({ mentions: [], jointGroups: [] }) } }));
  assert.deepEqual(prod.policyMissing, ['extraction_method'], 'a non-fixture extraction method is an OWNER decision');
  assert.equal(fetches, 0);
  assert.equal(all(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_signal_runs`)[0].n, 0);
  const approved = await O.runLocalPipeline(w.repo, cfgOf({ ...w, readers: spy.slice(0, 1) }, { extractor: { method: 'APPROVED_METHOD', extract: () => ({ mentions: [], jointGroups: [] }) }, policy: testPolicy({ extractionMethod: { status: 'SET', value: 'APPROVED_METHOD' } }) }));
  assert.equal(approved.status, 'OK');
});

test('P the per-run item cap bounds what any reader can contribute', async () => {
  const w = await fresh();
  const res = await O.runLocalPipeline(w.repo, cfgOf(w, { policy: testPolicy({ perRunItemCap: { status: 'SET', value: 1 }, perRunFetchCap: { status: 'SET', value: 1 } }) }));
  assert.ok(res.readers.every((r) => r.itemsSeen <= 1 && r.itemsNew <= 1));
  assert.equal(res.readers.find((r) => r.readerId === 'rss-a').nextCursor, '1', 'the reader reports where it stopped; no scheduler state is stored');
});

test('Q reader failure isolation: failing readers (fetch error, invalid item, throwing normalizer, partial write) never silence the others', async () => {
  const w = await fresh();
  const ok1 = w.readers.find((r) => r.descriptor.id === 'rss-a');
  const ok2 = w.readers.find((r) => r.descriptor.id === 'yt-a');
  const failFetch = CN.createMockConnector({ id: 'bad-fetch', class: 'RSS_WEB', acquisitionSourceId: 'src-bad-fetch', items: [], failWith: 'upstream exploded' });
  const badItem = CN.createMockConnector({ id: 'bad-item', platformMode: 'TIKTOK_CSI_MANUAL', acquisitionSourceId: 'src-bad-item', items: [{ acquisitionSourceId: 'x', platform: null, identity: { strategy: 'MANUAL_SNAPSHOT_KEY', value: 'k' }, signals: [{ conceptLabel: 'x', observationKind: 'SOCIAL_MOMENTUM', signalFamily: 'TURKEY_SOCIAL_MOMENTUM', measurementProvenance: 'SOCIAL', observedAt: '2026-10-02T00:00:00Z' }] }] });
  const throwingNormalizer = { ...CN.createMockConnector({ id: 'bad-normalize', class: 'RSS_WEB', acquisitionSourceId: 'src-bad-norm', items: [{ acquisitionSourceId: 'x', platform: null, identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value: 'n1' } }] }), normalize: () => { throw new Error('normalizer bug'); } };
  // partial: the 2nd item makes the classifier throw AFTER the first was stored
  const partialItems = [{ acquisitionSourceId: 'x', platform: null, identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value: 'ok-item' }, fixture: { extraction: { mentions: [{ label: 'Partial Fiction Topic', domainHint: 'HEALTH' }], jointGroups: [] } } }, { acquisitionSourceId: 'x', platform: null, identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value: 'poison-item' } }];
  const partial = CN.createMockConnector({ id: 'partial', class: 'RSS_WEB', acquisitionSourceId: 'src-partial', items: partialItems });
  const edu = { contentClass: 'HEALTH_EDUCATIONAL', commercialContext: 'NONE', clinicianReportedPublicQuestion: false };
  const classifier = { method: 'FIXTURE', classify: (item) => (['ok-item', 'poison-item'].includes(item.identity.value) ? edu : w.classifier.classify(item)) };
  const fixtureExtractor = K.createFixtureExtractor();
  const extractor = { method: 'FIXTURE', extract: (item) => { if (item.identity.value === 'poison-item') throw new Error('extractor exploded'); return fixtureExtractor.extract(item); } };
  const res = await O.runLocalPipeline(w.repo, cfgOf(w, { readers: [failFetch, ok1, badItem, throwingNormalizer, partial, ok2], classifier, extractor }));
  const by = Object.fromEntries(res.readers.map((r) => [r.readerId, r]));
  assert.equal(by['bad-fetch'].status, 'FAILED');
  assert.equal(by['bad-fetch'].error, 'upstream exploded');
  assert.equal(by['bad-item'].status, 'FAILED');
  assert.match(by['bad-item'].error, /signal_family_not_allowed_for_connector:TURKEY_SOCIAL_MOMENTUM/);
  assert.equal(by['bad-normalize'].status, 'FAILED');
  assert.equal(by['bad-normalize'].error, 'normalizer bug');
  assert.equal(by['partial'].status, 'PARTIAL', 'work done before the failure is kept and honestly labelled');
  assert.match(by['partial'].error, /extractor exploded/);
  assert.ok(by['partial'].observationsWritten > 0 && by['partial'].itemsNew === 2, 'both items were stored as thin references and the first was fully processed before the failure');
  assert.deepEqual([by['rss-a'].status, by['yt-a'].status], ['SUCCEEDED', 'SUCCEEDED'], 'readers before and after the failures still ran');
  assert.ok(by['rss-a'].observationsWritten > 0 && by['yt-a'].observationsWritten > 0);
  // failures are attributable provenance, not silent: one run row per reader with its error summary
  const runs = all(w.sqlite, `SELECT reader_id, status, error_summary FROM dossier_signal_runs ORDER BY started_at`);
  assert.equal(runs.length, 6);
  assert.deepEqual(runs.filter((r) => r.status !== 'SUCCEEDED').map((r) => r.reader_id).sort(), ['bad-fetch', 'bad-item', 'bad-normalize', 'partial']);
  assert.ok(runs.filter((r) => r.status !== 'SUCCEEDED').every((r) => r.error_summary));
  // the healthy readers' evidence still became aggregates, candidates and snapshots
  assert.ok(res.evaluations.some((e) => e.status === 'EVALUATED'));
  const health = await byLabel(w.repo, LABELS.health);
  assert.ok(health);
  assert.ok((await evalOf(w.repo, health.concept_id)));
  // the partial reader's pre-failure concept exists as a PROPOSED identity, not lost and not canonical
  assert.equal((await byLabel(w.repo, 'Partial Fiction Topic')).state, 'PROPOSED');
  // and the scheduler/runtime state of the existing Evergreen runner was never touched
  assert.equal(all(w.sqlite, 'SELECT COUNT(*) AS n FROM evergreen_runtime_state')[0].n, 0);
});

test('D actor discovery over a pipeline run: repeated unknown mentions become PROPOSED actors only under an owner policy, never ACTIVE, never a source', async () => {
  const w = await fresh();
  const res = await O.runLocalPipeline(w.repo, cfgOf(w));
  const runId = res.readers[0].runId;
  const mention = (by, name, key) => AC.recordActorMention(w.repo, { mentioningActorId: by, mentionedName: name, signalFamily: 'TR_CLINICIAN_CREATOR_PULSE', observedAt: '2026-10-02T00:00:00Z', dedupeKey: key, runId, evidenceSpan: 'bounded' });
  await mention(w.a1, 'Fictional Unknown Panelist', 'am1');
  await mention(w.a2, 'fictional unknown panelist', 'am2');
  await mention(w.a1, 'Fictional Panelist Two', 'am3');
  const feeds = JSON.stringify(all(w.sqlite, 'SELECT * FROM source_feeds ORDER BY id'));
  assert.deepEqual(await AC.proposeActorsFromRepeatedMentions(w.repo, DEFAULT_POLICY, { runIds: [runId], limit: 10 }), { status: 'POLICY_NOT_SET', proposed: [] });
  const out = await AC.proposeActorsFromRepeatedMentions(w.repo, testPolicy(), { runIds: [runId], limit: 10 });
  assert.equal(out.proposed.length, 1);
  assert.equal((await w.repo.getActor(out.proposed[0])).state, 'PROPOSED');
  assert.equal(JSON.stringify(all(w.sqlite, 'SELECT * FROM source_feeds ORDER BY id')), feeds);
  assert.equal(all(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_source_actors WHERE state = 'ACTIVE'`)[0].n, 0);
});
