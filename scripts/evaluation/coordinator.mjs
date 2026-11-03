// Codex-only, development-only coordinator. Existing graders retain scoring ownership.
import {mkdir,readFile,writeFile,open,unlink,readdir,lstat,cp} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,sha,readJSON,writeJSON,treeHash,safeFile,assert} from '../restore/core.mjs';
import {collectSessions,discoverSessions,collectInstructionHistory,redactText} from '../trajectory/collector.mjs';
import {createViews} from '../trajectory/views.mjs';
import {loadDelegationSpecs} from '../trajectory/delegation.mjs';
import {configFrom} from '../trajectory/langfuse.mjs';
import {executeSuite} from './runners.mjs';
export const frameworkRoot=fileURLToPath(new URL('../../',import.meta.url));
const now=()=>new Date().toISOString();
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function within(root,p){const r=relative(resolve(root),resolve(p));assert(!r.startsWith('..')&&!isAbsolute(r),'Evaluation path outside workspace');return resolve(p);}
async function noLinks(root,p){let at=resolve(root);assert(!(await lstat(at)).isSymbolicLink(),'Symlinked evaluation workspace');for(const segment of relative(root,p).split(sep).filter(Boolean)){at=join(at,segment);if(await exists(at))assert(!(await lstat(at)).isSymbolicLink(),'Symlinked evaluation path');}}
function validateConfig(c){
 assert(c?.schema_version==='CodexEvaluationConfig/v1'&&Array.isArray(c.suites)&&c.suites.length,'Codex development suites required');
 assert(Object.keys(c).every(k=>['schema_version','suites','budget','source','langfuse_config'].includes(k)),'Unknown evaluation configuration field');
 assert(new Set(c.suites.map(s=>s.id)).size===c.suites.length,'Duplicate suite IDs');
 for(const s of c.suites){assert(Object.keys(s).every(k=>['id','runner','triggers','feedback','profile','adapter','dimensions'].includes(k)),'Unknown suite field');assert(/^[a-z][a-z0-9_-]*$/.test(s.id)&&['engineering','preparation','development_e2e','trajectory'].includes(s.runner),'Unknown development suite');assert(!s.feedback||s.feedback==='developer','Only development feedback is supported');assert(!s.profile||['local','full'].includes(s.profile),'Invalid engineering profile');assert(Array.isArray(s.triggers)&&s.triggers.length&&s.triggers.every(x=>typeof x==='string'&&x),'Suite triggers required');if(s.runner==='trajectory')assert((s.dimensions??['F','T']).length&&new Set(s.dimensions??['F','T']).size===(s.dimensions??['F','T']).length&&(s.dimensions??['F','T']).every(x=>['D','I','F','T'].includes(x)),'Invalid trajectory dimensions');}
 for(const k of ['max_jobs','max_wall_ms','max_job_ms','max_judge_calls'])assert(Number.isSafeInteger(c.budget?.[k])&&c.budget[k]>0,'Positive evaluation budget required');
 assert(Object.keys(c.budget).every(k=>['max_jobs','max_wall_ms','max_job_ms','max_judge_calls'].includes(k)),'Unknown evaluation budget field');
 if(c.source){assert(Object.keys(c.source).every(k=>['session_directories','from','delegation_root'].includes(k)),'Unknown source field');assert(Array.isArray(c.source.session_directories)&&c.source.session_directories.length&&c.source.session_directories.every(x=>typeof x==='string'),'Explicit Codex transcript directories required');assert(Number.isFinite(Date.parse(c.source.from)),'Explicit source cutoff required');}
}
async function stateAt(store){const s=await readJSON(await safeFile(store,'state.json'));assert(s.schema_version==='CodexEvaluationState/v1','Invalid evaluation state');validateConfig(s.config);assert(digest(s.config)===s.config_sha256,'Evaluation configuration changed; create a new binding');await noLinks(s.workspace,within(s.workspace,store));return s;}
async function locked(store,fn){const file=join(store,'.state-lock'),h=await open(file,'wx');try{return await fn(await stateAt(store));}finally{await h.close();await unlink(file);}}
async function immutable(file,value){try{await writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;assert(digest(await readJSON(file))===digest(value),'Immutable evaluation record changed');}}
async function signature(){const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='tests'||e.name==='node_modules')continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile()&&(/\.mjs$/.test(e.name)&&!e.name.endsWith('.test.mjs')||e.name.endsWith('.json')))files.push([relative(frameworkRoot,p).replaceAll('\\','/'),sha(await readFile(p))]);}}for(const dir of ['scripts/restore','scripts/trajectory','scripts/evaluation','evals/pipeline','references'])await walk(join(frameworkRoot,dir));for(const name of ['rubrics.json','rubrics-v2.json'])files.push([name,sha(await readFile(join(frameworkRoot,'evals/trajectory',name)))]);return digest(files.sort());}

export async function initEvaluation(store,runRoot,{workspace=frameworkRoot,session_id,config}={}){
 validateConfig(config);assert(typeof session_id==='string'&&session_id,'Explicit Codex session owner required');store=within(workspace,store);runRoot=within(workspace,runRoot);await noLinks(workspace,store);await noLinks(workspace,runRoot);
 const run=await readJSON(join(runRoot,'run.json'));assert(run.schema_version==='restore/v0.2','Restore run required');
 if(config.source)assert(Date.parse(config.source.from)<=Date.now(),'Source starts in the future');
 await mkdir(store,{recursive:true});for(const d of ['checkpoints','jobs','results'])await mkdir(join(store,d),{recursive:true});
 const state={schema_version:'CodexEvaluationState/v1',workspace:resolve(workspace),run_root:runRoot,run_id:run.run_id,session_id,config,config_sha256:digest(config),started_at:now(),job_count:0,judge_calls:0,paused:false,latest_checkpoint:null};
 await writeFile(join(store,'state.json'),JSON.stringify(state,null,2)+'\n',{flag:'wx'});return state;
}

async function target(s){
 await noLinks(s.workspace,s.run_root);const run=await readJSON(join(s.run_root,'run.json'));assert(run.run_id===s.run_id,'Bound Restore run changed');
 const contract=await readJSON(join(s.run_root,'contract.json')),contract_sha256=digest(contract);if(run.contract_sha256)assert(run.contract_sha256===contract_sha256,'Frozen contract changed');
 await noLinks(s.workspace,join(s.run_root,'restored'));let artifact_sha256=null;try{artifact_sha256=await treeHash(join(s.run_root,'restored'));}catch(e){if(e.message!=='Artifact is empty')throw e;}
 return {run,contract,artifact_sha256,contract_sha256,environment_sha256:digest({declared:contract.environment??null,node:process.version,platform:process.platform,selectors:Object.fromEntries(['RESTORE_CAPTURE_PYTHON','RESTORE_SCHEMA_PYTHON','RESTORE_PLAYWRIGHT_MODULE'].map(k=>[k,process.env[k]??null]))}),implementation_sha256:await signature()};
}
const jobKey=(b,suite,adapter_sha256)=>({run_id:b.run_id,artifact:b.artifact_sha256,contract:b.contract_sha256,frozen:suite.runner==='development_e2e'?b.contract_frozen:null,environment:b.environment_sha256,implementation:b.implementation_sha256,suite,adapter_sha256,source:suite.runner==='trajectory'?b.source_cursor:null});
function verifyCheckpoint(c){assert(c.schema_version==='CodexEvaluationCheckpoint/v1'&&digest({...c,checkpoint_id:undefined,schema_version:undefined})===c.checkpoint_id,'Checkpoint metadata changed');}
async function loadJob(store,name,s){
 assert(/^[a-f0-9]{64}\.json$/.test(name),'Invalid job filename');const job=await readJSON(await safeFile(store,'jobs/'+name));assert(job.job_id+'.json'===name,'Job identity changed');
 assert(digest(job.suite)===digest(s.config.suites.find(x=>x.id===job.suite.id)??null),'Job suite identity changed');assert(/^[a-f0-9]{64}$/.test(job.checkpoint_id),'Invalid checkpoint identity');
 const directory=join(store,'checkpoints',job.checkpoint_id),checkpoint=await readJSON(await safeFile(store,'checkpoints/'+job.checkpoint_id+'/checkpoint.json'));verifyCheckpoint(checkpoint);assert(checkpoint.config_sha256===s.config_sha256&&digest(jobKey(checkpoint,job.suite,job.adapter_sha256))===job.job_id,'Job identity changed');return {job,directory,checkpoint};
}
async function sourceView(s,to){
 if(!s.config.source)return null;const src=s.config.source;
 assert(Number.isFinite(Date.parse(to))&&Date.parse(to)>=Date.parse(src.from)&&Date.parse(to)<=Date.now(),'Invalid checkpoint source window');
 const secrets=[];if(s.config.langfuse_config){const c=configFrom(await readFile(resolve(s.workspace,s.config.langfuse_config),'utf8'),{});secrets.push(c.publicKey,c.secretKey,Buffer.from(c.publicKey+':'+c.secretKey).toString('base64'));}
 const files=await discoverSessions(src.session_directories.map(p=>resolve(s.workspace,p)),s.session_id);assert(files.some(f=>f.id===s.session_id),'Bound Codex transcript unavailable');
 const sessions=await collectSessions(files,{from:src.from,to,process_end:to,secrets}),old=await collectInstructionHistory(files,{root_id:s.session_id,before:src.from,secrets});
 const history=createViews(old).sessions.flatMap(s=>s.events).map(e=>({id:e.event_id,at:e.completed_at,text:e.output.text,purpose:e.kind,source:e.source,applicability:'not_inferred'}));
 const specs=src.delegation_root?(await loadDelegationSpecs(within(s.workspace,resolve(s.workspace,src.delegation_root)))).map(x=>({...x,prompt:redactText(x.prompt,secrets),exported_text_redacted:true})):[];
 const views=createViews(sessions,{instruction_history:history,delegation_specs:specs});return {sessions,views,from:src.from,to,cursor_sha256:digest({events:sessions.flatMap(s=>s.events),history,specs}),scope:'checkpoint_window_not_full_task',public_context_only:true};
}

export async function checkpointEvaluation(store,{trigger='checkpoint',cutoff=now()}={}){
 return locked(store,async s=>{
  assert(!s.paused&&!await exists(join(store,'pause.json')),'Evaluation paused');assert(Date.now()-Date.parse(s.started_at)<s.config.budget.max_wall_ms,'Evaluation wall budget exhausted');
  const t=await target(s);if(!t.artifact_sha256)return {status:'waiting_artifact',jobs:[]};const source=await sourceView(s,cutoff),base={run_id:s.run_id,artifact_sha256:t.artifact_sha256,contract_sha256:t.contract_sha256,contract_frozen:!!t.run.contract_sha256,environment_sha256:t.environment_sha256,implementation_sha256:t.implementation_sha256,source_cursor:source?.cursor_sha256??null,config_sha256:s.config_sha256};
  base.source_snapshot_sha256=source?digest(source):null;
  // Admit the whole checkpoint before copying assets or publishing any new Job.
  const planned=[];s.job_count=(await readdir(join(store,'jobs'))).filter(n=>n.endsWith('.json')).length;
  for(const suite of s.config.suites.filter(x=>x.triggers.includes(trigger))){
   const adapter_sha256=suite.adapter?sha(await readFile(await safeFile(s.workspace,suite.adapter))):null;
   const job_id=digest(jobKey(base,suite,adapter_sha256)),path=join(store,'jobs',job_id+'.json');
   planned.push({suite,adapter_sha256,job_id,path,create:!await exists(path)});
  }
  assert(s.job_count+planned.filter(x=>x.create).length<=s.config.budget.max_jobs,'Evaluation job budget exhausted');
  const id=digest(base),directory=join(store,'checkpoints',id);await mkdir(directory,{recursive:true});
  if(!await exists(join(directory,'artifact'))){await cp(join(s.run_root,'restored'),join(directory,'artifact'),{recursive:true,filter:p=>!relative(join(s.run_root,'restored'),p).split(sep).some(x=>['node_modules','.git'].includes(x))});}
  assert(await treeHash(join(directory,'artifact'))===base.artifact_sha256,'Checkpoint artifact changed');
  await immutable(join(directory,'contract.json'),t.contract);if(source)await immutable(join(directory,'source.json'),source);
  const checkpoint={schema_version:'CodexEvaluationCheckpoint/v1',checkpoint_id:id,...base};await immutable(join(directory,'checkpoint.json'),checkpoint);
  const jobs=[];
  for(const {suite,adapter_sha256,job_id,path,create} of planned){
   if(create){await immutable(path,{schema_version:'CodexEvaluationJob/v1',job_id,checkpoint_id:id,suite,adapter_sha256,state:'queued',created_at:now(),result:null});s.job_count++;await writeJSON(join(store,'state.json'),s);}
   jobs.push(job_id);
  }
  s.latest_checkpoint=id;await writeJSON(join(store,'state.json'),s);return {checkpoint_id:id,jobs};
 });
}

async function current(s,checkpoint,job){
 const t=await target(s);return checkpoint.run_id===s.run_id&&checkpoint.artifact_sha256===t.artifact_sha256&&checkpoint.contract_sha256===t.contract_sha256&&checkpoint.environment_sha256===t.environment_sha256&&checkpoint.implementation_sha256===t.implementation_sha256&&(job.suite.runner!=='development_e2e'||checkpoint.contract_frozen===!!t.run.contract_sha256)&&(!job.adapter_sha256||sha(await readFile(await safeFile(s.workspace,job.suite.adapter)))===job.adapter_sha256);
}
export async function signalEvaluation(store,{session_id,trigger,turn_id=null}){const s=await stateAt(store);assert(s.session_id===session_id,'Evaluation owner mismatch');await writeJSON(join(store,'signal.json'),{session_id,trigger,turn_id,at:now()});return {status:'signalled'};}
export async function pauseEvaluation(store,session_id){const s=await stateAt(store);assert(s.session_id===session_id,'Evaluation owner mismatch');await writeJSON(join(store,'pause.json'),{session_id,at:now()});return {status:'paused'};}
export async function resumeEvaluation(store,session_id){return locked(store,async s=>{assert(s.session_id===session_id,'Evaluation owner mismatch');if(await exists(join(store,'pause.json')))await unlink(join(store,'pause.json'));s.paused=false;await writeJSON(join(store,'state.json'),s);return {status:'resumed',started_at:s.started_at,job_count:s.job_count};});}

export async function drainEvaluation(store,{executors={}}={}){
 const file=join(store,'worker.lock');let h;try{h=await open(file,'wx');await h.writeFile(JSON.stringify({pid:process.pid,at:now()}));}catch(e){if(e.code==='EEXIST')return {status:'busy_or_stale_lock'};throw e;}
 const summary={status:'drained',completed:0,stale:0,uncertain:0,failed:0};
 try{
  let s=await stateAt(store);if(await exists(join(store,'pause.json')))return {status:'paused'};
  if(await exists(join(store,'signal.json'))){const signal=await readJSON(join(store,'signal.json'));if(!await exists(join(store,'signal-done.json'))||digest(signal)!==(await readJSON(join(store,'signal-done.json'))).sha256){await checkpointEvaluation(store,{trigger:signal.trigger,cutoff:signal.at});await writeJSON(join(store,'signal-done.json'),{sha256:digest(signal)});}}
  for(const name of (await readdir(join(store,'jobs'))).sort()){
   s=await stateAt(store);if(await exists(join(store,'pause.json')))return {...summary,status:'paused'};
   const path=join(store,'jobs',name),{job,directory,checkpoint}=await loadJob(store,name,s);if(job.state==='running'){job.state='uncertain';await writeJSON(path,job);summary.uncertain++;continue;}if(job.state==='uncertain'){summary.uncertain++;continue;}if(job.state==='failed'){summary.failed++;continue;}if(job.state!=='queued')continue;
   if(!await current(s,checkpoint,job)){job.state='stale';await writeJSON(path,job);summary.stale++;continue;}
   assert(await treeHash(join(directory,'artifact'))===checkpoint.artifact_sha256,'Checkpoint artifact changed');const contract=await readJSON(join(directory,'contract.json'));assert(digest(contract)===checkpoint.contract_sha256,'Checkpoint contract changed');
   const remaining=s.config.budget.max_wall_ms-(Date.now()-Date.parse(s.started_at));if(remaining<=0)return {...summary,status:'budget_exhausted'};
   const judge_calls=job.suite.runner==='trajectory'&&s.config.source?(job.suite.dimensions??['F','T']).length:job.suite.runner==='development_e2e'&&job.suite.adapter?1:0;
   const reserved=await locked(store,async fresh=>{if(fresh.judge_calls+judge_calls>fresh.config.budget.max_judge_calls)return false;fresh.judge_calls+=judge_calls;await writeJSON(join(store,'state.json'),fresh);return true;});if(!reserved)return {...summary,status:'judge_budget_exhausted'};
   assert(!job.result&&!await exists(join(store,'results',job.job_id,'result.json')),'Prior result exists; never replay a completed evaluator');
   job.state='running';job.started_at=now();await writeJSON(path,job); // Never automatically replay an ambiguous external invocation.
   const output=join(store,'results',job.job_id);await mkdir(output,{recursive:true});
   try{
    const source=await exists(join(directory,'source.json'))?await readJSON(join(directory,'source.json')):null;if(source)assert(source.cursor_sha256===checkpoint.source_cursor&&digest(source)===checkpoint.source_snapshot_sha256,'Checkpoint source changed');
    const context={state:s,job,checkpoint,contract,source,artifact_root:join(directory,'artifact'),output_root:output,timeout_ms:Math.min(remaining,s.config.budget.max_job_ms)};
    const result=await (executors[job.suite.runner]??executeSuite)(context);
    assert(result&&typeof result.status==='string','Runner must return an explicit result status');
    assert(await treeHash(join(directory,'artifact'))===checkpoint.artifact_sha256,'Evaluator mutated checkpoint artifact');
    const envelope={schema_version:'CodexEvaluationResult/v1',job_id:job.job_id,checkpoint_id:job.checkpoint_id,artifact_sha256:checkpoint.artifact_sha256,contract_sha256:checkpoint.contract_sha256,feedback:'developer',scope:'development_only',result};
    await immutable(join(output,'result.json'),envelope);job.result={uri:relative(store,join(output,'result.json')).replaceAll('\\','/'),sha256:digest(envelope)};job.state='completed';job.completed_at=now();summary.completed++;
   }catch(e){job.state='failed';job.failure=redactText(e.message);job.completed_at=now();summary.failed++;}
   await writeJSON(path,job);
  }
  if(summary.failed)summary.status='failed';else if(summary.uncertain)summary.status='uncertain';return summary;
 }finally{await h.close();await unlink(file);}
}

export async function evaluationStatus(store,{session_id}={}){
 const s=await stateAt(store);assert(s.session_id===session_id,'Evaluation owner mismatch');const jobs=[],feedback=[],paused=await exists(join(store,'pause.json'));
 for(const name of (await readdir(join(store,'jobs'))).sort()){
  const {job,directory,checkpoint}=await loadJob(store,name,s);jobs.push(job);
  if(job.state!=='completed'||!job.result)continue;const envelope=await readJSON(await safeFile(store,job.result.uri));assert(digest(envelope)===job.result.sha256&&envelope.job_id===job.job_id&&envelope.checkpoint_id===job.checkpoint_id,'Evaluation result changed');
  assert(await treeHash(join(directory,'artifact'))===checkpoint.artifact_sha256,'Checkpoint artifact changed');
  const latest=job.suite.runner==='trajectory'&&s.latest_checkpoint?await readJSON(await safeFile(store,'checkpoints/'+s.latest_checkpoint+'/checkpoint.json')):null;if(latest)verifyCheckpoint(latest);
  if(!paused&&await current(s,checkpoint,job)&&(job.suite.runner!=='trajectory'||latest?.source_cursor===checkpoint.source_cursor))feedback.push({suite:job.suite.id,checkpoint_id:job.checkpoint_id,result:envelope.result});
 }
 return {schema_version:'CodexEvaluationStatus/v1',session_id:s.session_id,run_id:s.run_id,paused,jobs,feedback,acceptance:'not_evaluated',scope:'development_only'};
}
