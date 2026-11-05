import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadClassifier } from './topics-dryrun.mjs';
import { evaluate, readGolden, loadPlan, baselinePath } from './topics-feedback.mjs';

// Bible v5 §10.3 / §11.6: an owner PASS/FAIL answer that the classifier got right must stay right after any plan change.
test('golden owner answers that the baseline records as correct are still correct', async () => {
  const { classify } = await loadClassifier();
  const plan = await loadPlan();
  const results = plan.topics.flatMap((t) => evaluate(readGolden(t.topicId), classify, plan));
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')).correct : [];
  const ok = new Set(results.filter((r) => r.ok).map((r) => r.key));
  const broken = baseline.filter((k) => !ok.has(k));
  assert.deepEqual(broken, [], `golden cases broken by this change: ${broken.join(', ')} (node scripts/topics-feedback.mjs --report)`);
});
