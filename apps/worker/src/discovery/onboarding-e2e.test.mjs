import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';
import { processIntent } from '../../../../scripts/discovery/onboarding-executor.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const worker = await bundle('apps/worker/src/index.ts', 'discovery-onboarding-e2e');
const queries = await bundle('apps/worker/src/db/queries.ts', 'discovery-onboarding-query');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'discovery-onboarding-protocol-registry');

const OWNER_TOKEN = 'test-owner';
const EXECUTOR_TOKEN = 'test-executor';
const FEED_ID = 'discovery-onboarding-test-feed';
const NOW = new Date().toISOString();
const AUDIT = { by: 'test:discovery', reason: 'discovery onboarding e2e' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  sqlite.prepare(
    `INSERT INTO source_feeds
       (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, rules_json)
     VALUES (?, 'discovery test only', 'kaduse-research', 'kaduse-medikal',
             'DISCOVERY_TEST', 'https://discovery.example/feed', 0, 0, '{}')`,
  ).run(FEED_ID);
  return { sqlite, DB: d1FromSqlite(sqlite) };
}

function d4(uri, provenanceClass = 'PRIMARY_RESEARCH') {
  return {
    evidenceRef: `d4://test/${encodeURIComponent(uri)}`,
    observedAt: NOW,
    identityMatch: 'PASS',
    fetchDryRun: 'PASS',
    parseDryRun: 'PASS',
    accessTerms: 'ALLOWED',
    provenanceClass,
    provenanceUri: uri,
    sourceItemShapeValid: true,
  };
}

function doctorAdmission() {
  const institutionUri = 'https://university.example/doctor';
  const orcidUri = 'https://orcid.org/0000-0000-0000-000X';
  return {
    identity: {
      status: 'PASS',
      canonicalKey: 'discovery-doctor-e2e',
      references: [
        { type: 'CREDENTIAL', value: 'credential:e2e', verified: true },
        { type: 'INSTITUTIONAL_PROFILE', value: institutionUri, verified: true },
        { type: 'ORCID', value: '0000-0000-0000-000X', verified: true },
      ],
      doctor: { credentialClass: 'PHYSICIAN', credentialVerified: true, panel: 'GLOBAL_EXPERT_PANEL' },
    },
    sources: [
      {
        sourceId: 'discovery-doctor-institution',
        sourceType: 'INSTITUTIONAL_PROFILE',
        sourceRole: 'IDENTITY',
        uri: institutionUri,
        lifecycleTarget: 'Discovery Doctor E2E institutional profile',
        lifecycleChannel: 'kaduse-research',
        d4: d4(institutionUri, 'INSTITUTIONAL'),
      },
      {
        sourceId: 'discovery-doctor-orcid',
        sourceType: 'ORCID',
        sourceRole: 'IDENTITY',
        uri: orcidUri,
        lifecycleTarget: 'Discovery Doctor E2E ORCID',
        lifecycleChannel: 'kaduse-research',
        d4: d4(orcidUri, 'IDENTITY_REGISTRY'),
      },
    ],
    dataContract: true,
    routing: { role: 'RESEARCH_SIGNAL', destination: 'GLOBAL_HUB:kaduse-research' },
    provenance: true,
    dedupe: true,
    safety: true,
    observability: true,
    rollback: true,
    commercialReview: true,
  };
}

function protocolAdmission(mergeTargetProtocolId) {
  const definitionUri = 'https://guideline.example/discovery-protocol';
  const evidenceUri = 'https://pubmed.example/discovery-protocol-study';
  return {
    identity: {
      status: 'PASS',
      canonicalKey: 'discovery-protocol-e2e',
      references: [{ type: 'GUIDELINE', value: definitionUri, verified: true }],
      protocol: {
        definition: {
          sourceId: 'discovery-protocol-definition',
          uri: definitionUri,
          role: 'DEFINITION',
          statement: 'A synthetic protocol definition used only by the onboarding test.',
        },
        evidence: [{
          sourceId: 'discovery-protocol-evidence',
          uri: evidenceUri,
          role: 'EVIDENCE',
        }],
        guidelineAndSafetyReviewed: true,
        protocolType: 'DIETARY_PATTERN',
        genericOrBranded: 'GENERIC',
        ...(mergeTargetProtocolId ? { mergeTargetProtocolId } : {}),
      },
    },
    sources: [
      {
        sourceId: 'discovery-protocol-definition',
        sourceType: 'GUIDELINE',
        sourceRole: 'DEFINITION',
        uri: definitionUri,
        lifecycleTarget: 'Discovery protocol E2E guideline',
        lifecycleChannel: 'kaduse-research',
        d4: d4(definitionUri, 'GUIDELINE'),
      },
      {
        sourceId: 'discovery-protocol-evidence',
        sourceType: 'RCT_OR_RESEARCH',
        sourceRole: 'EVIDENCE',
        uri: evidenceUri,
        lifecycleTarget: 'Discovery protocol E2E evidence',
        lifecycleChannel: 'kaduse-research',
        d4: d4(evidenceUri),
      },
    ],
    dataContract: true,
    routing: { role: 'RESEARCH_SIGNAL', destination: 'GLOBAL_HUB:kaduse-research' },
    provenance: true,
    dedupe: true,
    safety: true,
    observability: true,
    rollback: true,
    commercialReview: true,
  };
}

async function apiCall(path, method, token, env, body) {
  const response = await worker.default.fetch(new Request(`https://hub.example${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, {});
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function execute(domain, canonicalName, admission, env, {
  decision = 'APPROVE',
  expectedStatus = 'AWAITING_INGEST',
} = {}) {
  const wave = await apiCall('/api/discovery/waves', 'POST', OWNER_TOKEN, env, {
    domain,
    searchSpace: [`${domain.toLowerCase()} end-to-end ${canonicalName}`],
  });
  const candidate = await apiCall('/api/discovery/candidates', 'POST', OWNER_TOKEN, env, {
    runId: wave.run.run_id,
    domain,
    canonicalName,
    aliases: [],
  });
  await apiCall(`/api/discovery/candidates/${candidate.candidate_id}/compile`, 'POST', OWNER_TOKEN, env, admission);
  const approved = await apiCall(`/api/discovery/candidates/${candidate.candidate_id}/decision`, 'POST', OWNER_TOKEN, env, {
    decision,
  });
  const claimed = await apiCall('/api/discovery/executor/claim', 'POST', EXECUTOR_TOKEN, env, {});
  assert.equal(claimed.intent.intent_id, approved.intentId);
  const result = await processIntent('https://hub.example', EXECUTOR_TOKEN, claimed.intent, {
    runLifecycle: (command, source) => ({
      exitCode: 0,
      result: { outcome: 'ACTIVE', ok: true, command, source_id: source.source_id },
    }),
    requestJson: async (_baseUrl, token, path, body) =>
      apiCall(path, 'POST', token, env, body),
  });
  assert.equal(result.finalized.status, expectedStatus, JSON.stringify({
    sources: await env.DB.prepare(
      `SELECT s.source_id, s.source_disposition, e.outcome, e.lifecycle_result_json
         FROM onboarding_intent_sources s
         LEFT JOIN onboarding_source_events e ON e.intent_id = s.intent_id AND e.source_id = s.source_id
        WHERE s.intent_id = ?`,
    ).bind(approved.intentId).all(),
  }));
  const retry = await apiCall('/api/discovery/executor/finalize', 'POST', EXECUTOR_TOKEN, env, {
    intentId: approved.intentId,
  });
  assert.equal(retry.entityId, result.finalized.entityId);
  assert.equal(retry.status, result.finalized.status);
  return { candidateId: candidate.candidate_id, intentId: approved.intentId, entityId: result.finalized.entityId };
}

async function ingestHubItem(db, sourceId, title, url) {
  const item = await queries.upsertSourceItem(db, {
    feedId: FEED_ID,
    route: 'kaduse-research',
    channelId: 'kaduse-medikal',
    title,
    summary: 'Synthetic discovery onboarding test item; no real-world health claim.',
    canonicalUrl: url,
    publisher: 'Discovery fixture',
    publishedAt: new Date().toISOString(),
    sourceId,
    decisionRoute: 'kaduse-research',
    intakeMetaJson: JSON.stringify({ discovery_test: true }),
  });
  assert.ok(item.id, `ingest rejected: ${item.rejected}`);
  return item.id;
}

test('Doctor discovery approval executes to canonical actor, ingestion, and Global Hub item', async () => {
  const { sqlite, DB } = openDb();
  const env = { DB, HUB_OPERATOR_TOKEN: OWNER_TOKEN, DISCOVERY_EXECUTOR_TOKEN: EXECUTOR_TOKEN };
  const flow = await execute('DOCTOR', 'Discovery Doctor E2E', doctorAdmission(), env);
  const associations = await sqlite.prepare(
    `SELECT a.association_id, ep.shared_source_ref
       FROM actor_source_associations a
       JOIN actor_source_endpoints ep ON ep.endpoint_id = a.endpoint_id
      WHERE a.actor_id = ? ORDER BY ep.shared_source_ref`,
  ).all(flow.entityId);
  assert.equal(associations.length, 2);
  const itemId = await ingestHubItem(DB, 'discovery-doctor-institution', 'Synthetic doctor source item for discovery test', 'https://university.example/item');
  const item = sqlite.prepare('SELECT triage_status, source_id FROM source_items WHERE id = ?').get(itemId);
  assert.equal(item.triage_status, 'inbox');
  assert.ok(item.source_id);
  const candidate = sqlite.prepare('SELECT state, entity_id FROM candidate_ledger WHERE candidate_id = ?').get(flow.candidateId);
  assert.equal(candidate.entity_id, flow.entityId);
  assert.equal(candidate.state, 'PRODUCTION_ACTIVE');
  const retry = await apiCall('/api/discovery/executor/finalize', 'POST', EXECUTOR_TOKEN, env, {
    intentId: flow.intentId,
  });
  assert.equal(retry.pipelineStage, 'PRODUCTION_ACTIVE');
  const intent = sqlite.prepare('SELECT status, pipeline_stage FROM onboarding_intents WHERE intent_id = ?').get(flow.intentId);
  assert.equal(intent.status, 'PRODUCTION_ACTIVE');
  assert.equal(intent.pipeline_stage, 'PRODUCTION_ACTIVE');
  assert.equal(sqlite.prepare(
    `SELECT COUNT(*) AS n FROM onboarding_source_events
      WHERE intent_id = ? AND outcome IN ('PIPELINE_INGESTED', 'HUB_ITEM_CREATED')`,
  ).get(flow.intentId).n, 2);
});

test('Protocol discovery approval executes to canonical protocol, evidence link, and Global Hub item', async () => {
  const { sqlite, DB } = openDb();
  const env = { DB, HUB_OPERATOR_TOKEN: OWNER_TOKEN, DISCOVERY_EXECUTOR_TOKEN: EXECUTOR_TOKEN };
  const flow = await execute('PROTOCOL', 'Discovery Protocol E2E', protocolAdmission(), env);
  const protocol = await protocols.getProtocol(DB, flow.entityId);
  assert.equal(protocol.canonical_name, 'Discovery Protocol E2E');
  const itemId = await ingestHubItem(DB, 'discovery-protocol-evidence', 'Synthetic protocol research item for discovery test', 'https://pubmed.example/item');
  const item = sqlite.prepare('SELECT triage_status FROM source_items WHERE id = ?').get(itemId);
  assert.equal(item.triage_status, 'inbox');
  const evidence = sqlite.prepare('SELECT evidence_id FROM protocol_evidence WHERE source_item_id = ?').get(itemId);
  assert.ok(evidence);
  const link = sqlite.prepare('SELECT direction FROM claim_evidence_links WHERE evidence_id = ?').get(evidence.evidence_id);
  assert.equal(link.direction, 'CONTEXT');
  const candidate = sqlite.prepare('SELECT state, entity_id FROM candidate_ledger WHERE candidate_id = ?').get(flow.candidateId);
  assert.equal(candidate.entity_id, flow.entityId);
  assert.equal(candidate.state, 'PRODUCTION_ACTIVE');
  const intent = sqlite.prepare('SELECT status, pipeline_stage FROM onboarding_intents WHERE intent_id = ?').get(flow.intentId);
  assert.equal(intent.status, 'PRODUCTION_ACTIVE');
  assert.equal(intent.pipeline_stage, 'PRODUCTION_ACTIVE');
  assert.equal(sqlite.prepare(
    `SELECT COUNT(*) AS n FROM onboarding_source_events
      WHERE intent_id = ? AND outcome IN ('PIPELINE_INGESTED', 'HUB_ITEM_CREATED')`,
  ).get(flow.intentId).n, 2);
});

test('Protocol merge decisions resolve aliases and create family variants idempotently', async () => {
  for (const decision of ['MERGE_AS_ALIAS', 'MERGE_AS_VARIANT']) {
    const { sqlite, DB } = openDb();
    const env = { DB, HUB_OPERATOR_TOKEN: OWNER_TOKEN, DISCOVERY_EXECUTOR_TOKEN: EXECUTOR_TOKEN };
    await protocols.createCanonicalProtocol(DB, {
      protocol_id: 'discovery-merge-target',
      canonical_name: 'Discovery Merge Target',
      protocol_type: 'DIETARY_PATTERN',
      generic_or_branded: 'GENERIC',
      registry_state: 'CANONICAL_READY',
    });
    const candidateName = decision === 'MERGE_AS_ALIAS'
      ? 'Discovery Target Alias'
      : 'Discovery Target Variant';
    const flow = await execute(
      'PROTOCOL',
      candidateName,
      protocolAdmission('discovery-merge-target'),
      env,
      { decision },
    );
    assert.equal(flow.entityId, decision === 'MERGE_AS_ALIAS' ? 'discovery-merge-target' : 'discovery-target-variant');
    if (decision === 'MERGE_AS_ALIAS') {
      const resolved = await protocols.resolveProtocol(DB, candidateName);
      assert.equal(resolved.protocol.protocol_id, 'discovery-merge-target');
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocols WHERE protocol_id = ?').get(flow.entityId).n, 1);
    } else {
      const membership = sqlite.prepare(
        `SELECT family_id, member_role FROM protocol_family_members WHERE protocol_id = ?`,
      ).get(flow.entityId);
      assert.equal(membership.member_role, 'VARIANT');
      const target = sqlite.prepare(
        `SELECT family_id, member_role FROM protocol_family_members WHERE protocol_id = 'discovery-merge-target'`,
      ).get();
      assert.equal(target.family_id, membership.family_id);
      assert.equal(target.member_role, 'CANONICAL');
    }
  }
});

test('Manual source coverage remains partial but does not block Protocol pipeline milestones', async () => {
  const { sqlite, DB } = openDb();
  const env = { DB, HUB_OPERATOR_TOKEN: OWNER_TOKEN, DISCOVERY_EXECUTOR_TOKEN: EXECUTOR_TOKEN };
  const admission = protocolAdmission();
  admission.identity.protocol.evidence.push({
    sourceId: 'discovery-protocol-manual-social',
    uri: 'https://instagram.example/discovery-protocol',
    role: 'EVIDENCE',
  });
  admission.sources.push({
    sourceId: 'discovery-protocol-manual-social',
    sourceType: 'INSTAGRAM',
    sourceRole: 'EVIDENCE',
    uri: 'https://instagram.example/discovery-protocol',
    lifecycleTarget: 'Discovery protocol E2E social source',
    lifecycleChannel: 'kaduse-research',
    d4: null,
  });
  const flow = await execute('PROTOCOL', 'Discovery Protocol Partial E2E', admission, env, {
    expectedStatus: 'PARTIAL_SOURCE_COVERAGE',
  });
  const manual = sqlite.prepare(
    `SELECT outcome FROM onboarding_source_events
      WHERE intent_id = ? AND source_id = 'discovery-protocol-manual-social'`,
  ).get(flow.intentId);
  assert.equal(manual.outcome, 'MANUAL_INTAKE');
  const itemId = await ingestHubItem(DB, 'discovery-protocol-evidence', 'Synthetic partial protocol item', 'https://pubmed.example/partial-item');
  const item = sqlite.prepare('SELECT id FROM source_items WHERE id = ?').get(itemId);
  assert.ok(item);
  const intent = sqlite.prepare('SELECT status, pipeline_stage FROM onboarding_intents WHERE intent_id = ?').get(flow.intentId);
  assert.equal(intent.status, 'PARTIAL_SOURCE_COVERAGE');
  assert.equal(intent.pipeline_stage, 'PRODUCTION_ACTIVE');
  assert.equal(sqlite.prepare('SELECT state FROM candidate_ledger WHERE candidate_id = ?').get(flow.candidateId).state, 'PARTIAL_SOURCE_COVERAGE');
});
