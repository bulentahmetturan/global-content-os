import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const dir='.logs/protocols-authority-acquisition/';
const read=name=>JSON.parse(readFileSync(dir+name,'utf8').replace(/^\uFEFF/,''));
const nih=read('nih-identity.json');const nihInput=read('nih-parser-input.json');
const dga=read('dga-identity.json');
const nihDownload=read('results.json').results.find(x=>x.id==='dash-item-booklet');
const dgaDownload=read('dga-pdf.json').results[0];
assert.match(nih.identity_excerpts,/NIH Publication No\. 06-4082/);assert.match(nih.identity_excerpts,/Revised April 2006/);
const heading=dga.appendix4_candidates.find(x=>/Appendix 4\./.test(x.text));
const table=dga.appendix4_candidates.filter(x=>/Table A4-1\./.test(x.text));
assert.ok(heading);assert.equal(table.length,2);assert.match(table[0].text,/12 Calorie Levels/);
assert.match(table[0].text,/1,000 1,200 1,400 1,600 1,800 2,000 2,200 2,400 2,600 2,800 3,000 3,200/);
assert.match(dga.cover,/2015-2020/);assert.match(dga.cover,/EIGHTH EDITION/);
assert.equal(nihDownload.transport,'VERIFIED_PUBLIC_AUTHORITY');assert.equal(dgaDownload.transport,'VERIFIED_PUBLIC_AUTHORITY');
assert.ok(nihInput.candidates.length);
const documents=[
 {id:'dash-item-booklet',canonicalUrl:nihDownload.url,acquiredUrl:nihDownload.finalUrl,sourceSHA256:nihDownload.sha256,acquiredUtc:nihDownload.finishedUtc,pdfPages:nih.pages,identity:'NIH Publication No. 06-4082; Revised April 2006',excerptPages:nihInput.candidates.map(x=>x.pdf_page),text:nihInput.candidates.map(x=>x.text).join('\n\n')},
 {id:'med-item-dga-2015',canonicalUrl:'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/',acquiredUrl:dgaDownload.finalUrl,sourceSHA256:dgaDownload.sha256,acquiredUtc:dgaDownload.finishedUtc,pdfPages:dga.pages,identity:'Dietary Guidelines for Americans 2015-2020; 8th Edition; Appendix 4; Table A4-1',excerptPages:[heading.pdf_page,...table.map(x=>x.pdf_page)],text:[heading,...table].map(x=>x.text).join('\n\n')},
].map(x=>({...x,parserFamily:'GUIDELINE_DOCUMENT',sourceTag:'REAL_SOURCE_LOCAL',automation:'PDF text extraction is local operator/manual intake; generic parser produces NEEDS_REVIEW candidates, not verified nutrient cell mapping or approved claims'}));
mkdirSync('release/protocols',{recursive:true});
writeFileSync('release/protocols/authority-contracts.json',JSON.stringify({generatedBy:'scripts/build-protocol-authority-contracts.mjs',documents,feedActivation:false,productionPersistence:false},null,2)+'\n');
const bibliographyRaw=readFileSync('.logs/protocols-authoritative-epmc.json','utf8');
const responseSHA256=createHash('sha256').update(bibliographyRaw).digest('hex');
assert.equal(responseSHA256,'afb394953c06dc209e7fac11d711a81f184c4b6dc51eb77938b17ead1c746a5c');
const records=JSON.parse(bibliographyRaw).resultList.result;
assert.deepEqual(records.map(x=>x.id).sort(),['11136953','29897866','9099655']);
writeFileSync('release/protocols/bibliographic-contracts.json',JSON.stringify({generatedBy:'scripts/build-protocol-authority-contracts.mjs',responseSHA256,source:'Europe PMC MED records from the existing bounded three-ID public read; no new fetch',resultList:{result:records.map(x=>Object.fromEntries(['id','source','title','doi','pmid','pubYear','firstPublicationDate','journalTitle','authorString'].filter(k=>x[k]!==undefined).map(k=>[k,x[k]])))}},null,2)+'\n');
console.log(JSON.stringify(documents.map(x=>({id:x.id,pdfPages:x.pdfPages,excerptPages:x.excerptPages,textLength:x.text.length}))));
