import { mkdirSync, writeFileSync } from 'node:fs';
import { loadProductionBeforeEvidence, correctionStatement, literalStatement, sha256, FIELDS, BEFORE_SHA256, sourceMetadataSql } from './protocols-five-item-writer.mjs';
const manifest = loadProductionBeforeEvidence();
const path='release/protocols/five-item-correction.json';
mkdirSync('release/protocols',{recursive:true});
writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
writeFileSync('release/protocols/five-item-authorization.json',JSON.stringify({
  generatedBy:'scripts/build-protocol-correction-manifest.mjs',baseCommit:'b7ebc86ab73cb5b13c3741312b82a3475636ed4d',productionOperation:'NOT_AUTHORIZED_NOT_EXECUTED',target:manifest.target,manifestPath:path,manifestSHA256:sha256(manifest),beforeEvidenceSHA256:BEFORE_SHA256,
  allowedIds:manifest.items.map(x=>x.id),allowedFields:FIELDS,approvedNewValues:manifest.items.map(x=>({id:x.id,...x.after})),beforeFieldHashes:manifest.items.map(x=>({id:x.id,hashes:x.hashes})),summaryLengths:manifest.items.map(x=>({id:x.id,length:x.after.summary.length})),
  transaction:'Single UPDATE with MATERIALIZED five-row eligibility CTE and RETURNING *. No per-record loop; all 21 historical fields plus every current preflight column compared with null-safe IS. Unknown source_items triggers deny. SQL below is historical-field preview, not blind execution authority; use the validated core with full fresh snapshot.',
  expectedSourceRowsChanged:{apply:5,rollback:5,idempotentReplay:0},readback:'All five RETURNING rows + separate primary-session SELECT *; captured identity/provenance/enrichment fields unchanged; exact approved values required.',
  audit:'Persist INTENT with manifest SHA before any write; persist COMPLETED/IDEMPOTENT_REPLAY or failure receipt. Audit failure after commit is reconciliation-required, never claim rollback.',
  abort:'Wrong IDs/fields/values/hash/target, stale snapshot, mixed partial state, unexpected trigger deny. Concurrent pre-write modification yields CAS_CONFLICT and zero rows. Post-write conflict reports committed/reconciliation-required.',
  rollback:'Same single guarded statement with old/next reversed; exact approved after-values plus preserved before-image fields required. All five or zero; repeated rollback zero. Never roll back concurrent owner edits.',
  historicalFieldCASPreview:literalStatement(correctionStatement(manifest)),historicalFieldRollbackPreview:literalStatement(correctionStatement(manifest,'ROLLBACK')),
  operatorBoundary:'Core writer has no remote adapter or production route. Separate explicit owner operation authorization + approved operator identity/transport + durable audit + bounded readbacks required; do not execute SQL blindly.',
  additionalReadScope:[sourceMetadataSql,`SELECT * FROM source_items WHERE id IN (${manifest.items.map(x=>"'"+x.id+"'").join(',')}) ORDER BY id LIMIT 6`],
},null,2)+'\n');
console.log(JSON.stringify({path,manifestSHA256:sha256(manifest),summaryLengths:manifest.items.map(x=>[x.id,x.after.summary.length]),productionWrites:0}));
