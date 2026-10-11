import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';
const approved = await bundle('apps/worker/src/protocols/approved-display.ts','approved-protocol-display');
const enrich = await bundle('apps/worker/src/localize/enrich.ts','approved-protocol-enrich');
const ingress = await bundle('apps/worker/src/ingress/upsert-localized.ts','approved-protocol-ingress');
const contract = await bundle('apps/worker/src/localize/contract.ts','approved-protocol-contract');
const backfill = await bundle('apps/worker/src/localize/backfill.ts','approved-protocol-backfill');
const queries = await bundle('apps/worker/src/db/queries.ts','approved-protocol-queries');
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`migrations/${f}`,'utf8'));
  return { sqlite, db: d1FromSqlite(sqlite) };
}
for (const item of approved.APPROVED_PROTOCOL_DISPLAY) test(`${item.id}: fail closed before correction; repeat enrichment/ingress preserves approved text without AI or writes`,async()=>{
  const {sqlite,db}=fixture();
  try {
    await assert.rejects(approved.protectedProtocolDisplay(db,{id:item.id}),/REMEDIATION_REQUIRED/);
    // Authorized fixture-only correction, not a production writer or deployment.
    sqlite.prepare('UPDATE source_items SET title=?,summary=?,gists_json=? WHERE id=?').run(item.title,item.summary,JSON.stringify([approved.approvedProtocolGist(item)]),item.id);
    const before=JSON.stringify(sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(item.id));
    const changes=sqlite.prepare('SELECT total_changes() AS n').get().n;
    for(let i=0;i<2;i++){
      const row=sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(item.id);
      assert.deepEqual(await enrich.enrichOneItem({DB:db,AI:{run(){throw Error('AI_MUST_NOT_RUN');}}},row),{ok:true});
      assert.deepEqual(await ingress.upsertLocalizedSourceItem({DB:db},{canonicalUrl:item.url,title:'bad replacement',summary:'bad replacement',route:'kaduse-research'}),{id:item.id,created:false});
      assert.deepEqual(await queries.upsertSourceItem(db,{canonicalUrl:item.url,title:'bad direct replacement',summary:'bad direct replacement',route:'kaduse-research'}),{id:item.id,created:false});
    }
    assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(item.id)),before);
    assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n,changes);
    // Legacy backfill must not rewrite an owned ID, even if its display is damaged.
    sqlite.prepare('UPDATE source_items SET title=? WHERE id=?').run('The study effects and health',item.id);
    const damaged=JSON.stringify(sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(item.id));
    await backfill.backfillLocalization({DB:db,AI:{run(){throw Error('AI_MUST_NOT_RUN');}}},{limit:120});
    assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM source_items WHERE id=?').get(item.id)),damaged);
    sqlite.prepare('UPDATE source_items SET canonical_url=? WHERE id=?').run('https://wrong.example/',item.id);
    await assert.rejects(approved.protectedProtocolDisplay(db,{id:item.id}),/IDENTITY_MISMATCH/);
  } finally {sqlite.close();}
});
test('non-owned identities never consult database or broaden guard',async()=>{
  assert.equal(await approved.protectedProtocolDisplay({prepare(){throw Error('DB_MUST_NOT_RUN');}},{id:'other'}),null);
});
test('approved PREDIMED preserves corrected-publication and intervention qualifications',()=>{
  const x=approved.APPROVED_PROTOCOL_DISPLAY.find(x=>x.id==='med-item-predimed-2018');
  assert.match(x.title,/Birincil/); assert.match(x.summary,/Randomizasyon sürecindeki sapmalar/);
  assert.match(x.summary,/7\.447/); assert.match(x.summary,/natürel sızma/); assert.match(x.summary,/sert kabuklu yemiş/); assert.match(x.summary,/kontrol/);
});
test('five scientific gists satisfy existing language/length contract; exact owner PREDIMED summary conflict remains explicit',()=>{
  for(const x of approved.APPROVED_PROTOCOL_DISPLAY){
    assert.equal(contract.validateTitleTr(x.title,''),null);
    assert.equal(contract.validateSummaryTr(approved.approvedProtocolGist(x),{titleOrig:'',titleTr:x.title}),null);
    assert.equal(contract.validateSummaryTr(x.summary,{titleOrig:'',titleTr:x.title}),x.id==='med-item-predimed-2018'?'SUMMARY_TOO_LONG':null);
  }
});
