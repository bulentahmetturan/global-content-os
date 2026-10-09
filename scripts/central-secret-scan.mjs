import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const tracked=execFileSync('git',['diff','--name-only','e20a0b3'],{encoding:'utf8'});
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'});
const paths=[...new Set(`${tracked}\n${untracked}`.split('\n').filter(Boolean))];
const pattern=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bghp_[A-Za-z0-9]{30,}\b|\bsk-proj-[A-Za-z0-9_-]{40,}\b/;
const flagged=[];
for(const path of paths) {try {if(pattern.test(readFileSync(path,'utf8')))flagged.push(path);}catch{}}
console.log(JSON.stringify({verdict:flagged.length?'FAIL':'PASS',filesScanned:paths.length,flaggedFiles:flagged,scope:'changed files; recognizable private-key/provider-token signatures only'}));
process.exitCode=flagged.length?1:0;
