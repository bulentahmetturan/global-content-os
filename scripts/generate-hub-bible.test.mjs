// D-BIBLE-V4-HUB-COPY (E22): the Hub Bible v4 is generated from the canonical file; a stale or hand-edited copy fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { HUB_BIBLE, checkHubBible, generateHubBible } from './generate-hub-bible.mjs';

test('committed Hub Bible v4 equals a fresh generation from the canonical source', () => {
  const r = checkHubBible();
  assert.ok(r.inSync, `${r.destination} is stale or hand-edited; run node scripts/generate-hub-bible.mjs`);
});

test('generation is deterministic and a hand edit of the Hub copy is detected', () => {
  const base = mkdtempSync(join(tmpdir(), 'hub-bible-'));
  try {
    for (const p of [HUB_BIBLE.source, HUB_BIBLE.destination]) mkdirSync(dirname(join(base, p)), { recursive: true });
    writeFileSync(join(base, HUB_BIBLE.source), '# Bible v4\n\nkanonik\n');
    assert.equal(checkHubBible(base).inSync, false, 'missing Hub copy is not in sync');
    assert.equal(generateHubBible(base).inSync, true);
    appendFileSync(join(base, HUB_BIBLE.destination), 'hand edit\n');
    assert.equal(checkHubBible(base).inSync, false, 'hand-edited Hub copy must fail');
    assert.equal(generateHubBible(base).inSync, true, 'regeneration restores the canonical bytes');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
