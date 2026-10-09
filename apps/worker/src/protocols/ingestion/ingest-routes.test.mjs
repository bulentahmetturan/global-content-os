// Runtime route integration: dry-run is read-only, execute is ledger-gated.
// Worker fetch with stub env; no network; ephemeral D1 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const worker = await bundle('apps/worker/src/index.ts', 'ingest-routes');
const kernel = await bundle('apps/worker/src/discovery/kernel.ts', 'ingest-routes-kernel');

const OWNER = 'hub-op-secret';
function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, DB: d1FromSqlite(sqlite) };
}
const envFor = (DB, extra = {}) => ({ DB, HUB_OPERATOR_TOKEN: OWNER, DISCOVERY_EXECUTOR_TOKEN: 'exec-secret', ...extra });
async function post(path, token, env, body) {
  const res = await worker.default.fetch(new Request(`https://gcos.test${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env, {});
  return { status: res.status, payload: await res.json() };
}

const d4 = (uri, provenanceClass = 'PRIMARY_RESEARCH') => ({
  evidenceRef: `d4://routes/${encodeURIComponent(uri)}`,
  observedAt: new Date().toISOString(), identityMatch: 'PASS', fetchDryRun: 'PASS', parseDryRun: 'PASS',
  accessTerms: 'ALLOWED', provenanceClass, provenanceUri: uri, sourceItemShapeValid: true,
});

async function approvedFlow(DB, env, tag = 'routes') {
  const run = await kernel.createDiscoveryRun(DB, 'PROTOCOL', [`${tag} exec ${Date.now()}`]);
  const candidate = await kernel.createCandidate(DB, { runId: run.run_id, domain: 'PROTOCOL', canonicalName: `${tag} exec protocol`, aliases: [] });
  const compiled = await kernel.compileCandidateAdmission(DB, candidate.candidate_id, {
    identity: {
      status: 'PASS', canonicalKey: 'dash-eating-plan',
      references: [{ type: 'GUIDELINE', value: `https://${tag}.example/def`, verified: true }],
      protocol: {
        definition: { sourceId: 's-def', uri: `https://${tag}.example/def`, role: 'DEFINITION', statement: `${tag} exec definition.` },
        evidence: [{ sourceId: 's-ev', uri: `https://${tag}.example/study`, role: 'EVIDENCE' }],
        guidelineAndSafetyReviewed: true, protocolType: 'DIETARY_PATTERN', genericOrBranded: 'GENERIC',
      },
    },
    sources: [
      { sourceId: 's-def', sourceType: 'OFFICIAL_WEBSITE', sourceRole: 'DEFINITION', uri: `https://${tag}.example/def`, lifecycleTarget: 't', lifecycleChannel: 'kaduse-research', d4: d4(`https://${tag}.example/def`, 'FIRST_PARTY') },
      { sourceId: 's-ev', sourceType: 'RCT_OR_RESEARCH', sourceRole: 'EVIDENCE', uri: `https://${tag}.example/study`, lifecycleTarget: 't', lifecycleChannel: 'kaduse-research', d4: d4(`https://${tag}.example/study`) },
    ],
    dataContract: true, routing: { role: 'RESEARCH_SIGNAL', destination: 'GLOBAL_HUB:kaduse-research' },
    provenance: true, dedupe: true, safety: true, observability: true, rollback: true, commercialReview: true,
  });
  assert.equal(compiled.state, 'READY_FOR_OWNER');
  await kernel.decideCandidate(DB, candidate.candidate_id, 'APPROVE', 'hub-operator');
  return { approval: { approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: candidate.candidate_id, admissionVersion: compiled.package.version } };
}

const dryRunBody = {
  protocolId: 'dash-eating-plan',
  admissionSources: [
    { sourceId: 's-def', sourceType: 'OFFICIAL_WEBSITE', uri: 'https://routes.example/def', sourceRole: 'DEFINITION', disposition: 'ACTIVATE' },
  ],
  documents: [{
    sourceId: 's-def', parserFamily: 'GENERIC_WEB',
    text: 'Vegetables: 4-5 servings per day.\n\nA routes test claim block with enough length.',
    uri: 'https://routes.example/def', sourceTag: 'SYNTHETIC_FIXTURE',
  }],
};

test('dry-run without token is denied fail-closed', async () => {
  const { DB } = openDb();
  const { status, payload } = await post('/api/protocols/ingest/dry-run', 'wrong', envFor(DB), dryRunBody);
  assert.equal(status, 401);
  assert.equal(payload.error, 'UNAUTHORIZED');
});

test('dry-run resolves identity and writes nothing', async () => {
  const { sqlite, DB } = openDb();
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n;
  const { status, payload } = await post('/api/protocols/ingest/dry-run', OWNER, envFor(DB), dryRunBody);
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.resolvedAs, 'EXACT_CANONICAL_ID');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n, before);
});

test('dry-run with unknown protocol is BLOCKED, not an error', async () => {
  const { DB } = openDb();
  const { status, payload } = await post('/api/protocols/ingest/dry-run', OWNER, envFor(DB), { ...dryRunBody, protocolId: 'no-such-protocol' });
  assert.equal(status, 200);
  assert.equal(payload.run.status, 'BLOCKED');
});

test('execute with forged approval is rejected (409, no write)', async () => {
  const { sqlite, DB } = openDb();
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_ingestion_runs').get().n;
  const { status, payload } = await post('/api/protocols/ingest/execute', OWNER, envFor(DB), {
    approval: { approvedBy: 'attacker', decision: 'APPROVE', candidateId: 'candidate_forged', admissionVersion: 'v1-x' },
    documents: [{ sourceId: 's-x', text: 'Forged document with sufficient length for parsing.', uri: 'https://x.example/' }],
  });
  assert.equal(status, 409);
  assert.match(payload.error, /APPROVAL_/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_ingestion_runs').get().n, before);
});

test('execute rejects documents from non-admission sources (409, no write)', async () => {
  const { sqlite, DB } = openDb();
  const env = envFor(DB);
  const flow = await approvedFlow(DB, env);
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_ingestion_runs').get().n;
  const { status, payload } = await post('/api/protocols/ingest/execute', OWNER, env, {
    approval: flow.approval,
    documents: [{ sourceId: 's-smuggled', text: 'Smuggled document with sufficient length for parsing.', uri: 'https://evil.example/' }],
  });
  assert.equal(status, 409);
  assert.match(payload.error, /SOURCE_NOT_AUTHORIZED/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_ingestion_runs').get().n, before);
});

test('execute with genuine approval persists once, replays second time', async () => {
  const { sqlite, DB } = openDb();
  const env = envFor(DB);
  const flow = await approvedFlow(DB, env);
  const documents = [
    { sourceId: 's-def', text: 'DASH emphasizes vegetables 4-5 servings per day at 2000 kcal.\n\nGrains: 6-8 servings per day for the routes test.', uri: 'https://routes.example/def' },
    { sourceId: 's-ev', text: 'Trial analysis paragraph describing blood pressure outcomes across study arms in detail for routes.', uri: 'https://routes.example/study' },
  ];
  const first = await post('/api/protocols/ingest/execute', OWNER, env, { approval: flow.approval, documents });
  assert.equal(first.status, 200);
  assert.equal(first.payload.ok, true);
  assert.equal(first.payload.replayed, false);
  assert.ok(first.payload.created.components + first.payload.created.claims > 0);
  const second = await post('/api/protocols/ingest/execute', OWNER, env, { approval: flow.approval, documents });
  assert.equal(second.status, 200);
  assert.equal(second.payload.replayed, true);
  assert.equal(second.payload.runId, first.payload.runId);
  const runRow = sqlite.prepare('SELECT status FROM protocol_ingestion_runs WHERE run_id=?').get(first.payload.runId);
  assert.ok(['PERSISTED', 'PARTIAL'].includes(runRow.status));
});
