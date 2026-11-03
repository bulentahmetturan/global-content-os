import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeGate } from './dedupe.mjs';

const cand = { source_id: 'x_haber', url: 'https://example.org/feed', heading: 'HABER' };
const retiredHolder = { source_id: 'x_saglik', urls: ['https://example.org/feed'], heading: 'HABER', retired: true };

test('retired holder of the same endpoint blocks without a stated reason', () => {
  const r = dedupeGate({ candidate: cand, projections: [retiredHolder] });
  assert.equal(r.checks.canonical_url.status, 'FAIL');
});

test('retired holder is released when the operator states the reason', () => {
  const r = dedupeGate({ candidate: cand, projections: [retiredHolder], sharedEndpointReason: 'owner moved publisher to Haber lane' });
  assert.equal(r.checks.canonical_url.status, 'PASS');
});
