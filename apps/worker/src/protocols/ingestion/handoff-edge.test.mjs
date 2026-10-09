// Handoff edge cases: stale admission, conflicting alias, partial failure,
// unauthorized persist, quarantine accounting. Real registry rows where alias
// semantics matter; everything else pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const handoff = await bundle('apps/worker/src/protocols/ingestion/discovery-handoff.ts', 'ingest-handoff-edge');
const registry = await bundle('apps/worker/src/protocols/registry.ts', 'ingest-handoff-edge-reg');
const persist = await bundle('apps/worker/src/protocols/ingestion/persist.ts', 'ingest-handoff-edge-persist');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const freshAdmission = (overrides = {}) => ({
  domain: 'PROTOCOL', version: 'v1-edge', compiledAt: new Date().toISOString(),
  identity: { canonicalKey: 'dash-eating-plan' },
  sources: [
    { sourceId: 's1', sourceType: 'OFFICIAL_WEBSITE', uri: 'https://edge.example/a', sourceRole: 'DEFINITION', disposition: 'ACTIVATE' },
    { sourceId: 's2', sourceType: 'INSTAGRAM', uri: 'https://instagram.com/edge', sourceRole: 'EVIDENCE', disposition: 'MANUAL_INTAKE' },
  ],
  usableSourceCount: 1, missing: [], ...overrides,
});
const decision = (d = 'APPROVE') => ({ decision: d, decidedBy: 'hub-operator', candidateId: 'candidate_edge' });

test('stale admission (>72h) rejected, fresh passes', async () => {
  assert.throws(
    () => handoff.adaptAdmissionToIngestion(
      freshAdmission({ compiledAt: new Date(Date.now() - 73 * 3600 * 1000).toISOString() }), decision()),
    /APPROVAL_STALE_PACKAGE/,
  );
  const ok = handoff.adaptAdmissionToIngestion(freshAdmission(), decision());
  assert.equal(ok.protocolId, 'dash-eating-plan');
});

test('missing owner decision (empty decidedBy) rejected', async () => {
  assert.throws(
    () => handoff.adaptAdmissionToIngestion(freshAdmission(), { decision: 'APPROVE', decidedBy: '', candidateId: 'c' }),
    /APPROVAL_MISSING/,
  );
});

test('conflicting alias resolves AMBIGUOUS fail-closed at registry', async () => {
  const { db } = openDb();
  await registry.addProtocolAlias(db, { protocol_id: 'dash-eating-plan', alias_value: 'Shared Edge Name', alias_type: 'NAME_VARIANT' });
  await registry.addProtocolAlias(db, { protocol_id: 'mediterranean-diet', alias_value: 'Shared Edge Name', alias_type: 'NAME_VARIANT' });
  const resolved = await registry.resolveProtocol(db, 'Shared Edge Name');
  assert.equal(resolved.outcome, 'AMBIGUOUS');
});

test('partial source failure: ACTIVATE eligible isolated from MANUAL_INTAKE', async () => {
  const out = handoff.adaptAdmissionToIngestion(freshAdmission(), decision());
  assert.equal(out.plannedSources.length, 2);
  assert.ok(out.diagnostics.some((d) => d.includes('MANUAL_INTAKE/RESTRICTED')));
});

test('package for another protocol rejected against verified authorization', async () => {
  const { db } = openDb();
  const pkg = {
    protocolId: 'mediterranean-diet', version: null, phases: [], components: [], aliases: [],
    actorRelationships: [], claims: [], safety: [], commercial: [], diagnostics: [],
  };
  await assert.rejects(
    persist.persistMappedPackage(db, pkg, {
      dryRun: false,
      verified: { protocolId: 'dash-eating-plan', candidateId: 'c', admissionVersion: 'v', decision: 'APPROVE', decidedBy: 'h' },
    }),
    /APPROVAL_IDENTITY_UNRESOLVED/,
  );
});

test('quarantine accounting: edge with missing actor quarantines, rest persists', async () => {
  const { db } = openDb();
  const approval = { approvedBy: 'h', decision: 'APPROVE', candidateId: 'c', admissionVersion: 'v' };
  const pkg = {
    protocolId: 'dash-eating-plan',
    version: { versionId: 'dash-v-edge', versionSeq: 96, versionLabel: 'edge', sourceTag: 'SYNTHETIC_FIXTURE' },
    phases: [], components: [], aliases: [],
    actorRelationships: [
      { relationshipId: 'apr_edge_ok', actorId: 'actor_nhlbi', relationshipType: 'ASSOCIATED_WITH', excerpt: 'e', sourceTag: 'SYNTHETIC_FIXTURE' },
      { relationshipId: 'apr_edge_ghost', actorId: 'actor_ghost', relationshipType: 'RESEARCHER', excerpt: 'e', sourceTag: 'SYNTHETIC_FIXTURE' },
    ],
    claims: [], safety: [], commercial: [], diagnostics: [],
  };
  const res = await persist.persistMappedPackage(db, pkg, { dryRun: false, approval });
  assert.equal(res.created.edges, 1);
  assert.equal(res.quarantined, 1);
  assert.ok(res.diagnostics.some((d) => d.code === 'PARTIAL_SUCCESS'));
});
