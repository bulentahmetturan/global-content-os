// Persist: dry-run touches nothing, approval gate, idempotent re-apply, no overwrite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const persist = await bundle('apps/worker/src/protocols/ingestion/persist.ts', 'ingest-persist');
const mapping = await bundle('apps/worker/src/protocols/ingestion/p-mapping.ts', 'ingest-persist-map');
const parse = await bundle('apps/worker/src/protocols/ingestion/parse-contract.ts', 'ingest-persist-parse');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function samplePkg(tag = 'SYNTHETIC_FIXTURE') {
  const doc = parse.parseDocument({
    sourceId: 's-test', parserFamily: 'GENERIC_WEB',
    text: 'Grains: 6-8 servings per day for test.\n\nA test claim block with sufficient length here.',
    uri: 'https://example.org/t', sourceTag: tag,
  });
  return mapping.mapParsedToCanonical({ protocolId: 'dash-eating-plan', protocolSlugSeed: 'DASH eating plan', parsed: [doc], baseVersionSeq: 99 });
}

test('dry-run is default and writes nothing', async () => {
  const { sqlite, db } = openDb();
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n;
  const res = await persist.persistMappedPackage(db, samplePkg());
  assert.equal(res.dryRun, true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n, before);
});

test('non-dry-run without approval fails closed', async () => {
  const { db } = openDb();
  await assert.rejects(persist.persistMappedPackage(db, samplePkg(), { dryRun: false }), /APPROVAL_MISSING/);
});

test('authorized write persists, re-apply skips existing (no overwrite)', async () => {
  const { sqlite, db } = openDb();
  const pkg = samplePkg();
  const approval = { approvedBy: 'hub-operator', decision: 'APPROVE', candidateId: 'candidate_test', admissionVersion: 'v1-abc' };
  const first = await persist.persistMappedPackage(db, pkg, { dryRun: false, approval });
  assert.ok(first.created.components + first.created.claims > 0);
  const second = await persist.persistMappedPackage(db, pkg, { dryRun: false, approval });
  assert.equal(second.created.components, 0);
  assert.equal(second.created.claims, 0);
  assert.ok(second.skippedExisting > 0);
  void sqlite;
});

test('unknown protocol fails closed without write', async () => {
  const { db } = openDb();
  const doc = parse.parseDocument({
    sourceId: 's', parserFamily: 'GENERIC_WEB', text: 'Grains: test servings block here.\n\nAnother long enough block for claim.',
    uri: 'https://example.org/u', sourceTag: 'SYNTHETIC_FIXTURE',
  });
  const pkg = mapping.mapParsedToCanonical({ protocolId: 'no-such-protocol', protocolSlugSeed: 'Nope', parsed: [doc] });
  const res = await persist.persistMappedPackage(db, pkg, { dryRun: false, approval: { approvedBy: 'h', decision: 'APPROVE', candidateId: 'c', admissionVersion: 'v' } });
  assert.ok(res.diagnostics.some((d) => d.code === 'IDENTITY_UNRESOLVED'));
  assert.equal(res.created.components, 0);
});
