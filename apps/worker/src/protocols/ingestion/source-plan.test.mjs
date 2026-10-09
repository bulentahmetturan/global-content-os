// Ingestion source planning: role→P-level authority, fail-closed transports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
void DatabaseSync;
const plan = await bundle('apps/worker/src/protocols/ingestion/source-plan.ts', 'ingest-plan');
const fetch = await bundle('apps/worker/src/protocols/ingestion/fetch-policy.ts', 'ingest-fetch');

test('definition source authorized for P1-P3, evidence for P5, safety for P6', async () => {
  const out = plan.planSources([
    { sourceId: 's-def', sourceType: 'OFFICIAL_WEBSITE', uri: 'https://example.org/def', sourceRole: 'DEFINITION', disposition: 'ACTIVATE' },
    { sourceId: 's-ev', sourceType: 'RCT_OR_RESEARCH', uri: 'https://pubmed.ncbi.nlm.nih.gov/1/', sourceRole: 'EVIDENCE', disposition: 'ACTIVATE' },
    { sourceId: 's-safe', sourceType: 'GUIDELINE', uri: 'https://example.org/g', sourceRole: 'SAFETY', disposition: 'ACTIVATE' },
  ]);
  assert.deepEqual(out[0].authorizedPLevels, ['P1', 'P2', 'P3']);
  assert.deepEqual(out[1].authorizedPLevels, ['P5']);
  assert.deepEqual(out[2].authorizedPLevels, ['P6']);
  assert.equal(out[0].automatedFetchPermitted, true);
});

test('instagram/youtube never automated: manual intake only', async () => {
  const out = plan.planSources([
    { sourceId: 's-ig', sourceType: 'INSTAGRAM', uri: 'https://instagram.com/x', sourceRole: 'EVIDENCE', disposition: 'ACTIVATE' },
  ]);
  assert.equal(out[0].automatedFetchPermitted, false);
  const decision = fetch.decideFetch(out[0]);
  assert.equal(decision.verdict, 'MANUAL_INTAKE_ONLY');
});

test('restricted disposition never permitted', async () => {
  const out = plan.planSources([
    { sourceId: 's-r', sourceType: 'GUIDELINE', uri: 'https://example.org/r', sourceRole: 'GUIDELINE', disposition: 'RESTRICTED' },
  ]);
  assert.equal(fetch.decideFetch(out[0]).verdict, 'RESTRICTED');
});

test('unauthorized P-level throws fail-closed', async () => {
  const out = plan.planSources([
    { sourceId: 's-ev', sourceType: 'RCT_OR_RESEARCH', uri: 'https://pubmed.ncbi.nlm.nih.gov/1/', sourceRole: 'EVIDENCE', disposition: 'ACTIVATE' },
  ]);
  assert.throws(() => plan.assertSourceAuthorizedForPLevel(out[0], 'P6'), /SOURCE_UNAUTHORIZED_FOR_P_LEVEL/);
});
