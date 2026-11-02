#!/usr/bin/env node
import {resolve,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {armAutomatic,runWorker,settingsFor} from './auto.mjs';
import {writeDelegationSpec} from './delegation.mjs';
const [command,target,out]=process.argv.slice(2);
try{
 let result;
 if(command==='arm')result=await armAutomatic(resolve(target),{settings:{...await settingsFor(),enabled:true},...(out?{outRoot:resolve(out)}:{})});
 else if(command==='delegate-spec')result=await writeDelegationSpec(resolve(target),JSON.parse(await readFile(resolve(out),'utf8')));
 else if(command==='worker')result=await runWorker(resolve(target));
 else if(command==='resume')result=await runWorker(join(resolve(target),'binding.json'));
 else if(command==='status')result=JSON.parse(await readFile(join(resolve(target),'automatic-status.json'),'utf8'));
 else if(command==='inspect'){const p=JSON.parse(await readFile(join(resolve(target),'payload-inspect.json'),'utf8'));result=out?{[out]:p[out]}:p;}
 else result={usage:'arm RUN [CAPTURE_DIR] | resume CAPTURE_DIR | status CAPTURE_DIR | inspect CAPTURE_DIR [DIMENSION] | delegate-spec CAPTURE_DIR request.json. Project opt-in: reverse_output/trajectory/auto-settings.json. Read references/trajectory/interfaces.md.'};
 console.log(JSON.stringify(result,null,2));if(['failed','incomplete','partial','not_bound','owner_mismatch'].includes(result?.status))process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
