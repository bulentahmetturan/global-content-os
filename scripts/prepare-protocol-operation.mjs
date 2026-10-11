// Plan only: consumes operator evidence files, never opens a remote connection.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCorrectionManifest, correctionStatement, literalStatement, sha256, sourceMetadataSql, TARGET } from './protocols-five-item-writer.mjs';

export function prepareOperation(manifest, identity, rowEvidence, metadataEvidence) {
  validateCorrectionManifest(manifest);
  if (identity.uuid !== TARGET.databaseId || identity.name !== TARGET.databaseName || identity.read_replication?.mode !== 'disabled') throw new Error('TARGET_OR_PRIMARY_ROUTING_UNVERIFIED');
  const results = evidence => {
    if (!Array.isArray(evidence) || evidence.length !== 1 || evidence[0].success !== true || evidence[0].meta?.rows_written !== 0 || evidence[0].meta?.changed_db !== false) throw new Error('UNSAFE_READ_EVIDENCE');
    return evidence[0].results;
  };
  const rows = results(rowEvidence), metadata = results(metadataEvidence);
  if (Buffer.byteLength(JSON.stringify(rows)) > 262144) throw new Error('SNAPSHOT_RESOURCE_BUDGET');
  const apply = correctionStatement(manifest, 'APPLY', rows, metadata);
  const after = rows.map(row => ({ ...row, ...manifest.items.find(item => item.id === row.id).after }));
  const rollback = correctionStatement(manifest, 'ROLLBACK', after, metadata);
  return {
    authorization: 'NOT_GRANTED_FOR_PRODUCTION_OPERATION', evidenceAuthenticity: 'OPERATOR_ATTESTATION_REQUIRED',
    target: TARGET, manifestSHA256: sha256(manifest), snapshotSHA256: sha256(rows), metadataSHA256: sha256(metadata),
    applySql: literalStatement(apply) + ';', rollbackSql: literalStatement(rollback) + ';',
    readbackSql: `SELECT * FROM source_items WHERE id IN (${manifest.items.map(item => "'" + item.id + "'").join(',')}) ORDER BY id LIMIT 6;`,
    metadataSql: sourceMetadataSql + ';', expectedChangedRecords: 5, expectedReplayWrites: 0,
    requiredGates: ['Fresh operator identity and receipt timestamps', '100% protected Worker deployment and drained old writers', 'Exclusive operator write window', 'Owner approval of exact SQL hash and operation scope', 'Durable intent before execution'],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [identityPath, rowsPath, metadataPath, outputPath] = process.argv.slice(2);
  if (!outputPath) throw new Error('Usage: node scripts/prepare-protocol-operation.mjs identity.json rows.json metadata.json output-directory');
  const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const plan = prepareOperation(json('release/protocols/five-item-correction.json'), json(identityPath), json(rowsPath), json(metadataPath));
  mkdirSync(outputPath, { recursive: true });
  for (const [name, value] of [['apply.sql', plan.applySql], ['rollback.sql', plan.rollbackSql], ['readback.sql', plan.readbackSql]]) writeFileSync(join(outputPath, name), value);
  writeFileSync(join(outputPath, 'operation.json'), JSON.stringify({ ...plan, applySqlSHA256: sha256(plan.applySql), rollbackSqlSHA256: sha256(plan.rollbackSql) }, null, 2));
  console.log('PLAN_ONLY: production execution remains blocked pending external gates.');
}
