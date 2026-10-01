// Turkish summary contract (Hub renderer): the source-language excerpt is never the visible summary, and
// "Öz hazırlanıyor…" is shown only while enrichment is pending; a failed item gets an explicit Turkish state instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} not found in index.html`);
  let depth = 0;
  let i = html.indexOf('{', start);
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) { i++; break; }
  }
  return html.slice(start, i);
}

const ctx = {
  state: { route: 'kaduse', selected: {} },
  DECISION_LABELS: {},
  sourceLabel: () => 'Health Canada',
  formatNewsAge: () => '',
};
vm.createContext(ctx);
vm.runInContext([extractFunction('escapeHtml'), extractFunction('stripHtml'), extractFunction('cardHtml')].join('\n'), ctx);

const item = (o) => ({ id: 'i1', triageStatus: 'inbox', canonicalUrl: 'https://x.test/a', title: 'Başlık', titleOrig: 'Title', gists: ['Source English excerpt that must not leak.'], summary: 'Source English excerpt that must not leak.', ...o });

test('pending: explicit processing state, English excerpt hidden', () => {
  const h = ctx.cardHtml(item({ enrichmentStatus: 'pending' }));
  assert.match(h, /Öz hazırlanıyor/);
  assert.doesNotMatch(h, /must not leak/);
});

test('failed: explicit Turkish failure state (not "hazırlanıyor"), English excerpt hidden', () => {
  const h = ctx.cardHtml(item({ enrichmentStatus: 'failed' }));
  assert.match(h, /özet üretilemedi/);
  assert.doesNotMatch(h, /Öz hazırlanıyor/);
  assert.doesNotMatch(h, /must not leak/);
});

test('done: Turkish summary shown, no processing note', () => {
  const h = ctx.cardHtml(item({ enrichmentStatus: 'done', gists: ['Sağlık Kanada, yeni ilaç rehberini yayımladı.'] }));
  assert.match(h, /Sağlık Kanada, yeni ilaç rehberini yayımladı\./);
  assert.doesNotMatch(h, /Öz hazırlanıyor|üretilemedi/);
});
