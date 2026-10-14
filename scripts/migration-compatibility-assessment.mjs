#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EVIDENCE = '.logs/operator-evidence-recovery-20261011/ER02/reconciliation.json';
const RC_SHA = '19cbd3447bf08cdd04e651d5ba7a5a49ce7a8f81';

export const OPTION_B_MIGRATIONS = Object.freeze([
  {
    filename: '0043_protocol_mediterranean_wave2.sql',
    sha256: '85ee1c23ff3f1f73f315aa6f6aa68951bb6aec0aa6e71e09bb4c9553745bbc9e',
    counterpart: '0044_protocol_mediterranean_wave2.sql',
    owner: 'Protocols',
    effect: 'DATA_SEED',
    dataRequirement: 'Exact version/component/source/claim/evidence payload and relationships must be verified independently; old bounded reads are not proof of complete migration payload or applied bytes.',
  },
  {
    filename: '0044_doctor_discovery_candidates.sql',
    sha256: '9205df1cc7a763cba684c7ef9c9963c9fa418191a03882bb053704f36bc001a2',
    counterpart: '0048_doctor_discovery_candidates.sql',
    owner: 'Doctors',
    effect: 'DDL_CREATE',
    dataRequirement: 'No row transformation is declared by this schema-only migration; existing table/index contract is schema evidence, not execution provenance.',
  },
  {
    filename: '0045_discovery_signal_linkage.sql',
    sha256: '65d3b0180c873a009c04adb46d79c0a4ee8f1d6bcb640804412a0a0bf814b1c9',
    counterpart: '0046_discovery_signal_linkage.sql',
    owner: 'Discovery',
    effect: 'DDL_ADD_COLUMNS_AND_INDEX',
    dataRequirement: 'No backfill is declared; existing linked-column values and index contract remain unverified as migration effects.',
  },
  {
    filename: '0045_doctor_source_proposals.sql',
    sha256: 'f4e61ef061c31e0a3ad42d9ff06298eb8e1ee6426d5f5963fd22bdb1dc318667',
    counterpart: '0049_doctor_source_proposals.sql',
    owner: 'Doctors',
    effect: 'DDL_CREATE',
    dataRequirement: 'No row transformation is declared by this schema-only migration; existing table/index contract is schema evidence, not execution provenance.',
  },
  {
    filename: '0046_doctor_knowledge.sql',
    sha256: '3ea0279b4d2155d14135ecb46f6de7047eb666452229802eb199c72092e2a7ce',
    counterpart: '0047_doctor_knowledge.sql',
    owner: 'Doctors',
    effect: 'DDL_CREATE',
    dataRequirement: 'No row transformation is declared by this schema-only migration; existing tables, foreign keys and indexes are schema evidence, not execution provenance.',
  },
  {
    filename: '0046_doctor_profile_facts.sql',
    sha256: 'c7877402a92e6a108347011157a5906feeffa67bab7e6af0e539489ea10abe59',
    counterpart: '0050_doctor_profile_facts.sql',
    owner: 'Doctors',
    effect: 'DDL_CREATE',
    dataRequirement: 'No row transformation is declared by this schema-only migration; existing table/unique-index contract is schema evidence, not execution provenance.',
  },
]);

const fail = (code, detail) => ({ ok: false, code, detail });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assessOptionB(reconciliation, migrationBytesByName) {
  if (!reconciliation || typeof reconciliation !== 'object') return fail('EVIDENCE_INVALID', 'Reconciliation evidence must be an object.');
  if (reconciliation.RC_SHA !== RC_SHA) return fail('RC_IDENTITY_MISMATCH', 'Evidence is not anchored to the ER02 RC.');
  if (!Array.isArray(reconciliation.RC_ONLY_FILENAMES) || !Array.isArray(reconciliation.REMOTE_ONLY_FILENAMES)) return fail('FILENAME_SETS_INVALID', 'Exact filename sets are required.');
  if (reconciliation.RC_ONLY_FILENAMES.length !== OPTION_B_MIGRATIONS.length || reconciliation.COMMON_FILENAMES?.length !== 45 || reconciliation.REMOTE_ONLY_FILENAMES.length !== 8) return fail('FILENAME_SET_COUNTS_MISMATCH', 'The captured exact filename-set counts changed.');
  if (reconciliation.SCHEMA_DRIFT?.verdict !== 'NO_APPLICATION_DDL_DRIFT_DETECTED' || reconciliation.SCHEMA_DRIFT?.exactObjectCount !== 259 || reconciliation.SEMANTIC_MATCHES?.length !== 12) return fail('SCHEMA_EVIDENCE_MISMATCH', 'Captured schema evidence no longer matches the assessed baseline.');
  if (reconciliation.REQUIRED_SCHEMA_DELTA?.ddl !== 'NONE_IDENTIFIED_FROM_CAPTURED_SCHEMA') return fail('DDL_DELTA_NOT_CLOSED', 'A required DDL delta is present or unknown.');
  if (reconciliation.REQUIRED_SCHEMA_DELTA?.data !== 'UNKNOWN_NO_REMOTE_SOURCE_DATA_ROWS') return fail('DATA_EVIDENCE_CHANGED', 'Data evidence must be assessed separately.');
  if (reconciliation.ACTUAL_PENDING_SET !== 'UNKNOWN' || reconciliation.READY_FOR_OWNER_DEPLOY !== false) return fail('READINESS_EVIDENCE_MISMATCH', 'Unknown pending set and failed readiness must remain explicit.');
  if (!Array.isArray(reconciliation.PROVEN_BYTE_MATCHES?.production) || reconciliation.PROVEN_BYTE_MATCHES.production.length !== 0) return fail('PROVENANCE_EVIDENCE_CHANGED', 'This assessment is anchored to zero proven applied byte matches.');

  const absentLocal = new Set(reconciliation.RC_ONLY_FILENAMES.filter((row) => row.ledger === null).map((row) => row.filename));
  const remoteNames = new Set(reconciliation.REMOTE_ONLY_FILENAMES.map((row) => row.filename));
  const rows = [];
  for (const item of OPTION_B_MIGRATIONS) {
    if (!absentLocal.has(item.filename)) return fail('RC_ONLY_IDENTITY_MISMATCH', item.filename);
    if (!remoteNames.has(item.counterpart)) return fail('REMOTE_COUNTERPART_MISSING', item.counterpart);
    const evidenceRow = reconciliation.RC_ONLY_FILENAMES.find((row) => row.filename === item.filename);
    if (evidenceRow.rcSha256 !== item.sha256) return fail('EVIDENCE_HASH_MISMATCH', item.filename);
    const bytes = migrationBytesByName?.get(item.filename);
    if (!bytes || hash(bytes) !== item.sha256) return fail('LOCAL_FILE_HASH_MISMATCH', item.filename);
    rows.push({
      filename: item.filename,
      sha256: item.sha256,
      historicalOriginCommits: [...new Set((evidenceRow.historicalVersions || []).map((version) => version.commit))],
      ledgerStatus: 'ABSENT_IN_CAPTURED_LEDGER',
      candidateRemoteCounterpart: item.counterpart,
      counterpartStatus: 'NAME_AND_SCHEMA_EFFECT_CANDIDATE_ONLY_NOT_ALIAS_AUTHORITY',
      owner: item.owner,
      effect: item.effect,
      dataRequirement: item.dataRequirement,
      appliedBytes: 'UNPROVEN',
      executionRequired: 'UNKNOWN',
    });
  }

  return {
    ok: true,
    policy: 'OPTION_B_SCHEMA_EFFECT_COMPATIBILITY_ASSESSMENT_ONLY',
    rcSha: RC_SHA,
    schemaCompatibility: 'NO_REQUIRED_APPLICATION_DDL_DELTA_IDENTIFIED_IN_CAPTURED_SCHEMA',
    dataCompatibility: 'UNKNOWN',
    migrationExecutionIdentity: 'UNPROVEN',
    actualPendingSet: 'UNKNOWN',
    migrationReadiness: 'FAIL_CLOSED',
    records: rows,
    executionAuthorized: false,
    aliasAuthorityGranted: false,
    runtimeReadinessChanged: false,
    sqlExecuted: false,
    databaseContacted: false,
    ledgerChanged: false,
    productionAuthorized: false,
  };
}

function main(argv) {
  const evidencePath = resolve(ROOT, argv[0] || DEFAULT_EVIDENCE);
  let reconciliation;
  try {
    reconciliation = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const files = new Map(OPTION_B_MIGRATIONS.map(({ filename }) => [filename, readFileSync(join(ROOT, 'release-artifacts', 'gate-b-retired-rc-only', filename))]));
    const result = assessOptionB(reconciliation, files);
    console.log(JSON.stringify({ ...result, evidencePath: evidencePath.replace(`${ROOT}\\`, '') }, null, 2));
    return result.ok ? 0 : 2;
  } catch (error) {
    console.log(JSON.stringify(fail('ASSESSMENT_INPUT_UNAVAILABLE', error.message), null, 2));
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
