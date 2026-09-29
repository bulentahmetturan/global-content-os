// Drift guard: the GCOS source-catalog zod enums must equal the canonical research vocabulary (single truth).
// Run: node --test packages/contracts/research-vocabulary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const vocab = JSON.parse(readFileSync(path.join(here, 'research-vocabulary.json'), 'utf8'));
const schemas = readFileSync(path.join(here, '../source-catalog/src/research/schemas.ts'), 'utf8').split('\r\n').join('\n');

function enumValues(schemaName) {
  const start = schemas.indexOf(`export const ${schemaName} = z.enum([`);
  assert.ok(start >= 0, `${schemaName} not found`);
  const end = schemas.indexOf(']);', start);
  return [...schemas.slice(start, end).matchAll(/^\s*'([A-Z_]+)'/gm)].map((m) => m[1]);
}

// single-line enums: z.enum(['A', 'B'])
function inlineEnum(schemaName) {
  const m = schemas.match(new RegExp(`export const ${schemaName} = z\\.enum\\(\\[([^\\]]*)\\]\\)`));
  return m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) : null;
}

const values = (name) => inlineEnum(name) ?? enumValues(name);

test('source-catalog enums equal the canonical vocabulary (order included)', () => {
  assert.deepEqual(values('AccessLevelSchema'), vocab.accessLevel);
  assert.deepEqual(values('PeerReviewStatusSchema'), vocab.peerReviewStatus);
  assert.deepEqual(values('IntegrityStatusSchema'), vocab.integrityStatus);
  assert.deepEqual(values('ResearchSourceRoleSchema'), vocab.researchSourceRole);
});

test('vocabulary lists are non-empty and duplicate-free', () => {
  for (const k of ['accessLevel', 'peerReviewStatus', 'integrityStatus', 'researchSourceRole']) {
    assert.ok(vocab[k].length > 0, k);
    assert.equal(new Set(vocab[k]).size, vocab[k].length, k);
  }
});
