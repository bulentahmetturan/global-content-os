// The Hub is one HTML file with inline scripts. A syntax error there blanks the whole page (2026-11-12), and no other test parses it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every inline script in apps/hub/index.html parses', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const code of scripts) assert.doesNotThrow(() => new Function(code));
});
