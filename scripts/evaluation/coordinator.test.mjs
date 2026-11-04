import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import * as restore from '../restore/core.mjs';
import {initEvaluation,checkpointEvaluation,drainEvaluation,evaluationStatus,signalEvaluation,pauseEvaluation,resumeEvaluation} from './coordinator.mjs';

async function fixture(t,suites=[{id:'check',runner:'engineering',profile:'local',triggers:['checkpoint','Stop']}],budget={}){
 const workspace=await mkdtemp(join(tmpdir(),'codex-eval-test-'));
 t.after(async()=>{assert.ok(resolve(workspace).startsWith(resolve(tmpdir())+sep)&&basename(workspace).startsWith('codex-eval-test-'));await rm(workspace,{recursive:true,force:true});});
 const runRoot=join(workspace,'case'),store=join(workspace,'reverse_output/evaluation/case');await restore.init(runRoot,'https://example.com');
 await writeFile(join(runRoot,'restored/index.html'),'<h1>fixture</h1>');
 const config={schema_version:'CodexEvaluationConfig/v1',suites,budget:{max_jobs:8,max_wall_ms:600000,max_job_ms:30000,max_judge_calls:4,...budget}};
 await initEvaluation(store,runRoot,{workspace,session_id:'owner',config});return {workspace,runRoot,store,config};
}
const success=async context=>({status:'passed',scope:'fixture_only',snapshot:await readFile(join(context.artifact_root,'index.html'),'utf8')});

test('checkpoints preserve originals, deduplicate unchanged targets and invalidate changed adapters or artifacts',async t=>{
 const f=await fixture(t),before=await readFile(join(f.runRoot,'run.json'),'utf8');
 const a=await checkpointEvaluation(f.store),b=await checkpointEvaluation(f.store);assert.equal(a.checkpoint_id,b.checkpoint_id);assert.equal(a.jobs[0],b.jobs[0]);
 await writeFile(join(f.runRoot,'restored/index.html'),'<h1>changed</h1>');const c=await checkpointEvaluation(f.store);assert.notEqual(c.jobs[0],a.jobs[0]);
 assert.equal(await readFile(join(f.runRoot,'run.json'),'utf8'),before);
 const result=await drainEvaluation(f.store,{executors:{engineering:success}});assert.equal(result.completed,1);assert.equal(result.stale,1);
 const status=await evaluationStatus(f.store,{session_id:'owner'});assert.equal(status.feedback.length,1);assert.match(status.feedback[0].result.snapshot,/changed/);
 await writeFile(join(f.runRoot,'restored/index.html'),'third');assert.equal((await evaluationStatus(f.store,{session_id:'owner'})).feedback.length,0);
});

test('one accepted Job is not rerun; start markers survive interrupted execution without automatic retry',async t=>{
 const f=await fixture(t);const cp=await checkpointEvaluation(f.store);let calls=0;
 await drainEvaluation(f.store,{executors:{engineering:async c=>{calls++;return success(c);}}});await drainEvaluation(f.store,{executors:{engineering:success}});assert.equal(calls,1);
 const jobPath=join(f.store,'jobs',cp.jobs[0]+'.json'),job=JSON.parse(await readFile(jobPath));job.state='running';delete job.result;await writeFile(jobPath,JSON.stringify(job));
 const r=await drainEvaluation(f.store,{executors:{engineering:async()=>{calls++;return {};}}});assert.equal(r.uncertain,1);assert.equal(calls,1);
});

test('session identity, evaluator visibility and complete pipeline status are not conflated',async t=>{
 const f=await fixture(t);await checkpointEvaluation(f.store);
 await assert.rejects(evaluationStatus(f.store,{session_id:'other'}),/owner/);
 await drainEvaluation(f.store,{executors:{engineering:async()=>({status:'incomplete',reason:'missing evidence'})}});
 const s=await evaluationStatus(f.store,{session_id:'owner'});assert.equal(s.jobs[0].state,'completed');assert.equal(s.feedback[0].result.status,'incomplete');assert.equal(s.acceptance,'not_evaluated');
 const bad={...f.config,suites:[{id:'holdout',runner:'development_e2e',feedback:'release_only',triggers:['Stop']}]};
 await assert.rejects(initEvaluation(join(f.workspace,'bad'),f.runRoot,{workspace:f.workspace,session_id:'owner',config:bad}),/development|feedback/);
});

test('durable signals coalesce, interrupt remains paused and budgets cannot be reset by resume',async t=>{
 const f=await fixture(t);await signalEvaluation(f.store,{session_id:'owner',trigger:'Stop',turn_id:'one'});await signalEvaluation(f.store,{session_id:'owner',trigger:'Stop',turn_id:'one'});
 await pauseEvaluation(f.store,'owner');const paused=await drainEvaluation(f.store,{executors:{engineering:success}});assert.equal(paused.status,'paused');
 await assert.rejects(checkpointEvaluation(f.store),/paused/);
 await resumeEvaluation(f.store,'owner');await drainEvaluation(f.store,{executors:{engineering:success}});
 const a=JSON.parse(await readFile(join(f.store,'state.json')));assert.equal(a.job_count,1);await resumeEvaluation(f.store,'owner');const b=JSON.parse(await readFile(join(f.store,'state.json')));assert.equal(a.started_at,b.started_at);assert.equal(a.job_count,b.job_count);
});

test('modified snapshots and changed result files fail closed; unavailable suites never pass',async t=>{
 const f=await fixture(t,[{id:'e2e',runner:'development_e2e',triggers:['checkpoint']}]);const cp=await checkpointEvaluation(f.store);
 await drainEvaluation(f.store);let s=await evaluationStatus(f.store,{session_id:'owner'});assert.equal(s.feedback[0].result.status,'unavailable');
 const job=JSON.parse(await readFile(join(f.store,'jobs',cp.jobs[0]+'.json')));await writeFile(join(f.store,job.result.uri),'{}');await assert.rejects(evaluationStatus(f.store,{session_id:'owner'}),/result.*changed/i);
});

test('job budget remains cumulative when targets change',async t=>{
 const f=await fixture(t,undefined,{max_jobs:1});
 await checkpointEvaluation(f.store);await writeFile(join(f.runRoot,'restored/index.html'),'new');await assert.rejects(checkpointEvaluation(f.store),/job budget/);
 await drainEvaluation(f.store,{executors:{engineering:success}});const s=await evaluationStatus(f.store,{session_id:'owner'});assert.equal(s.jobs[0].state,'stale');
 assert.equal((await lstat(f.store)).isSymbolicLink(),false);
});

test('symlinked stores cannot bypass workspace and owner checks',async t=>{
 const f=await fixture(t),alias=join(f.workspace,'alias');await symlink(f.store,alias,process.platform==='win32'?'junction':'dir');await assert.rejects(evaluationStatus(alias,{session_id:'owner'}),/Symlink/);
});

test('multi-suite admission cannot partially spend jobs or copy artifacts beyond budget',async t=>{
 const f=await fixture(t,[{id:'one',runner:'engineering',triggers:['checkpoint']},{id:'two',runner:'preparation',triggers:['checkpoint']}],{max_jobs:1});
 await assert.rejects(checkpointEvaluation(f.store),/job budget/);
 assert.equal((await readdir(join(f.store,'jobs'))).length,0);assert.equal((await readdir(join(f.store,'checkpoints'))).length,0);
});

test('tampering with queued suite or snapshot cannot execute an unbound evaluator',async t=>{
 const f=await fixture(t),cp=await checkpointEvaluation(f.store),path=join(f.store,'jobs',cp.jobs[0]+'.json');
 const job=JSON.parse(await readFile(path));job.suite.profile='full';await writeFile(path,JSON.stringify(job));let called=false;
 await assert.rejects(drainEvaluation(f.store,{executors:{engineering:async()=>{called=true;return {};}}}),/suite|identity/);assert.equal(called,false);
});

test('results from a mutated checkpoint and paused tasks are not delivered',async t=>{
 const f=await fixture(t),cp=await checkpointEvaluation(f.store);await drainEvaluation(f.store,{executors:{engineering:success}});
 await pauseEvaluation(f.store,'owner');assert.equal((await evaluationStatus(f.store,{session_id:'owner'})).feedback.length,0);await resumeEvaluation(f.store,'owner');
 await writeFile(join(f.store,'checkpoints',cp.checkpoint_id,'artifact/index.html'),'tampered');await assert.rejects(evaluationStatus(f.store,{session_id:'owner'}),/artifact changed/);
});
