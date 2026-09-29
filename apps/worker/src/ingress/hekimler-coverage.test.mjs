// S71 (work package 1, item 3): classifyHekimlerFamily() is the single
// canonical place that decides a Hekimler source's content family. Both
// /api/hekimler/sources (index.ts) and the Hub client (sourceFamily()) are
// meant to agree with this function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `hekimler-coverage-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/ingress/hekimler-coverage.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { classifyHekimlerFamily, HEKIMLER_BURS_SOURCE_IDS, HEKIMLER_EGITIM_SOURCE_IDS } = await import(
  pathToFileURL(out).href
);

test('every explicitly-registered burs source classifies as burs', () => {
  for (const id of HEKIMLER_BURS_SOURCE_IDS) {
    assert.equal(classifyHekimlerFamily(id), 'burs', id);
  }
});

test('every explicitly-registered egitim source classifies as egitim', () => {
  for (const id of HEKIMLER_EGITIM_SOURCE_IDS) {
    assert.equal(classifyHekimlerFamily(id), 'egitim', id);
  }
});

test('a plain duyuru-style source (no prefix, not registered) classifies as duyuru', () => {
  assert.equal(classifyHekimlerFamily('ttb_national'), 'duyuru');
  assert.equal(classifyHekimlerFamily('osym_medical_exams'), 'duyuru');
});

test('an unregistered id still falls back to the prefix convention', () => {
  assert.equal(classifyHekimlerFamily('burs_some_new_source_not_yet_in_the_list'), 'burs');
  assert.equal(classifyHekimlerFamily('egitim_some_new_source_not_yet_in_the_list'), 'egitim');
});
