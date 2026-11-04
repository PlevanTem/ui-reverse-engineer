import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import * as core from '../restore/core.mjs';
import {bindCodexEvaluation,afterCodexCommand,handleEvaluationHook} from './codex.mjs';
import {drainEvaluation,evaluationStatus} from './coordinator.mjs';
import {initTask,armTask} from '../restore/task.mjs';
import {handleHook} from '../restore/hooks.mjs';

test('Codex hook queues durable work, isolates sessions/forks and preserves Interrupt',async t=>{
 const workspace=await mkdtemp(join(tmpdir(),'codex-eval-host-'));t.after(async()=>{assert.ok(resolve(workspace).startsWith(resolve(tmpdir())+sep)&&basename(workspace).startsWith('codex-eval-host-'));await rm(workspace,{recursive:true,force:true});});
 const run=join(workspace,'case'),store=join(workspace,'reverse_output/evaluation/case');await core.init(run,'https://example.com');await writeFile(join(run,'restored/index.html'),'fixture');
 const config={schema_version:'CodexEvaluationConfig/v1',suites:[{id:'engineering',runner:'engineering',triggers:['record','Stop']}],budget:{max_jobs:4,max_wall_ms:600000,max_job_ms:30000,max_judge_calls:1}};
 const options={workspace,session_id:'owner',start:false};await bindCodexEvaluation(store,run,config,options);
 await bindCodexEvaluation(store,run,config,options);assert.equal(JSON.parse(await readFile(join(store,'state.json'))).job_count,0);
 assert.equal(await afterCodexCommand(run,'record',{...options,session_id:'other'}),null);
 assert.deepEqual(await handleEvaluationHook({hook_event_name:'Stop',session_id:'owner',agent_id:'child',cwd:workspace},options),{});
 assert.deepEqual(await handleEvaluationHook({hook_event_name:'SessionStart',session_id:'owner',source:'fork',cwd:workspace},options),{});
 await afterCodexCommand(run,'record',options);assert.equal(JSON.parse(await readFile(join(store,'signal.json'))).trigger,'record');
 await drainEvaluation(store,{executors:{engineering:async()=>({status:'passed',scope:'fixture_only'})}});
 const feedback=await handleEvaluationHook({hook_event_name:'SessionStart',session_id:'owner',cwd:workspace},options);assert.match(feedback.hookSpecificOutput.additionalContext,/evaluation.*status/i);assert.doesNotMatch(feedback.hookSpecificOutput.additionalContext,/quality.*pass/i);
 const taskRoot=join(workspace,'task'),registry=join(workspace,'task-registry');await initTask(taskRoot,run,{scope:'website_and_skill_proposals',evaluation:'development',max_wall_ms:600000,max_runs:2,max_total_rounds:3,max_stop_requests:3,max_stalled_stops:2},'Synthetic website task');await armTask(taskRoot,'owner',registry);
 const continuation=await handleHook({hook_event_name:'Stop',session_id:'owner',turn_id:'step',cwd:workspace},{workspace,registry,startEvaluations:false});assert.equal(continuation.decision,'block');assert.match(continuation.reason,/evaluation.*status/i);
 await handleEvaluationHook({hook_event_name:'Interrupt',session_id:'owner',cwd:workspace},options);assert.equal((await evaluationStatus(store,{session_id:'owner'})).paused,true);
 const paused=await afterCodexCommand(run,'record',options);assert.equal(paused.status,'paused');
});
