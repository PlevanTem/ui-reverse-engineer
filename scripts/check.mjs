#!/usr/bin/env node
// Engineering checks only. A green receipt cannot accept a website or calibrate a Judge.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const workspace=fileURLToPath(new URL('../',import.meta.url));
const exec=promisify(execFile),sha=s=>createHash('sha256').update(s).digest('hex');

export function buildPlan(profile='local',{env=process.env,root=workspace}={}){
 if(!['local','full'].includes(profile))throw new Error('Profile must be local or full');
 const steps=[{id:'regression',command:process.execPath,args:['--test','--test-isolation=none','scripts/check.test.mjs','scripts/restore/tests/*.test.mjs','scripts/trajectory/*.test.mjs','scripts/evaluation/*.test.mjs','scripts/data-factory/*.test.mjs'],cwd:root},
  {id:'schemas',...(env.RESTORE_SCHEMA_PYTHON?{command:env.RESTORE_SCHEMA_PYTHON,args:['-X','utf8','scripts/validate-schemas.py'],cwd:root}:{unavailable:'RESTORE_SCHEMA_PYTHON not set'})}];
 const blockers=profile==='full'?['RESTORE_CAPTURE_PYTHON','RESTORE_PLAYWRIGHT_MODULE','RESTORE_SCHEMA_PYTHON'].filter(k=>!env[k]).map(k=>k+' required for full checks'):[];
 if(profile==='full'){
  const cwd=join(root,'evals/case-manager');
  steps.push({id:'case-manager-build',command:process.execPath,args:['node_modules/vite/bin/vite.js','build'],cwd},
   {id:'case-manager-package',command:process.execPath,args:['scripts/prepare-sites-build.mjs'],cwd},
   {id:'case-manager-tests',command:process.execPath,args:['--test','tests/sites-worker.test.mjs'],cwd});
 }
 return {schema_version:'RestoreCheckPlan/v1',profile,blockers,steps,scope:'local engineering only; no model calls, uploads or dependency installation',additional_acceptance:'See evals/README.md and evals/vnext-acceptance.md'};
}

async function execute(step){
 try{const r=await exec(step.command,step.args,{cwd:step.cwd,windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});return {exit_code:0,stdout:r.stdout,stderr:r.stderr};}
 catch(e){return {exit_code:Number.isInteger(e.code)?e.code:1,stdout:e.stdout??'',stderr:(e.stderr??'')+'\n'+e.message};}
}

export async function runChecks(plan,{execute:run=execute,onRecord=async()=>{}}={}){
 const started_at=new Date().toISOString(),checks=[];
 if(plan.blockers.length)return {schema_version:'RestoreCheckResult/v1',profile:plan.profile,status:'blocked',started_at,completed_at:new Date().toISOString(),blockers:plan.blockers,checks};
 for(const step of plan.steps){
  if(step.unavailable){const check={id:step.id,status:'unavailable',reason:step.unavailable};checks.push(check);await onRecord(check);continue;}
  const begin=Date.now();let result;
  try{result=await run(step);}catch(e){result={exit_code:1,stdout:'',stderr:e.message};}
  const stdout=result.stdout??'',stderr=result.stderr??'';
  const skipped=Number(stdout.match(/^(?:ℹ |# )skipped\s+(\d+)/m)?.[1]??0);
  const check={id:step.id,status:result.exit_code===0?'passed':'failed',exit_code:result.exit_code,elapsed_ms:Date.now()-begin,skipped_tests:skipped,stdout_sha256:sha(stdout),stderr_sha256:sha(stderr)};
  checks.push(check);await onRecord(check,{stdout,stderr});
 }
 const status=checks.some(x=>x.status==='failed')?'failed':checks.some(x=>x.status==='unavailable'||x.skipped_tests>0)?'incomplete':'passed';
 return {schema_version:'RestoreCheckResult/v1',profile:plan.profile,status,started_at,completed_at:new Date().toISOString(),blockers:[],checks};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.includes('--help')){console.log('node scripts/check.mjs [local|full] [--plan] [--output NEW_DIRECTORY]\nNode 24+. See evals/README.md#统一工程检查. No network/model execution.');}
  else{
   if(Number(process.versions.node.split('.')[0])<24)throw new Error('The consolidated test runner requires Node 24+; runtime modules retain their existing requirements');
   const args=process.argv.slice(2),profile=args[0]&&!args[0].startsWith('--')?args.shift():'local';let output=null,preview=false;
   while(args.length){const arg=args.shift();if(arg==='--plan')preview=true;else if(arg==='--output'){output=args.shift();if(!output||output.startsWith('--'))throw new Error('--output requires a new directory');}else throw new Error('Unknown argument: '+arg);}
   const plan=buildPlan(profile);
   if(preview)console.log(JSON.stringify(plan,null,2));
   else{
    const out=resolve(output??join(workspace,'reverse_output/checks',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()));
    await mkdir(dirname(out),{recursive:true});await mkdir(out); // Never overwrite a previous check receipt.
    await writeFile(join(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');
    const result=await runChecks(plan,{onRecord:async(check,logs)=>{
     if(logs)await writeFile(join(out,check.id+'.log'),logs.stdout+'\n'+logs.stderr);
     console.log(check.id+': '+check.status+(check.skipped_tests?' ('+check.skipped_tests+' skipped tests)':''));
    }});
    await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:result.status,report:join(out,'result.json'),blockers:result.blockers}));if(result.status!=='passed')process.exitCode=1;
   }
  }
 }catch(e){console.error(e.message);process.exitCode=1;}
}
