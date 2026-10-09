// Parse contract + P-mapping: bounded extraction, excerpt-required, deterministic IDs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../../sqlite-d1.test-helper.mjs';

const parse = await bundle('apps/worker/src/protocols/ingestion/parse-contract.ts', 'ingest-parse');
const mapping = await bundle('apps/worker/src/protocols/ingestion/p-mapping.ts', 'ingest-mapping');

test('unsupported parser family rejected, never guessed', async () => {
  assert.throws(
    () => parse.parseDocument({ sourceId: 's', parserFamily: 'UNSUPPORTED', text: 'hello', uri: 'https://x', sourceTag: 'SYNTHETIC_FIXTURE' }),
    /PARSE_UNSUPPORTED/,
  );
});

test('safety-looking block becomes NEEDS_REVIEW safety, never auto-verified', async () => {
  const doc = parse.parseDocument({
    sourceId: 's-g', parserFamily: 'GUIDELINE_DOCUMENT',
    text: 'Contraindicated in advanced kidney disease.\n\nEat vegetables daily.',
    uri: 'https://example.org/g', sourceTag: 'SYNTHETIC_FIXTURE',
  });
  assert.equal(doc.safety.length, 1);
  assert.equal(doc.safety[0].review, 'NEEDS_REVIEW');
  assert.ok(doc.safety[0].excerpt.length > 0);
  assert.deepEqual(parse.validateParsedDocument(doc), []);
});

test('mapping is deterministic: same input same IDs', async () => {
  const doc = parse.parseDocument({
    sourceId: 's1', parserFamily: 'GENERIC_WEB',
    text: 'Grains: 6-8 servings per day.\n\nLowers blood pressure in trials.',
    uri: 'https://example.org/a', sourceTag: 'SYNTHETIC_FIXTURE',
  });
  const a = mapping.mapParsedToCanonical({ protocolId: 'dash-eating-plan', protocolSlugSeed: 'DASH eating plan', parsed: [doc] });
  const b = mapping.mapParsedToCanonical({ protocolId: 'dash-eating-plan', protocolSlugSeed: 'DASH eating plan', parsed: [doc] });
  assert.deepEqual(a, b);
  assert.ok(a.components.length + a.claims.length > 0);
});

test('empty protocol id fails closed', async () => {
  const doc = parse.parseDocument({
    sourceId: 's1', parserFamily: 'GENERIC_WEB', text: 'Some content block with enough length to parse.',
    uri: 'https://example.org/a', sourceTag: 'SYNTHETIC_FIXTURE',
  });
  assert.throws(() => mapping.mapParsedToCanonical({ protocolId: '  ', protocolSlugSeed: 'x', parsed: [doc] }), /IDENTITY_UNRESOLVED/);
});
