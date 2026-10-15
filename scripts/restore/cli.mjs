#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as core from './core.mjs';
import { invoke } from './adapter.mjs';
import { report, approve } from './report.mjs';
import { compare } from './pairwise.mjs';

const [command,directory,...args]=process.argv.slice(2), root=directory&&resolve(directory);
const usage=`Restore v0.2 (Node 20+)\ninit RUN URL [ordinary|refined|complex]\nprofile RUN TIER\nfreeze RUN\nassessment-input RUN [output.json]\nbaseline RUN assessment.json\nnext RUN\nbegin RUN hypothesis.json\nrecord RUN assessment.json verification.json\nverify RUN candidate-assessment.json pairwise-adapter.mjs\nabort RUN reason\nstop RUN blocked|failed reason\nmeasure RUN adapter.mjs output.json\neval-input RUN output.json\neval RUN evaluator.mjs [judge.mjs]\neval-record RUN result.json\ntime-exclude RUN interval.json\nusage-record RUN token-usage.json\nreport RUN\napprove RUN approval.json\nAll evidence paths are relative to RUN. Read references/restore/interfaces.md.`;
async function input(path){core.assert(path,'Input JSON path required');return core.readJSON(resolve(path));}
async function save(value,file){if(file)await core.writeJSON(resolve(file),value);return value;}
try {
  if(!command||command==='--help'){console.log(usage);}
  else {
    core.assert(root,'Run directory required'); let result;
    if(command==='init') result=await core.init(root,args[0],args[1]);
    else result=await core.locked(root,command,async run=>{
      switch(command) {
        case 'profile': core.assert(run.phase==='prepare'&&run.profile_changes===0&&core.TIERS[args[0]]&&core.budget(run).elapsed_ms<=300000,'Tier can change once within five minutes before freezing');run.tier=args[0];run.profile_changes++;return core.budget(run);
        case 'freeze': return core.freeze(root,run);
        case 'assessment-input': return save(await core.assessmentInput(root,run),args[0]);
        case 'baseline': return core.baseline(root,run,await input(args[0]));
        case 'next': if(run.pending&&core.budget(run).repair_remaining_ms===0)return core.abort(root,run,'Repair deadline exhausted');return core.advance(root,run);
        case 'begin': return core.begin(root,run,await input(args[0]));
        case 'record': return core.record(root,run,await input(args[0]),await input(args[1]));
        case 'verify': core.assert(args[0]&&args[1],'Candidate assessment and pairwise adapter required');return compare(root,run,resolve(args[0]),resolve(args[1]));
        case 'abort': return core.abort(root,run,args.join(' '));
        case 'stop': core.assert(['blocked','failed'].includes(args[0])&&core.text(args.slice(1).join(' ')),'Stop requires blocked/failed and reason');return core.end(root,run,args[0],args.slice(1).join(' '));
        case 'measure': {const request=await core.assessmentInput(root,run);const a=await invoke(args[0],request,core.budget(run).repair_remaining_ms);const c=await core.contract(root,run);await core.assess(root,run,c,a,request.binding.artifact_sha256,request.states.map(s=>s.id));return save(a,args[1]);}
        case 'eval-input': return save(await core.finalInput(root,run),args[0]);
        case 'eval': {
          core.assert(args[0],'Explicit independent evaluator script required');const request=await core.finalInput(root,run); let output;
          try { output=await invoke(args[0],request,Math.max(0,core.budget(run).remaining_ms-2000),args.slice(1).map(p=>resolve(p))); }
          catch(error){output={schema_version:'E2EResultRef/v0.2',binding:request.binding??null,status:'incomplete',reason:error.message,dimensions:[],redlines:[],evidence:[],total_100:null,provisional:true,scoring_provenance:'independent_evaluator/e2e-v0.2'};}
          return core.recordE2E(root,run,output);
        }
        case 'eval-record': return core.recordE2E(root,run,await input(args[0]));
        case 'time-exclude': return core.excludeTime(root,run,await input(args[0]));
        case 'usage-record': return core.recordTokenUsage(root,run,await input(args[0]));
        case 'report': return report(root,run);
        case 'approve': return approve(root,run,await input(args[0]));
        default: throw new Error(usage);
      }
    });
    console.log(JSON.stringify(result,null,2));
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
