import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const kernel = await bundle('apps/worker/src/discovery/kernel.ts', 'shared-discovery-kernel');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function d4(overrides = {}) {
  return {
    evidenceRef: 'd4://evidence/fixture',
    observedAt: new Date().toISOString(),
    identityMatch: 'PASS',
    fetchDryRun: 'PASS',
    parseDryRun: 'PASS',
    accessTerms: 'ALLOWED',
    provenanceClass: 'FIRST_PARTY',
    provenanceUri: 'https://publisher.example/profile',
    sourceItemShapeValid: true,
    ...overrides,
  };
}

function doctorAdmission(overrides = {}) {
  return {
    identity: {
      status: 'PASS',
      canonicalKey: 'doctor-ada-example',
      references: [
        { type: 'CREDENTIAL', value: 'credential-ref', verified: true },
        { type: 'INSTITUTIONAL_PROFILE', value: 'institution-ref', verified: true },
        { type: 'ORCID', value: '0000-0000-0000-000X', verified: true },
      ],
      doctor: { credentialClass: 'PHYSICIAN', credentialVerified: true, panel: 'GLOBAL_EXPERT_PANEL' },
    },
    sources: [
      {
        sourceId: 'institution-profile',
        sourceType: 'INSTITUTIONAL_PROFILE',
        sourceRole: 'IDENTITY',
        uri: 'https://university.example/ada',
        lifecycleTarget: 'Ada Example profile',
        lifecycleChannel: 'tip_toplulugu',
        d4: d4({ provenanceClass: 'INSTITUTIONAL', provenanceUri: 'https://university.example/ada' }),
      },
      {
        sourceId: 'orcid',
        sourceType: 'ORCID',
        sourceRole: 'IDENTITY',
        uri: 'https://orcid.org/0000-0000-0000-000X',
        lifecycleTarget: 'Ada Example ORCID',
        lifecycleChannel: 'kaduse-research',
        d4: d4({ provenanceClass: 'IDENTITY_REGISTRY', provenanceUri: 'https://orcid.org/0000-0000-0000-000X' }),
      },
    ],
    dataContract: true,
    routing: { role: 'RESEARCH_SIGNAL', destination: kernel.CONTENT_ROLE_ROUTER.RESEARCH_SIGNAL },
    provenance: true,
    dedupe: true,
    safety: true,
    observability: true,
    rollback: true,
    commercialReview: true,
    ...overrides,
  };
}

function protocolAdmission(overrides = {}) {
  const definitionUri = 'https://guideline.example/protocol';
  const evidenceUri = 'https://pubmed.example/study/123';
  return {
    identity: {
      status: 'PASS',
      canonicalKey: 'example-protocol',
      references: [{ type: 'GUIDELINE', value: definitionUri, verified: true }],
      protocol: {
        definition: { sourceId: 'definition', uri: definitionUri, role: 'DEFINITION', statement: 'A defined care approach.' },
        evidence: [{ sourceId: 'evidence', uri: evidenceUri, role: 'EVIDENCE' }],
        guidelineAndSafetyReviewed: true,
        protocolType: 'DIETARY_PATTERN',
        genericOrBranded: 'GENERIC',
      },
    },
    sources: [
      {
        sourceId: 'definition',
        sourceType: 'GUIDELINE',
        sourceRole: 'DEFINITION',
        uri: definitionUri,
        lifecycleTarget: 'Example guideline',
        lifecycleChannel: 'kaduse-research',
        d4: d4({ provenanceClass: 'GUIDELINE', provenanceUri: definitionUri }),
      },
      {
        sourceId: 'evidence',
        sourceType: 'RCT_OR_RESEARCH',
        sourceRole: 'EVIDENCE',
        uri: evidenceUri,
        lifecycleTarget: 'Example research evidence',
        lifecycleChannel: 'kaduse-research',
        d4: d4({ provenanceClass: 'PRIMARY_RESEARCH', provenanceUri: evidenceUri }),
      },
    ],
    dataContract: true,
    routing: { role: 'PROTOCOL_CLAIM', destination: kernel.CONTENT_ROLE_ROUTER.PROTOCOL_CLAIM },
    provenance: true,
    dedupe: true,
    safety: true,
    observability: true,
    rollback: true,
    commercialReview: true,
    ...overrides,
  };
}

test('registry contracts route fixed roles and compile a complete Doctor admission package', () => {
  const result = kernel.compileAdmissionPackage('DOCTOR', doctorAdmission());
  assert.equal(result.missing.length, 0);
  assert.equal(result.gates.D4_EVIDENCE_READY, 'PASS');
  assert.equal(result.gates.IDENTITY, 'PASS');
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every((source) => source.contract && source.disposition === 'ACTIVATE'));
  assert.equal(result.dataMapping.entityKey, 'actor_id');
  assert.equal(result.rollbackPolicy, 'SUSPEND_ENTITY_AND_DEACTIVATE_SOURCE_WITH_AUDIT');
  assert.match(result.version, /^v1-[a-f0-9]{8}$/);
});

test('unsupported sources remain manual without blocking an entity that has usable sources', () => {
  const input = doctorAdmission();
  input.sources.push({
    sourceId: 'social-profile',
    sourceType: 'INSTAGRAM',
    sourceRole: 'IDENTITY',
    uri: 'https://instagram.com/ada',
    d4: d4({ fetchDryRun: 'UNKNOWN', parseDryRun: 'UNKNOWN', sourceItemShapeValid: false }),
  });
  const result = kernel.compileAdmissionPackage('DOCTOR', input);
  assert.equal(result.missing.length, 0);
  assert.equal(result.sources.find((source) => source.sourceId === 'social-profile').disposition, 'MANUAL_INTAKE');
  assert.equal(result.usableSourceCount, 2);
});

test('zero usable sources and stale D4 evidence fail readiness; protocol definition/evidence roles cannot overlap', () => {
  const onlyManual = doctorAdmission({
    sources: doctorAdmission().sources.map((source) => ({
      ...source,
      d4: d4({ fetchDryRun: 'FAIL', parseDryRun: 'FAIL', sourceItemShapeValid: false }),
    })),
  });
  const notReady = kernel.compileAdmissionPackage('DOCTOR', onlyManual);
  assert.equal(notReady.gates.SOURCE_PLAN, 'FAIL');
  assert.equal(notReady.gates.D4_EVIDENCE_READY, 'PASS');
  assert.equal(notReady.missing.includes('SOURCE_PLAN'), true);

  const stale = doctorAdmission();
  stale.sources[0].d4 = d4({ observedAt: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString() });
  const staleResult = kernel.compileAdmissionPackage('DOCTOR', stale);
  assert.equal(staleResult.gates.D4_EVIDENCE_READY, 'FAIL');

  const protocol = protocolAdmission();
  protocol.identity.protocol.evidence[0].uri = protocol.identity.protocol.definition.uri;
  protocol.sources[1].uri = protocol.sources[0].uri;
  const roleCollision = kernel.compileAdmissionPackage('PROTOCOL', protocol);
  assert.equal(roleCollision.gates.DATA_CONTRACT, 'FAIL');
});

test('protocol admissions keep definition and evidence provenance separate', () => {
  const result = kernel.compileAdmissionPackage('PROTOCOL', protocolAdmission());
  assert.equal(result.missing.length, 0);
  assert.equal(result.sources[0].sourceRole, 'DEFINITION');
  assert.equal(result.sources[1].sourceRole, 'EVIDENCE');
  assert.equal(result.dataMapping.entityKey, 'protocol_id');
});

test('waves snapshot known entities, reject reused search space, and require a reason to rediscover rejected candidates', async () => {
  const { sqlite, db } = openDb();
  const first = await kernel.createDiscoveryRun(db, 'PROTOCOL', ['new guideline queries']);
  const duplicate = await kernel.createCandidate(db, {
    runId: first.run_id, domain: 'PROTOCOL', canonicalName: 'Mediterranean diet', aliases: [],
  });
  assert.equal(duplicate.state, 'DUPLICATE/MERGED');
  await assert.rejects(kernel.createDiscoveryRun(db, 'PROTOCOL', ['new guideline queries']), /SEARCH_SPACE_ALREADY_USED/);

  const candidate = await kernel.createCandidate(db, {
    runId: first.run_id, domain: 'PROTOCOL', canonicalName: 'New protocol', aliases: [{ value: 'New protocol alias', kind: 'NAME' }],
  });
  await kernel.compileCandidateAdmission(db, candidate.candidate_id, protocolAdmission());
  await kernel.decideCandidate(db, candidate.candidate_id, 'REJECT', 'test-owner');
  const second = await kernel.createDiscoveryRun(db, 'PROTOCOL', ['unseen guideline queries']);
  await assert.rejects(kernel.createCandidate(db, {
    runId: second.run_id, domain: 'PROTOCOL', canonicalName: 'New protocol', aliases: [],
  }), /REDISCOVERY_REASON_REQUIRED/);
  const rediscovered = await kernel.createCandidate(db, {
    runId: second.run_id,
    domain: 'PROTOCOL',
    canonicalName: 'New protocol',
    aliases: [],
    rediscoveryReason: 'NEW_GUIDELINE',
  });
  assert.equal(rediscovered.state, 'DISCOVERED');
});

test('approval creates an immutable intent; executor claims and records each source idempotently', async () => {
  const { sqlite, db } = openDb();
  const run = await kernel.createDiscoveryRun(db, 'DOCTOR', ['new institutional registry search']);
  const candidate = await kernel.createCandidate(db, {
    runId: run.run_id, domain: 'DOCTOR', canonicalName: 'Ada Example', aliases: [],
  });
  const compiled = await kernel.compileCandidateAdmission(db, candidate.candidate_id, doctorAdmission());
  assert.equal(compiled.state, 'READY_FOR_OWNER');
  const decision = await kernel.decideCandidate(db, candidate.candidate_id, 'APPROVE', 'test-owner');
  assert.equal(decision.state, 'APPROVED');
  assert.ok(decision.intentId);
  assert.throws(() => sqlite.prepare(
    `UPDATE onboarding_intents SET approved_by = 'forged' WHERE intent_id = ?`,
  ).run(decision.intentId), /ONBOARDING_INTENT_IMMUTABLE/);
  const claimed = await kernel.claimNextOnboardingIntent(db);
  assert.equal(claimed.intent_id, decision.intentId);
  assert.equal(claimed.status, 'EXECUTING');
  const sourceId = claimed.sources[0].source_id;
  const eventA = await kernel.recordOnboardingSourceResult(db, decision.intentId, sourceId, 'ACTIVE', { outcome: 'ACTIVE' }, 'd4://source');
  const eventB = await kernel.recordOnboardingSourceResult(db, decision.intentId, sourceId, 'ACTIVE', { outcome: 'ACTIVE' }, 'd4://source');
  assert.equal(eventA, eventB);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM onboarding_source_events WHERE intent_id = ? AND source_id = ?').get(decision.intentId, sourceId).n, 1);
  assert.equal(sqlite.prepare('SELECT state FROM candidate_ledger WHERE candidate_id = ?').get(candidate.candidate_id).state, 'ONBOARDING');
});

test('doctor yield maintenance and protocol saturation thresholds are measured per wave', async () => {
  const { db } = openDb();
  let doctorResult;
  for (let n = 0; n < 3; n++) {
    const run = await kernel.createDiscoveryRun(db, 'DOCTOR', [`doctor new-space-${n}`]);
    doctorResult = await kernel.recordWaveMetrics(db, run.run_id, 20, 1, 20, 19);
  }
  assert.equal(doctorResult.status, 'MAINTENANCE');
  assert.equal(doctorResult.yield, 0.05);
  assert.equal(doctorResult.readinessGatePassRate, 0.95);

  let protocolResult;
  for (let n = 0; n < 3; n++) {
    const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`protocol new-space-${n}`]);
    protocolResult = await kernel.recordWaveMetrics(db, run.run_id, 0, 0, 0, 0, 0);
  }
  assert.equal(protocolResult.status, 'SATURATED');
  const maintenanceRun = await kernel.createDiscoveryRun(db, 'PROTOCOL', ['protocol event-triggered maintenance']);
  assert.equal(maintenanceRun.status, 'MAINTENANCE');
});

test('cross-feed signals propose the opposite discovery domain without creating an entity', async () => {
  const { sqlite, db } = openDb();
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM actors').get().n;
  const signalId = await kernel.createCrossFeedSignal(db, 'UNKNOWN_PROTOCOL_SIGNAL', 'Example protocol', 'item-1', { item: 'item-1' });
  const signal = sqlite.prepare('SELECT * FROM discovery_cross_feed_signals WHERE signal_id = ?').get(signalId);
  assert.equal(signal.proposed_domain, 'PROTOCOL');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM actors').get().n, before);
});
