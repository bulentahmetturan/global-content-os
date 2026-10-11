import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, join, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { makeLocalWorld } from '../apps/worker/src/statistics/test-support/local-runtime.mjs';
import { executeCorrection, COLUMNS, sha256 } from './protocols-five-item-writer.mjs';
const manifest=JSON.parse(readFileSync('release/protocols/five-item-correction.json','utf8'));
const quote=x=>x===null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
test('actual local D1: five-row statement atomicity, stale/interleaved CAS, idempotency and full rollback',async()=>{
 const w=makeLocalWorld('content-only');const metrics=[];let serial=0;
 const command=sql=>{
  const file=join(w.dir,'query-'+(++serial)+'.sql');writeFileSync(file,sql);
  let out;
  try{out=execFileSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute','content-local','--local','--config',w.toml,'--persist-to',w.persist,'--file',file,'--json'],{cwd:w.dir,encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'1',NO_COLOR:'1'},timeout:120000,maxBuffer:4*1024*1024,windowsHide:true});}
  catch(error){error.message+='\n'+String(error.stderr??'').slice(-2000)+'\n'+String(error.stdout??'').slice(-2000);throw error;}
  const results=JSON.parse(out);assert.ok(results.every(x=>x.success));metrics.push(...results.map(x=>x.meta));return results.at(-1);
 };
 const db={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async all(){let i=0;const text=sql.replace(/\?/g,()=>quote(args[i++]));assert.equal(i,args.length);return command(text);}};}};
 const journal=join(w.dir,'audit.jsonl');const audit=async r=>{const fd=openSync(journal,'a');try{writeSync(fd,JSON.stringify(r)+'\n');fsyncSync(fd);}finally{closeSync(fd);}};
 const seed=()=>command(manifest.items.map(x=>`UPDATE source_items SET ${COLUMNS.filter(k=>k!=='id').map(k=>k+'='+quote(x.before[k])).join(',')} WHERE id=${quote(x.id)};`).join('\n'));
 const fingerprint=()=>{
  const schema=w.query('content',"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name");
  const tables=schema.filter(x=>x.type==='table').map(x=>({name:x.name,rows:w.query('content','SELECT * FROM "'+x.name.replaceAll('"','""')+'"').map(r=>JSON.stringify(r)).sort()}));
  return sha256({schema,tables}); // Includes complete d1_migrations rows, not just its count.
 };
 try{
  w.migrate('content-local');seed();const before=fingerprint();
  const applied=await executeCorrection(db,manifest,{audit});assert.equal(applied.recordsChanged,5);
  console.log(JSON.stringify({actualD1Meta:applied.meta,verifiedReturningRows:applied.recordsChanged}));
  if(applied.meta.changes !== undefined)assert.equal(applied.meta.changes,5);
  if(applied.meta.rows_written !== undefined)assert.equal(applied.meta.rows_written,5);
  assert.equal((await executeCorrection(db,manifest,{audit})).recordsChanged,0);
  const rolled=await executeCorrection(db,manifest,{operation:'ROLLBACK',audit});assert.equal(rolled.recordsChanged,5);if(rolled.meta.changes !== undefined)assert.equal(rolled.meta.changes,5);assert.equal(fingerprint(),before);
  assert.equal((await executeCorrection(db,manifest,{operation:'ROLLBACK',audit})).recordsChanged,0);
  let raceFingerprint;
  const race={prepare(sql){const p=db.prepare(sql);if(!sql.startsWith('WITH expected'))return p;return {bind(...args){p.bind(...args);return {async all(){command(`UPDATE source_items SET triage_status='hold' WHERE id=${quote(manifest.items[2].id)}`);raceFingerprint=fingerprint();return p.all();}};}};}};
  await assert.rejects(executeCorrection(race,manifest,{audit}),/CAS_CONFLICT/);
  assert.equal(fingerprint(),raceFingerprint);
  assert.deepEqual(w.query('content','SELECT id,title FROM source_items WHERE id IN ('+manifest.items.map(x=>quote(x.id)).join(',')+') ORDER BY id'),manifest.items.map(x=>({id:x.id,title:x.before.title})).sort((a,b)=>a.id.localeCompare(b.id)));
  command(`UPDATE source_items SET triage_status='inbox' WHERE id=${quote(manifest.items[2].id)}`);seed();
  command(`UPDATE source_items SET updated_at='stale' WHERE id=${quote(manifest.items[0].id)}`);const stale=fingerprint();
  await assert.rejects(executeCorrection(db,manifest,{audit}),/STALE/);assert.equal(fingerprint(),stale);seed();
  const fresh=fingerprint();
  command("CREATE TRIGGER test_abort BEFORE UPDATE OF title ON source_items WHEN NEW.id='med-item-dga-2015' BEGIN SELECT RAISE(ABORT,'LOCAL_ATOMICITY_TEST'); END");
  await assert.rejects(executeCorrection(db,manifest,{audit}),/UNREVIEWED/);
  command('DROP TRIGGER test_abort');assert.equal(fingerprint(),fresh);
  const restored=fingerprint();assert.equal(restored,before);
  let schemaRaceFingerprint;
  const schemaRace={prepare(sql){const p=db.prepare(sql);if(!sql.startsWith('WITH expected'))return p;return {bind(...args){p.bind(...args);return {async all(){command("CREATE TRIGGER schema_race BEFORE UPDATE OF title ON source_items WHEN NEW.id='med-item-dga-2015' BEGIN SELECT RAISE(FAIL,'unsafe'); END");schemaRaceFingerprint=fingerprint();return p.all();}};}};}};
  await assert.rejects(executeCorrection(schemaRace,manifest,{audit}),/CAS_CONFLICT/);assert.equal(fingerprint(),schemaRaceFingerprint);
  command('DROP TRIGGER schema_race');assert.equal(fingerprint(),restored);
  const dga=manifest.items.find(x=>x.id==='med-item-dga-2015');
  command(`ALTER TABLE source_items ADD COLUMN atomicity_probe INTEGER DEFAULT 0 CONSTRAINT protocol_atomicity_probe CHECK (id != 'med-item-dga-2015' OR summary != ${quote(dga.after.summary)})`);
  const faultBaseline=fingerprint();
  await assert.rejects(executeCorrection(db,manifest,{audit}),/protocol_atomicity_probe/);
  const faultAfter=fingerprint();assert.equal(faultAfter,faultBaseline);
  writeFileSync('.logs/protocols-safe-writer-local-d1.json',JSON.stringify({status:'PASS',databaseIdentity:{name:'content-local',id:w.ids.content,production:false},finishedUtc:new Date().toISOString(),atomicStatementAbort:true,concurrentSchemaCAS:true,staleSnapshot:true,interleavedUncapturedColumnCAS:true,applyRows:5,rollbackRows:5,replayRows:0,changesMetric:applied.meta.changes??'UNKNOWN_NOT_EXPOSED_BY_LOCAL_D1',rowsWrittenMetric:applied.meta.rows_written??'UNKNOWN_NOT_EXPOSED_BY_LOCAL_D1',fullDatabaseFingerprintRestored:true,fingerprintScope:'All application rows including complete migration ledger + DDL; excludes SQLite and _cf_ internals; logical, not physical file-byte identity',beforeFingerprint:before,restoredFingerprint:restored,faultBaselineFingerprint:faultBaseline,faultAfterFailureFingerprint:faultAfter,metrics,audit:readFileSync(journal,'utf8').trim().split('\n').map(x=>JSON.parse(x)),remoteWrites:0},null,2)+'\n');
 }finally{
  assert.ok(resolve(w.dir).startsWith(resolve(tmpdir())+sep)&&basename(w.dir).startsWith('stats-runtime-'));
  w.teardown();
 }
});
