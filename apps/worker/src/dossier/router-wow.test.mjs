// Phases J + K: acute-vs-structural router and the public-health WOW framework (pure, local). Policies below are TEST-ONLY fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { testPolicy } from './test-support.mjs';

const RT = await bundle('apps/worker/src/dossier/router.ts', 'dossier-router');
const W = await bundle('apps/worker/src/dossier/wow.ts', 'dossier-wow');
const { DEFAULT_POLICY } = await bundle('apps/worker/src/dossier/policy.ts', 'dossier-policy-rw');

const PH = 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH';
const ev = (over = {}) => ({ domain: 'HEALTH', eventKind: 'SINGLE_EVENT', credibleAnchor: 'UNKNOWN', globalFrontierSupport: 'UNKNOWN', ...over });

test('J acute vs structural: a single event stays TIME_SENSITIVE_CONTEXT; a structural indicator is an EVERGREEN dossier candidate; both may feed without duplicate acquisition', () => {
  const single = RT.routeSignal(ev(), DEFAULT_POLICY);
  assert.deepEqual(single.outcomes, ['TIME_SENSITIVE_CONTEXT']);
  const structural = RT.routeSignal(ev({ eventKind: 'STRUCTURAL_INDICATOR' }), DEFAULT_POLICY);
  assert.deepEqual(structural.outcomes, ['EVERGREEN_DOSSIER'], 'no numeric policy is needed when the evidence itself is a structural indicator');
  // the same event is repeated: it feeds BOTH the acute context and the dossier (one source event, two destinations)
  const both = RT.routeSignal(ev({ occurrences: 5 }), testPolicy());
  assert.deepEqual(both.outcomes, ['TIME_SENSITIVE_CONTEXT', 'EVERGREEN_DOSSIER']);
  assert.deepEqual(RT.routeSignal(ev({ occurrences: 2 }), testPolicy()).outcomes, ['TIME_SENSITIVE_CONTEXT'], 'below the (test) repetition criterion it stays acute only');
  assert.equal(RT.routeSignal(ev({ eventKind: 'REPEATED_PATTERN' }), DEFAULT_POLICY).outcomes[0], 'EVERGREEN_DOSSIER');
});

test('J missing policy or evidence fails closed to WATCH / not ready; no repetition rule is invented', () => {
  const r = RT.routeSignal(ev({ occurrences: 50 }), DEFAULT_POLICY);
  assert.deepEqual(r.outcomes, ['TIME_SENSITIVE_CONTEXT'], 'without a repetition policy a high count is never read as repetition');
  assert.ok(r.reasons.includes('POLICY_NOT_SET:repetition_criteria'));
  assert.deepEqual(RT.classifyRepetition(50, DEFAULT_POLICY), { kind: 'UNKNOWN', reason: 'POLICY_NOT_SET:repetition_criteria' });
  assert.deepEqual(RT.classifyRepetition(undefined, testPolicy()), { kind: 'UNKNOWN', reason: 'occurrences_unknown' });
  assert.equal(RT.classifyRepetition(3, testPolicy()).kind, 'REPEATED_PATTERN');
  const unk = RT.routeSignal(ev({ eventKind: 'UNKNOWN' }), testPolicy());
  assert.deepEqual([unk.outcomes, unk.notReady], [['WATCH'], true]);
  assert.deepEqual(RT.routeSignal(ev({ eventKind: 'MADE_UP' }), testPolicy()).reasons, ['event_kind_not_in_vocabulary']);
});

test('J public-health dossiers need a credible anchor; without the configured qualification the router fails closed; global emerging needs frontier support', () => {
  const phStructural = ev({ domain: PH, eventKind: 'STRUCTURAL_INDICATOR' });
  const noPolicy = RT.routeSignal({ ...phStructural, credibleAnchor: true }, DEFAULT_POLICY);
  assert.deepEqual([noPolicy.outcomes, noPolicy.notReady, noPolicy.reasons], [['WATCH'], true, ['POLICY_NOT_SET:public_health_credible_anchor']], 'anchor qualification is CONFIG_REQUIRED: fail closed');
  assert.deepEqual(RT.routeSignal({ ...phStructural, credibleAnchor: false }, testPolicy()).outcomes, ['WATCH']);
  assert.deepEqual(RT.routeSignal({ ...phStructural, credibleAnchor: 'UNKNOWN' }, testPolicy()).outcomes, ['WATCH']);
  assert.deepEqual(RT.routeSignal({ ...phStructural, credibleAnchor: true }, testPolicy()).outcomes, ['EVERGREEN_DOSSIER']);
  // an acute public-health event remains time-sensitive context even with no anchor; the dossier branch is the one that is gated
  const acute = RT.routeSignal(ev({ domain: PH, occurrences: 9 }), testPolicy());
  assert.deepEqual(acute.outcomes, ['TIME_SENSITIVE_CONTEXT']);
  assert.ok(acute.reasons.includes('NO_CREDIBLE_ANCHOR'));
  assert.deepEqual(RT.routeSignal(ev({ eventKind: 'GLOBAL_EMERGING', globalFrontierSupport: true }), DEFAULT_POLICY).outcomes, ['FRONTIER_DOSSIER']);
  const weak = RT.routeSignal(ev({ eventKind: 'GLOBAL_EMERGING', globalFrontierSupport: 'UNKNOWN' }), DEFAULT_POLICY);
  assert.deepEqual([weak.outcomes, weak.reasons], [['WATCH'], ['GLOBAL_FRONTIER_SUPPORT_UNKNOWN']]);
  const withFrontier = RT.routeSignal(ev({ eventKind: 'STRUCTURAL_INDICATOR', globalFrontierSupport: true }), DEFAULT_POLICY);
  assert.deepEqual(withFrontier.outcomes, ['EVERGREEN_DOSSIER', 'FRONTIER_DOSSIER']);
});

test('J/K the router and WOW modules are pure: no storage, no network, no routing hook, no numeric policy literal', () => {
  for (const f of ['router.ts', 'wow.ts']) {
    const src = readFileSync(`apps/worker/src/dossier/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/from '\.\/(repo|aggregation|clusters)'|fetch\(|db\.|prepare\(|process\.|env\./.test(src), `${f} must be pure`);
    const numbers = [...src.matchAll(/(?<![\w.'"-])(\d+(?:\.\d+)?)(?![\w'"-])/g)].map((m) => m[1]).filter((n) => !['0', '1'].includes(n));
    assert.deepEqual(numbers, [], `${f} contains numeric literals that look like invented policy`);
  }
});

const wowIn = (over = {}) => ({
  domain: PH, lane: 'GLOBAL_PUBLIC_HEALTH_FRONTIER', patterns: ['HIDDEN_EXPOSURE'],
  dimensions: { SURPRISE: { state: 'MEASURED', value: 4 }, DATA_STRENGTH: { state: 'MEASURED', value: 3 }, TURKEY_RELEVANCE: { state: 'MEASURED', value: 2 } },
  anchors: [{ family: 'TURKEY_PUBLIC_HEALTH_DATA', provenance: 'MEASURED' }], ...over,
});

test('K credible anchor present -> WOW candidate; patterns and dimensions are preserved separately; social-only never grounds a public-health candidate', () => {
  const ok = W.evaluateWow(wowIn(), testPolicy());
  assert.deepEqual([ok.status, ok.patternClass, ok.factuallyGrounded], ['WOW_CANDIDATE', 'HIDDEN_EXPOSURE', true]);
  assert.deepEqual(Object.keys(ok.dimensions), ['SURPRISE', 'DATA_STRENGTH', 'TURKEY_RELEVANCE'], 'dimensions stay separate: no universal score');
  const social = W.evaluateWow(wowIn({ anchors: [] }), testPolicy());
  assert.deepEqual([social.status, social.factuallyGrounded, social.reasons.includes('NO_CREDIBLE_ANCHOR')], ['WATCH', false, true], 'social/search/creator activity alone cannot factually ground a public-health topic');
  const wrongFamily = W.evaluateWow(wowIn({ anchors: [{ family: 'TURKEY_SOCIAL_MOMENTUM', provenance: 'SOCIAL' }] }), testPolicy());
  assert.equal(wrongFamily.status, 'WATCH');
  assert.equal(wrongFamily.factuallyGrounded, false);
});

test('K measured vs modeled: a modeled-only anchor does not qualify under the configured provenance; a measured one does', () => {
  const modeled = W.evaluateWow(wowIn({ anchors: [{ family: 'GLOBAL_ENVIRONMENTAL_OBSERVATION', provenance: 'MODELED' }] }), testPolicy());
  assert.deepEqual([modeled.status, modeled.factuallyGrounded, modeled.reasons.includes('MODELED_DATA_ONLY')], ['WATCH', false, true]);
  const measured = W.evaluateWow(wowIn({ anchors: [{ family: 'GLOBAL_ENVIRONMENTAL_OBSERVATION', provenance: 'MEASURED' }, { family: 'GLOBAL_ENVIRONMENTAL_OBSERVATION', provenance: 'MODELED' }] }), testPolicy());
  assert.equal(measured.status, 'WOW_CANDIDATE');
});

test('K global significance with Turkey data UNKNOWN is representable and not treated as zero or as a blocker', () => {
  const r = W.evaluateWow(wowIn({ lane: 'GLOBAL_PUBLIC_HEALTH_FRONTIER', patterns: ['GLOBAL_SHIFT'], dimensions: { GLOBAL_SIGNIFICANCE: { state: 'MEASURED', value: 5 }, AUDIENCE_RELEVANCE: { state: 'MEASURED', value: 4 }, TURKEY_RELEVANCE: { state: 'UNKNOWN', value: null } }, anchors: [{ family: 'GLOBAL_PUBLIC_HEALTH_DATA', provenance: 'MEASURED' }] }), testPolicy());
  assert.equal(r.status, 'WOW_CANDIDATE');
  assert.ok(r.reasons.includes('LOW_TURKEY_DATA'));
  assert.deepEqual(r.dimensions.TURKEY_RELEVANCE, { state: 'UNKNOWN', value: null });
});

test('K without owner-configured thresholds the answer is NOT_READY, never an automatic promotion; vocabulary and explicit value states are enforced', () => {
  assert.deepEqual(W.evaluateWow(wowIn(), DEFAULT_POLICY).reasons, ['POLICY_NOT_SET:wow_thresholds']);
  assert.equal(W.evaluateWow(wowIn(), DEFAULT_POLICY).status, 'NOT_READY');
  const noAnchorPolicy = W.evaluateWow(wowIn(), testPolicy({ publicHealthCredibleAnchor: { status: 'CONFIG_REQUIRED' } }));
  assert.deepEqual([noAnchorPolicy.status, noAnchorPolicy.reasons], ['NOT_READY', ['POLICY_NOT_SET:public_health_credible_anchor']], 'anchor qualification unset: fail closed');
  assert.match(W.evaluateWow(wowIn({ patterns: ['VIRAL_SPIKE'] }), testPolicy()).reasons[0], /pattern_not_in_vocabulary/);
  assert.match(W.evaluateWow(wowIn({ dimensions: { VIRALITY: { state: 'MEASURED', value: 9 } } }), testPolicy()).reasons[0], /dimension_not_in_vocabulary/);
  assert.match(W.evaluateWow(wowIn({ dimensions: { SURPRISE: 4 } }), testPolicy()).reasons[0], /dimension_needs_explicit_value_state:SURPRISE/);
  const few = W.evaluateWow(wowIn({ dimensions: { SURPRISE: { state: 'MEASURED', value: 4 }, DATA_STRENGTH: { state: 'UNKNOWN', value: null } } }), testPolicy());
  assert.deepEqual([few.status, few.reasons.includes('INSUFFICIENT_MEASURED_DIMENSIONS')], ['WATCH', true]);
  const nonQual = W.evaluateWow(wowIn({ patterns: ['SYSTEM_SURPRISE'] }), testPolicy());
  assert.deepEqual([nonQual.status, nonQual.reasons.includes('NO_QUALIFYING_PATTERN')], ['WATCH', true]);
});

test('K anchors come from live aggregates only under the configured qualification (none without a policy)', () => {
  const aggs = [
    { aggregate_id: 'a1', signal_family: 'TURKEY_PUBLIC_HEALTH_DATA', measurement_provenance: 'ADMINISTRATIVE', observation_count: 2 },
    { aggregate_id: 'a2', signal_family: 'TURKEY_SOCIAL_MOMENTUM', measurement_provenance: 'SOCIAL', observation_count: 40 },
    { aggregate_id: 'a3', signal_family: 'GLOBAL_ENVIRONMENTAL_OBSERVATION', measurement_provenance: 'MODELED', observation_count: 9 },
  ];
  assert.deepEqual(W.credibleAnchorsFromAggregates(aggs, DEFAULT_POLICY), []);
  assert.deepEqual(W.credibleAnchorsFromAggregates(aggs, testPolicy()).map((a) => a.aggregateId), ['a1']);
});
