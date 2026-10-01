// Regression guard: source add/retire/reactivate must stay routed to the canonical lifecycle (CORE P3 invariant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(root, f), 'utf8').split('\r\n').join('\n');
const section = (t, h) => t.split(/^### /m).find((s) => s.startsWith(h)) || '';

test('CORE P3 carries the source lifecycle invariant', () => {
  const p3 = read('docs/CORE.md').split('\n').find((l) => l.startsWith('- **P3**')) || '';
  for (const k of ['scripts/source-lifecycle.mjs', 'docs/SOURCE-LIFECYCLE.md', '`retire`', 'never restates', 'never destructive delete']) {
    assert.ok(p3.includes(k), `CORE P3 missing: ${k}`);
  }
});

test('AGENTS routes source requests to the lifecycle', () => {
  const a = read('AGENTS.md');
  assert.match(a, /## Source requests[\s\S]*docs\/SOURCE-LIFECYCLE\.md[\s\S]*scripts\/source-lifecycle\.mjs/);
});

test('INDEX: lifecycle route is canonical; Tıp Topluluğu add and modify routes are not bypasses', () => {
  const idx = read('docs/INDEX.md');
  assert.match(section(idx, 'Add / retire / reactivate a source'), /scripts\/source-lifecycle\.mjs/);
  const add = section(idx, 'Add a Tıp Topluluğu source');
  assert.match(add, /Not an independent add path/);
  assert.match(add, /lifecycle route above/);
  assert.match(section(idx, 'Modify a source record'), /Add, retire, reactivate or any lifecycle-grade change goes to the lifecycle route above/);
});

test('SOURCE-LIFECYCLE keeps the deictic-reference rule and retire default', () => {
  const l = read('docs/SOURCE-LIFECYCLE.md');
  assert.match(l, /## Deictic references[\s\S]*exactly one source identity[\s\S]*ask the user one question/);
  assert.match(l, /Retire \(default for "remove" \/ "stop using"\)/);
});

test('proposed source ids skip generic listing segments and keep the publisher subdomain', async () => {
  const { proposeSourceId } = await import('./routing.mjs');
  const taken = new Set();
  assert.equal(proposeSourceId({ lane: 'kaduse-news', heading: 'HABER', url: 'https://bilimgenc.tubitak.gov.tr/kategori/saglik', taken }), 'bilimgenc-tubitak-saglik');
  assert.equal(proposeSourceId({ lane: 'tip_toplulugu', heading: 'BURS', url: 'https://tubitak.gov.tr/tr/duyuru', taken }), 'burs_tubitak_duyuru');
});
