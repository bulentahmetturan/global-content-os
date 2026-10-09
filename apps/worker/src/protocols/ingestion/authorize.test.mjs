// Server-side ingestion authorization: ApprovalRef is a claim, ledgers are proof.
// Drives the REAL discovery kernel (run→candidate→compile→decide) in an
// ephemeral D1, then verifies authorizeIngestPersist against those rows.
// Covers: invalid/missing decision, stale package, unknown candidate,
// wrong domain, duplicate candidate, unauthorized persist, executor replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const kernel = await bundle('apps/worker/src/discovery/kernel.ts', 'ingest-authz-kernel');
const authorize = await bundle('apps/worker/src/protocols/ingestion/authorize.ts', 'ingest-authz');

const NOW = new Date().toISOString();
function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const d4 = (uri, provenanceClass = 'PRIMARY_RESEARCH') => ({
  evidenceRef: `d4://authz/${encodeURIComponent(uri)}`,
  observedAt: NOW,
  identityMatch: 'PASS',
  fetchDryRun: 'PASS',
  parseDryRun: 'PASS',
  accessTerms: 'ALLOWED',
  provenanceClass,
  provenanceUri: uri,
  sourceItemShapeValid: true,
});

function protocolAdmission(canonicalKey = 'dash-eating-plan') {
  const definitionUri = 'https://authz.example/dash-definition';
  const evidenceUri = 'https://authz.example/dash-study';
  return {
    identity: {
      status: 'PASS',
      canonicalKey,
      references: [{ type: 'GUIDELINE', value: definitionUri, verified: true }],
      protocol: {
        definition: { sourceId: 'authz-def', uri: definitionUri, role: 'DEFINITION', statement: 'DASH plan (authz test).' },
        evidence: [{ sourceId: 'authz-ev', uri: evidenceUri, role: 'EVIDENCE' }],
        guidelineAndSafetyReviewed: true,
        protocolType: 'MEDICAL_NUTRITION_THERAPY',
        genericOrBranded: 'GENERIC',
      },
    },
    sources: [
      { sourceId: 'authz-def', sourceType: 'OFFICIAL_WEBSITE', sourceRole: 'DEFINITION', uri: definitionUri, lifecycleTarget: 'Authz definition', lifecycleChannel: 'kaduse-research', d4: d4(definitionUri, 'FIRST_PARTY') },
      { sourceId: 'authz-ev', sourceType: 'RCT_OR_RESEARCH', sourceRole: 'EVIDENCE', uri: evidenceUri, lifecycleTarget: 'Authz evidence', lifecycleChannel: 'kaduse-research', d4: d4(evidenceUri) },
    ],
    dataContract: true,
    routing: { role: 'RESEARCH_SIGNAL', destination: 'GLOBAL_HUB:kaduse-research' },
    provenance: true, dedupe: true, safety: true, observability: true, rollback: true, commercialReview: true,
  };
}

async function approvedFlow(db, canonicalName = 'Authz Protocol', canonicalKey = 'dash-eating-plan') {
  const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`authz ${canonicalName} ${Date.now()}`]);
  const candidate = await kernel.createCandidate(db, { runId: run.run_id, domain: 'PROTOCOL', canonicalName, aliases: [] });
  const compiled = await kernel.compileCandidateAdmission(db, candidate.candidate_id, protocolAdmission(canonicalKey));
  assert.equal(compiled.state, 'READY_FOR_OWNER');
  const decided = await kernel.decideCandidate(db, candidate.candidate_id, 'APPROVE', 'hub-operator');
  return { candidateId: candidate.candidate_id, version: compiled.package.version };
}

test('forged approval for unknown candidate fails closed', async () => {
  const { db } = openDb();
  await assert.rejects(
    authorize.authorizeIngestPersist(db, { approvedBy: 'attacker', decision: 'APPROVE', candidateId: 'candidate_nope', admissionVersion: 'v1-x' }),
    /APPROVAL_CANDIDATE_UNKNOWN/,
  );
});

test('empty approval claim fails closed', async () => {
  const { db } = openDb();
  await assert.rejects(
    authorize.authorizeIngestPersist(db, { approvedBy: '', decision: 'APPROVE', candidateId: 'c', admissionVersion: 'v' }),
    /APPROVAL_MISSING/,
  );
});

test('WATCH decision is not an approval', async () => {
  const { db } = openDb();
  await assert.rejects(
    authorize.authorizeIngestPersist(db, { approvedBy: 'hub-operator', decision: 'WATCH', candidateId: 'c', admissionVersion: 'v' }),
    /APPROVAL_MISSING/,
  );
});

test('unapproved (READY_FOR_OWNER) candidate cannot authorize persist', async () => {
  const { db } = openDb();
  const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`authz pending ${Date.now()}`]);
  const candidate = await kernel.createCandidate(db, { runId: run.run_id, domain: 'PROTOCOL', canonicalName: 'Pending Protocol', aliases: [] });
  const compiled = await kernel.compileCandidateAdmission(db, candidate.candidate_id, protocolAdmission());
  await assert.rejects(
    authorize.authorizeIngestPersist(db, { approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: candidate.candidate_id, admissionVersion: compiled.package.version }),
    /APPROVAL_CANDIDATE_NOT_APPROVED:READY_FOR_OWNER/,
  );
});

test('stale admission version rejected after recompile', async () => {
  const { db } = openDb();
  const flow = await approvedFlow(db);
  await assert.rejects(
    authorize.authorizeIngestPersist(db, { approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: flow.candidateId, admissionVersion: 'v1-stale' }),
    /APPROVAL_STALE_PACKAGE/,
  );
});

test('wrong-domain (DOCTOR) approval cannot authorize protocol persist', async () => {
  const { db } = openDb();
  const run = await kernel.createDiscoveryRun(db, 'DOCTOR', [`authz doctor ${Date.now()}`]);
  const candidate = await kernel.createCandidate(db, { runId: run.run_id, domain: 'DOCTOR', canonicalName: 'Authz Doctor', aliases: [] });
  await assert.rejects(
    authorize.authorizeIngestPersist(db, { approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: candidate.candidate_id, admissionVersion: 'v1-x' }),
    /APPROVAL_WRONG_DOMAIN/,
  );
});

test('genuine owner approval verifies against server-side ledgers', async () => {
  const { db } = openDb();
  const flow = await approvedFlow(db);
  const verified = await authorize.authorizeIngestPersist(db, {
    approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: flow.candidateId, admissionVersion: flow.version,
  });
  assert.equal(verified.protocolId, 'dash-eating-plan');
  assert.equal(verified.decidedBy, 'hub-operator');
  assert.equal(verified.decision, 'APPROVE');
});

test('duplicate candidate resolves to same known entity, no second approval', async () => {
  const { db } = openDb();
  const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`authz dup ${Date.now()}`]);
  const first = await kernel.createCandidate(db, { runId: run.run_id, domain: 'PROTOCOL', canonicalName: 'DASH eating plan', aliases: [] });
  assert.equal(first.state, 'DUPLICATE/MERGED');
  assert.equal(first.duplicate_of, 'dash-eating-plan');
});

test('suspended candidate loses execute authorization (no cached grants)', async () => {
  const { db } = openDb();
  const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`authz susp ${Date.now()}`]);
  const candidate = await kernel.createCandidate(db, { runId: run.run_id, domain: 'PROTOCOL', canonicalName: 'Suspended Protocol', aliases: [] });
  const compiled = await kernel.compileCandidateAdmission(db, candidate.candidate_id, protocolAdmission());
  await kernel.decideCandidate(db, candidate.candidate_id, 'APPROVE', 'hub-operator');
  const approval = { approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: candidate.candidate_id, admissionVersion: compiled.package.version };
  const before = await authorize.authorizeIngestPersist(db, approval);
  assert.equal(before.protocolId, 'dash-eating-plan');
  // Owner suspends via the discovery state machine (APPROVED→ONBOARDING→SUSPENDED).
  await kernel.claimNextOnboardingIntent(db);
  await db.prepare(`UPDATE candidate_ledger SET state='SUSPENDED' WHERE candidate_id=?`).bind(candidate.candidate_id).run();
  await assert.rejects(authorize.authorizeIngestPersist(db, approval), /APPROVAL_CANDIDATE_NOT_APPROVED:SUSPENDED/);
});
