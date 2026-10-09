// Discovery handoff + dry-run E2E: approved admission → dry-run, no canonicalization.
// Labels: SYNTHETIC_FIXTURE only. Regression baseline: DASH CONTROLLED_SQL_IMPORT rows intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const handoff = await bundle('apps/worker/src/protocols/ingestion/discovery-handoff.ts', 'ingest-handoff');
const engine = await bundle('apps/worker/src/protocols/ingestion/index.ts', 'ingest-e2e');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'ingest-e2e-claims');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const admission = {
  domain: 'PROTOCOL',
  version: 'v1-test',
  compiledAt: new Date().toISOString(),
  identity: {
    canonicalKey: 'dash-eating-plan',
    protocol: {
      definition: { sourceId: 's-def', uri: 'https://www.nhlbi.nih.gov/health-topics/dash-eating-plan', role: 'DEFINITION', statement: 'DASH plan' },
      evidence: [{ sourceId: 's-ev', uri: 'https://pubmed.ncbi.nlm.nih.gov/9099655/', role: 'EVIDENCE' }],
      guidelineAndSafetyReviewed: true,
      protocolType: 'MEDICAL_NUTRITION_THERAPY',
      genericOrBranded: 'GENERIC',
    },
  },
  sources: [
    { sourceId: 's-def', sourceType: 'OFFICIAL_WEBSITE', uri: 'https://www.nhlbi.nih.gov/health-topics/dash-eating-plan', sourceRole: 'DEFINITION', disposition: 'ACTIVATE' },
    { sourceId: 's-ev', sourceType: 'RCT_OR_RESEARCH', uri: 'https://pubmed.ncbi.nlm.nih.gov/9099655/', sourceRole: 'EVIDENCE', disposition: 'ACTIVATE' },
    { sourceId: 's-ig', sourceType: 'INSTAGRAM', uri: 'https://instagram.com/dash', sourceRole: 'EVIDENCE', disposition: 'MANUAL_INTAKE' },
  ],
  usableSourceCount: 2,
  missing: [],
};

test('approved admission adapts to ingestion plan with separate approvals listed', async () => {
  const res = handoff.adaptAdmissionToIngestion(admission, { decision: 'APPROVE', decidedBy: 'hub-operator', candidateId: 'candidate_1' });
  assert.equal(res.protocolId, 'dash-eating-plan');
  assert.equal(res.plannedSources.length, 3);
  assert.ok(res.requiredApprovals.some((a) => a.includes('SOURCE_ACTIVATION')));
  assert.ok(res.requiredApprovals.some((a) => a.includes('MIGRATION')));
});

test('non-approved decision never adapts', async () => {
  assert.throws(
    () => handoff.adaptAdmissionToIngestion(admission, { decision: 'WATCH', decidedBy: 'hub-operator', candidateId: 'c' }),
    /NOT_APPROVED/,
  );
});

test('dry-run E2E on REAL_SOURCE_LOCAL-labeled doc writes nothing, DASH baseline intact', async () => {
  const { sqlite, db } = openDb();
  const adapted = handoff.adaptAdmissionToIngestion(admission, { decision: 'APPROVE', decidedBy: 'hub-operator', candidateId: 'candidate_1' });
  const out = await engine.runDryRun(db, {
    protocolId: adapted.protocolId,
    admissionSources: adapted.plannedSources,
    documents: [{
      sourceId: 's-def', parserFamily: 'GENERIC_WEB',
      text: 'DASH emphasizes vegetables 4-5 servings per day.\n\nSodium 2300 mg reducible to 1500 mg.',
      uri: 'https://www.nhlbi.nih.gov/health-topics/dash-eating-plan', sourceTag: 'REAL_SOURCE_LOCAL',
    }],
  });
  assert.equal(out.run.status, 'DRY_RUN_COMPLETE');
  assert.equal(out.resolvedAs, 'EXACT_CANONICAL_ID');
  // CONTROLLED_SQL_IMPORT regression baseline untouched by dry-run:
  assert.equal((await claims.listProtocolVersionClaims(db, 'dash-v1')).length, 4);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM source_items WHERE discovery_reason='protocol-wave-1-dash-controlled-import'").get().n, 3);
});
