import {mkdir, open, unlink, readFile, rename, lstat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as core from './core.mjs';
import {scoreFinal} from '../../evals/pipeline/grader.mjs';

const VERSION='RestoreTask/v1';
const limits=['max_wall_ms','max_runs','max_total_rounds','max_stop_requests','max_stalled_stops'];
export function validatePolicy(p){
 core.assert(p?.scope==='website_and_skill_proposals'&&p.evaluation==='development','Only development website tasks with Skill proposals are supported');
 core.assert(Object.keys(p).every(k=>['scope','evaluation',...limits].includes(k)),'Unknown task policy field');
 for(const k of limits)core.assert(Number.isSafeInteger(p[k])&&p[k]>0,`Positive finite ${k} required`);
}
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function contractSourceHash(path){return core.digest(await core.readJSON((await lstat(path)).isDirectory()?join(path,'contract.json'):path));}
export async function taskLocked(root,fn){
 root=resolve(root);const lock=join(root,'.task-lock');
 const h=await open(lock,'wx').catch(()=>{throw new Error('Task is locked; inspect the owner before removing a stale .task-lock');});
 try{const task=await core.readJSON(await core.safeFile(root,'task.json'));core.assert(task.schema_version===VERSION,'Invalid task version');validatePolicy(task.policy);
  core.assert(Number.isFinite(Date.parse(task.started_at))&&Date.parse(task.started_at)<=Date.now(),'Invalid started_at timestamp');
  core.assert(['active','paused','waiting','limited','accepted'].includes(task.status)&&[task.stop_requests,task.stalled_stops].every(n=>Number.isSafeInteger(n)&&n>=0),'Invalid task status/counters');
  const result=await fn(task);await core.writeJSON(join(root,'task.json'),task);return result;
 }finally{await h.close();await unlink(lock);}
}
export async function initTask(root,runRoot,policy,objective){
 validatePolicy(policy);core.assert(core.text(objective),'Task objective required');root=resolve(root);runRoot=resolve(runRoot);
 const run=await core.readJSON(join(runRoot,'run.json'));core.assert(run.schema_version===core.VERSION,'Restore run required');
 await mkdir(root,{recursive:true});
 const task={schema_version:VERSION,task_id:randomUUID(),objective,started_at:new Date().toISOString(),policy:{...policy},status:'active',reason:null,owner_session:null,runs:[{root:runRoot,run_id:run.run_id}],active_run:runRoot,stop_requests:0,stalled_stops:0,last_fingerprint:null,last_stop:null,plan:null,pending_handoff:null,proposals:[]};
 // Exclusive creation, unlike atomic replace, must never overwrite an existing task.
 const h=await open(join(root,'task.json'),'wx');try{await h.writeFile(JSON.stringify(task,null,2)+'\n');}finally{await h.close();}
 return statusTask(root);
}
async function boundJSON(root,ref){
 const value=await core.readJSON(await core.safeFile(root,ref.uri));core.assert(core.digest(value)===ref.sha256,'Referenced JSON digest changed');return value;
}
async function finalState(root,run){
 const ref=run.post_run_e2e_review??run.e2e;if(!ref)return null;
 const doc=await boundJSON(root,ref),result=run.post_run_e2e_review?doc.result:doc;
 core.assert(result?.schema_version==='E2EResultRef/v0.2'&&result.status===ref.status,'E2E status mismatch');
 const request=await core.finalInput(root,run);
 core.assert(core.canonical(result.binding??null)===core.canonical(request.binding??null),'Task E2E binding mismatch');
 if(run.post_run_e2e_review)core.assert(doc.run_id===run.run_id&&doc.binding?.artifact_sha256===run.best&&doc.binding?.contract_sha256===run.contract_sha256,'Post-run review binding mismatch');
 if(result.status!=='incomplete'){
  await core.verifyEvidence(root,result.evidence);
  const scored=scoreFinal(request,result);
  core.assert(result.scoring_provenance===scored.scoring_provenance&&result.status===scored.status&&result.total_100===scored.total_100&&result.provisional===scored.provisional,'E2E status/total differs from authoritative grader');
 }
 return {result,sha256:ref.sha256};
}
async function facts(task){
 core.assert(task.runs.length>0&&task.runs.at(-1).root===task.active_run,'Invalid active task run');
 let rounds=0;const runs=[];
 for(const entry of task.runs){const run=await core.readJSON(join(entry.root,'run.json'));core.assert(run.run_id===entry.run_id&&run.schema_version===core.VERSION,'Task run identity changed');rounds+=run.rounds.length;runs.push(run);}
 const run=runs.at(-1),root=task.active_run;
 const c=run.contract_sha256?await core.contract(root,run):await core.readJSON(join(root,'contract.json'));
 const final=run.stop?await finalState(root,run):null;
 let working=null;try{working=await core.treeHash(join(root,'restored'));}catch(e){if(!/Artifact is empty/.test(e.message))throw e;}
 const fingerprint=core.digest({run_id:run.run_id,phase:run.phase,contract:core.digest(c),best:run.best,baseline:run.baseline,pending:run.pending,rounds:run.rounds.map(r=>({candidate:r.candidate,decision:r.decision,assessment:r.assessment})),static_checks:run.static_checks,final:final?.sha256??null,working,plan:task.plan?.sha256??null,pending_handoff:task.pending_handoff?.id??null});
 return {run,rounds,final,fingerprint,working};
}
async function derive(root,task){
 const interrupt=join(root,'interrupt.json');
 if(await exists(interrupt)){const marker=await core.readJSON(interrupt);if(marker.session_id===task.owner_session){task.status='paused';task.reason='User interrupted';}}
 const f=await facts(task),remaining=Math.max(0,task.policy.max_wall_ms-(Date.now()-Date.parse(task.started_at)));
 let action,reason=null;
 // Recheck integrity even after acceptance. A persisted status is not proof of completion.
 if(f.final?.result.status==='pass'&&f.run.phase==='complete'&&!f.run.pending){task.status='accepted';action='accepted';}
 else if(task.status==='paused'||task.status==='waiting'){action='none';reason=task.reason;}
 else if(remaining===0||task.stop_requests>=task.policy.max_stop_requests||f.rounds>=task.policy.max_total_rounds){task.status='limited';action='none';reason='Cumulative task budget exhausted';}
 else{
  task.status='active';
  if(task.pending_handoff)action='handoff';
  else if(f.run.phase==='prepare')action='prepare';
  else if(f.run.pending)action=core.budget(f.run).repair_remaining_ms===0?'abort_candidate':f.working===f.run.pending.before?'build_candidate':'measure_verify';
  else if(f.run.phase==='baseline')action='baseline_measure';
  else if(!f.run.stop)action='loop_next';
  else if(!f.final)action=f.run.phase==='complete'?'repair_evaluation':'final_e2e';
  else if(task.plan)action='handoff';
  else action=f.final.result.status==='incomplete'?'repair_evaluation':'learn_plan';
  if(action==='handoff'&&task.runs.length>=task.policy.max_runs){task.status='limited';action='none';reason='Cumulative run limit reached';}
 }
 task.reason=reason;
 return {schema_version:'RestoreTaskStatus/v1',task_id:task.task_id,status:task.status,action,active_run:task.active_run,remaining_ms:remaining,completed_rounds:f.rounds,run_count:task.runs.length,provisional:f.final?.result.provisional??null,reason,fingerprint:f.fingerprint};
}
export const statusTask=root=>taskLocked(root,task=>derive(root,task));
export async function pauseTask(root,reason,status='paused'){
 core.assert(core.text(reason)&&['paused','waiting'].includes(status),'Pause/wait reason required');
 return taskLocked(root,task=>{task.status=status;task.reason=reason;return {status,reason};});
}
export async function armTask(root,session,registry,resume=false){
 core.assert(core.text(session)&&core.text(registry),'Explicit session and registry required');root=resolve(root);registry=resolve(registry);
 return taskLocked(root,async task=>{
  core.assert(!['paused','waiting'].includes(task.status)||resume,'Explicit task-resume required');
  const file=join(registry,`${core.sha(session)}.json`);await mkdir(registry,{recursive:true});
  if(await exists(file)){const prior=await core.readJSON(file);core.assert(prior.task_root===root&&prior.task_id===task.task_id,'Session is already bound to another task');}
  task.owner_session=session;if(resume){if(await exists(join(root,'interrupt.json')))await unlink(join(root,'interrupt.json'));task.status='active';task.reason=null;task.stalled_stops=0;task.last_fingerprint=null;task.last_stop=null;}
  // Write both identities; a stale old-session pointer cannot match a transferred task.
  await core.writeJSON(file,{schema_version:'RestoreTaskBinding/v1',task_root:root,task_id:task.task_id,session_id:session});
  return {task_id:task.task_id,session_id:session,armed:true,status:task.status,host_activation:'unverified'};
 });
}
export async function planTask(root,plan){
 return taskLocked(root,async task=>{
  core.assert(!task.pending_handoff,'Cannot replace an in-flight handoff plan');
  const state=await derive(root,task);core.assert(state.status==='active'&&['learn_plan','repair_evaluation','handoff'].includes(state.action),'Plan requires a closed development run');
  core.assert(['continue','refreeze'].includes(plan.mode)&&core.text(plan.hypothesis)&&core.text(plan.expected_change),'Plan mode/hypothesis/expected change required');
  const run=await core.readJSON(join(task.active_run,'run.json'));core.assert(run.phase==='complete'&&run.stop&&!run.pending,'Plan requires finalized run');
  const final=await finalState(task.active_run,run);core.assert(final,'Plan requires recorded development E2E');
  if(final.result.status==='incomplete')core.assert(plan.mode==='refreeze','Incomplete E2E needs evaluation repair or explicit contract refreeze, not blind website rebuild');
  await core.verifyEvidence(task.active_run,plan.evidence);
  if(plan.mode==='refreeze')core.assert(core.text(plan.contract_source),'Explicit refreeze contract source required');
  core.assert(Object.keys(plan).every(k=>['mode','hypothesis','expected_change','evidence','contract_source'].includes(k)),'Unknown plan field');
  const doc={schema_version:'RestoreTaskPlan/v1',...plan,source_run_id:run.run_id,source_result_sha256:final.sha256};
  if(plan.mode==='refreeze'){doc.contract_source=resolve(plan.contract_source);doc.source_contract_sha256=await contractSourceHash(doc.contract_source);}
  const hash=core.digest(doc),uri=`plans/${hash}.json`;await mkdir(join(root,'plans'),{recursive:true});await core.writeJSON(core.local(root,uri),doc);
  task.plan={uri,sha256:hash};return task.plan;
 });
}
async function verifyChild(child,operation){
 const r=await core.readJSON(join(child,'run.json')),lineage=await core.readJSON(await core.safeFile(child,'lineage.json'));
 core.assert(core.digest(lineage)===r.lineage?.sha256&&lineage.child_run_id===r.run_id&&lineage.parent.run_id===operation.parent_run_id&&lineage.parent.run_json_sha256===operation.parent_run_sha256&&lineage.parent.events_jsonl_sha256===operation.parent_events_sha256,'Child lineage mismatch; preserve directory for inspection');
 core.assert(lineage.relationship===(operation.mode==='refreeze'?'contract_refreeze':'continuation'),'Child relationship mismatch');
 core.assert(core.digest(await core.readJSON(join(child,'contract.json')))===operation.child_contract_sha256,'Child planned contract changed');
 if(operation.mode==='refreeze')core.assert(lineage.contract_refreeze?.source.canonical_sha256===operation.child_contract_sha256,'Child refreeze source changed');
 core.assert(await core.treeHash(join(child,'restored'))===lineage.inherited.artifact_sha256,'Child inherited artifact changed');
 core.assert(!r.best&&!r.baseline&&!r.pending&&r.rounds.length===0,'Unadopted child must be an untouched new run');
 return r;
}
export async function handoffTask(root){
 return taskLocked(root,async task=>{
  // Retrying after the atomic task cursor commit returns the existing child.
  if(!task.plan&&!task.pending_handoff&&task.runs.length>1)return derive(root,task);
  core.assert(task.plan,'A bound learning plan is required before handoff');
  const state=await derive(root,task);core.assert(state.action==='handoff'&&state.status==='active','Task cannot hand off within current limits');
  const plan=await boundJSON(root,task.plan),parent=await core.readJSON(join(task.active_run,'run.json')),final=await finalState(task.active_run,parent);
  core.assert(plan.source_run_id===parent.run_id&&plan.source_result_sha256===final?.sha256,'Stale learning plan');await core.verifyEvidence(task.active_run,plan.evidence);
  if(plan.mode==='refreeze')core.assert(await contractSourceHash(plan.contract_source)===plan.source_contract_sha256,'Planned contract source changed');
  if(!task.pending_handoff){
   const id=core.digest({task:task.task_id,parent:parent.run_id,plan:task.plan.sha256,index:task.runs.length});
   task.pending_handoff={id,mode:plan.mode,parent_run_id:parent.run_id,parent_run_sha256:core.sha(await readFile(join(task.active_run,'run.json'))),parent_events_sha256:core.sha(await readFile(join(task.active_run,'events.jsonl'))),child_contract_sha256:plan.mode==='refreeze'?plan.source_contract_sha256:parent.contract_sha256,child:`runs/run-${task.runs.length+1}-${id.slice(0,12)}`,stage:`runs/stage-${id}`};
   // Durable intent precedes child publication; rerun adopts only this exact operation.
   await core.writeJSON(join(root,'task.json'),task);
  }
  const op=task.pending_handoff,child=core.local(root,op.child),stage=core.local(root,op.stage);
  core.assert(core.sha(await readFile(join(task.active_run,'run.json')))===op.parent_run_sha256&&core.sha(await readFile(join(task.active_run,'events.jsonl')))===op.parent_events_sha256,'Parent changed during handoff');
  if(!await exists(child)){
   if(!await exists(stage)){
    await mkdir(join(root,'runs'),{recursive:true});
    if(plan.mode==='refreeze')await core.refreezeRun(task.active_run,stage,plan.contract_source);else await core.continueRun(task.active_run,stage);
   }
   // A crash during copying leaves a partial stage: fail closed, do not delete or duplicate it.
   await verifyChild(stage,op);await rename(stage,child);
  }
  const childRun=await verifyChild(child,op);task.runs.push({root:child,run_id:childRun.run_id});task.active_run=child;task.plan=null;task.pending_handoff=null;
  return derive(root,task);
 });
}
export async function proposeTask(root,proposal){
 return taskLocked(root,async task=>{
  core.assert(['problem','hypothesis','proposed_change'].every(k=>core.text(proposal[k]))&&Array.isArray(proposal.regression_cases)&&proposal.regression_cases.length>0&&proposal.regression_cases.every(core.text),'Proposal problem/hypothesis/change/regression cases required');
  await core.verifyEvidence(task.active_run,proposal.evidence);
  const doc={schema_version:'RestoreSkillProposal/v1',status:'proposed',task_id:task.task_id,run_id:task.runs.at(-1).run_id,problem:proposal.problem,hypothesis:proposal.hypothesis,proposed_change:proposal.proposed_change,regression_cases:proposal.regression_cases,evidence:proposal.evidence};
  const hash=core.digest(doc),ref={uri:`proposals/${hash}.json`,sha256:hash};await mkdir(join(root,'proposals'),{recursive:true});await core.writeJSON(core.local(root,ref.uri),doc);
  if(!task.proposals.some(p=>p.sha256===hash))task.proposals.push(ref);return ref;
 });
}
export function recoveryText(root,state){
 return `Restore development task ${state.task_id}: ${state.status}. Next action: ${state.action}. Task: ${resolve(root)}/task.json; active run: ${state.active_run}. Read references/restore.md and references/restore/interfaces.md#任务连续性. Reconcile with task-status before work. Resume this exact stage; preserve prior runs, cumulative limits, evidence and keep/revert decisions. A build or report is not acceptance. Use development evidence only; Skill changes are proposals. Do the next authorized action and verify it, then recheck task-status. Remaining task wall budget: ${state.remaining_ms} ms.`;
}
export async function taskHook(root,event){
 if(event.hook_event_name==='Interrupt'){
  const task=await core.readJSON(await core.safeFile(root,'task.json'));if(task.owner_session!==event.session_id)return {};
  // Interrupt has a short host deadline. Record independently of a long handoff lock.
  await core.writeJSON(join(root,'interrupt.json'),{session_id:event.session_id,turn_id:event.turn_id??null,at:new Date().toISOString()});
  return {systemMessage:'Restore task paused; checkpoint preserved. Explicit task-resume is required.'};
 }
 return taskLocked(root,async task=>{
  if(task.owner_session!==event.session_id)return {};
  const kind=event.hook_event_name;
  const state=await derive(root,task);
  if(kind==='Stop'){
   core.assert(core.text(event.turn_id),'Stop hook requires turn_id for idempotency');
   if(state.status==='active'&&task.last_stop?.turn_id===event.turn_id&&task.last_stop.fingerprint===state.fingerprint)return task.last_stop.output;
   let output={};
   if(state.status==='active'){
    task.stalled_stops=task.last_fingerprint===state.fingerprint?task.stalled_stops+1:0;
    if(task.stalled_stops>=task.policy.max_stalled_stops){task.status='waiting';task.reason='Repeated Stop without authoritative progress';output={systemMessage:task.reason};}
    else{task.stop_requests++;output={decision:'block',reason:recoveryText(root,state)};}
   }
   task.last_fingerprint=state.fingerprint;task.last_stop={turn_id:event.turn_id,fingerprint:state.fingerprint,output};
   return output;
  }
  if(kind==='SessionStart')return {hookSpecificOutput:{hookEventName:kind,additionalContext:recoveryText(root,state)}};
  // Pre/PostCompact persist a recomputed checkpoint; SessionStart(source=compact) reinjects it.
  return {};
 });
}
