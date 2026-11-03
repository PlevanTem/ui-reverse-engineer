#!/usr/bin/env node
import { geometrySuite } from './geometry.mjs';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as core from './core.mjs';
import { invoke } from './adapter.mjs';
import { report, approve } from './report.mjs';
import { compare } from './pairwise.mjs';
import { checkPreparation, createOptimizationTemplate, optimizationBrief } from './optimization.mjs';
import * as task from './task.mjs';
import {defaultRegistry} from './hooks.mjs';
import {afterRestoreCommand} from '../trajectory/auto.mjs';
import {afterCodexCommand} from '../evaluation/codex.mjs';

const [command,directory,...args]=process.argv.slice(2), root=directory&&resolve(directory);
const usage=`Restore v0.2 (Node 20+)\ninit RUN URL [ordinary|refined|complex]\ninit-vnext RUN URL [ordinary|refined|complex]\nprepare-check RUN\ngeometry-check RUN capture.json [suite.json]\nimplementation-brief RUN [output.md]\ncontinue OLD_RUN NEW_RUN [ordinary|refined|complex]\nrefreeze OLD_RUN NEW_RUN CONTRACT_SOURCE [ordinary|refined|complex]\nprofile RUN TIER\nfreeze RUN\nprogress RUN\ngeneration-input RUN [output.json]\nassessment-input RUN [output.json]\ninitial-record RUN assessment.json (baseline is a compatibility alias)\nnext RUN\nbegin RUN hypothesis.json\nrecord RUN assessment.json verification.json\nverify RUN candidate-assessment.json pairwise-adapter.mjs\nabort RUN reason\nstatic-check-record RUN suite.json\nstop RUN blocked reason blocker.json\nstop RUN failed reason\nmeasure RUN adapter.mjs output.json\neval-input RUN output.json\neval RUN evaluator.mjs [judge.mjs]\neval-record RUN result.json\npost-run-review-record RUN review.json\ntime-exclude RUN interval.json\nusage-record RUN token-usage.json\nreport RUN\napprove RUN approval.json\nAll evidence paths are relative to RUN. Read references/restore/interfaces.md.`;
async function input(path){core.assert(path,'Input JSON path required');return core.readJSON(resolve(path));}
const taskUsage=`Task continuity (development only):\ntask-init TASK RUN policy.json OBJECTIVE\ntask-status TASK\ntask-arm TASK SESSION_ID\ntask-resume TASK SESSION_ID\ntask-pause TASK REASON\ntask-wait TASK REASON\ntask-plan TASK plan.json\ntask-handoff TASK\ntask-propose TASK proposal.json\nRead references/restore/interfaces.md#任务连续性. Host hook trust/activation is separate.`;
async function save(value,file){if(file)await core.writeJSON(resolve(file),value);return value;}
try {
  if(!command||command==='--help'){console.log(usage+'\n'+taskUsage);}
  else {
    core.assert(root,'Run directory required'); let result;
    if(command==='task-init'){core.assert(args[0]&&args[1],'Run and policy JSON required');result=await task.initTask(root,resolve(args[0]),await input(args[1]),args.slice(2).join(' '));}
    else if(command==='task-status')result=await task.statusTask(root);
    else if(command==='task-arm'||command==='task-resume')result=await task.armTask(root,args[0],defaultRegistry,command==='task-resume');
    else if(command==='task-pause'||command==='task-wait')result=await task.pauseTask(root,args.join(' '),command==='task-pause'?'paused':'waiting');
    else if(command==='task-plan')result=await task.planTask(root,await input(args[0]));
    else if(command==='task-handoff')result=await task.handoffTask(root);
    else if(command==='task-propose')result=await task.proposeTask(root,await input(args[0]));
    else if(command==='init') result=await core.init(root,args[0],args[1]);
    else if(command==='init-vnext'){result=await core.init(root,args[0],args[1]);const c=await core.readJSON(join(root,'contract.json'));c.optimization=createOptimizationTemplate();await core.writeJSON(join(root,'contract.json'),c);result.optimization='RestoreOptimization/v1';}
    else if(command==='prepare-check')result=await checkPreparation(root,await core.readJSON(join(root,'contract.json')));
    else if(command==='geometry-check'){const run=await core.readJSON(join(root,'run.json'));result=await save(await geometrySuite(root,run,args[0]),args[1]);}
    else if(command==='implementation-brief'){const run=await core.readJSON(join(root,'run.json'));const c=await core.contract(root,run);const brief=optimizationBrief(c);const file=resolve(args[0]??join(root,'implementation-brief.md'));const {writeFile}=await import('node:fs/promises');await writeFile(file,brief);result={file,contract_sha256:run.contract_sha256};}
    else if(command==='continue') {core.assert(args[0],'New run directory required');result=await core.continueRun(root,resolve(args[0]),args[1]);}
    else if(command==='refreeze') {core.assert(args[0]&&args[1],'New run directory and contract source required');result=await core.refreezeRun(root,resolve(args[0]),resolve(args[1]),args[2]);}
    else if(command==='progress') result=await core.progress(root,await core.readJSON(join(root,'run.json')));
    else if(command==='generation-input') result=await save(await core.generationInput(root,await core.readJSON(join(root,'run.json'))),args[0]);
    else result=await core.locked(root,command,async run=>{
      switch(command) {
        case 'profile': core.assert(run.phase==='prepare'&&run.profile_changes===0&&core.TIERS[args[0]]&&core.budget(run).elapsed_ms<=300000,'Tier can change once within five minutes before freezing');run.tier=args[0];run.profile_changes++;return core.budget(run);
        case 'freeze': return core.freeze(root,run);
        case 'assessment-input': return save(await core.assessmentInput(root,run),args[0]);
        case 'initial-record':
        case 'baseline': return core.baseline(root,run,await input(args[0]));
        case 'next': if(run.pending&&core.budget(run).repair_remaining_ms===0)return core.abort(root,run,'Repair deadline exhausted');return core.advance(root,run);
        case 'begin': return core.begin(root,run,await input(args[0]));
        case 'record': return core.record(root,run,await input(args[0]),await input(args[1]));
        case 'verify': core.assert(args[0]&&args[1],'Candidate assessment and pairwise adapter required');return compare(root,run,resolve(args[0]),resolve(args[1]));
        case 'abort': return core.abort(root,run,args.join(' '));
        case 'static-check-record': return core.recordStaticChecks(root,run,await input(args[0]));
        case 'stop': core.assert(['blocked','failed'].includes(args[0])&&core.text(args[1]),'Stop requires blocked/failed and a quoted reason');return core.end(root,run,args[0],args[1],args[0]==='blocked'?await input(args[2]):null);
        case 'measure': {const request=await core.assessmentInput(root,run);const a=await invoke(args[0],request,core.budget(run).repair_remaining_ms);const c=await core.contract(root,run);await core.assess(root,run,c,a,request.binding.artifact_sha256,request.states.map(s=>s.id));return save(a,args[1]);}
        case 'eval-input': return save(await core.finalInput(root,run),args[0]);
        case 'eval': {
          core.assert(args[0],'Explicit independent evaluator script required');const request=await core.finalInput(root,run); let output;
          try { output=await invoke(args[0],request,Math.max(0,core.budget(run).remaining_ms-2000),args.slice(1).map(p=>resolve(p))); }
          catch(error){output={schema_version:'E2EResultRef/v0.2',binding:request.binding??null,status:'incomplete',reason:error.message,dimensions:[],redlines:[],evidence:[],total_100:null,provisional:true,scoring_provenance:request.binding?.scorer_version?`independent_evaluator/${request.binding.scorer_version}`:'independent_evaluator/e2e/v0.4'};}
          return core.recordE2E(root,run,output);
        }
        case 'eval-record': return core.recordE2E(root,run,await input(args[0]));
        case 'post-run-review-record': return core.recordPostRunE2EReview(root,run,await input(args[0]));
        case 'time-exclude': return core.excludeTime(root,run,await input(args[0]));
        case 'usage-record': return core.recordTokenUsage(root,run,await input(args[0]));
        case 'report': return report(root,run);
        case 'approve': return approve(root,run,await input(args[0]));
        default: throw new Error(usage);
      }
    });
    // CLI owns optional telemetry orchestration. Direct core/task imports do not arm workers.
    if(!command.startsWith('task-')){const target=['continue','refreeze'].includes(command)?resolve(args[0]):root;const telemetry=await afterRestoreCommand(target);if(telemetry&&result&&typeof result==='object'&&!Array.isArray(result))result.trajectory=telemetry;try{const evaluation=await afterCodexCommand(target,command);if(evaluation&&result&&typeof result==='object'&&!Array.isArray(result))result.evaluation=evaluation;}catch(error){if(result&&typeof result==='object')result.evaluation={status:'unverified',reason:error.message};}}
    console.log(JSON.stringify(result,null,2));
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
