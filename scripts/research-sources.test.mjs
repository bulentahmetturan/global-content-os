import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState, pausedIds, whichFeed, main } from './research-sources.mjs';

test('real state: every paused Research feed is disabled in config/feeds.json; Evergreen carriers are kept', () => {
  const st = readState();
  const feeds = new Map(JSON.parse(readFileSync('config/feeds.json', 'utf8')).feeds.map((f) => [f.id, f]));
  for (const id of pausedIds(st)) if (feeds.has(id)) assert.equal(feeds.get(id).enabled, false, id);
  assert.deepEqual(st.kept_enabled.map((k) => k.feed_id).sort(), ['research-cochrane-library', 'research-europe-pmc-rest', 'research-pubmed-eutilities']);
  assert.ok(!pausedIds(st).includes('research-pubmed-eutilities'));
});

test('a wow article finds its paused feed by domain; reactivation needs an article and writes reversible SQL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, JSON.stringify({ mode: 'WOW_EXAMPLE_LED', kept_enabled: [], paused: [{ feed_id: 'research-jama-network', label: 'JAMA', endpoint_url: 'https://jamanetwork.com/' }], reactivated: [] }));
  const st = readState(p);
  assert.deepEqual(whichFeed(st, 'https://jamanetwork.com/journals/jama/fullarticle/1').map((x) => x.feed_id), ['research-jama-network']);
  assert.deepEqual(whichFeed(st, 'https://www.nejm.org/doi/x'), []);
  const log = console.log; console.log = () => {};
  try {
    assert.throws(() => main(['reactivate', 'research-jama-network'], p), /--article/);
    assert.equal(main(['reactivate', 'research-jama-network', '--article', 'https://jamanetwork.com/x'], p), 0);
  } finally { console.log = log; }
  assert.deepEqual(pausedIds(readState(p)), []);
});
