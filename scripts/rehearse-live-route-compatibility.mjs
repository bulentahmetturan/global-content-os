// Local handler-dispatch rehearsal only: synthetic read D1, no live calls or writes.
import { readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
const expected = '0e1e6f1beadc3ac748cdcfcd00b9e9439b1c16914c89d2fe698239b32008dfb1';
const binary = '.logs/authorized-operator-evidence-20261011/module-1.bin';
if (createHash('sha256').update(readFileSync(binary)).digest('hex') !== expected) throw new Error('ARTIFACT_HASH_MISMATCH');
copyFileSync(binary, '.logs/captured-live-route-rehearsal.mjs');
const live = (await import(pathToFileURL(resolve('.logs/captured-live-route-rehearsal.mjs')).href)).default;
const candidate = (await bundle('apps/worker/src/index.ts','exact-route-compatibility')).default;
const evidence = [];
for (const [name, worker] of [['captured_live',live],['central_candidate',candidate]]) {
  for (const path of ['/api/discovery/candidates','/api/discovery/observability','/api/discovery/owner']) {
    let reads = 0, writes = 0;
    const db = { prepare() { const stmt = { bind() {return stmt;},async all(){reads++;return {results:[]};},async first(){reads++;return {n:0,total:0,count:0};},async run(){writes++;throw new Error('WRITES_FORBIDDEN');} };return stmt;} };
    const env = {DB:db,HUB_OPERATOR_TOKEN:'local-test-only',OPS_TOKEN:'local-ops-only',ASSETS:{async fetch(){return new Response('LOCAL_ASSET_FALLBACK',{status:418});}}};
    const previousFetch = globalThis.fetch; globalThis.fetch = async()=>{throw new Error('NETWORK_FORBIDDEN');};
    try {
      const response = await worker.fetch(new Request('https://local.invalid'+path,{headers:{Authorization:'Bearer local-test-only'}}),env,{waitUntil(){}});
      evidence.push({runtime:name,path,method:'GET',status:response.status,readQueries:reads,writes,handled:response.status!==418,
        limitation:'Synthetic empty D1: dispatch proof only, not production data compatibility'});
    } catch {evidence.push({runtime:name,path,method:'GET',status:'LOCAL_HANDLER_ERROR',readQueries:reads,writes,handled:reads>0});}
    finally {globalThis.fetch=previousFetch;}
  }
}
writeFileSync('.logs/exact-route-dispatch-rehearsal.json',JSON.stringify({mode:'LOCAL_NO_NETWORK',evidence},null,2));
console.log(JSON.stringify(evidence));
if (evidence.some(row=>row.writes!==0)) process.exitCode=1;
