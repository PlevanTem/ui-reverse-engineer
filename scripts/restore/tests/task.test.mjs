import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, rename, readdir, open, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as core from '../core.mjs';
const execute=promisify(execFile);
const api=()=>import('../task.mjs');
const policy={scope:'website_and_skill_proposals',evaluation:'development',max_wall_ms:3600000,max_runs:3,max_total_rounds:8,max_stop_requests:12,max_stalled_stops:2};

async function fixture(t){
 const base=await mkdtemp(join(tmpdir(),'restore-task-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const root=join(base,'task'),run=join(base,'initial');await core.init(run,'https://example.com');
 return {base,root,run};
}
async function change(run,fn){const value=await core.readJSON(join(run,'run.json'));fn(value);await core.writeJSON(join(run,'run.json'),value);return value;}

test('task preserves pending measure/verify and does not accept a built or merely closed run',async t=>{
 const {root,run}=await fixture(t), task=await api();const initialized=await task.initTask(root,run,policy,'Restore the required website');
 assert.equal(initialized.schema_version,'RestoreTaskStatus/v1');
 assert.equal((await task.statusTask(root)).action,'prepare');
 await change(run,r=>{r.phase='loop';r.pending={round:1,issue_id:'hero',required_states:['home']};});
 assert.equal((await task.statusTask(root)).action,'measure_verify');
 await change(run,r=>{r.pending=null;r.phase='complete';r.stop={reason:'failed'};});
 const state=await task.statusTask(root);assert.notEqual(state.status,'accepted');assert.equal(state.action,'repair_evaluation');
});

test('interruption after begin but before edits resumes candidate build before measurement',async t=>{
 const {root,run}=await fixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 await writeFile(join(run,'restored','index.html'),'<h1>best</h1>');const before=await core.treeHash(join(run,'restored'));
 await change(run,r=>{r.phase='loop';r.pending={round:1,before,issue_id:'hero',required_states:['home']};});
 assert.equal((await task.statusTask(root)).action,'build_candidate');
 await writeFile(join(run,'restored','index.html'),'<h1>candidate</h1>');assert.equal((await task.statusTask(root)).action,'measure_verify');
 await change(run,r=>{r.started_at='2000-01-01T00:00:00.000Z';});assert.equal((await task.statusTask(root)).action,'abort_candidate');
});

test('binding is explicit, repeated Stop is bounded, and unrelated sessions cannot drive task',async t=>{
 const {root,run,base}=await fixture(t), task=await api();await task.initTask(root,run,policy,'Restore');
 const {handleHook}=await import('../hooks.mjs');
 const registry=join(base,'bindings');await task.armTask(root,'owner',registry);
 const event=(turn,extra={})=>({hook_event_name:'Stop',session_id:'owner',turn_id:turn,cwd:base,...extra});
 assert.deepEqual(await handleHook(event('x',{session_id:'other'}),{registry,workspace:base}),{});
 const first=await handleHook(event('1'),{registry,workspace:base});assert.equal(first.decision,'block');
 assert.deepEqual(await handleHook(event('1'),{registry,workspace:base}),first);
 assert.equal((await handleHook(event('2',{stop_hook_active:true}),{registry,workspace:base})).decision,'block');
 const stopped=await handleHook(event('3',{stop_hook_active:true}),{registry,workspace:base});assert.equal(stopped.decision,undefined);
 assert.equal((await core.readJSON(join(root,'task.json'))).status,'waiting');
 assert.equal((await core.readJSON(join(root,'task.json'))).stop_requests,2);
});

test('Interrupt survives session recovery and needs explicit resume without resetting budget',async t=>{
 const {root,run,base}=await fixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 const registry=join(base,'bindings');await task.armTask(root,'owner',registry);
 const {handleHook}=await import('../hooks.mjs');const e={session_id:'owner',turn_id:'one',cwd:base};
 await handleHook({...e,hook_event_name:'Interrupt'},{registry,workspace:base});
 assert.equal((await task.statusTask(root)).status,'paused');
 assert.equal((await handleHook({...e,hook_event_name:'Stop'},{registry,workspace:base})).decision,undefined);
 const before=await core.readJSON(join(root,'task.json'));
 await task.armTask(root,'owner',registry,true);
 const after=await core.readJSON(join(root,'task.json'));assert.equal(after.started_at,before.started_at);assert.equal(after.stop_requests,before.stop_requests);
 const recovery=await handleHook({...e,hook_event_name:'SessionStart'},{registry,workspace:base});
 assert.match(recovery.hookSpecificOutput.additionalContext,/prepare/);
 assert.doesNotMatch(JSON.stringify(recovery),/dimensions|total_100|last_assistant/);
});

test('total budget is persistent and heldout task policy is rejected',async t=>{
 const {root,run}=await fixture(t),task=await api();
 await assert.rejects(()=>task.initTask(root,run,{...policy,evaluation:'heldout'},'Restore'),/development/);
 await task.initTask(root,run,policy,'Restore');
 const state=await core.readJSON(join(root,'task.json'));state.started_at='2000-01-01T00:00:00.000Z';await core.writeJSON(join(root,'task.json'),state);
 assert.equal((await task.statusTask(root)).status,'limited');
});

// Frozen synthetic task exercises the real run controller, final grader and child publication.
async function finalFixture(t,status='incomplete'){
 const f=await fixture(t);const c=await core.readJSON(join(f.run,'contract.json'));
 const bytes=Buffer.from('synthetic evidence');await writeFile(join(f.run,'evidence','ref.bin'),bytes);
 c.observed_url=c.requested_url;c.start_command='open index.html';c.environment={browser:'synthetic',os:'synthetic',dpr:1,locale:'en-US'};
 c.e2e_profile={rubric_version:'site-restore-v1.0',scorer_version:'e2e/v0.2'};
 c.states=[{id:'home',page_id:'home',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_selector:'body',regions:['hero'],steps:[],sentinel:true}];
 c.reference_evidence=[{id:'ref',kind:'screenshot',uri:'evidence/ref.bin',sha256:core.sha(bytes)}];
 c.obligations=['C1','C2','C3'].map((id,i)=>({id,criterion_id:id,state_id:'home',region_id:'hero',expected:'Observed region',method:'comparison',importance:'obvious',required:true,target:3,applicability:i===2?'not_applicable':'applicable',reason:'Static fixture',reference_evidence:['ref']}));
 await core.writeJSON(join(f.run,'contract.json'),c);await writeFile(join(f.run,'restored','index.html'),'<h1>fixture</h1>');
 await core.locked(f.run,'freeze',r=>core.freeze(f.run,r));
 const r=await core.readJSON(join(f.run,'run.json')), request=await core.assessmentInput(f.run,r);
 const a={schema_version:'LoopAssessment/v0.2',binding:request.binding,assessor:{role:'independent',id:'synthetic'},evidence:c.reference_evidence,covered_states:['home'],units:c.obligations.map(o=>({obligation_id:o.id,status:o.applicability==='applicable'?'scored':'not_applicable',score:o.applicability==='applicable'?3:null,reason:'Fixture',evidence:['ref']})),gates:c.runtime_gates.map(g=>({id:g.id,status:'pass',evidence:['ref']})),findings:[],stability:{status:'stable',reason:'Fixture',evidence:['ref']}};
 await core.locked(f.run,'baseline',r=>core.baseline(f.run,r,a));
 const stopped=await core.readJSON(join(f.run,'run.json')), final=await core.finalInput(f.run,stopped);
 const {scoreFinal,REDLINES}=await import('../../../evals/pipeline/grader.mjs');
 const raw={binding:final.binding,assessor:{role:'independent',id:'synthetic'},calibration:{status:'unmeasured'},evidence:c.reference_evidence,covered_states:['home'],dimensions:['layout','style','content','interaction','robustness'].map(id=>({id,status:'scored',score:status==='fail'&&id==='style'?2:3,reason:'Fixture',evidence:['ref']})),redlines:REDLINES.map(id=>({schema_version:'E2ERedlineAssessment/v1',id,applicability:'applicable',status:'pass',severity:'S0',impact:'none',affected_states:['home'],affected_regions:['hero'],reason:'Fixture',evidence:['ref']}))};
 const result=status==='incomplete'?{schema_version:'E2EResultRef/v0.2',binding:final.binding,status,reason:'Judge unavailable',dimensions:[],redlines:[],evidence:[],total_100:null,provisional:true}:scoreFinal(final,raw);
 await core.locked(f.run,'eval-record',r=>core.recordE2E(f.run,r,result));
 return {...f,c};
}

test('incomplete E2E points at setup repair; cannot create a new website run without a bound plan',async t=>{
 const {root,run}=await finalFixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 assert.equal((await task.statusTask(root)).action,'repair_evaluation');
 await assert.rejects(()=>task.handoffTask(root),/plan/);
});

test('verified independent E2E passes accept with provisional label, bad pass labels/hashes do not',async t=>{
 const {root,run}=await finalFixture(t,'pass'),task=await api();await task.initTask(root,run,policy,'Restore');
 const state=await task.statusTask(root);assert.equal(state.status,'accepted');assert.equal(state.provisional,true);
 const r=await core.readJSON(join(run,'run.json')), e=await core.readJSON(core.local(run,r.e2e.uri));
 e.dimensions[0].score=1;await core.writeJSON(core.local(run,r.e2e.uri),e);
 await assert.rejects(()=>task.statusTask(root),/hash|digest|changed/i);
 r.e2e.sha256=core.digest(e);await core.writeJSON(join(run,'run.json'),r);
 await assert.rejects(()=>task.statusTask(root),/status|grader|pass/i);
});

test('plan + handoff is idempotent and never inherits scores or resets task limits',async t=>{
 const {root,run,c}=await finalFixture(t,'fail'),task=await api();await task.initTask(root,run,policy,'Restore');
 const before=await readFile(join(run,'run.json'),'utf8');
 await task.planTask(root,{mode:'continue',hypothesis:'Repair observed style',expected_change:'Improve materials',evidence:c.reference_evidence});
 assert.equal((await task.statusTask(root)).action,'handoff');
 const child=await task.handoffTask(root);assert.equal(child.action,'baseline_measure');
 const again=await task.handoffTask(root);assert.equal(again.active_run,child.active_run);
 const r=await core.readJSON(join(child.active_run,'run.json'));assert.equal(r.baseline,null);assert.equal(r.phase,'baseline');
 assert.equal(await readFile(join(run,'run.json'),'utf8'),before);
 const persisted=await core.readJSON(join(root,'task.json'));assert.equal(persisted.runs.length,2);assert.equal(persisted.policy.max_runs,3);
});

test('proposal saves evidence-linked learning without changing Skill or run files',async t=>{
 const {root,run,c}=await finalFixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 const before=await readFile(join(run,'run.json'),'utf8');
 const p=await task.proposeTask(root,{problem:'Missing evaluation setup',hypothesis:'Check before freeze',proposed_change:'Preflight final request',regression_cases:['synthetic missing profile'],evidence:c.reference_evidence});
 assert.equal((await core.readJSON(core.local(root,p.uri))).status,'proposed');
 assert.equal(await readFile(join(run,'run.json'),'utf8'),before);
});

test('incomplete E2E can refreeze explicit prepared inputs but planned contract drift is rejected',async t=>{
 const {root,run,c,base}=await finalFixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 const source=join(base,'new-contract');await mkdir(join(source,'evidence'),{recursive:true});await cp(join(run,'evidence'),join(source,'evidence'),{recursive:true});
 const planned={...c,start_command:'serve index.html'};await core.writeJSON(join(source,'contract.json'),planned);
 await task.planTask(root,{mode:'refreeze',hypothesis:'Repair frozen evaluation setup',expected_change:'Use prepared entry',contract_source:source,evidence:c.reference_evidence});
 await core.writeJSON(join(source,'contract.json'),{...planned,start_command:'different command'});
 await assert.rejects(()=>task.handoffTask(root),/contract.*changed|source.*changed|planned/i);
 await core.writeJSON(join(source,'contract.json'),planned);const result=await task.handoffTask(root);assert.equal(result.action,'prepare');
 const child=await core.readJSON(join(result.active_run,'run.json'));assert.equal(child.best,null);assert.equal(child.phase,'prepare');
});

test('real CLI and hook stdin return valid JSON with no armed task',async t=>{
 const {base,root,run}=await fixture(t);const policyFile=join(base,'policy.json');await core.writeJSON(policyFile,policy);
 const cli=new URL('../cli.mjs',import.meta.url);const {fileURLToPath}=await import('node:url');
 const result=await execute(process.execPath,[fileURLToPath(cli),'task-init',root,run,policyFile,'Restore']);assert.equal(JSON.parse(result.stdout).action,'prepare');
 const {spawn}=await import('node:child_process');
 const output=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../hooks.mjs',import.meta.url))],{cwd:base});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(new Error(err)));child.stdin.end(JSON.stringify({session_id:'unbound',hook_event_name:'Stop',turn_id:'one',cwd:base}));});
 assert.deepEqual(JSON.parse(output),{});
});

test('duplicate Stop cannot bypass cumulative stop cap',async t=>{
 const {root,run,base}=await fixture(t),task=await api();await task.initTask(root,run,{...policy,max_stop_requests:1},'Restore');
 await task.armTask(root,'owner',join(base,'bindings'));
 const e={hook_event_name:'Stop',session_id:'owner',turn_id:'same',cwd:base};
 assert.equal((await task.taskHook(root,e)).decision,'block');
 assert.equal((await task.taskHook(root,e)).decision,undefined);
 assert.equal((await task.statusTask(root)).status,'limited');
});

test('Interrupt is durable even while a command owns the task lock',async t=>{
 const {root,run,base}=await fixture(t),task=await api();await task.initTask(root,run,policy,'Restore');await task.armTask(root,'owner',join(base,'bindings'));
 const h=await open(join(root,'.task-lock'),'wx');
 try{await task.taskHook(root,{hook_event_name:'Interrupt',session_id:'owner',turn_id:'one'});}finally{await h.close();await rm(join(root,'.task-lock'));}
 assert.equal((await task.statusTask(root)).status,'paused');
 await task.armTask(root,'owner',join(base,'bindings'),true);assert.equal((await task.statusTask(root)).status,'active');
});

test('recovery after child publication before cursor commit adopts the exact child',async t=>{
 const {root,run,c}=await finalFixture(t,'fail'),task=await api();await task.initTask(root,run,policy,'Restore');
 await task.planTask(root,{mode:'continue',hypothesis:'Repair style',expected_change:'Improve',evidence:c.reference_evidence});
 const before=await core.readJSON(join(root,'task.json')),parent=await core.readJSON(join(run,'run.json'));
 const id=core.digest({task:before.task_id,parent:parent.run_id,plan:before.plan.sha256,index:before.runs.length});
 before.pending_handoff={id,mode:'continue',parent_run_id:parent.run_id,parent_run_sha256:core.sha(await readFile(join(run,'run.json'))),parent_events_sha256:core.sha(await readFile(join(run,'events.jsonl'))),child_contract_sha256:parent.contract_sha256,child:`runs/run-2-${id.slice(0,12)}`,stage:`runs/stage-${id}`};
 await core.writeJSON(join(root,'task.json'),before);
 const child=core.local(root,before.pending_handoff.child);await core.continueRun(run,child);
 const childId=(await core.readJSON(join(child,'run.json'))).run_id;
 const recovered=await task.handoffTask(root);assert.equal(recovered.active_run,child);
 assert.equal((await core.readJSON(join(child,'run.json'))).run_id,childId);assert.equal((await readdir(join(root,'runs'))).length,1);
});

test('malformed time budget cannot become an unbounded task',async t=>{
 const {root,run}=await fixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 const state=await core.readJSON(join(root,'task.json'));state.started_at='invalid';await core.writeJSON(join(root,'task.json'),state);
 await assert.rejects(()=>task.statusTask(root),/timestamp|started_at/i);
});

test('linked runs share completed-round and wall limits and cannot exceed max_runs',async t=>{
 const {root,run,c}=await finalFixture(t,'fail'),task=await api();await task.initTask(root,run,{...policy,max_runs:1},'Restore');
 await task.planTask(root,{mode:'continue',hypothesis:'Repair',expected_change:'Improve',evidence:c.reference_evidence});
 await assert.rejects(()=>task.handoffTask(root),/limit/);
 const state=await core.readJSON(join(root,'task.json'));state.policy.max_runs=3;state.policy.max_total_rounds=1;await core.writeJSON(join(root,'task.json'),state);
 await change(run,r=>r.rounds.push({decision:'revert',candidate:null}));
 assert.equal((await task.statusTask(root)).status,'limited');
});

test('recovery from a complete staged child publishes once; a partial stage is preserved',async t=>{
 const {root,run,c}=await finalFixture(t,'fail'),task=await api();await task.initTask(root,run,policy,'Restore');
 await task.planTask(root,{mode:'continue',hypothesis:'Repair',expected_change:'Improve',evidence:c.reference_evidence});
 const state=await core.readJSON(join(root,'task.json')),r=await core.readJSON(join(run,'run.json'));
 const id=core.digest({task:state.task_id,parent:r.run_id,plan:state.plan.sha256,index:state.runs.length});
 const stage=core.local(root,`runs/stage-${id}`);await mkdir(stage,{recursive:true});await writeFile(join(stage,'partial.txt'),'must preserve');
 await assert.rejects(()=>task.handoffTask(root),/ENOENT/);assert.equal(await readFile(join(stage,'partial.txt'),'utf8'),'must preserve');
 await assert.rejects(()=>task.planTask(root,{mode:'continue',hypothesis:'Replace in-flight plan',expected_change:'Different',evidence:c.reference_evidence}),/in.flight/i);
 // Complete a separately preserved interrupted copy, exactly as a maintainer would repair it.
 const partial=stage+'-preserved';await rename(stage,partial);await core.continueRun(run,stage);
 const result=await task.handoffTask(root);assert.equal(result.action,'baseline_measure');
 assert.equal(await readFile(join(partial,'partial.txt'),'utf8'),'must preserve');assert.equal((await core.readJSON(join(root,'task.json'))).runs.length,2);
});

test('compaction checkpoints do not spend Stop requests and fork/subagent events get no context',async t=>{
 const {root,run,base}=await fixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 const registry=join(base,'bindings');await task.armTask(root,'owner',registry);const {handleHook}=await import('../hooks.mjs');
 const common={session_id:'owner',cwd:base,turn_id:'compact'};
 await handleHook({...common,hook_event_name:'PreCompact'},{workspace:base,registry});await handleHook({...common,hook_event_name:'PostCompact'},{workspace:base,registry});
 const recovery=await handleHook({...common,hook_event_name:'SessionStart',source:'compact'},{workspace:base,registry});assert.match(recovery.hookSpecificOutput.additionalContext,/prepare/);
 assert.equal((await core.readJSON(join(root,'task.json'))).stop_requests,0);
 assert.deepEqual(await handleHook({...common,hook_event_name:'Stop',agent_id:'child'},{workspace:base,registry}),{});
 assert.deepEqual(await handleHook({...common,hook_event_name:'SessionStart',source:'fork'},{workspace:base,registry}),{});
});

test('configured command resolves git root from subdirectory and drives a bound task through real stdin',async t=>{
 const {root,run,base}=await fixture(t),task=await api();await task.initTask(root,run,policy,'Restore');
 const repo=join(base,'repo');await mkdir(join(repo,'scripts'),{recursive:true});await mkdir(join(repo,'evals'),{recursive:true});
 await cp(new URL('../',import.meta.url),join(repo,'scripts','restore'),{recursive:true});await cp(new URL('../../../evals/pipeline/',import.meta.url),join(repo,'evals','pipeline'),{recursive:true});
 await execute('git',['init','--quiet',repo]);const registry=join(repo,'reverse_output','restore-task-bindings');await task.armTask(root,'owner',registry);
 const config=await core.readJSON(new URL('../../../.codex/hooks.json',import.meta.url)),handler=config.hooks.Stop[0].hooks[0];
 const {spawn}=await import('node:child_process');
 const call=async turn=>new Promise((resolve,reject)=>{
  const windows=process.platform==='win32';const child=spawn(windows?'powershell.exe':'/bin/sh',windows?['-NoProfile','-NonInteractive','-Command',handler.commandWindows]:['-c',handler.command],{cwd:join(repo,'scripts')});let out='',err='';
  child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(new Error(err)));
  child.stdin.end(JSON.stringify({hook_event_name:'Stop',session_id:'owner',turn_id:turn,cwd:join(repo,'scripts'),stop_hook_active:turn!=='1'}));
 });
 assert.match((await call('1')).reason,/prepare/);
 await change(run,r=>{r.phase='baseline';});
 assert.match((await call('2')).reason,/baseline_measure/);
 const audit=await readFile(join(root,'hook-events.jsonl'),'utf8');assert.match(audit,/stdin_unverified/);
 // This is a shell/adapter integration test, not a native Codex callback.
});
