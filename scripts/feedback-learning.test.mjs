import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { editorialFeedbackInput } from './editorial-feedback.mjs';
import { createRelevanceLedger } from './relevance-ledger.mjs';
import { rankCandidates } from './relevance-selection.mjs';

// The feedback store/patterns live in the channel-content-os sibling; CI checks out this repo alone.
const require = createRequire(import.meta.url);
const ccosFeedback = fileURLToPath(new URL('../../channel-content-os/packages/feedback/src/', import.meta.url));
const hasCcos = existsSync(ccosFeedback);
const skipCcos = { skip: !hasCcos && 'channel-content-os sibling not present' };
const { buildFeedbackEvent } = hasCcos ? require(`${ccosFeedback}model.mjs`) : {};
const { createFeedbackStore } = hasCcos ? require(`${ccosFeedback}store.mjs`) : {};
const { aggregatePatterns, proposalsFromPatterns, inspectLearning } = hasCcos ? require(`${ccosFeedback}patterns.mjs`) : {};
const { measureEffectiveness } = hasCcos ? require(`${ccosFeedback}effectiveness.mjs`) : {};

const T = '2026-09-29T10:00:00.000Z';
const human = { kind: 'human', id: 'editor-1' };
const machine = { kind: 'machine', id: 'hub' };
const owner = { kind: 'canonical_owner', id: 'global-content-os' };
const ccosOwner = { kind: 'canonical_owner', id: 'channel-content-os' };
const allow = () => true;

const universe = [
  { id: 'h1', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'hospital-opening', content_family: 'news', base_priority: 10 },
  { id: 'h2', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'hospital-opening', content_family: 'news', base_priority: 10 },
  { id: 'r1', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'regulatory-device', content_family: 'regulatory', base_priority: 10 },
  { id: 'r2', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'regulatory-device', content_family: 'regulatory', base_priority: 10 },
  { id: 'c1', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'clinical-product', content_family: 'clinical', base_priority: 10 },
  { id: 'o1', channel_id: 'hekimler-toplulugu', source_id: 'med-wire', topic: 'hospital-opening', content_family: 'news', base_priority: 10 },
];

function decisionRow(item, action, reason_code) {
  return editorialFeedbackInput(item, { action, reason_code, at: T });
}

test('accept and reject become channel-scoped evidence without invented fields', skipCcos, () => {
  const item = { id: 'h1', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'hospital-opening', content_family: 'news' };
  const rejected = buildFeedbackEvent(decisionRow(item, 'delete', 'not_relevant_for_channel'));
  assert.equal(rejected.ok, true, JSON.stringify(rejected.errors));
  assert.equal(rejected.event.channel_scope.channel_id, 'kaduse-medikal');
  assert.equal(rejected.event.observation.code, 'LOW_RELEVANCE');
  assert.equal(rejected.event.evidence.data.reason_code, 'not_relevant_for_channel');
  const accepted = buildFeedbackEvent(decisionRow({ id: 'r1', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'regulatory-device', content_family: 'regulatory' }, 'promote'));
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors));
  assert.equal(accepted.event.observation.code, 'CANDIDATE_ACCEPTED');
  assert.equal(accepted.event.evidence.data.reason_code, undefined);
  const noTopic = buildFeedbackEvent(decisionRow({ id: 'x', channel_id: 'kaduse-medikal', source_id: 'med-wire' }, 'delete', 'not_relevant_for_channel'));
  assert.equal(noTopic.event.evidence.data.topic, undefined);
});

test('reviewed pattern changes later Kaduse selection and leaves the other channel alone', skipCcos, () => {
  const before = rankCandidates(universe, []);
  assert.equal(before.find((c) => c.id === 'h1').selection_priority, before.find((c) => c.id === 'r1').selection_priority);

  const store = createFeedbackStore({ authorize: allow });
  const inputs = [];
  for (const id of ['h1', 'h2', 'h3']) {
    inputs.push(decisionRow({ id, channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'hospital-opening', content_family: 'news' }, 'delete', 'not_relevant_for_channel'));
  }
  for (const id of ['r1', 'r2', 'r3']) {
    inputs.push(decisionRow({ id, channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'regulatory-device', content_family: 'regulatory' }, 'promote'));
  }
  const events = inputs.map((input) => {
    const saved = store.ingest(machine, input);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    return store.get(saved.feedback_id);
  });
  const groups = aggregatePatterns(events);
  const proposals = proposalsFromPatterns(groups);
  const lower = proposals.find((p) => p.action === 'LOWER_TOPIC_PRIORITY' && p.scope.key === 'hospital-opening');
  assert.ok(lower);
  assert.equal(proposals.some((p) => p.scope.key === 'med-wire' || p.action === 'DISABLE'), false);

  const pattern = groups.find((g) => g.pattern_id === lower.pattern_id);
  const proposalInput = {
    feedback_type: 'EDITORIAL_FEEDBACK',
    origin_system: 'global-content-os',
    subject_type: 'candidate',
    subject_id: pattern.pattern_id,
    timestamp: T,
    channel_scope: { kind: 'channel', channel_id: 'kaduse-medikal' },
    observation: { code: 'LOW_RELEVANCE' },
    evidence: {
      refs: [{ kind: 'pattern', id: pattern.pattern_id }],
      data: { decision: 'rejected', topic: 'hospital-opening', channel_id: 'kaduse-medikal', source_id: 'med-wire', timestamp: T },
    },
    proposed_adjustment: {
      action: lower.action,
      target_class: lower.target_class,
      status: 'PROPOSAL',
      rationale: lower.rationale,
      scope: lower.scope,
    },
    idempotency_key: `proposal-${pattern.pattern_id}`,
  };
  const proposalSaved = store.ingest(machine, proposalInput);
  assert.equal(proposalSaved.ok, true, JSON.stringify(proposalSaved));
  store.requestReview(machine, proposalSaved.feedback_id, 'repeated low relevance');
  assert.equal(store.accept(machine, proposalSaved.feedback_id, 'auto').ok, false);
  assert.equal(store.accept(human, proposalSaved.feedback_id, 'hospital openings are low relevance for Kaduse').ok, true);
  const accepted = store.get(proposalSaved.feedback_id);

  const ledger = createRelevanceLedger({ authorize: allow });
  assert.equal(ledger.apply({ owner: ccosOwner, feedback: accepted, proposal: lower, pattern }).code, 'FEEDBACK_CANONICAL_OWNER_BOUNDARY');
  assert.equal(ledger.apply({ owner, feedback: { ...accepted, review_state: 'OBSERVED' }, proposal: lower, pattern }).code, 'NOT_ACCEPTED');
  const applied = ledger.apply({ owner, feedback: accepted, proposal: lower, pattern, why: 'lower hospital-opening priority' });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  store.markApplied(owner, accepted.feedback_id, applied.change_ref, 'selection priority lowered');

  const after = ledger.rank(universe);
  const hospital = after.find((c) => c.id === 'h1');
  const regulatory = after.find((c) => c.id === 'r1');
  const otherChannel = after.find((c) => c.id === 'o1');
  assert.ok(hospital.selection_priority < regulatory.selection_priority);
  assert.equal(regulatory.selection_priority, 10);
  assert.equal(otherChannel.selection_priority, 10);
  assert.ok(after.findIndex((c) => c.id === 'r1') < after.findIndex((c) => c.id === 'h1'));

  const reversed = ledger.reverse({ owner, adjustment_id: applied.adjustment.adjustment_id, why: 'measurement regressed' });
  assert.equal(reversed.ok, true);
  const restored = ledger.rank(universe);
  assert.equal(restored.find((c) => c.id === 'h1').selection_priority, 10);

  const beforeMetrics = [
    ...Array.from({ length: 4 }, () => ({ channel_id: 'kaduse-medikal', topic: 'hospital-opening', source_id: 'med-wire', content_family: 'news', decision: 'rejected' })),
    ...Array.from({ length: 4 }, () => ({ channel_id: 'kaduse-medikal', topic: 'regulatory-device', source_id: 'med-wire', content_family: 'regulatory', decision: 'accepted' })),
  ];
  const afterMetrics = [
    ...Array.from({ length: 4 }, () => ({ channel_id: 'kaduse-medikal', topic: 'hospital-opening', source_id: 'med-wire', content_family: 'news', decision: 'accepted' })),
    ...Array.from({ length: 4 }, () => ({ channel_id: 'kaduse-medikal', topic: 'regulatory-device', source_id: 'med-wire', content_family: 'regulatory', decision: 'accepted' })),
  ];
  const measurement = measureEffectiveness({
    before: beforeMetrics,
    after: afterMetrics,
    focus: { channel_id: 'kaduse-medikal', dimension: 'topic', key: 'hospital-opening' },
    protect: { channel_id: 'kaduse-medikal', dimension: 'topic', key: 'regulatory-device' },
    adjustment_id: applied.adjustment.adjustment_id,
    change_ref: applied.change_ref,
    window: { start: T, end: '2026-10-29T10:00:00.000Z' },
  });
  assert.equal(measurement.outcome, 'IMPROVED');
  const trace = inspectLearning({
    event: store.get(proposalSaved.feedback_id),
    pattern,
    proposal: lower,
    measurement,
  });
  assert.equal(trace.event.feedback_id, proposalSaved.feedback_id);
  assert.equal(trace.pattern.count, 3);
  assert.equal(trace.proposal.action, 'LOWER_TOPIC_PRIORITY');
  assert.equal(trace.review.review_state, 'APPLIED');
  assert.equal(trace.change_ref.id, applied.change_ref.id);
  assert.equal(trace.effectiveness.outcome, 'IMPROVED');
  assert.equal(JSON.stringify(trace).includes('history'), false);
  assert.equal(Object.keys(store).some((k) => /registry|policy|mutate|applyRule/i.test(k)), false);
});

test('owner ledger: channel-scoped, reviewed-only, reversible (GCOS only)', () => {
  const lower = { action: 'LOWER_TOPIC_PRIORITY', status: 'PROPOSAL', channel_id: 'kaduse-medikal', scope: { dimension: 'topic', key: 'hospital-opening' }, rationale: 'repeated low relevance' };
  const accepted = {
    ...decisionRow(universe[0], 'delete', 'not_relevant_for_channel'),
    feedback_id: 'fb_pattern',
    review_state: 'ACCEPTED',
    reviewed_by: human,
    proposed_adjustment: { ...lower, target_class: 'editorial_policy' },
  };
  const pattern = { pattern_id: 'pat_hospital', count: 3 };
  const ledger = createRelevanceLedger({ authorize: allow });
  assert.equal(ledger.apply({ owner, feedback: { ...accepted, reviewed_by: machine }, proposal: lower, pattern }).code, 'NOT_REVIEWED');
  assert.equal(ledger.apply({ owner: ccosOwner, feedback: accepted, proposal: lower, pattern }).code, 'FEEDBACK_CANONICAL_OWNER_BOUNDARY');
  const applied = ledger.apply({ owner, feedback: accepted, proposal: lower, pattern });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  const after = ledger.rank(universe);
  assert.ok(after.find((c) => c.id === 'h1').selection_priority < 10);
  assert.equal(after.find((c) => c.id === 'o1').selection_priority, 10);
  assert.equal(ledger.reverse({ owner, adjustment_id: applied.adjustment.adjustment_id }).ok, true);
  assert.equal(ledger.rank(universe).find((c) => c.id === 'h1').selection_priority, 10);
});

test('one decision cannot apply a selection change', () => {
  const input = decisionRow({ id: 'h1', channel_id: 'kaduse-medikal', source_id: 'med-wire', topic: 'hospital-opening', content_family: 'news' }, 'delete', 'not_relevant_for_channel');
  const event = { ...input, feedback_id: 'fb_single' };
  if (hasCcos) assert.equal(proposalsFromPatterns(aggregatePatterns([buildFeedbackEvent(input).event])).length, 0);
  const ledger = createRelevanceLedger({ authorize: allow });
  const refused = ledger.apply({
    owner,
    feedback: { ...event, review_state: 'ACCEPTED', reviewed_by: human, proposed_adjustment: { action: 'LOWER_TOPIC_PRIORITY', target_class: 'editorial_policy', status: 'PROPOSAL', rationale: 'single', scope: { dimension: 'topic', key: 'hospital-opening' } } },
    proposal: { action: 'LOWER_TOPIC_PRIORITY', status: 'PROPOSAL', channel_id: 'kaduse-medikal', scope: { dimension: 'topic', key: 'hospital-opening' }, rationale: 'single' },
    pattern: { pattern_id: 'pat_single', count: 1 },
  });
  assert.equal(refused.code, 'ONE_SHOT_POLICY_MUTATION');
  assert.equal(ledger.rank(universe).find((c) => c.id === 'h1').selection_priority, 10);
  const noAuth = createRelevanceLedger();
  assert.equal(noAuth.apply({ owner, feedback: event, proposal: { status: 'PROPOSAL', action: 'LOWER_TOPIC_PRIORITY' } }).code, 'AUTH_FAIL_CLOSED');
});
