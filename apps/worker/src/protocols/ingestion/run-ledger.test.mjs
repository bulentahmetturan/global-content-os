// Durable run ledger: atomic claim, resume, replay, crash-recovery accounting.
// Ephemeral D1 with all migrations (incl. 0045).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const ledger = await bundle('apps/worker/src/protocols/ingestion/run-ledger.ts', 'ingest-ledger');
const kernel = await bundle('apps/worker/src/discovery/kernel.ts', 'ingest-ledger-kernel');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

async function realCandidate(db) {
  const run = await kernel.createDiscoveryRun(db, 'PROTOCOL', [`ledger candidate ${Date.now()}${Math.random()}`]);
  const candidate = await kernel.createCandidate(db, { runId: run.run_id, domain: 'PROTOCOL', canonicalName: 'Ledger Test Protocol', aliases: [] });
  return candidate.candidate_id;
}

const input = (candidateId, hash = 'abc123') => ({
  protocolId: 'dash-eating-plan', candidateId, admissionVersion: 'v1-x', contentHash: hash, decidedBy: 'hub-operator',
});

test('concurrent double-claim converges on one run (UNIQUE arbiter)', async () => {
  const { db } = openDb();
  const candidateId = await realCandidate(db);
  const [a, b] = await Promise.all([ledger.recordDurableRun(db, input(candidateId)), ledger.recordDurableRun(db, input(candidateId))]);
  assert.equal(a.runId, b.runId);
  const fresh = [a, b].filter((r) => !r.replayed && !r.resumed);
  assert.equal(fresh.length, 1);
});

test('PERSISTED run replays; OPEN run resumes (crash recovery)', async () => {
  const { db } = openDb();
  const candidateId = await realCandidate(db);
  const first = await ledger.recordDurableRun(db, input(candidateId, 'h1'));
  assert.equal(first.replayed, false);
  // Simulate crash: run stays OPEN, no completion update.
  const retry = await ledger.recordDurableRun(db, input(candidateId, 'h1'));
  assert.equal(retry.runId, first.runId);
  assert.equal(retry.resumed, true);
  assert.equal(retry.replayed, false);
  await ledger.updateDurableRun(db, first.runId, { status: 'PERSISTED', recordsPersisted: 3, diagnostics: [] });
  const done = await ledger.recordDurableRun(db, input(candidateId, 'h1'));
  assert.equal(done.replayed, true);
});

test('run keys immutable; status transitions accounted', async () => {
  const { sqlite, db } = openDb();
  const candidateId = await realCandidate(db);
  const { runId } = await ledger.recordDurableRun(db, input(candidateId, 'h2'));
  assert.throws(() => sqlite.prepare('UPDATE protocol_ingestion_runs SET content_hash=? WHERE run_id=?').run('zzz', runId));
  await ledger.updateDurableRun(db, runId, { status: 'PARTIAL', recordsMapped: 5, recordsPersisted: 3, quarantinedIds: ['q1'], diagnostics: [{ code: 'PARTIAL_SUCCESS', detail: 'x' }] });
  const row = sqlite.prepare('SELECT status, records_mapped, records_persisted, quarantined_ids_json FROM protocol_ingestion_runs WHERE run_id=?').get(runId);
  assert.equal(row.status, 'PARTIAL');
  assert.equal(row.records_mapped, 5);
  assert.deepEqual(JSON.parse(row.quarantined_ids_json), ['q1']);
});
