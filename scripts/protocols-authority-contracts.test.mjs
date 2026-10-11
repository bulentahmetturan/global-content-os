import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
const {documents}=JSON.parse(readFileSync('release/protocols/authority-contracts.json','utf8'));
const parser=await bundle('apps/worker/src/protocols/ingestion/parse-contract.ts','authority-parser');
for(const d of documents)test(`${d.id}: real authority PDF excerpt preserves source identity, locator and NEEDS_REVIEW parser boundary`,()=>{
 assert.ok(d.text.length>100&&d.text.length<20000);assert.match(d.sourceSHA256,/^[a-f0-9]{64}$/);
 const input={sourceId:d.id,uri:d.acquiredUrl,sourceTag:d.sourceTag,parserFamily:d.parserFamily,text:d.text};
 const result=parser.parseDocument(input);assert.deepEqual(parser.parseDocument(input),result);
 assert.deepEqual(parser.validateParsedDocument(result),[]);assert.equal(result.uri,d.acquiredUrl);assert.equal(result.sourceTag,'REAL_SOURCE_LOCAL');
 const records=[...result.components,...result.claims,...result.safety];assert.ok(records.length>0);
 assert.ok(records.every(x=>x.review==='NEEDS_REVIEW'&&x.excerpt.trim()));assert.equal(result.version,null);
 if(d.id==='med-item-dga-2015'){assert.deepEqual(d.excerptPages,[102,103,104]);assert.match(d.text,/Table A4-1/);assert.match(d.text,/12 Calorie Levels/);assert.notEqual(d.acquiredUrl,d.canonicalUrl);}
 else {assert.match(d.identity,/06-4082/);assert.match(d.identity,/April 2006/);assert.match(d.text,/servings|2,300|1,500/i);}
});
test('PDF intake remains review-gated; not complete automatic live-source ingestion or feed activation',()=>{
 const fixture=JSON.parse(readFileSync('release/protocols/authority-contracts.json','utf8'));assert.equal(fixture.feedActivation,false);assert.equal(fixture.productionPersistence,false);
 for(const d of documents)assert.match(d.automation,/manual intake.*NEEDS_REVIEW/);
});
