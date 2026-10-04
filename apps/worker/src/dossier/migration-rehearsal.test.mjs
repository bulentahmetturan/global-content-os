// Phase C (overnight hardening): the LOCAL rehearsal of migration 0031 against a seeded pre-0031 production-shaped database, the committed machine-readable
// artifact (docs/generated/dossier-0031-preflight.json) and the freeze of the migration file. Nothing here can reach a remote database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const { rehearse } = await import('../../../../scripts/dossier-0031-rehearsal.mjs');
const FROZEN_SHA = '5f228b0a2c3541f46ba2259f1e2cce2cef5f4db6fdf24d111f58e49fbcbdc343';
const MIGRATION = '0031_dossier_discovery_foundation.sql';

test('migration 0031 is FROZEN: LF-normalized checksum equals the owner-reviewed value; it is still the newest migration; 0028 is untouched; no 0032 exists', () => {
  const sha = createHash('sha256').update(readFileSync(`migrations/${MIGRATION}`, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  assert.equal(sha, FROZEN_SHA);
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  assert.equal(files[files.length - 1], MIGRATION);
  assert.ok(!files.some((f) => f.startsWith('0032')));
  // 0028 (the already-applied temporal-paths migration) is byte-identical to the one on main
  const norm = (f) => createHash('sha256').update(readFileSync(f, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))).digest('hex');
  assert.equal(norm('migrations/0028_temporal_paths.sql'), '79ffd6a637f31fd16174847ecb08f39665b056fc549199b97ef3236b9b089c01');
});

test('local rehearsal: seeded pre-0031 rows, values, objects and CHECK semantics are preserved; only the audited dossier objects are added; idempotent; fresh == upgraded; Worker boots before and after', async () => {
  const r = await rehearse();
  assert.deepEqual(r.checks.filter((c) => !c.ok), []);
  assert.equal(r.REMOTE_0031_REHEARSAL, 'PASS');
  assert.equal(r.REMOTE_MUTATION, 'NOT_APPLIED');
  assert.equal(r.existing_rows_modified, 0);
  assert.equal(r.existing_objects_modified, 0);
  assert.equal(r.sha256_lf_normalized, FROZEN_SHA);
  assert.ok(r.seeded_rows_total > 883, 'the baseline includes the seeded GCOS rows on top of the registry');
  for (const t of ['source_items', 'item_path_membership', 'evergreen_runtime_state', 'approved_briefs', 'editorial_decisions']) assert.ok(r.baseline_row_counts_nonzero[t] >= 1, t);
  assert.equal(r.worker_boot.pre_0031.run_refused_reasons, 'DOSSIER_SCHEMA_NOT_APPLIED', 'a Worker deployed before the migration refuses cleanly');
  assert.equal(r.worker_boot.upgraded.readiness_dossier_level, 'DISABLED');
});

test('the committed artifact docs/generated/dossier-0031-preflight.json matches the frozen migration, has every required field and contains no secret', () => {
  const a = JSON.parse(readFileSync('docs/generated/dossier-0031-preflight.json', 'utf8'));
  for (const k of ['migration_filename', 'sha256_lf_normalized', 'objects_created', 'indexes_created', 'triggers_created', 'existing_objects_modified', 'existing_rows_modified', 'fresh_test', 'upgrade_test', 'worker_boot_test', 'timestamp']) assert.ok(k in a, k);
  assert.equal(a.migration_filename, MIGRATION);
  assert.equal(a.sha256_lf_normalized, FROZEN_SHA, 'the artifact describes exactly the file that would be applied');
  assert.deepEqual([a.tables_created, a.indexes_created, a.triggers_created, a.objects_created], [21, 17, 40, 78]);
  assert.deepEqual([a.existing_objects_modified, a.existing_rows_modified, a.fresh_test, a.upgrade_test, a.worker_boot_test, a.REMOTE_0031_REHEARSAL, a.REMOTE_MUTATION], [0, 0, 'PASS', 'PASS', 'PASS', 'PASS', 'NOT_APPLIED']);
  assert.ok(!/token|secret|bearer|authorization/i.test(JSON.stringify(a).replace(/OPS_TOKEN_NOT_CONFIGURED|STATUS_CALLBACK_TOKEN_NOT_CONFIGURED|INGEST_TOKEN_NOT_CONFIGURED/g, '')), 'no credential material in the artifact');
});
