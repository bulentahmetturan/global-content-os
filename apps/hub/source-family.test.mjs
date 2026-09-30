// S71 (work package 1, item 3): content-family classification must be
// canonical (registry-backed), not a UI-only heuristic re-derived from the
// source id on the client. sourceFamily() prefers the backend's own
// classifyTipTopluluguFamily() verdict (apps/worker/src/ingress/tip_toplulugu-
// coverage.ts, sent as `family` on every /api/tip_toplulugu/sources entry) and
// only falls back to the id-prefix heuristic for entries that never went
// through the backend at all (this file's own synthetic RUNNER_REQUIRED
// placeholders).
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

const src = [
  extractFunction('isBursSource'),
  extractFunction('isEgitimSource'),
  extractFunction('sourceFamily'),
  '({ sourceFamily })',
].join('\n');
const { sourceFamily } = vm.runInNewContext(src, {}, { filename: 'index.html (extracted)' });

test('prefers the backend-provided family field over the id prefix', () => {
  // A source whose id looks like "duyuru" by prefix convention (no burs_/
  // egitim_ prefix) but the backend explicitly classified as burs must
  // report burs -- the backend verdict wins.
  assert.equal(sourceFamily({ sourceId: 'some_weird_id', family: 'burs' }), 'burs');
});

test('falls back to the id-prefix heuristic when family is absent', () => {
  assert.equal(sourceFamily({ sourceId: 'burs_tr_fulbright' }), 'burs');
  assert.equal(sourceFamily({ sourceId: 'egitim_ers' }), 'egitim');
  assert.equal(sourceFamily({ sourceId: 'ttb_national' }), 'duyuru');
});

test('an invalid/unrecognized family value on the object is ignored, not trusted blindly', () => {
  assert.equal(sourceFamily({ sourceId: 'burs_tr_fulbright', family: 'not_a_real_family' }), 'burs');
});

test('handles a missing source object without throwing', () => {
  assert.equal(sourceFamily(null), 'duyuru');
  assert.equal(sourceFamily(undefined), 'duyuru');
});
