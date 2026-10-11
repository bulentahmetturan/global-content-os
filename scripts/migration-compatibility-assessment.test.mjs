import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessOptionB, OPTION_B_MIGRATIONS } from './migration-compatibility-assessment.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const files = new Map(OPTION_B_MIGRATIONS.map(({ filename }) => [filename, readFileSync(join(root, 'migrations', filename))]));
const evidence = {
  RC_SHA: '19cbd3447bf08cdd04e651d5ba7a5a49ce7a8f81',
  RC_ONLY_FILENAMES: OPTION_B_MIGRATIONS.map((item) => ({
    filename: item.filename,
    rcSha256: item.sha256,
    ledger: null,
    historicalVersions: [{ commit: 'a'.repeat(40) }],
  })),
  REMOTE_ONLY_FILENAMES: [
    ...OPTION_B_MIGRATIONS.map((item) => ({ filename: item.counterpart })),
    { filename: '0031_dossier_discovery_foundation.sql' },
    { filename: 'remote-extra.sql' },
  ],
  COMMON_FILENAMES: Array.from({ length: 45 }, (_, i) => ({ filename: `common-${i}` })),
  SCHEMA_DRIFT: { verdict: 'NO_APPLICATION_DDL_DRIFT_DETECTED', exactObjectCount: 259 },
  SEMANTIC_MATCHES: Array.from({ length: 12 }, () => ({})),
  REQUIRED_SCHEMA_DELTA: { ddl: 'NONE_IDENTIFIED_FROM_CAPTURED_SCHEMA', data: 'UNKNOWN_NO_REMOTE_SOURCE_DATA_ROWS' },
  ACTUAL_PENDING_SET: 'UNKNOWN',
  READY_FOR_OWNER_DEPLOY: false,
  PROVEN_BYTE_MATCHES: { production: [] },
};

test('produces assessment-only result and retains fail-closed readiness', () => {
  const result = assessOptionB(evidence, files);
  assert.equal(result.ok, true);
  assert.equal(result.migrationReadiness, 'FAIL_CLOSED');
  assert.equal(result.actualPendingSet, 'UNKNOWN');
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.aliasAuthorityGranted, false);
  assert.equal(result.runtimeReadinessChanged, false);
  assert.equal(result.sqlExecuted, false);
  assert.equal(result.databaseContacted, false);
  assert.equal(result.ledgerChanged, false);
  assert.equal(result.records.length, 6);
});

test('rejects a changed RC identity', () => {
  assert.equal(assessOptionB({ ...evidence, RC_SHA: '0'.repeat(40) }, files).code, 'RC_IDENTITY_MISMATCH');
});

test('rejects omitted filename evidence', () => {
  const altered = { ...evidence, RC_ONLY_FILENAMES: evidence.RC_ONLY_FILENAMES.slice(1) };
  assert.equal(assessOptionB(altered, files).code, 'FILENAME_SET_COUNTS_MISMATCH');
});

test('rejects a migration file whose bytes drift', () => {
  const alteredFiles = new Map(files);
  alteredFiles.set(OPTION_B_MIGRATIONS[0].filename, Buffer.from('SELECT 1;'));
  assert.equal(assessOptionB(evidence, alteredFiles).code, 'LOCAL_FILE_HASH_MISMATCH');
});

test('rejects a schema-only finding presented as readiness', () => {
  const altered = { ...evidence, READY_FOR_OWNER_DEPLOY: true };
  assert.equal(assessOptionB(altered, files).code, 'READINESS_EVIDENCE_MISMATCH');
});

test('rejects a hidden or aliased exact filename discrepancy', () => {
  const altered = {
    ...evidence,
    RC_ONLY_FILENAMES: evidence.RC_ONLY_FILENAMES.map((row) => row.filename === OPTION_B_MIGRATIONS[0].filename ? { ...row, ledger: { id: 44 } } : row),
  };
  assert.equal(assessOptionB(altered, files).code, 'RC_ONLY_IDENTITY_MISMATCH');
});

test('assessment code has no migration execution or network client imports', () => {
  const source = readFileSync(new URL('./migration-compatibility-assessment.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wrangler|fetch\s*\(|\.prepare\s*\(|\.batch\s*\(|child_process|migration-authority|execFileSync/);
});
