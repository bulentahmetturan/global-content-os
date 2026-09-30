// Regression: the Hub's "N aktif kaynak" header count must be lane-scoped.
// Bug (found 2026-09-28): Haber and Research share the coarse
// state.route === 'kaduse' (real lane is state.kind), and the header count
// summed kaduse-news + kaduse-research's enabledFeeds regardless of which
// tab was open -- both tabs showed the identical combined number (observed:
// both showed "137 aktif kaynak"). Fixed in apps/hub/index.html's
// computeActiveSourceCount(). This test extracts that exact function's
// source from the live HTML file (not a reimplementation) so a future edit
// that reintroduces cross-lane summing fails here.
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
  // Balance braces from the first '{' after the signature to find the end.
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
  extractFunction('computeActiveSourceCount'),
  '({ computeActiveSourceCount, isBursSource, isEgitimSource, sourceFamily })',
].join('\n');

const { computeActiveSourceCount } = vm.runInNewContext(src, {}, { filename: 'index.html (extracted)' });

test('Haber and Research tabs compute their counts independently and can differ', () => {
  const state = {
    route: 'kaduse',
    kind: 'news',
    routeMeta: {
      'kaduse-news': { enabledFeeds: 60 },
      'kaduse-research': { enabledFeeds: 42 },
    },
  };
  const haberCount = computeActiveSourceCount(state, [], []);
  state.kind = 'research';
  const researchCount = computeActiveSourceCount(state, [], []);

  assert.equal(haberCount, 60);
  assert.equal(researchCount, 42);
  assert.notEqual(
    haberCount,
    researchCount,
    'Haber and Research must not collapse to the same combined count'
  );
});

test('does not sum kaduse-news + kaduse-research (the actual bug)', () => {
  const state = {
    route: 'kaduse',
    kind: 'news',
    routeMeta: {
      'kaduse-news': { enabledFeeds: 60 },
      'kaduse-research': { enabledFeeds: 42 },
    },
  };
  const haberCount = computeActiveSourceCount(state, [], []);
  assert.notEqual(haberCount, 60 + 42, 'Haber tab must not show the combined 102');
});

test('falls back to 0 when routeMeta has not loaded yet for that lane', () => {
  const state = { route: 'kaduse', kind: 'research', routeMeta: {} };
  assert.equal(computeActiveSourceCount(state, [], []), 0);
});

test('tip_toplulugu lanes (burs/egitim/duyuru) stay independently scoped too', () => {
  const hekSources = [
    { sourceId: 'burs_tr_fulbright' },
    { sourceId: 'egitim_ifm_fmcp' },
    { sourceId: 'ttb_national' },
  ];
  const bursCatalog = [{}, {}, {}]; // 3 burs catalog entries
  const egitimCatalog = [{}]; // 1 egitim catalog entry

  const burs = computeActiveSourceCount(
    { route: 'tip_toplulugu', hekLane: 'burs', hekSources },
    bursCatalog,
    egitimCatalog
  );
  const egitim = computeActiveSourceCount(
    { route: 'tip_toplulugu', hekLane: 'egitim', hekSources },
    bursCatalog,
    egitimCatalog
  );
  const duyuru = computeActiveSourceCount(
    { route: 'tip_toplulugu', hekLane: 'duyuru', hekSources },
    bursCatalog,
    egitimCatalog
  );

  assert.equal(burs, 3);
  assert.equal(egitim, 1);
  assert.equal(duyuru, 1); // only ttb_national is neither burs_ nor egitim_
});

test('non-kaduse, non-tip_toplulugu routes read their own routeMeta entry', () => {
  const state = { route: 'tip-ogrencileri', routeMeta: { 'tip-ogrencileri': { enabledFeeds: 729 } } };
  assert.equal(computeActiveSourceCount(state, [], []), 729);
});
