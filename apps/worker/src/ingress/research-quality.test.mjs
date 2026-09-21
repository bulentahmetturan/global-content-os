import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const q = await import('./research-quality.ts');
describe('research quality gates', () => {
  it('flags placeholder titles', () => {
    assert.ok(q.isPlaceholderTitle('Title Pending 927'));
    assert.ok(q.isPlaceholderTitle('Untitled'));
    assert.ok(!q.isPlaceholderTitle('Deep learning for arrhythmia detection on ECG'));
  });
  it('flags far-future dates only', () => {
    const now = new Date('2026-09-21T00:00:00Z');
    assert.ok(q.isFutureDate('2036-09-18', now));
    assert.ok(!q.isFutureDate('2026-09-20', now));
    assert.ok(!q.isFutureDate(null, now));
  });
  it('requires the exact journal for container-title queries', () => {
    const want = q.expectedContainer('container-title:"European Heart Journal"');
    assert.equal(want, 'European Heart Journal');
    assert.ok(q.containerMatches(want, ['European Heart Journal']));
    assert.ok(!q.containerMatches(want, ['Media Industries']));
    assert.ok(!q.containerMatches(q.expectedContainer('container-title:Circulation'), ['Circulation Research']));
    assert.ok(q.containerMatches(q.expectedContainer('publisher-name:medRxiv'), ['anything']));
  });
});
