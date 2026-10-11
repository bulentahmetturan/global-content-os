import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { d1FromSqlite, bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
import { executeCorrection, validateCorrectionManifest, correctionStatement, literalStatement, COLUMNS, sourceMetadataSql } from './protocols-five-item-writer.mjs';
const manifest=JSON.parse(readFileSync('release/protocols/five-item-correction.json','utf8'));
const approved=await bundle('apps/worker/src/protocols/approved-display.ts','writer-approved');
const contract=await bundle('apps/worker/src/localize/contract.ts','writer-contract');
const ingress=await bundle('apps/worker/src/ingress/europe-pmc.ts','writer-epmc');
const queries=await bundle('apps/worker/src/db/queries.ts','writer-hub-view');
export function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync('migrations/'+f,'utf8'));
  for(const x of manifest.items)sqlite.prepare(`UPDATE source_items SET ${COLUMNS.filter(k=>k!=='id').map(k=>k+'=?').join(',')} WHERE id=?`).run(...COLUMNS.filter(k=>k!=='id').map(k=>x.before[k]),x.id);
  return {sqlite,db:d1FromSqlite(sqlite)};
}
function snapshot(db) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>[x.name,JSON.stringify(db.prepare('SELECT * FROM "'+x.name+'"').all())]));
}
const audit=async()=>{};
test('five-record atomic apply, replay, CAS rollback and recovery preserve every unrelated row/table',async()=>{
 const {sqlite,db}=fixture();try{
  const before=snapshot(sqlite);const receipts=[];
  assert.equal((await executeCorrection(db,manifest,{audit:async r=>receipts.push(r)})).recordsChanged,5);
  for(const x of manifest.items){
    assert.equal(await approved.protectedProtocolDisplay(db,{id:x.id}),x.id);
    const view=queries.rowToView(sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(x.id));
    assert.equal(view.title,x.after.title);assert.equal(view.titleOrig,x.before.title_orig);assert.equal(view.summary,x.after.summary);
    assert.deepEqual(view.gists,JSON.parse(x.after.gists_json));assert.equal(view.canonicalUrl,x.before.canonical_url);
  }
  const after=snapshot(sqlite);
  assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([k])=>k!=='source_items')),Object.fromEntries(Object.entries(before).filter(([k])=>k!=='source_items')));
  const beforeOthers=JSON.parse(before.source_items).filter(x=>!manifest.items.some(m=>m.id===x.id));
  assert.deepEqual(JSON.parse(after.source_items).filter(x=>!manifest.items.some(m=>m.id===x.id)),beforeOthers);
  assert.equal((await executeCorrection(db,manifest,{audit})).status,'IDEMPOTENT_REPLAY');assert.deepEqual(snapshot(sqlite),after);
  assert.equal((await executeCorrection(db,manifest,{operation:'ROLLBACK',audit})).recordsChanged,5);assert.deepEqual(snapshot(sqlite),before);
  assert.equal((await executeCorrection(db,manifest,{operation:'ROLLBACK',audit})).recordsChanged,0);
  assert.equal(receipts[0].status,'INTENT');assert.equal(receipts.at(-1).status,'COMPLETED');
 }finally{sqlite.close();}
});
test('stale one-item snapshot and mixed partial state block all five',async()=>{
 for(const partial of [false,true]){const {sqlite,db}=fixture();try{
  if(partial){const x=manifest.items[0];sqlite.prepare('UPDATE source_items SET title=?,summary=?,gists_json=? WHERE id=?').run(x.after.title,x.after.summary,x.after.gists_json,x.id);}
  else sqlite.prepare('UPDATE source_items SET updated_at=? WHERE id=?').run('concurrent-owner-edit',manifest.items[0].id);
  const before=snapshot(sqlite);await assert.rejects(executeCorrection(db,manifest,{audit}),/STALE_BEFORE_IMAGE/);assert.deepEqual(snapshot(sqlite),before);
 }finally{sqlite.close();}}
});
test('interleaved modification after preflight causes SQL CAS zero-row rejection',async()=>{
 const {sqlite,db}=fixture();try{
  const wrapped={prepare(sql){const p=db.prepare(sql);if(!sql.startsWith('WITH expected'))return p;return {bind(...args){p.bind(...args);return {async all(){sqlite.prepare('UPDATE source_items SET updated_at=? WHERE id=?').run('raced',manifest.items[3].id);return p.all();}};}};}};
  await assert.rejects(executeCorrection(wrapped,manifest,{audit}),/CAS_CONFLICT/);
  for(const x of manifest.items)assert.equal(sqlite.prepare('SELECT title FROM source_items WHERE id=?').get(x.id).title,x.before.title);
 }finally{sqlite.close();}
});
test('IDs, duplicates, fields, values, hashes, target and raw evidence cannot widen the authorization',()=>{
 const mutations=[m=>m.items[0].id='unrelated',m=>m.items[0]=m.items[1],m=>m.items[0].after.publisher='bad',m=>m.items[0].after.title='not approved',m=>m.items[0].hashes.title='0',m=>m.target.databaseId='wrong',m=>m.beforeEvidenceRaw+=' ',m=>m.items.pop(),m=>m.items[0].before.extra='bad'];
 for(const mutate of mutations){const m=structuredClone(manifest);mutate(m);assert.throws(()=>validateCorrectionManifest(m));}
});
test('schema changed after preflight fails closed even with a partial-write FAIL trigger',async()=>{
 const {sqlite,db}=fixture();try{
  const before=snapshot(sqlite);
  const wrapped={prepare(sql){const p=db.prepare(sql);if(!sql.startsWith('WITH expected'))return p;return {bind(...args){p.bind(...args);return {async all(){sqlite.exec("CREATE TRIGGER schema_race BEFORE UPDATE OF title ON source_items WHEN NEW.id='med-item-dga-2015' BEGIN SELECT RAISE(FAIL,'unsafe'); END");return p.all();}};}};}};
  await assert.rejects(executeCorrection(wrapped,manifest,{audit}),/CAS_CONFLICT/);
  assert.deepEqual(snapshot(sqlite),before);
  sqlite.exec('DROP TRIGGER schema_race');
  assert.match(correctionStatement(manifest).sql,/0 = 1/);
 }finally{sqlite.close();}
});
test('unsafe table conflict policies and corrected-field keys cannot weaken statement atomicity',()=>{
 const {sqlite}=fixture();try{
  const metadata=sqlite.prepare(sourceMetadataSql).all();
  for(const suffix of [' ON CONFLICT FAIL',' ON CONFLICT IGNORE',' ON CONFLICT REPLACE',' UNIQUE',' GENERATED ALWAYS AS (title)',' REFERENCES source_items(title)']){
   const bad=structuredClone(metadata);bad.find(x=>x.type==='table').sql=bad.find(x=>x.type==='table').sql.replace('title TEXT NOT NULL','title TEXT NOT NULL'+suffix);
   assert.throws(()=>correctionStatement(manifest,'APPLY',undefined,bad),/UNREVIEWED/);
  }
  assert.throws(()=>correctionStatement(manifest,'APPLY',undefined,[...metadata,{type:'index',name:'unsafe',sql:'CREATE UNIQUE INDEX unsafe ON source_items(title)'}]),/UNREVIEWED_CORRECTED_FIELD_INDEX/);
 }finally{sqlite.close();}
});
test('unreviewed triggers and failed durable intent stop before writes; terminal audit loss is recoverable',async()=>{
 const {sqlite,db}=fixture();try{
  const before=snapshot(sqlite);await assert.rejects(executeCorrection(db,manifest,{audit:async()=>{throw Error('AUDIT_DOWN');}}),/AUDIT_DOWN/);assert.deepEqual(snapshot(sqlite),before);
  sqlite.exec("CREATE TRIGGER unreviewed AFTER UPDATE ON source_items BEGIN SELECT RAISE(FAIL,'unsafe'); END");
  await assert.rejects(executeCorrection(db,manifest,{audit}),/UNREVIEWED/);sqlite.exec('DROP TRIGGER unreviewed');assert.deepEqual(snapshot(sqlite),before);
  await assert.rejects(executeCorrection(db,manifest,{audit:async r=>{if(r.status==='COMPLETED')throw Error('FINAL_AUDIT_DOWN');}}),/FINAL_AUDIT_DOWN/);
  assert.equal((await executeCorrection(db,manifest,{audit})).status,'IDEMPOTENT_REPLAY');
 }finally{sqlite.close();}
});
test('post-write conflict is reported committed, never falsely reported as no write; rollback denies owner edits',async()=>{
 const {sqlite,db}=fixture();try{
  const wrapped={prepare(sql){const p=db.prepare(sql);if(!sql.startsWith('WITH expected'))return p;return {bind(...args){p.bind(...args);return {async all(){const r=await p.all();sqlite.prepare('UPDATE source_items SET summary=? WHERE id=?').run('new-owner-summary',manifest.items[0].id);return r;}};}};}};
  await assert.rejects(executeCorrection(wrapped,manifest,{audit}),e=>e.message==='POST_WRITE_CONFLICT'&&e.receipt.recordsChanged===5&&e.receipt.status==='COMMITTED_REQUIRES_RECONCILIATION');
  await assert.rejects(executeCorrection(db,manifest,{operation:'ROLLBACK',audit}),/STALE/);
 }finally{sqlite.close();}
});
test('318-character summary passes; 321-character summary is still rejected',()=>{
 const x=manifest.items.find(x=>x.id==='med-item-predimed-2018');assert.equal(x.after.summary.length,318);
 assert.equal(contract.validateSummaryTr(x.after.summary,{titleOrig:'',titleTr:x.after.title}),null);
 assert.equal(contract.validateSummaryTr(x.after.summary+'aaa',{titleOrig:'',titleTr:x.after.title}),'SUMMARY_TOO_LONG');
});
test('three exact DOI/PMID identities preserve five-item ownership; mismatches fail closed without global merge',async()=>{
 const {sqlite,db}=fixture();try{
  await executeCorrection(db,manifest,{audit});
  for(const [doi,pmid,id] of [['10.1056/NEJM200101043440101','11136953','dash-item-sodium-2001'],['https://doi.org/10.1056/NEJM200101043440101','11136953','dash-item-sodium-2001'],['10.1056/NEJM200101043440101',null,'dash-item-sodium-2001'],['10.1056/NEJMoa1800389','29897866','med-item-predimed-2018']])assert.equal(await approved.protectedBibliographicProtocol(db,{doi,pmid}),id);
  await assert.rejects(approved.protectedBibliographicProtocol(db,{doi:'10.1056/NEJMoa1800389',pmid:'11136953'}),/IDENTITY_CONFLICT/);
  assert.equal(await approved.protectedBibliographicProtocol({prepare(){throw Error('NO_DB');}},{doi:'10.unknown/work',pmid:'999999'}),null);
  sqlite.prepare('UPDATE source_feeds SET enabled=0 WHERE id IN (?,?)').run('europe-pmc-batch','research-europe-pmc-rest');
  sqlite.prepare('UPDATE source_feeds SET enabled=1 WHERE id=?').run('research-europe-pmc-rest');
  const bibliography=JSON.parse(readFileSync('release/protocols/bibliographic-contracts.json','utf8'));
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({resultList:bibliography.resultList}));
  const rows=JSON.stringify(sqlite.prepare('SELECT * FROM source_items ORDER BY id').all());
  try{for(let i=0;i<2;i++){const result=await ingress.ingestEuropePmc({DB:db},{force:true});assert.equal(result.created,0);assert.equal(result.total,3);}}finally{globalThis.fetch=oldFetch;}
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM source_items ORDER BY id').all()),rows);
  sqlite.prepare('UPDATE source_feeds SET enabled=0 WHERE id IN (?,?)').run('europe-pmc-batch','research-europe-pmc-rest');
  globalThis.fetch=async()=>{throw Error('DISABLED_FEED_MUST_NOT_FETCH');};
  try{await assert.rejects(ingress.ingestEuropePmc({DB:db},{force:true}),/missing or disabled/);assert.equal((await ingress.ingestEuropePmc({DB:db})).total,0);}finally{globalThis.fetch=oldFetch;}
 }finally{sqlite.close();}
});
test('single generated SQL contains one UPDATE and no BEGIN/batch or broader data mutation',()=>{
 const sql=literalStatement(correctionStatement(manifest));assert.equal((sql.match(/UPDATE source_items SET/g)||[]).length,1);assert.match(sql,/eligible AS MATERIALIZED/);assert.match(sql,/RETURNING \*/);
});
