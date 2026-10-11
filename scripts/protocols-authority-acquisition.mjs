// Bounded public authority reads; no database, lifecycle, ingestion or publication writer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir='.logs/protocols-authority-acquisition';mkdirSync(dir,{recursive:true});
const dgaPdf=process.argv.includes('--dga-pdf');
const authorities=[{id:'dash-item-booklet',url:'https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf',kind:'PDF'},
 {id:'med-item-dga-2015',url:dgaPdf?'https://odphp.health.gov/sites/default/files/2019-09/2015-2020_Dietary_Guidelines.pdf':process.argv.includes('--dga-resolved')?'https://odphp.health.gov/our-work/nutrition-physical-activity/dietary-guidelines/previous-dietary-guidelines/2015':'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/',kind:dgaPdf?'PDF':'HTML'}];
const allowed=new Set(['www.nhlbi.nih.gov','nhlbi.nih.gov','health.gov','www.health.gov','odphp.health.gov','dietaryguidelines.gov','www.dietaryguidelines.gov']);
const results=[];
for(const a of authorities.filter(a=>!(process.argv.includes('--dga-only')||process.argv.includes('--dga-resolved')||dgaPdf)||a.id==='med-item-dga-2015')){
 const r={...a,startedUtc:new Date().toISOString(),redirects:[],requests:0};
 try{
  let url=a.url;const signal=AbortSignal.timeout(20000);
  for(let i=0;i<4;i++){
   const u=new URL(url);if(u.protocol!=='https:'||!allowed.has(u.hostname)||u.username||u.password)throw Error('AUTHORITY_REDIRECT_DENIED');
   r.requests++;const response=await fetch(u,{redirect:'manual',signal,headers:{Accept:a.kind==='PDF'?'application/pdf':'text/html','User-Agent':'global-content-os/0.1'}});
   r.status=response.status;r.finalUrl=url;r.contentType=response.headers.get('content-type');
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw Error('REDIRECT_WITHOUT_LOCATION');r.redirects.push({from:url,status:response.status,to:new URL(location,url).href});url=new URL(location,url).href;await response.body?.cancel();continue;}
   const chunks=[];let length=0;const reader=response.body.getReader();
   const budget=dgaPdf&&a.id==='med-item-dga-2015'?12582912:2097152;
   while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>budget){await reader.cancel();throw Error('AUTHORITY_BYTE_BUDGET');}chunks.push(Buffer.from(value));}
   const bytes=Buffer.concat(chunks);r.bytes=bytes.length;r.sha256=createHash('sha256').update(bytes).digest('hex');
   const path=dir+'/'+a.id+(a.kind==='PDF'?'.pdf':'.html');writeFileSync(path,bytes);r.rawEvidence=path;
   if(!response.ok)throw Error('AUTHORITY_HTTP_'+response.status);
   if(a.kind==='PDF'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('NOT_PDF');
   if(a.kind==='HTML'&&!/text\/html/i.test(r.contentType??''))throw Error('NOT_HTML');
   r.transport='VERIFIED_PUBLIC_AUTHORITY';r.semanticDocumentIdentity='REQUIRES_CONTENT_CHECK';break;
  }
  if(!r.transport)throw Error('REDIRECT_BUDGET');
 }catch(error){r.transport='BLOCKED';r.error=error.message;r.cause=error.cause?.code??null;}
 r.finishedUtc=new Date().toISOString();results.push(r);
}
writeFileSync(dir+(dgaPdf?'/dga-pdf.json':process.argv.includes('--dga-resolved')?'/dga-resolved.json':process.argv.includes('--dga-only')?'/dga-followup.json':'/results.json'),JSON.stringify({results,productionMutations:0,feedActivation:false,liveIngestion:false},null,2)+'\n');console.log(JSON.stringify(results));
