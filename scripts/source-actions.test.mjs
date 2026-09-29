import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performSourceAction, validateRequest, SOURCE_ACTIONS } from './source-actions.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const owner = { kind: 'canonical_owner', id: 'global-content-os' };
const yes = () => true;
const fb = (o = {}) => ({
  feedback_id: 'fb_0123456789abcdef',
  feedback_type: 'SOURCE_FEEDBACK',
  subject_type: 'source',
  subject_id: 'tdb_dental',
  review_state: 'ACCEPTED',
  reviewed_by: { kind: 'human', id: 'r1' },
  ...o,
});
const registryBytes = () => readFileSync(join(root, 'adapters/hekimler-radar/content/source-registry-v1.1.json'), 'utf8');

test('fails closed: no authorize / non-true authorize / throwing authorize / non-owner actor', () => {
  assert.equal(performSourceAction({ feedback: fb(), action: 'disable', owner }).code, 'AUTH_FAIL_CLOSED');
  assert.equal(performSourceAction({ feedback: fb(), action: 'disable', owner, authorize: () => 'yes' }).code, 'AUTH_FAIL_CLOSED');
  assert.equal(performSourceAction({ feedback: fb(), action: 'disable', owner, authorize: () => { throw new Error('x'); } }).code, 'AUTH_FAIL_CLOSED');
  assert.equal(performSourceAction({ feedback: fb(), action: 'disable', owner: { kind: 'machine', id: 'm' }, authorize: yes }).code, 'AUTH_FAIL_CLOSED');
});

test('only ACCEPTED feedback reviewed by a human/review gate can drive an action', () => {
  for (const s of ['OBSERVED', 'NEEDS_REVIEW', 'REJECTED', 'APPLIED']) {
    assert.equal(validateRequest({ feedback: fb({ review_state: s }), action: 'disable', owner, authorize: yes }).code, 'NOT_ACCEPTED', s);
  }
  assert.equal(validateRequest({ feedback: fb({ reviewed_by: { kind: 'machine', id: 'x' } }), action: 'disable', owner, authorize: yes }).code, 'NOT_REVIEWED_BY_HUMAN_OR_GATE');
  assert.equal(validateRequest({ feedback: fb({ feedback_type: 'EDITORIAL_FEEDBACK' }), action: 'disable', owner, authorize: yes }).code, 'NOT_SOURCE_FEEDBACK');
  assert.equal(validateRequest({ feedback: fb(), action: 'delete_everything', owner, authorize: yes }).code, 'UNSUPPORTED_ACTION');
});

test('all six requested actions are supported; params validated', () => {
  assert.deepEqual([...SOURCE_ACTIONS].sort(), ['change_cadence', 'change_url', 'classification_review', 'disable', 'parser_review', 'revalidate']);
  assert.equal(validateRequest({ feedback: fb(), action: 'change_url', params: { url: 'http://x' }, owner, authorize: yes }).code, 'INVALID_PARAMS');
  assert.equal(validateRequest({ feedback: fb(), action: 'change_cadence', params: { poll_minutes: 5 }, owner, authorize: yes }).code, 'INVALID_PARAMS');
});

test('default is a DRY RUN: returns the patch and does not touch the canonical file', () => {
  const before = registryBytes();
  const r = performSourceAction({ feedback: fb(), action: 'disable', owner, authorize: yes });
  assert.equal(r.ok, true);
  assert.equal(r.outcome, 'DRY_RUN');
  assert.equal(r.patch.after, 'BLOCKED');
  assert.equal(registryBytes(), before);
  const r2 = performSourceAction({ feedback: fb(), action: 'disable', owner, authorize: yes, apply: 'true' });
  assert.notEqual(r2.outcome, 'APPLIED');
  assert.equal(registryBytes(), before);
});

test('review-type actions record a task and never edit the registry', () => {
  for (const a of ['revalidate', 'parser_review', 'classification_review']) {
    const r = performSourceAction({ feedback: fb(), action: a, owner, authorize: yes, apply: true });
    assert.equal(r.outcome, 'REVIEW_TASK_RECORDED');
    assert.equal(r.edits_registry, false);
  }
});

test('unknown source id is refused, not guessed', () => {
  assert.equal(performSourceAction({ feedback: fb({ subject_id: 'no_such_source' }), action: 'disable', owner, authorize: yes }).code, 'RECORD_NOT_FOUND');
});

test('exactly one guarded write site, and the action doc exists', () => {
  const src = readFileSync(join(root, 'scripts/source-actions.mjs'), 'utf8');
  assert.equal((src.match(/writeFileSync\(/g) || []).length, 1);
  assert.ok(existsSync(join(root, 'docs/FEEDBACK-SOURCE-ACTIONS.md')));
});
