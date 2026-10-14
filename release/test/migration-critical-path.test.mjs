import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyseRepo, numbering } from '../lib/migrations.mjs';
import { readMigrations, replay } from '../../scripts/migration-authority.mjs';

test('applied filenames are exact, unique, replay and ledger-idempotency hold', () => {
  const files = readMigrations('migrations');
  const identities = files.filter(f => f.name.startsWith('0043_') || f.name.startsWith('0044_')).map(f => f.name);
  assert.deepEqual(identities, ['0043_dossier_discovery_foundation.sql', '0044_protocol_mediterranean_wave2.sql', '0044_shared_discovery_kernel.sql']);
  assert.deepEqual(numbering(files.map(f => ({ filename: f.name, number: Number(f.name.slice(0, 4)) }))).dups, []);
  const first = replay(files);
  try {
    for (const name of identities) assert.equal(first.db.prepare('SELECT COUNT(*) n FROM d1_migrations WHERE name=?').get(name).n, 1);
    assert.deepEqual(replay(files, { database: first.db }).executed, []);
  } finally { first.db.close(); }
});

test('0045 invalid byte encoding is identified before SQL parsing and never marked locally tested', () => {
  const root = mkdtempSync(join(tmpdir(), 'migration-encoding-'));
  const file = '0045_discovery_signal_linkage.sql';
  try {
    writeFileSync(join(root, file), Buffer.from([0xff, 0xfe, ...Buffer.from('CREATE TABLE proof(id TEXT);', 'utf16le')]));
    const result = analyseRepo({ root, migrationsDir: '.', pending: [file], applied: [] });
    assert.equal(result.freshChainFkOn.ok, false);
    assert.equal(result.freshChainFkOn.failedAt, file);
    assert.match(result.freshChainFkOn.error, /encoded data was not valid/i);
    assert.equal(result.pending[0].testedLocal, false);
    assert.match(result.pending[0].error, /encoded data was not valid/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('clean historical 0045 chain and required migration readiness reconcile locally only', () => {
  const files = readMigrations('migrations');
  const required = files.map(f => f.name);
  const result = analyseRepo({ root: process.cwd(), migrationsDir: 'migrations', pending: required, applied: null });
  assert.equal(result.freshChainFkOn.ok, true);
  assert.deepEqual(result.dups, []);
  assert.equal(result.pending.length, files.length);
  assert.ok(result.pending.every(f => f.exists && f.testedLocal && f.applied === 'unknown'));
});
