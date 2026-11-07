#!/usr/bin/env node
// Launch adapter only: Harbor owns all step, retry and stopping decisions.
import {spawn} from 'node:child_process';
import {access,cp,mkdir,mkdtemp,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTask,parseCasesYaml,compileCases} from './task-builder.mjs';
import {exportTrial,EXPORTER_DIGEST} from '../data-factory/export-trial.mjs';
import {treeHash,sha} from '../restore/core.mjs';
const workspace=fileURLToPath(new URL('../../',import.meta.url));
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const json=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
export async function collectJob(job,output,{validator=null}={}){
  await mkdir(output,{recursive:true});const records=[];
  const exporterDigest=EXPORTER_DIGEST;
  if(!await exists(job))return records;
  for(const entry of await readdir(job,{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    const trial=join(job,entry.name);if(!await exists(join(trial,'result.json')))continue;
    const packagePath=resolve(output,entry.name),manifestPath=join(packagePath,'manifest.json');
    let staging=null,displaced=false,published=false;
    try{
      const resultBytes=await readFile(join(trial,'result.json')),result=JSON.parse(resultBytes),resultDigest=sha(resultBytes);
      if(await exists(manifestPath)){
        const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
        if(manifest.harbor?.trial_id!==String(result.id??result.trial_name))throw Error('Existing package belongs to a different trial; choose a separate output directory');
        if(manifest.integrity?.status==='valid'&&manifest.harbor.trial_result_sha256===resultDigest&&manifest.package?.exporter_sha256===exporterDigest){records.push({trial:entry.name,package:packagePath,runtime_acceptance:manifest.runtime_acceptance,eligibility:manifest.eligibility});continue;}
      }else if(await exists(packagePath))throw Error('Existing package has no manifest; inspect it before replacing');
      // Export and validate beside the destination before moving the old package.
      staging=await mkdtemp(join(resolve(output),'.export-'));
      const r=await exportTrial(trial,join(staging,'package'),{validator});
      if(r.manifest.integrity?.status!=='valid'||r.manifest.package?.exporter_sha256!==exporterDigest||r.manifest.harbor.trial_result_sha256!==resultDigest||sha(await readFile(join(trial,'result.json')))!==resultDigest)throw Error('Trial changed during export or package validation failed; previous package retained');
      if(await exists(packagePath)){await rename(packagePath,join(staging,'previous'));displaced=true;}
      try{await rename(r.output,packagePath);published=true;}
      catch(error){if(displaced){await rename(join(staging,'previous'),packagePath);displaced=false;}throw error;}
      records.push({trial:entry.name,package:packagePath,runtime_acceptance:r.manifest.runtime_acceptance,eligibility:r.manifest.eligibility});
    }
    catch(error){records.push({trial:entry.name,status:'export_failed',error:error.message+(displaced&&!published?`; previous package retained at ${join(staging,'previous')}`:'')});}
    finally{if(staging&&(!displaced||published))await rm(staging,{recursive:true,force:true});}
  }
  return records;
}
export async function runtimeSkill(output){
  await mkdir(output,{recursive:true});
  for(const path of ['SKILL.md','references/harbor','references/restore.md','references/restore','references/restore-brief-template.md','evals/restore.md','evals/pipeline','scripts/restore','assets/restore']){
    await mkdir(join(output,path,'..'),{recursive:true});
    await cp(join(workspace,path),join(output,path),{recursive:true,filter:p=>!/(^|[\\/])(tests|node_modules|\.venv)([\\/]|$)/.test(p)});
  }
  const sdk=join(workspace,'tools/browser/node_modules/playwright-core');
  if(await exists(sdk))await cp(sdk,join(output,'tools/browser/node_modules/playwright-core'),{recursive:true});
  await writeFile(join(output,'SKILL.md'),await readFile(join(workspace,'references/harbor/runtime-skill.md'),'utf8'));
  return treeHash(output);
}
function run(executable,args){return new Promise((resolveResult,reject)=>{
  const dockerBin=join(process.env.LOCALAPPDATA??'', 'Programs','DockerDesktop','resources','bin');
  const child=spawn(executable,args,{cwd:workspace,stdio:'inherit',windowsHide:true,env:{...process.env,PATH:dockerBin+(process.platform==='win32'?';':':')+(process.env.PATH??''),PYTHONPATH:join(workspace,'tools/harbor')+(process.env.PYTHONPATH?(process.platform==='win32'?';':':')+process.env.PYTHONPATH:''),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
  const forward=()=>child.kill('SIGINT');process.once('SIGINT',forward);
  child.once('error',error=>{process.removeListener('SIGINT',forward);reject(error);});
  child.once('close',(code,signal)=>{process.removeListener('SIGINT',forward);resolveResult({code:code??1,signal});});
});}
function watchJob(job){
  const seen=new Set();let busy=false;
  const timer=setInterval(async()=>{if(busy||!await exists(job))return;busy=true;try{
    for(const entry of await readdir(job,{withFileTypes:true})){if(!entry.isDirectory())continue;const log=join(job,entry.name,'trial.log');if(!await exists(log))continue;const text=await readFile(log,'utf8');const stage=[...text.matchAll(/^Starting step (\d+)\/(\d+): ([\w-]+)/gm)].at(-1);if(stage){const key=entry.name+':'+stage[3];if(!seen.has(key)){seen.add(key);process.stderr.write(`[Harbor] ${entry.name}: ${stage[3]} (${stage[1]}/${stage[2]})\n`);}}}
  }catch(error){process.stderr.write(`[Harbor progress] ${error.message}\n`);}finally{busy=false;}},3000);
  timer.unref();return ()=>clearInterval(timer);
}
export async function main(args=process.argv.slice(2)){
  const options={};while(args.length){const flag=args.shift();if(flag==='--plan'){options.plan=true;continue;}const value=args.shift();if(!value||value.startsWith('--'))throw Error(`${flag} requires a value`);options[flag.replace(/^--/,'')]=value;}
  for(const key of Object.keys(options))if(!['plan','url','case','tier','output','model','source-policy','recover'].includes(key))throw Error(`Unknown option: ${key}`);
  if(options.recover){const root=resolve(options.recover),receipt=JSON.parse(await readFile(join(root,'launch.json'),'utf8'));receipt.packages=await collectJob(join(root,'jobs','restore'),join(root,'packages'));receipt.status=receipt.packages.length&&receipt.packages.every(p=>p.status!=='export_failed')?'recorded':'export_failed';await json(join(root,'launch.json'),receipt);console.log(JSON.stringify(receipt,null,2));if(receipt.status!=='recorded')process.exitCode=1;return;}
  if(options.url&&options.case)throw Error('Choose one input: --url or --case');
  let url=options.url,tier=options.tier??'refined',item=null;
  if(options.case){const cases=parseCasesYaml(await readFile(join(workspace,'evals/cases.yaml'),'utf8'));const matches=cases.filter(c=>c.id===options.case||c.title.toLowerCase().includes(options.case.toLowerCase()));if(matches.length!==1)throw Error('Case must match exactly one prepared test case');item=matches[0];if(item.status!=='ready')throw Error(`Case ${item.id} is ${item.status}; --case requires a manually prepared ready fixture. To restore the live website use --url ${item.url}`);url=item.url;}
  if(!url)throw Error('A target URL is required: provide --url URL or --case CASE');
  const output=resolve(options.output??join(workspace,'reverse_output',`restore-${Date.now()}`));if(await exists(output))throw Error('Output must be a new directory');await mkdir(output,{recursive:true});
  const task=join(output,'task'),skill=join(output,'runtime-skill');let taskPath=task;
  if(!options.plan){const npmCli=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');const browserInstall=await run(process.execPath,[npmCli,'ci','--prefix',join(workspace,'tools/browser'),'--ignore-scripts','--no-audit','--no-fund']);if(browserInstall.code)throw Error('Browser SDK setup failed');}
  if(item?.status==='ready'){const compiled=await compileCases(task,{caseId:item.id});taskPath=compiled.tasks[0].output;}
  else await createTask(task,{url,tier,sourcePolicy:options['source-policy']??'fixture_only',inputRoute:'direct_url'});
  const skillDigest=await runtimeSkill(skill),auth=process.env.CODEX_AUTH_JSON_PATH??join(homedir(),'.codex','auth.json');
  const nativeConfig=await exists(join(homedir(),'.codex','config.toml'))?await readFile(join(homedir(),'.codex','config.toml'),'utf8'):'';
  const model=options.model??process.env.RESTORE_MODEL??nativeConfig.match(/^model\s*=\s*"([^"]+)"/m)?.[1];
  if(!model)throw Error('Set --model MODEL or RESTORE_MODEL');
  const uvArgs=['run','--project',join(workspace,'tools/harbor'),'--locked','harbor','run','-p',taskPath,'-a','restore_codex:RestoreCodex','-m',model,'--ak','version=0.153.0','--ak','reasoning_summary=none','--skill',skill,'--resume-trajectory','--n-concurrent','1','--jobs-dir',join(output,'jobs'),'--job-name','restore','--yes'];
  if(await exists(auth))uvArgs.push('--ae',`CODEX_AUTH_JSON_PATH=${auth}`);
  uvArgs.push('--ae','PLAYWRIGHT_BROWSERS_PATH=/ms-playwright');
  uvArgs.push('--ae','RESTORE_PLAYWRIGHT_MODULE=/home/pwuser/.agents/skills/runtime-skill/tools/browser/node_modules/playwright-core/index.mjs');
  const taskMetadata=JSON.parse(await readFile(join(taskPath,'restore-task.json'),'utf8'));
  uvArgs.push('--ae',`RESTORE_SOURCE_POLICY=${taskMetadata.source_policy.mode}`);
  const install=['archive.ubuntu.com','security.ubuntu.com','raw.githubusercontent.com','github.com','codeload.github.com','nodejs.org','registry.npmjs.org'];
  for(const host of install)uvArgs.push('--allow-environment-host',host);
  for(const host of [...install,'chatgpt.com','auth.openai.com','api.openai.com'])uvArgs.push('--allow-agent-host',host);
  const receipt={schema_version:'RestoreLaunch/v1',url,case_id:item?.id??null,route:item?.status==='ready'?'ready_case':'exploratory',skill_digest:skillDigest,agent:{adapter:'restore_codex:RestoreCodex',adapter_sha256:sha(await readFile(join(workspace,'tools/harbor/restore_codex.py'))),codex_version:'0.153.0'},model,status:'prepared',packages:[]};
  await json(join(output,'launch.json'),receipt);
  if(options.plan){console.log(JSON.stringify({output,...receipt},null,2));return;}
  let result,stopProgress=()=>{};
  try{
    const sync=await run('uv',['sync','--project',join(workspace,'tools/harbor'),'--locked']);if(sync.code)throw Error('Harbor dependency sync failed');
    const base=['run','--project',join(workspace,'tools/harbor'),'--locked'];
    for(const command of [[...base,'python',join(workspace,'tools/harbor/preflight_agent.py'),'restore_codex:RestoreCodex'],[...base,'harbor','lint',taskPath,'--json','--extend-select','ALL'],[...uvArgs,'--dry-run']]){if((await run('uv',command)).code)throw Error('Harbor preflight failed');}
    stopProgress=watchJob(join(output,'jobs','restore'));result=await run('uv',uvArgs);
  }catch(error){receipt.error=error.message;}
  finally{
    stopProgress();
    receipt.packages=await collectJob(join(output,'jobs','restore'),join(output,'packages'));
    receipt.status=receipt.packages.some(p=>p.status==='export_failed')?'export_failed':receipt.error||!receipt.packages.length?'launch_failed':'recorded';
    receipt.harbor_exit_code=result?.code??null;await json(join(output,'launch.json'),receipt);
  }
  console.log(JSON.stringify({output,...receipt},null,2));
  if(receipt.error||result?.code||!receipt.packages.length||receipt.packages.some(p=>p.status==='export_failed'||p.runtime_acceptance==='failed'))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
