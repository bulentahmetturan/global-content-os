// Operator tooling only. No Worker route, remote adapter, deployment or auto-apply.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['apps/worker/src/protocols/approved-display.ts'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { APPROVED_PROTOCOL_DISPLAY, approvedProtocolGist } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
export const TARGET = Object.freeze({ databaseName: 'global-content-os', databaseId: 'c0ce92dc-9842-4dd9-9d05-a8d09e798b34' });
export const BEFORE_SHA256 = '7db95f937893e6ba556dbb65169aca2dc5a6e29e4edeacfc617436993ba59067';
export const FIELDS = ['title', 'summary', 'gists_json'];
export const COLUMNS = ['id','title','title_orig','summary','gists_json','canonical_url','publisher','published_at','feed_id','route','channel_id','dedupe_key','canonical_work_id','acquisition_path','discovery_mode','discovery_reason','enrichment_status','enrichment_json','enrichment_error','enriched_at','updated_at'];
const ids = APPROVED_PROTOCOL_DISPLAY.map(x => x.id);
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (obj, expected) => obj && typeof obj === 'object' && !Array.isArray(obj) && same(Object.keys(obj).sort(), [...expected].sort());
function requireThat(ok, code) { if (!ok) throw new Error(code); }
const approvedAfter = a => ({ title: a.title, summary: a.summary, gists_json: JSON.stringify([approvedProtocolGist(a)]) });

export function createCorrectionManifest(raw) {
  requireThat(sha256(raw) === BEFORE_SHA256, 'BEFORE_EVIDENCE_HASH_MISMATCH');
  const evidence = JSON.parse(raw.replace(/^\uFEFF/, ''));
  requireThat(evidence.length === 1 && evidence[0].success && evidence[0].meta.rows_written === 0 && evidence[0].meta.changed_db === false, 'UNSAFE_BEFORE_EVIDENCE');
  const rows = evidence[0].results;
  requireThat(rows.length === 5 && same(rows.map(x => x.id).sort(), [...ids].sort()), 'FIVE_ID_SCOPE_REQUIRED');
  return { target: TARGET, beforeEvidenceRaw: raw, items: APPROVED_PROTOCOL_DISPLAY.map(a => {
    const before = rows.find(x => x.id === a.id);
    requireThat(keys(before,COLUMNS) && before.canonical_url === a.url && before.route === 'kaduse-research' && before.discovery_reason === (a.id.startsWith('dash-') ? 'protocol-wave-1-dash-controlled-import' : 'protocol-wave-2-med-controlled-import'), 'BEFORE_IDENTITY_MISMATCH');
    requireThat(a.summary.length <= 320, 'SUMMARY_TOO_LONG');
    return { id: a.id, before, hashes: Object.fromEntries(COLUMNS.map(k => [k,sha256(before[k])])), after: approvedAfter(a) };
  }) };
}
export function validateCorrectionManifest(manifest) {
  requireThat(keys(manifest,['target','beforeEvidenceRaw','items']) && keys(manifest.target,Object.keys(TARGET)) && same(manifest.target,TARGET), 'TARGET_OR_MANIFEST_MISMATCH');
  requireThat(Array.isArray(manifest.items) && manifest.items.length === 5 && same(manifest.items.map(x=>x.id).sort(),[...ids].sort()), 'FIVE_ID_SCOPE_REQUIRED');
  const canonical = createCorrectionManifest(manifest.beforeEvidenceRaw);
  for (const item of manifest.items) {
    const expected = canonical.items.find(x => x.id === item.id);
    requireThat(keys(item,['id','before','hashes','after']) && keys(item.before,COLUMNS) && keys(item.hashes,COLUMNS) && keys(item.after,FIELDS), 'UNEXPECTED_FIELDS');
    requireThat(COLUMNS.every(k => item.before[k] === expected.before[k] && item.hashes[k] === sha256(item.before[k])), 'BEFORE_VALUE_OR_HASH_MISMATCH');
    requireThat(FIELDS.every(k => item.after[k] === expected.after[k]), 'APPROVED_VALUES_REQUIRED');
  }
  return manifest;
}

export const sourceMetadataSql = "SELECT type,name,sql FROM sqlite_master WHERE tbl_name='source_items' AND type IN ('table','trigger','index') ORDER BY type,name LIMIT 65";
const sqlValue = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
function validateSourceMetadata(metadata) {
  requireThat(Array.isArray(metadata) && metadata.length <= 64 && Buffer.byteLength(JSON.stringify(metadata)) <= 65536, 'SOURCE_METADATA_RESOURCE_BUDGET');
  const tables = metadata.filter(x=>x.type==='table');
  const triggers = metadata.filter(x=>x.type==='trigger');
  requireThat(tables.length===1 && tables[0].name==='source_items' && /^CREATE TABLE\b/i.test(tables[0].sql) && !/ON CONFLICT\s+(FAIL|IGNORE|REPLACE)\b|\bGENERATED\b|\bAS\s*\(/i.test(tables[0].sql), 'UNREVIEWED_SOURCE_TABLE_CONFLICT_POLICY');
  // Corrected fields must never become parent keys or cascading foreign keys.
  requireThat(/\bid\s+TEXT\s+PRIMARY KEY\b/i.test(tables[0].sql) && (tables[0].sql.match(/\bPRIMARY KEY\b/gi)??[]).length===1 && !/\bUNIQUE\b|\bFOREIGN KEY\b|\bON UPDATE\b/i.test(tables[0].sql) && (tables[0].sql.match(/\bREFERENCES\b/gi)??[]).length===1 && /\bfeed_id\s+TEXT\s+NOT NULL\s+REFERENCES\s+source_feeds\s*\(id\)/i.test(tables[0].sql), 'UNREVIEWED_SOURCE_KEY_CONTRACT');
  requireThat(triggers.length===1 && triggers[0].name==='trg_source_items_acquisition_path_immutable' && normalizeSql(triggers[0].sql)===triggerExpected, 'UNREVIEWED_SOURCE_ITEM_TRIGGERS');
  requireThat(metadata.every(x=>keys(x,['type','name','sql']) && ['table','trigger','index'].includes(x.type)), 'INVALID_SOURCE_METADATA');
  requireThat(!metadata.some(x=>x.type==='index' && /\b(title|summary|gists_json)\b/i.test(x.sql??'')), 'UNREVIEWED_CORRECTED_FIELD_INDEX');
  return metadata;
}
export function correctionStatement(manifest, operation = 'APPLY', liveSnapshot, sourceMetadata) {
  validateCorrectionManifest(manifest);
  requireThat(operation === 'APPLY' || operation === 'ROLLBACK', 'INVALID_OPERATION');
  if (liveSnapshot) requireThat(stateMatches(liveSnapshot,manifest,operation === 'APPLY' ? 'BEFORE' : 'AFTER'), 'STALE_LIVE_SNAPSHOT');
  const columns = liveSnapshot ? Object.keys(liveSnapshot[0]) : COLUMNS;
  requireThat(columns.every(k=>/^[a-z_][a-z0-9_]*$/.test(k)) && COLUMNS.every(k=>columns.includes(k)), 'INVALID_SNAPSHOT_COLUMNS');
  if (liveSnapshot) requireThat(liveSnapshot.every(r=>keys(r,columns)), 'INCONSISTENT_SNAPSHOT_COLUMNS');
  const items = manifest.items.map(x => ({ id:x.id, old:liveSnapshot ? liveSnapshot.find(r=>r.id===x.id) : operation === 'APPLY' ? x.before : {...x.before,...x.after}, next:operation === 'APPLY' ? x.after : Object.fromEntries(FIELDS.map(k=>[k,x.before[k]])) }));
  // A preview without reviewed live schema is deliberately non-executable.
  const schemaGate = sourceMetadata ? (()=>{
    validateSourceMetadata(sourceMetadata);
    const scope = "tbl_name='source_items'";
    const exact = sourceMetadata.map(x=>`(type IS ${sqlValue(x.type)} AND name IS ${sqlValue(x.name)} AND sql IS ${sqlValue(x.sql)})`).join(' OR ');
    return `(SELECT COUNT(*) FROM sqlite_master WHERE ${scope}) = ${sourceMetadata.length} AND (SELECT COUNT(*) FROM sqlite_master WHERE ${scope} AND (${exact})) = ${sourceMetadata.length}`;
  })() : '0 = 1';
  // Materialize the whole five-row eligibility decision BEFORE any row changes.
  // A single UPDATE has statement-level atomicity; no per-item update loop/batch.
  const sql = `WITH expected AS MATERIALIZED (SELECT value FROM json_each(?)), eligible AS MATERIALIZED (
    SELECT COUNT(*) AS n FROM source_items s JOIN expected e ON s.id = json_extract(e.value,'$.id')
    WHERE (${schemaGate}) AND ${columns.map(k=>`s.${k} IS json_extract(e.value,'$.old.${k}')`).join(' AND ')})
    UPDATE source_items SET ${FIELDS.map(k=>`${k} = (SELECT json_extract(e.value,'$.next.${k}') FROM expected e WHERE json_extract(e.value,'$.id') = source_items.id)`).join(', ')}
    WHERE id IN (SELECT json_extract(value,'$.id') FROM expected) AND (SELECT n FROM eligible) = 5 RETURNING *`;
  return {sql, binding:JSON.stringify(items)};
}
export function literalStatement(statement) {
  return statement.sql.replace('?', "'" + statement.binding.replaceAll("'", "''") + "'");
}
const triggerExpected = "CREATE TRIGGER trg_source_items_acquisition_path_immutable BEFORE UPDATE OF acquisition_path ON source_items WHEN OLD.acquisition_path IS NOT NULL AND NEW.acquisition_path IS NOT OLD.acquisition_path BEGIN SELECT RAISE(ABORT, 'ACQUISITION_PATH_IMMUTABLE'); END";
const normalizeSql = s => s.replace(/IF NOT EXISTS\s+/i,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const readSql = `SELECT * FROM source_items WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id LIMIT 6`;
function fullReadbackMatches(rows, snapshot, manifest, operation) {
  return rows.length === 5 && manifest.items.every(x=>{
    const before=snapshot.find(r=>r.id===x.id);const row=rows.find(r=>r.id===x.id);
    const expected={...before,...(operation === 'APPLY' ? x.after : Object.fromEntries(FIELDS.map(k=>[k,x.before[k]])))};
    return row && keys(row,Object.keys(expected)) && Object.keys(expected).every(k=>row[k]===expected[k]);
  });
}
function stateMatches(rows, manifest, phase) {
  return rows.length === 5 && manifest.items.every(x => {
    const row = rows.find(r=>r.id===x.id);
    const expected = phase === 'BEFORE' ? x.before : {...x.before,...x.after};
    return row && COLUMNS.every(k=>row[k] === expected[k]);
  });
}

export async function executeCorrection(db, manifest, {operation='APPLY', audit} = {}) {
  validateCorrectionManifest(manifest);
  requireThat(operation === 'APPLY' || operation === 'ROLLBACK', 'INVALID_OPERATION');
  requireThat(typeof audit === 'function', 'DURABLE_AUDIT_REQUIRED');
  // Primary-session routing is required for a future remote adapter; none ships here.
  const session = db.withSession ? db.withSession('first-primary') : db;
  const receipt = {operation,manifestSHA256:sha256(manifest),startedUtc:new Date().toISOString(),status:'INTENT',recordsChanged:0};
  await audit({...receipt}); // Fail before writes when the intent cannot be persisted.
  try {
    const sourceMetadata = validateSourceMetadata((await session.prepare(sourceMetadataSql).all()).results);
    receipt.sourceMetadataSHA256=sha256(sourceMetadata);
    const beforePhase = operation === 'APPLY' ? 'BEFORE' : 'AFTER';
    const afterPhase = operation === 'APPLY' ? 'AFTER' : 'BEFORE';
    const rows = (await session.prepare(readSql).bind(...ids).all()).results;
    requireThat(Buffer.byteLength(JSON.stringify(rows),'utf8') <= 262144, 'SNAPSHOT_RESOURCE_BUDGET');
    if (stateMatches(rows,manifest,afterPhase)) {
      receipt.status='IDEMPOTENT_REPLAY'; receipt.readbackSHA256=sha256(rows);
    } else {
      requireThat(stateMatches(rows,manifest,beforePhase), 'STALE_BEFORE_IMAGE_OR_PARTIAL_STATE');
      const statement=correctionStatement(manifest,operation,rows,sourceMetadata);
      receipt.snapshotSHA256=sha256(rows);receipt.statementSHA256=sha256(statement);
      await audit({...receipt,status:'PREFLIGHT_READY',beforeRows:rows,sourceMetadata});
      const result=await session.prepare(statement.sql).bind(statement.binding).all();
      if (result.results.length === 0) {
        const replay=(await session.prepare(readSql).bind(...ids).all()).results;
        requireThat(stateMatches(replay,manifest,afterPhase),'CAS_CONFLICT');
        receipt.status='IDEMPOTENT_REPLAY'; receipt.readbackSHA256=sha256(replay);
      } else {
        receipt.recordsChanged=result.results.length; receipt.meta=result.meta;
        requireThat(fullReadbackMatches(result.results,rows,manifest,operation),'COMMITTED_READBACK_MISMATCH');
        const readback=(await session.prepare(readSql).bind(...ids).all()).results;
        requireThat(fullReadbackMatches(readback,rows,manifest,operation),'POST_WRITE_CONFLICT');
        receipt.status='COMPLETED'; receipt.readbackSHA256=sha256(readback);
      }
    }
    receipt.finishedUtc=new Date().toISOString(); await audit({...receipt}); return receipt;
  } catch (error) {
    receipt.status=receipt.recordsChanged ? 'COMMITTED_REQUIRES_RECONCILIATION' : 'FAILED_OR_OUTCOME_UNKNOWN';
    receipt.error=error.message; receipt.finishedUtc=new Date().toISOString();
    try { await audit({...receipt}); } catch { /* Intent persists; recover by exact state readback, never blind replay. */ }
    error.receipt=receipt; throw error;
  }
}

export function loadProductionBeforeEvidence(path='.logs/protocols-finalization-before-image.json') {
  return createCorrectionManifest(readFileSync(path,'utf8'));
}
