import { execFileSync } from 'node:child_process';
import { readMigrations, replay, sha256 } from './migration-authority.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync,writeFileSync } from 'node:fs';
export function rehearse(directory='migrations', predecessor='7b61870') {
  const fixtureClock='2026-10-09T00:00:00.000Z';
  const files=readMigrations(directory),fresh=replay(files,{fixtureClock});
  try {
    const repeat=replay(files,{database:fresh.db});
    if(repeat.executed.length || repeat.schema!==fresh.schema || repeat.data!==fresh.data) throw new Error('REPEAT_STATE_CHANGED');
    let upgrade=null;
    if(directory==='migrations') {
      const names=execFileSync('git',['ls-tree','--name-only',`${predecessor}:migrations`],{encoding:'utf8'}).trim().split('\n').filter(n=>n.endsWith('.sql'));
      const previous=names.map(name=>({name,bytes:execFileSync('git',['show',`${predecessor}:migrations/${name}`])}));
      const initial=replay(previous,{fixtureClock});
      try {
        const advanced=replay(files,{database:initial.db});
        if(advanced.schema!==fresh.schema || advanced.data!==fresh.data) throw new Error('FRESH_UPGRADE_DIVERGENCE');
        upgrade={kind:'HYPOTHETICAL_GIT_LEDGER',predecessor,executed:advanced.executed.length,schema:advanced.schema,data:advanced.data};
      } finally {initial.db.close();}
    }
    return {verdict:'PASS',directory,freshExecuted:fresh.executed.length,repeatExecuted:repeat.executed.length,schema:fresh.schema,data:fresh.data,upgrade,inventory:files.map(f=>({name:f.name,sha256:sha256(f.bytes)}))};
  } finally {fresh.db.close();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const evidence={status:'DRAFT_NOT_AUTHORIZED',baseCommit:'e20a0b3d18d91de12f783cc96fe16808d754f119',productionLedger:'UNVERIFIED',content:rehearse(),statistics:rehearse('migrations/statistics')};
    const output=JSON.stringify(evidence,null,2)+'\n';
    if(process.argv.includes('--write-register')) {mkdirSync('release',{recursive:true});writeFileSync('release/central-recovery-migration-register.json',output);}
    console.log(output);
  }
  catch(error){console.log(JSON.stringify({verdict:'FAIL',reason:error.message}));process.exitCode=1;}
}
