// D-BIBLE-V4-HUB-COPY (E22) and MANUAL_SYNC_MIRRORS=0: Hub copies are generated from canonical files; stale or hand-edited copies fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { HUB_ASSETS, checkHubAssets, generateHubAssets } from './generate-hub-assets.mjs';

test('every committed Hub copy equals a fresh generation from its canonical source', () => {
  for (const r of checkHubAssets()) {
    assert.ok(r.inSync, `${r.destination} is stale or hand-edited; run node scripts/generate-hub-assets.mjs`);
  }
});

test('generation is deterministic, a hand edit is detected, and catalogs project the registry', () => {
  const base = mkdtempSync(join(tmpdir(), 'hub-assets-'));
  try {
    const registry = { sources: [{ source_id: 'burs_x', name: 'X', source_url: 'https://x.example/', runtime_activation: 'AUTOMATION_READY', fetch_mode: 'list-page' }] };
    for (const a of HUB_ASSETS) {
      mkdirSync(dirname(join(base, a.source)), { recursive: true });
      mkdirSync(dirname(join(base, a.destination)), { recursive: true });
      writeFileSync(join(base, a.source), a.source.endsWith('.md') ? '# Bible v4\r\n\r\nkanonik\r\n' : JSON.stringify(a.source.includes('source-registry') ? registry : { v: 1 }));
    }
    assert.ok(checkHubAssets(base).every((r) => !r.inSync), 'missing Hub copies are not in sync');
    assert.ok(generateHubAssets(base).every((r) => r.inSync));
    const burs = HUB_ASSETS.find((a) => a.destination.endsWith('burs-sources.json'));
    assert.deepEqual(JSON.parse(readFileSync(join(base, burs.destination), 'utf8')), [{ id: 'burs_x', name: 'X', url: 'https://x.example/', mode: 'AUTOMATION_READY' }]);
    appendFileSync(join(base, HUB_ASSETS[0].destination), 'hand edit\n');
    assert.equal(checkHubAssets(base)[0].inSync, false, 'hand-edited Hub copy must fail');
    assert.ok(generateHubAssets(base).every((r) => r.inSync), 'regeneration restores the canonical content');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
