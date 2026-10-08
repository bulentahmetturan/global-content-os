import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const worker = await bundle('apps/worker/src/index.ts', 'discovery-owner-api');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  return { sqlite, DB: d1FromSqlite(sqlite) };
}

const source = (sourceId, sourceType, sourceRole, uri) => ({
  sourceId,
  sourceType,
  sourceRole,
  uri,
  lifecycleTarget: `Candidate ${sourceId}`,
  lifecycleChannel: 'tip_toplulugu',
  d4: {
    evidenceRef: `d4://${sourceId}`,
    observedAt: new Date().toISOString(),
    identityMatch: 'PASS',
    fetchDryRun: 'PASS',
    parseDryRun: 'PASS',
    accessTerms: 'ALLOWED',
    provenanceClass: 'INSTITUTIONAL',
    provenanceUri: uri,
    sourceItemShapeValid: true,
  },
});

function admission() {
  return {
    identity: {
      status: 'PASS',
      canonicalKey: 'doctor-api-test',
      references: [
        { type: 'CREDENTIAL', value: 'credential', verified: true },
        { type: 'INSTITUTIONAL_PROFILE', value: 'institution', verified: true },
        { type: 'ORCID', value: 'orcid', verified: true },
      ],
      doctor: { credentialClass: 'PHYSICIAN', credentialVerified: true, panel: 'TURKEY_EXPERT_PANEL' },
    },
    sources: [
      source('institution', 'INSTITUTIONAL_PROFILE', 'IDENTITY', 'https://institution.example/doctor'),
      source('orcid', 'ORCID', 'IDENTITY', 'https://orcid.org/0000-0000-0000-000X'),
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

async function call(request, env) {
  const response = await worker.default.fetch(request, env, {});
  return { response, body: await response.json() };
}

test('owner decisions and local executor use separate fail-closed credentials', async () => {
  const { DB } = openDb();
  const env = {
    DB,
    HUB_OPERATOR_TOKEN: 'owner-secret',
    DISCOVERY_EXECUTOR_TOKEN: 'executor-secret',
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  };
  const missing = await call(new Request('https://hub.example/api/discovery/waves', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: 'DOCTOR', searchSpace: ['new physician registry'] }),
  }), { ...env, HUB_OPERATOR_TOKEN: '' });
  assert.equal(missing.response.status, 503);

  const headers = { Authorization: 'Bearer owner-secret', 'Content-Type': 'application/json' };
  const wave = await call(new Request('https://hub.example/api/discovery/waves', {
    method: 'POST',
    headers,
    body: JSON.stringify({ domain: 'DOCTOR', searchSpace: ['new physician registry'] }),
  }), env);
  assert.equal(wave.response.status, 201);
  const candidate = await call(new Request('https://hub.example/api/discovery/candidates', {
    method: 'POST',
    headers,
    body: JSON.stringify({ runId: wave.body.run.run_id, domain: 'DOCTOR', canonicalName: 'Doctor API Test', aliases: [] }),
  }), env);
  const compiled = await call(new Request(`https://hub.example/api/discovery/candidates/${candidate.body.candidate_id}/compile`, {
    method: 'POST', headers, body: JSON.stringify(admission()),
  }), env);
  assert.equal(compiled.body.state, 'READY_FOR_OWNER');
  const approved = await call(new Request(`https://hub.example/api/discovery/candidates/${candidate.body.candidate_id}/decision`, {
    method: 'POST', headers, body: JSON.stringify({ decision: 'APPROVE' }),
  }), env);
  assert.equal(approved.body.state, 'APPROVED');
  assert.ok(approved.body.intentId);

  const wrongExecutor = await call(new Request('https://hub.example/api/discovery/executor/claim', {
    method: 'POST', headers,
  }), env);
  assert.equal(wrongExecutor.response.status, 401);
  const claimed = await call(new Request('https://hub.example/api/discovery/executor/claim', {
    method: 'POST',
    headers: { Authorization: 'Bearer executor-secret' },
  }), env);
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.body.intent.status, 'EXECUTING');

  const ownerQueue = await call(new Request('https://hub.example/api/discovery/owner', {
    headers: { Authorization: 'Bearer owner-secret' },
  }), env);
  assert.deepEqual(Object.keys(ownerQueue.body.candidates[0]).sort(), [
    'candidate_id', 'canonical_entity_id', 'canonical_name', 'domain',
    'intent_status', 'pipeline_stage', 'state',
  ]);
  assert.equal(ownerQueue.body.candidates[0].intent_status, 'EXECUTING');
  assert.equal(ownerQueue.body.candidates[0].pipeline_stage, 'ONBOARDING');
});
