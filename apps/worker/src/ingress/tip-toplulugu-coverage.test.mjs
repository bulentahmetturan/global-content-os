// S71 (work package 1, item 3): classifyTipTopluluguFamily() is the single
// canonical place that decides a Tıp Topluluğu source's content family. Both
// /api/tip_toplulugu/sources (index.ts) and the Hub client (sourceFamily()) are
// meant to agree with this function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `tip-toplulugu-coverage-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/ingress/tip-toplulugu-coverage.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { classifyTipTopluluguFamily, TIP_TOPLULUGU_BURS_SOURCE_IDS, TIP_TOPLULUGU_EGITIM_SOURCE_IDS } = await import(
  pathToFileURL(out).href
);

test('every explicitly-registered burs source classifies as burs', () => {
  for (const id of TIP_TOPLULUGU_BURS_SOURCE_IDS) {
    assert.equal(classifyTipTopluluguFamily(id), 'burs', id);
  }
});

test('every explicitly-registered egitim source classifies as egitim', () => {
  for (const id of TIP_TOPLULUGU_EGITIM_SOURCE_IDS) {
    assert.equal(classifyTipTopluluguFamily(id), 'egitim', id);
  }
});

// The Worker lists mirror the canonical registries (SOURCE_TRUTH_DUPLICATION=0): same ids, no drift.
for (const [lane, ids] of [['burs', TIP_TOPLULUGU_BURS_SOURCE_IDS], ['egitim', TIP_TOPLULUGU_EGITIM_SOURCE_IDS]]) {
  test(`${lane} Worker source ids equal source-registry-${lane}-v1.json`, () => {
    const reg = JSON.parse(readFileSync(`adapters/tip-toplulugu-radar/content/source-registry-${lane}-v1.json`, 'utf8'));
    const registryIds = reg.sources.map((s) => s.source_id ?? s.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id in the Worker list');
    assert.deepEqual([...ids].sort(), [...registryIds].sort());
  });
}

test('a plain duyuru-style source (no prefix, not registered) classifies as duyuru', () => {
  assert.equal(classifyTipTopluluguFamily('ttb_national'), 'duyuru');
  assert.equal(classifyTipTopluluguFamily('osym_medical_exams'), 'duyuru');
});

test('an unregistered id still falls back to the prefix convention', () => {
  assert.equal(classifyTipTopluluguFamily('burs_some_new_source_not_yet_in_the_list'), 'burs');
  assert.equal(classifyTipTopluluguFamily('egitim_some_new_source_not_yet_in_the_list'), 'egitim');
});
