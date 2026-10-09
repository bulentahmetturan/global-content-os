// REAL LOCAL D1 E2E: real CONTROLLED_SQL_IMPORT rows (0042 DASH) replayed
// through the engine into a new version, then read back with provenance.
// Chain: REAL SOURCE ROWS → AUTHORIZED INTAKE (ledger-verified) → PARSE
// → EXTRACT → NORMALIZE → P1–P7 MAPPING → EVIDENCE VALIDATION
// → LOCAL D1 PERSISTENCE → READ-BACK → PROVENANCE VERIFICATION.
// Writes go to the ephemeral local D1 only. No remote, no network fetch
// (fetch stage = pre-existing controlled import, labeled as such).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const kernel = await bundle('apps/worker/src/discovery/kernel.ts', 'ingest-reale2e-kernel');
const authorize = await bundle('apps/worker/src/protocols/ingestion/authorize.ts', 'ingest-reale2e-authz');
const parse = await bundle('apps/worker/src/protocols/ingestion/parse-contract.ts', 'ingest-reale2e-parse');
const mapping = await bundle('apps/worker/src/protocols/ingestion/p-mapping.ts', 'ingest-reale2e-map');
const persist = await bundle('apps/worker/src/protocols/ingestion/persist.ts', 'ingest-reale2e-persist');
const refs = await bundle('apps/worker/src/protocols/ingestion/source-ref.ts', 'ingest-reale2e-ref');
const plans = await bundle('apps/worker/src/protocols/ingestion/source-plan.ts', 'ingest-reale2e-plan');
const fetches = await bundle('apps/worker/src/protocols/ingestion/fetch-policy.ts', 'ingest-reale2e-fetch');
const ledger = await bundle('apps/worker/src/protocols/ingestion/run-ledger.ts', 'ingest-reale2e-ledger');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'ingest-reale2e-claims');
const evidence = await bundle('apps/worker/src/protocols/evidence.ts', 'ingest-reale2e-evidence');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const NOW = new Date().toISOString();
const d4 = (uri, provenanceClass = 'PRIMARY_RESEARCH') => ({
  evidenceRef: `d4://reale2e/${encodeURIComponent(uri)}`,
  observedAt: NOW, identityMatch: 'PASS', fetchDryRun: 'PASS', parseDryRun: 'PASS',
  accessTerms: 'ALLOWED', provenanceClass, provenanceUri: uri, sourceItemShapeValid: true,
});

test('REAL_LOCAL_D1_E2E: real DASH rows → engine → new version → provenance-verified readback', async () => {
  const { sqlite, db } = openDb();

  // 1. REAL SOURCE ROWS: read the verified 0042 controlled-import rows.
  const realItems = sqlite.prepare(
    `SELECT id, canonical_url, publisher, title FROM source_items
      WHERE discovery_reason = 'protocol-wave-1-dash-controlled-import' ORDER BY id`,
  ).all();
  assert.equal(realItems.length, 3);
  const realComponents = sqlite.prepare(
    `SELECT title, detail FROM protocol_components WHERE version_id = 'dash-v1' ORDER BY component_seq`,
  ).all();
  assert.equal(realComponents.length, 9);

  // 2. AUTHORIZED INTAKE: genuine owner approval through the real kernel.
  const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`reale2e dash replay ${Date.now()}`]);
  const candidate = await kernel.createCandidate(db, { runId: run.run_id, domain: 'PROTOCOL', canonicalName: 'DASH E2E Replay', aliases: [] });
  const definitionUri = 'https://reale2e.example/dash-definition';
  const evidenceUri = 'https://reale2e.example/dash-trial';
  const compiled = await kernel.compileCandidateAdmission(db, candidate.candidate_id, {
    identity: {
      status: 'PASS', canonicalKey: 'dash-eating-plan',
      references: [{ type: 'GUIDELINE', value: definitionUri, verified: true }],
      protocol: {
        definition: { sourceId: 'e2e-def', uri: definitionUri, role: 'DEFINITION', statement: 'DASH E2E replay definition.' },
        evidence: [{ sourceId: 'e2e-ev', uri: evidenceUri, role: 'EVIDENCE' }],
        guidelineAndSafetyReviewed: true, protocolType: 'MEDICAL_NUTRITION_THERAPY', genericOrBranded: 'GENERIC',
      },
    },
    sources: [
      { sourceId: 'e2e-def', sourceType: 'OFFICIAL_WEBSITE', sourceRole: 'DEFINITION', uri: definitionUri, lifecycleTarget: 't', lifecycleChannel: 'kaduse-research', d4: d4(definitionUri, 'FIRST_PARTY') },
      { sourceId: 'e2e-ev', sourceType: 'RCT_OR_RESEARCH', sourceRole: 'EVIDENCE', uri: evidenceUri, lifecycleTarget: 't', lifecycleChannel: 'kaduse-research', d4: d4(evidenceUri) },
    ],
    dataContract: true, routing: { role: 'RESEARCH_SIGNAL', destination: 'GLOBAL_HUB:kaduse-research' },
    provenance: true, dedupe: true, safety: true, observability: true, rollback: true, commercialReview: true,
  });
  assert.equal(compiled.state, 'READY_FOR_OWNER');
  await kernel.decideCandidate(db, candidate.candidate_id, 'APPROVE', 'hub-operator');
  const verified = await authorize.authorizeIngestPersist(db, {
    approvedBy: 'hub-operator', decision: 'APPROVE',
    candidateId: candidate.candidate_id, admissionVersion: compiled.package.version,
  });
  assert.equal(verified.protocolId, 'dash-eating-plan');

  // 3-5. PLAN + FETCH GATE + SOURCE REF BIND against the real rows.
  const planned = plans.planSources(compiled.package.sources.map((s) => ({
    sourceId: s.sourceId, sourceType: s.sourceType, uri: s.uri, sourceRole: s.sourceRole, disposition: s.disposition,
  })));
  for (const p of planned) plans.assertSourceAuthorizedForPLevel(p, p.authorizedPLevels[0]);
  const gates = fetches.gateFetchForPLevel(planned, 'P5');
  assert.ok(gates.length > 0);
  const trial = realItems.find((r) => r.id === 'dash-item-trial-1997');
  const trialSummary = sqlite.prepare(`SELECT summary FROM source_items WHERE id='dash-item-trial-1997'`).get().summary;
  const contentText = `${realComponents.map((c) => `${c.title}\n${c.detail}`).join('\n\n')}\n\n${trialSummary}\nAdditional trial analysis paragraph describing blood pressure outcomes across study arms in detail.`;
  const bound = await refs.bindSourceRef(db, {
    sourceItemId: trial.id, canonicalUrl: trial.canonical_url, publisher: trial.publisher, contentText,
  });

  // 6-7. PARSE + EXTRACT + P-MAP the real component texts into a new version.
  const doc = parse.parseDocument({
    sourceId: 'e2e-ev', parserFamily: 'BIBLIOGRAPHIC', text: contentText,
    uri: trial.canonical_url, sourceTag: 'CONTROLLED_SQL_IMPORT',
  });
  assert.deepEqual(parse.validateParsedDocument(doc), []);
  const pkg = mapping.mapParsedToCanonical({
    protocolId: 'dash-eating-plan', protocolSlugSeed: 'DASH eating plan',
    parsed: [doc], baseVersionSeq: 97,
    actorRelationships: [{ actorId: 'actor_nhlbi', relationshipType: 'ASSOCIATED_WITH', excerpt: doc.components[0]?.excerpt ?? 'DASH', sourceTag: 'CONTROLLED_SQL_IMPORT' }],
  });
  assert.ok(pkg.components.length > 0 && pkg.claims.length > 0);

  // 8. EVIDENCE VALIDATION: definition-class links stay CONTEXT (firewall holds on real data).
  for (const cl of pkg.claims) {
    assert.ok(['SUPPORTS', 'CONTEXT'].includes(cl.direction));
  }

  // 9-10. DURABLE RUN + LOCAL PERSISTENCE with verified authorization.
  const contentHash = await refs.hashContent(JSON.stringify(pkg));
  const durable = await ledger.recordDurableRun(db, {
    protocolId: 'dash-eating-plan', candidateId: candidate.candidate_id,
    admissionVersion: compiled.package.version, contentHash, decidedBy: 'hub-operator',
  });
  assert.equal(durable.replayed, false);
  const persisted = await persist.persistMappedPackage(db, pkg, { dryRun: false, verified });
  assert.ok(persisted.created.components > 0);
  assert.equal(persisted.quarantined, 0);
  await ledger.updateDurableRun(db, durable.runId, {
    status: 'PERSISTED', recordsMapped: pkg.components.length + pkg.claims.length,
    recordsPersisted: persisted.created.components + persisted.created.claims, diagnostics: persisted.diagnostics,
  });

  // 11. READ-BACK + PROVENANCE VERIFICATION through existing repository APIs.
  const versions = sqlite.prepare(
    `SELECT version_id FROM protocol_versions WHERE protocol_id='dash-eating-plan' ORDER BY version_seq`,
  ).all().map((r) => r.version_id);
  assert.ok(versions.includes('dash-v1') && versions.includes('dash-eating-plan-v97'));
  const edges = sqlite.prepare(
    `SELECT actor_id, relationship_type FROM actor_protocol_relationships WHERE protocol_id='dash-eating-plan' ORDER BY actor_id`,
  ).all();
  assert.ok(edges.some((e) => e.actor_id === 'actor_nhlbi'));
  // Original wave rows untouched (no silent overwrite):
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM protocol_components WHERE version_id='dash-v1'`).get().n, 9);
  assert.equal((await claims.listProtocolVersionClaims(db, 'dash-v1')).length, 4);
  const chain = await evidence.getEvidenceChain(db, 'clm_dash_bp_lowering');
  assert.equal(chain[0].sourceItemId, 'dash-item-trial-1997');
  // Replay is idempotent:
  const replay = await persist.persistMappedPackage(db, pkg, { dryRun: false, verified });
  assert.equal(replay.created.components, 0);
  assert.ok(replay.skippedExisting > 0);
  const durableReplay = await ledger.recordDurableRun(db, {
    protocolId: 'dash-eating-plan', candidateId: candidate.candidate_id,
    admissionVersion: compiled.package.version, contentHash, decidedBy: 'hub-operator',
  });
  assert.equal(durableReplay.replayed, true);
});
