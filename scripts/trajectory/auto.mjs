import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,open,unlink} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {collectSessions,collectInstructionHistory,discoverSessions,projectTraces,redactText} from './collector.mjs';
import {createViews} from './views.mjs';
import {buildEvidencePayload} from './evidence.mjs';
import {loadDelegationSpecs} from './delegation.mjs';
import {configFrom} from './langfuse-pilot.mjs';
import {buildPayload,loadRubrics,runCodexJudge,validateJudgment,dimensionScores} from './judge.mjs';
import {sendTraces,registerEvaluators,judgeTrace,judgeFailureTrace,verifyCloudScores} from './transport.mjs';
export const workspaceRoot=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>readFile(p,'utf8').then(JSON.parse),save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function maybe(p){try{return await read(p);}catch(e){if(e.code!=='ENOENT')throw e;return null;}}
function within(workspace,path){const rel=relative(resolve(workspace),resolve(path));assert.ok(!rel.startsWith('..')&&!isAbsolute(rel),'Automatic output/run must stay in this workspace');return resolve(path);}
const attrs=s=>Object.fromEntries(s.attributes.map(a=>[a.key,a.value.stringValue]));

export function taskStart(sources,before){let found=null;for(const source of sources)for(const line of source.split('\n')){try{const r=JSON.parse(line);if(r.type==='event_msg'&&r.payload?.type==='task_started'&&Date.parse(r.timestamp)<=Date.parse(before)&&(!found||Date.parse(r.timestamp)>Date.parse(found)))found=r.timestamp;}catch{}}return found;}
export function captureEnd(sources,completedAt,now=new Date().toISOString()){const end=Date.parse(completedAt);assert.ok(Number.isFinite(end),'Completed run lacks a durable completion time');let boundary=Math.min(Date.parse(now),end+30000);for(const source of sources)for(const line of source.split('\n')){try{const r=JSON.parse(line),at=Date.parse(r.timestamp);if(r.type==='event_msg'&&at>=end&&['task_complete','task_started'].includes(r.payload?.type))boundary=Math.min(boundary,at-(r.payload.type==='task_started'?1:0));}catch{}}return new Date(boundary).toISOString();}
export async function settingsFor(workspace=workspaceRoot){return await maybe(join(workspace,'reverse_output/trajectory/auto-settings.json'));}
export async function armAutomatic(runRoot,{workspace=workspaceRoot,settings,env=process.env,outRoot,start=true}={}){
 settings??=await settingsFor(workspace);if(!settings?.enabled)return null;for(const k of ['from','process_end'])if(settings[k]!==undefined)assert.ok(typeof settings[k]==='string'&&Number.isFinite(Date.parse(settings[k])),`Invalid trajectory ${k}`);for(const [k,min,max] of [['watch_ms',0,14400000],['poll_ms',1000,60000]])if(settings[k]!==undefined)assert.ok(Number.isInteger(settings[k])&&settings[k]>=min&&settings[k]<=max,`Invalid trajectory ${k}`);runRoot=within(workspace,runRoot);const run=await read(join(runRoot,'run.json'));
 const owner=settings.root_session_id??env.CODEX_THREAD_ID??env.CODEX_SESSION_ID;if(!owner)return {status:'not_bound',reason:'No explicit or host session ID; no unrelated transcript guessed'};
 assert.match(run.run_id,/^[a-zA-Z0-9_-]+$/);outRoot=within(workspace,outRoot??join(workspace,'reverse_output/trajectories',run.run_id));await mkdir(outRoot,{recursive:true});const bindingPath=join(outRoot,'binding.json');let binding=await maybe(bindingPath);
 if(binding&&binding.root_session_id!==owner)return {status:'owner_mismatch',binding_path:bindingPath};
 if(binding){assert.equal(binding.run_id,run.run_id,'Binding belongs to another run');assert.equal(resolve(binding.run_root),runRoot,'Binding points to another run directory');}
 if(!binding){const prepared=await maybe(join(outRoot,'projection.json')),capture=await maybe(join(outRoot,'capture-config.json')),a=prepared?.traces?.[0]?.spans?.[0]?attrs(prepared.traces[0].spans[0]):{};
  if(prepared){assert.equal(a['langfuse.observation.metadata.restore_run_id'],run.run_id,'Prepared capture belongs to another run');assert.equal(capture?.root_session_id,owner,'Prepared session owner differs');}
  binding={schema_version:'AutomaticTrajectoryBinding/v1',view_version:prepared?(a['langfuse.observation.metadata.restore_schema']==='AgentTrajectory/v2'?2:1):2,workspace:resolve(workspace),run_root:runRoot,run_id:run.run_id,out_root:outRoot,root_session_id:owner,from:settings.from??capture?.from??null,from_source:settings.from?'explicit':capture?.from?'prepared_capture':'pending_native_task_boundary',process_end:settings.process_end??capture?.process_end??null,task_id:settings.task_id??a['langfuse.session.id']??run.run_id,capture_id:settings.capture_id??a['langfuse.observation.metadata.restore_capture_id']??randomUUID(),config_path:resolve(workspace,settings.config_path??'reverse_output/langfuse/.env.local'),session_home:settings.session_home??join(homedir(),'.codex/sessions'),session_directories:settings.session_directories??capture?.session_directories??null,watch_ms:Math.min(settings.watch_ms??14400000,14400000),poll_ms:Math.max(1000,settings.poll_ms??5000),created_at:new Date().toISOString()};await save(bindingPath,binding);
 }
 if(!start)return {status:'bound',binding_path:bindingPath};const state=await maybe(join(outRoot,'automatic-status.json'));if(state?.status==='complete')return {status:'complete',binding_path:bindingPath,result:state.result};
 if(state&&Date.now()-Date.parse(state.at)<30000&&state.pid){try{process.kill(state.pid,0);return {status:state.status,binding_path:bindingPath,pid:state.pid};}catch(e){if(e.code==='EPERM')return {status:'running_unverified',binding_path:bindingPath};}}
 const log=await open(join(outRoot,'automatic.log'),'a');let child;try{child=spawn(process.execPath,[fileURLToPath(new URL('./cli.mjs',import.meta.url)),'worker',bindingPath],{cwd:workspace,windowsHide:true,detached:true,stdio:['ignore',log.fd,log.fd]});await new Promise((ok,bad)=>{child.once('spawn',ok);child.once('error',bad);});child.unref();}catch(e){await save(join(outRoot,'automatic-status.json'),{schema_version:'AutomaticTrajectoryStatus/v1',status:'failed',stage:'worker_start',at:new Date().toISOString(),reason:redactText(e.message)});throw e;}finally{await log.close();}
 return {status:'worker_started',pid:child.pid,binding_path:bindingPath,completion:'Inspect automatic-status.json; startup alone is not delivery proof'};
}
export async function afterRestoreCommand(runRoot,options={}){const rel=relative(options.workspace??workspaceRoot,resolve(runRoot));if(rel.startsWith('..')||isAbsolute(rel))return null;try{return await armAutomatic(runRoot,options);}catch(e){return {status:'automatic_error',reason:redactText(e.message),completion:'Trajectory not verified; website result remains separate'};}}
async function sessionDirectories(home){const dirs=[];async function visit(path,depth){if(depth===3){dirs.push(path);return;}for(const e of await readdir(path,{withFileTypes:true}))if(e.isDirectory()&&!e.isSymbolicLink()&&/^\d+$/.test(e.name))await visit(join(path,e.name),depth+1);}await visit(home,0);return dirs;}

export async function executePrepared({projection,outRoot,config,run,sessions,contract,facts=[],binding={},views=null},deps={}){
 const send=deps.send??sendTraces,register=deps.register??registerEvaluators,judge=deps.judge??runCodexJudge;
 const capture=await send(projection.traces,join(outRoot,'capture-delivery'),config);if(capture.status!=='pass')return {status:'incomplete',stage:'capture_readback',capture};
 if(run.phase!=='complete'||!run.stop?.at)return {status:'partial',stage:'case_not_complete',capture,judges:'not_run',reason:'No completed run and frozen loop boundary'};
 const dimensions=binding.judge_dimensions??['D','I','F','T'],version=views?2:1;assert.ok(dimensions.length&&new Set(dimensions).size===dimensions.length&&dimensions.every(d=>['D','I','F','T'].includes(d)),'Invalid Judge dimensions');const rubrics=await loadRubrics({version}),judgments=[],packets={};
 for(const d of dimensions){const path=join(outRoot,'judges',d,'native-default');await mkdir(path,{recursive:true});packets[d]=await maybe(join(path,'payload.json'))??(views?buildEvidencePayload(d,views,{...contract,contract_sha256:run.contract_sha256},facts):buildPayload(d,sessions,{...contract,contract_sha256:run.contract_sha256},facts,rubrics));await save(join(path,'payload.json'),packets[d]);}
 await save(join(outRoot,'payload-inspect.json'),Object.fromEntries(Object.entries(packets).map(([d,p])=>[d,{schema:p.schema_version,characters:JSON.stringify(p).length,readiness:p.readiness??p.selection}])));await register(config,join(outRoot,'platform'),{version,dimensions});
 let dimension;try{for(const d of dimensions){dimension=d;const path=join(outRoot,'judges',d,'native-default');let result=await maybe(join(path,'result.json'));
  if(result){const payload=await read(join(path,'payload.json')),execution=await read(join(path,'execution.json'));assert.equal(execution.payload_sha256,hash(payload),'Stored Judge payload changed');assert.equal(execution.exit_code,0);result=validateJudgment(result,payload);judgments.push({result,execution});continue;}
  assert.ok(!await maybe(join(path,'execution.json'))&&!await maybe(join(path,'attempt.json')),'Prior Judge attempt failed or was interrupted; preserve it and explicitly create a new attempt/capture before retry');
  const payload=packets[d];await judge(payload,path);judgments.push({result:await read(join(path,'result.json')),execution:await read(join(path,'execution.json'))});
 }}catch(e){const path=join(outRoot,'judges',dimension,'native-default'),execution=await maybe(join(path,'execution.json'))??await maybe(join(path,'attempt.json'))??{},failure=redactText(e.message,[config.publicKey,config.secretKey]);const trace=judgeFailureTrace(dimension,execution,failure,{task_id:binding.task_id??run.run_id,capture_id:binding.capture_id??run.run_id,source_trace_id:projection.traces[0].traceId});await save(join(outRoot,'judge-failure-trace.json'),trace);try{await send([trace],join(outRoot,'judge-failure-delivery'),config);}catch(deliveryError){await save(join(outRoot,'judge-failure-upload.json'),{status:'incomplete',reason:redactText(deliveryError.message,[config.publicKey,config.secretKey])});}throw e;}
 let trace=await maybe(join(outRoot,'judges-trace.json'));if(!trace){trace=judgeTrace(judgments,{task_id:binding.task_id??run.run_id,capture_id:binding.capture_id??run.run_id,source_trace_id:projection.traces[0].traceId,rubric_version:rubrics.version});await save(join(outRoot,'judges-trace.json'),trace);}
 const delivery=await send([trace],join(outRoot,'judge-delivery'),config);if(delivery.status!=='pass')return {status:'incomplete',stage:'judge_readback',capture,delivery};
 const scores=await (deps.verify??verifyCloudScores)(config,trace,judgments,join(outRoot,'judge-delivery'));const summary={status:scores.status==='pass'?'complete':'incomplete',capture,delivery,scores,assessment:dimensionScores(judgments.map(j=>j.result))};await save(join(outRoot,'automatic-result.json'),summary);return summary;
}

export async function runWorker(bindingPath,{execute=executePrepared,settleMs=2000}={}){
 const b=await read(bindingPath);assert.equal(b.schema_version,'AutomaticTrajectoryBinding/v1');within(b.workspace,b.out_root);const lockPath=join(b.out_root,'worker.lock');let lock;try{lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));}catch(e){if(e.code==='EEXIST')return {status:'already_running_or_stale_lock',reason:'Inspect lock owner before explicit recovery'};throw e;}
 const state=async(status,extra={})=>save(join(b.out_root,'automatic-status.json'),{schema_version:'AutomaticTrajectoryStatus/v1',status,pid:process.pid,at:new Date().toISOString(),...extra});
 try{
  let run;const deadline=Date.now()+b.watch_ms;do{run=await read(join(b.run_root,'run.json'));assert.equal(run.run_id,b.run_id);if(run.phase==='complete')break;await state('waiting',{phase:run.phase});await pause(b.poll_ms);}while(Date.now()<deadline);
  await state('collecting',{phase:run.phase});const config=configFrom(await readFile(b.config_path,'utf8'),{}),secrets=[config.publicKey,config.secretKey,Buffer.from(config.publicKey+':'+config.secretKey).toString('base64')];
  let projection=await maybe(join(b.out_root,'projection.json')),sessions=await maybe(join(b.out_root,'sessions.json')),views=await maybe(join(b.out_root,'views.json'));
  if(!projection){await pause(settleMs);const files=await discoverSessions(b.session_directories??await sessionDirectories(b.session_home),b.root_session_id);assert.ok(files.length,'No bound host transcripts available');
   const sources=[];for(const f of files.filter(f=>f.id===b.root_session_id))sources.push(await readFile(f.path,'utf8'));
   if(!b.from){b.from=taskStart(sources,run.started_at)??run.started_at;b.from_source=taskStart(sources,run.started_at)?'host_task_started':'run_initialization_only';await save(bindingPath,b);}
   assert.ok(Number.isFinite(Date.parse(b.from)),'Invalid bound start');let to=new Date().toISOString();if(run.phase==='complete'){const ledger=(await readFile(join(b.run_root,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),closed=ledger.find(e=>e.phase==='complete')?.at;to=captureEnd(sources,closed,to);}
   const scope={from:b.from,to,process_end:b.process_end??run.stop?.at??null};sessions=await collectSessions(files,{...scope,secrets});
   if(b.view_version===2){const old=await collectInstructionHistory(files,{root_id:b.root_session_id,before:b.from,secrets}),prior=createViews(old);const history=prior.sessions.flatMap(s=>s.events).map(e=>({id:e.event_id,at:e.completed_at,text:e.output.text,purpose:e.kind,source:e.source,source_ids:e.message?.source_event_ids??[e.event_id],applicability:'not_inferred'}));const specs=(await loadDelegationSpecs(b.out_root)).map(s=>({...s,prompt:redactText(s.prompt,secrets),exported_text_redacted:true}));views=createViews(sessions,{instruction_history:history,delegation_specs:specs});await save(join(b.out_root,'views.json'),views);}
   projection=projectTraces(sessions,{task_id:b.task_id,capture_id:b.capture_id,run_id:b.run_id,views});assert.ok(projection.traces.length,'No host events in the bound window');
   await save(join(b.out_root,'capture-config.json'),{root_session_id:b.root_session_id,...scope,session_directories:b.session_directories,from_source:b.from_source});await save(join(b.out_root,'sessions.json'),sessions);await save(join(b.out_root,'projection.json'),projection);
  }
  assert.ok(Array.isArray(sessions));const a=attrs(projection.traces[0].spans[0]);assert.equal(a['langfuse.observation.metadata.restore_run_id'],b.run_id);assert.equal(a['langfuse.observation.metadata.restore_capture_id'],b.capture_id);
  const contract=await read(join(b.run_root,'contract.json')),facts=await maybe(join(b.out_root,'facts.json'))??[{id:'restore-controller-binding',scope:'controller_state_only_not_source_originality_proof',run_id:run.run_id,contract_sha256:run.contract_sha256,artifact_sha256:run.best,stop_reason:run.stop?.reason}];
  await state('delivering_and_judging');const result=await execute({projection,outRoot:b.out_root,config,run,sessions,contract,facts,binding:b,views});await state(result.status,{result});return result;
 }catch(e){await state('failed',{reason:redactText(e.message),retry:'Inspect receipts/failed attempts; do not blindly resend uncertain writes or rerun Judges'});throw e;}
 finally{await lock.close();await unlink(lockPath);}
}
