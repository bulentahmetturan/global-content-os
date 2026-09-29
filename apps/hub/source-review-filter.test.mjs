// S69 Hub source panel: "yalnız sorunlu / gözden geçirme gereken" filter
// (task D -- pure observation, no mutation). Extracts sourceNeedsReview()
// from the live index.html file and tests it against synthetic rows +
// revalidation data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} not found in index.html`);
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return html.slice(start, i);
}

const src = [extractFunction('sourceNeedsReview'), '({ sourceNeedsReview })'].join('\n');
const { sourceNeedsReview } = vm.runInNewContext(src, {}, { filename: 'index.html (extracted)' });

test('a source with a bad coverage label needs review', () => {
  assert.equal(sourceNeedsReview({ id: 'x', bad: true }, {}), true);
});

test('a healthy source with no revalidation record does not need review', () => {
  assert.equal(sourceNeedsReview({ id: 'x', bad: false }, {}), false);
});

test('a source listed in source_revalidation (REVALIDATION_REQUIRED) needs review even if not otherwise flagged bad', () => {
  const byId = { x: { canonical_source_key: 'x', revalidation_status: 'REVALIDATION_REQUIRED' } };
  assert.equal(sourceNeedsReview({ id: 'x', bad: false }, byId), true);
});

test('a source not present in the revalidation map and not bad never needs review', () => {
  const byId = { some_other_source: { revalidation_status: 'REVALIDATION_REQUIRED' } };
  assert.equal(sourceNeedsReview({ id: 'x', bad: false }, byId), false);
});

test('handles a missing/undefined revalidation map without throwing (endpoint unavailable case)', () => {
  assert.equal(sourceNeedsReview({ id: 'x', bad: false }, undefined), false);
  assert.equal(sourceNeedsReview({ id: 'x', bad: true }, undefined), true);
});
