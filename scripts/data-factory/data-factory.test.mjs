import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exportTrial} from './export-trial.mjs';
import {buildSnapshot} from './build-snapshot.mjs';
import {digest} from '../restore/core.mjs';
const json=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const lines=async path=>(await readFile(path,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);

async function fixture(t,{sourceAssisted=false,missingAtif=false,privateReasoning=false,trialId='trial-clean'}={}){
  const root=await mkdtemp(join(tmpdir(),'harbor-trial-'));t.after(()=>rm(root,{recursive:true,force:true}));const steps=['prepare','baseline'],session='session-'+trialId;
  for(const [index,name] of steps.entries()){
    const step=join(root,'steps',name);await mkdir(join(step,'agent'),{recursive:true});await mkdir(join(step,'verifier'),{recursive:true});await mkdir(join(step,'artifacts','restore-run','evaluations'),{recursive:true});
    if(!(missingAtif&&name==='baseline')){const copiedSource={step_id:1,source:'user',message:'Run prepare'};const copiedRef={source_trajectory_id:`${trialId}-prepare`,source_step_id:1,source_sha256:`sha256:${digest({source:copiedSource.source,message:copiedSource.message,tool_calls:null,observation:null})}`};const trajectory={schema_version:'ATIF-v1.8',session_id:session,trajectory_id:`${trialId}-${name}`,agent:{name:'codex',version:'fixture',model_name:'fixture-model'},steps:[index?{...copiedSource,is_copied_context:true,extra:{copied_context:copiedRef}}:copiedSource,{step_id:2,source:'agent',message:`Completed ${name}`,...(privateReasoning&&name==='prepare'?{reasoning_content:'private chain'}:{}),llm_call_count:1}],...(name==='prepare'?{continued_trajectory_ref:'../../baseline/agent/trajectory.json'}:{})};await json(join(step,'agent','trajectory.json'),trajectory);}
    const final=name==='baseline'?{status:'complete',rewards:{restore_layout:.8,restore_style:.7,restore_content:.9,restore_interaction:.6,restore_robustness:.8,restore_total:.76,restore_redline_pass:1}}:null;
    const evaluation={schema_version:'RestoreStepEvaluation/v1',step:name,status:'complete',continue_gate:name==='prepare'?1:0,stop_reason:name==='prepare'?null:'target_reached',decision:name==='baseline'?'keep':null,evidence:name==='baseline'?[{id:'pair'}]:[],final_e2e:final,limitations:[]};await json(join(step,'artifacts','restore-run','evaluations',`${name}.json`),evaluation);
    if(name==='baseline')await json(join(step,'artifacts','restore-run','contract.json'),{schema_version:'restore/v0.2',case_id:'UIR-SYNTHETIC',generation_policy:{mode:sourceAssisted?'source_assisted':'fixture_only',source_reuse:sourceAssisted?'allowed':'forbidden'}});
    const rewards={continue_gate:evaluation.continue_gate,...(final?.rewards??{})};await json(join(step,'verifier','reward.json'),rewards);await json(join(step,'verifier','restore-evaluation.json'),{schema_version:'RestoreVerifierRecord/v1',step:name,status:'complete',continue_gate:evaluation.continue_gate,stop_reason:evaluation.stop_reason,formal_quality_reward:Boolean(final)});
  }
  await json(join(root,'result.json'),{id:trialId,task_name:'ui-reverse-engineer/synthetic',trial_name:trialId,task_checksum:'a'.repeat(64),started_at:'2026-11-07T00:00:00Z',finished_at:'2026-11-07T00:02:00Z',step_results:steps.map((step,index)=>({step_name:step,verifier_result:{rewards:{continue_gate:1}},agent_execution:{finished_at:`2026-11-07T00:0${index+1}:00Z`}}))});
  await json(join(root,'lock.json'),{schema_version:2,task:{name:'ui-reverse-engineer/synthetic',type:'local',digest:'sha256:'+'a'.repeat(64)},skills:[{name:'ui-reverse-engineer',source:'.',digest:'sha256:'+'b'.repeat(64),git_commit_id:'fixture'}],agent:{},environment:{},verifier:{}});await json(join(root,'config.json'),{job_id:'job-fixture'});return root;
}

test('exports Harbor ATIF as primary data and governance sidecars',async t=>{
  const trial=await fixture(t),parent=await mkdtemp(join(tmpdir(),'trial-package-parent-')),output=join(parent,'package');t.after(()=>rm(parent,{recursive:true,force:true}));const result=await exportTrial(trial,output,{validator:async()=>{}});
  assert.equal(result.manifest.schema_version,'TrialDataManifest/v1');assert.equal(result.manifest.integrity.atif_valid,true);assert.equal(result.episode.eligibility.sft.eligible,true);assert.equal(result.episode.eligibility.rl.eligible,true);assert.equal(result.episode.eligibility.preference.eligible,true);assert.equal(result.steps[0].index,1);
  const index=JSON.parse(await readFile(join(output,'trajectories','index.json'),'utf8'));assert.equal(index.atif_version,'ATIF-v1.8');assert.equal(index.trajectories.length,2);assert.equal(result.manifest.privacy.copied_context_steps,1);assert.doesNotMatch(await readFile(join(output,'episode.json'),'utf8'),/chain_of_thought|reasoning_content/i);
});

test('missing or private ATIF closes training eligibility without fabricating a ledger trajectory',async t=>{
  for(const options of [{missingAtif:true,trialId:'missing'},{privateReasoning:true,trialId:'private'}]){const trial=await fixture(t,options),parent=await mkdtemp(join(tmpdir(),'trial-package-parent-')),output=join(parent,'package');t.after(()=>rm(parent,{recursive:true,force:true}));const result=await exportTrial(trial,output,{validator:async()=>{}});assert.equal(result.episode.eligibility.trajectory.eligible,false);assert.equal(result.episode.eligibility.sft.eligible,false);}
});

test('source-assisted trial is preserved but excluded from training candidates',async t=>{
  const trial=await fixture(t,{sourceAssisted:true,trialId:'assisted'}),parent=await mkdtemp(join(tmpdir(),'trial-package-parent-')),output=join(parent,'package');t.after(()=>rm(parent,{recursive:true,force:true}));const result=await exportTrial(trial,output,{validator:async()=>{}});assert.equal(result.episode.outcome.stop_reason,'target_reached');for(const purpose of ['trajectory','sft','preference','rl']){assert.equal(result.episode.eligibility[purpose].eligible,false);assert.ok(result.episode.eligibility[purpose].reasons.includes('source_reuse_allowed'));}
});

test('native v1.7 timeout is auditable but cannot become SFT or RL',async t=>{
 const trial=await fixture(t,{trialId:'native-timeout'}),parent=await mkdtemp(join(tmpdir(),'native-timeout-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 for(const name of ['prepare','baseline']){const path=join(trial,'steps',name,'agent','trajectory.json'),v=JSON.parse(await readFile(path,'utf8'));v.schema_version='ATIF-v1.7';await json(path,v);}
 const resultPath=join(trial,'result.json'),result=JSON.parse(await readFile(resultPath,'utf8'));result.step_results[1].exception_info={exception_type:'AgentTimeoutError'};await json(resultPath,result);
 const pkg=await exportTrial(trial,join(parent,'package'),{validator:async()=>{}});
 assert.equal(pkg.manifest.integrity.atif_valid,true);assert.equal(pkg.manifest.runtime_acceptance,'failed');
 assert.equal(pkg.manifest.eligibility.trajectory.eligible,true);assert.equal(pkg.manifest.eligibility.sft.eligible,false);assert.equal(pkg.manifest.eligibility.rl.eligible,false);
 assert.equal(JSON.parse(await readFile(join(parent,'package','trajectories','prepare','trajectory.json'),'utf8')).schema_version,'ATIF-v1.7');
});

test('snapshot deduplicates packages and filters copied context from training views',async t=>{
  const trial=await fixture(t,{trialId:'snapshot'}),parent=await mkdtemp(join(tmpdir(),'snapshot-parent-'));t.after(()=>rm(parent,{recursive:true,force:true}));const p1=join(parent,'p1'),duplicate=join(parent,'duplicate'),snapshot=join(parent,'snapshot');await exportTrial(trial,p1,{validator:async()=>{}});await cp(p1,duplicate,{recursive:true});const result=await buildSnapshot(snapshot,[p1,duplicate],{datasetId:'test'});
  assert.equal(result.manifest.counts.episodes,1);assert.equal(result.manifest.counts.duplicates,1);assert.equal(result.manifest.counts.rl,1);const trajectories=await lines(join(snapshot,'exports','trajectory.jsonl'));assert.ok(trajectories.every(item=>item.steps.every(step=>step.is_copied_context!==true)));assert.ok((await lines(join(snapshot,'exports','sft.jsonl'))).length>0);
});

test('snapshot refuses modified canonical ATIF or media after export',async t=>{
  const trial=await fixture(t,{trialId:'snapshot-integrity'}),agent=join(trial,'steps/prepare/agent');
  await mkdir(join(agent,'images'));await writeFile(join(agent,'images/reference.png'),'fixture-image');
  const source=JSON.parse(await readFile(join(agent,'trajectory.json'),'utf8'));
  source.steps[0].message=[{type:'image',source:{path:'images/reference.png'}}];await json(join(agent,'trajectory.json'),source);
  // The resumed fixture prefix no longer matches the changed prepare source.
  const baseline=join(trial,'steps/baseline/agent/trajectory.json'),next=JSON.parse(await readFile(baseline,'utf8'));next.steps[0]={step_id:1,source:'user',message:'Run baseline'};await json(baseline,next);
  const output=join(trial,'package');await exportTrial(trial,output,{validator:async()=>{}});
  const index=JSON.parse(await readFile(join(output,'trajectories/index.json'),'utf8'));assert.equal(index.trajectories[0].media[0].uri,'trajectories/prepare/images/reference.png');
  await buildSnapshot(join(trial,'good'),[output]);
  const canonical=join(output,'trajectories/prepare/trajectory.json'),original=await readFile(canonical);await writeFile(canonical,'{}');
  await assert.rejects(()=>buildSnapshot(join(trial,'bad-atif'),[output]),/file changed/);await writeFile(canonical,original);
  await writeFile(join(output,'trajectories/prepare/images/reference.png'),'changed');
  await assert.rejects(()=>buildSnapshot(join(trial,'bad-media'),[output]),/file changed/);
});

test('snapshot rejects conflicting export versions of the same episode',async t=>{
 const first=await fixture(t,{trialId:'version-conflict'}),second=await fixture(t,{trialId:'version-conflict',sourceAssisted:true});
 const p1=join(first,'package'),p2=join(second,'package');await exportTrial(first,p1,{validator:async()=>{}});await exportTrial(second,p2,{validator:async()=>{}});
 await assert.rejects(()=>buildSnapshot(join(first,'snapshot'),[p1,p2]),/Conflicting versions of episode/);
});

test('Data Factory task description is projected from its hashed contract',async t=>{
 const trial=await fixture(t,{trialId:'task-description'}),path=join(trial,'steps/baseline/artifacts/restore-run/contract.json');
 const contract=JSON.parse(await readFile(path,'utf8'));
 contract.reference_evidence=[{id:'hero',kind:'screenshot'}];
 contract.task_description={title:'Observed task',scenario:'Story landing page',user_intent:null,description:'Reproduce the observed story and interaction states.',evidence_refs:['hero']};await json(path,contract);
 const output=join(trial,'package'),result=await exportTrial(trial,output,{validator:async()=>{}});
 assert.deepEqual(result.episode.task.description,contract.task_description);assert.match(result.episode.task.contract_sha256,/^[a-f0-9]{64}$/);
});

test('native multi-step ATIF without optional IDs or continuation refs uses Harbor step order',async t=>{
 const trial=await fixture(t,{trialId:'native-continuation'});
 for(const name of ['prepare','baseline']){const path=join(trial,'steps',name,'agent','trajectory.json'),value=JSON.parse(await readFile(path,'utf8'));value.schema_version='ATIF-v1.7';delete value.trajectory_id;delete value.continued_trajectory_ref;delete value.steps[0].is_copied_context;delete value.steps[0].extra;value.steps[0].message=`Run ${name}`;await json(path,value);}
 const result=await exportTrial(trial,join(trial,'package'),{validator:async()=>{}});
 assert.equal(result.manifest.integrity.atif_valid,true);const index=JSON.parse(await readFile(join(trial,'package/trajectories/index.json'),'utf8'));
 assert.equal(index.trajectories[1].previous_step,'prepare');assert.equal(index.trajectories[1].trajectory_id,null);
});

test('unmarked exact resumed prefix is normalized with verifiable source hashes',async t=>{
 const trial=await fixture(t,{trialId:'unmarked-prefix'}),path=join(trial,'steps/baseline/agent/trajectory.json'),value=JSON.parse(await readFile(path,'utf8'));
 delete value.steps[0].is_copied_context;delete value.steps[0].extra;await json(path,value);
 const result=await exportTrial(trial,join(trial,'package'),{validator:async()=>{}});
 assert.equal(result.manifest.integrity.atif_valid,true);assert.equal(result.episode.eligibility.sft.eligible,true);
 const normalized=JSON.parse(await readFile(join(trial,'package/trajectories/baseline/trajectory.json'),'utf8'));assert.equal(normalized.steps[0].is_copied_context,true);assert.match(normalized.steps[0].extra.copied_context.source_sha256,/^sha256:[a-f0-9]{64}$/);
});

test('stale native ATIF cannot cover a later Harbor step just because it passes schema validation',async t=>{
 const trial=await fixture(t,{trialId:'stale-native'});
 const first=join(trial,'steps/prepare/agent/trajectory.json'),source=JSON.parse(await readFile(first,'utf8'));source.steps[0].message='# Restore prepare\n';delete source.continued_trajectory_ref;await json(first,source);await json(join(trial,'steps/baseline/agent/trajectory.json'),source);
 const result=await exportTrial(trial,join(trial,'package'),{validator:async()=>{}});
 assert.equal(result.manifest.integrity.atif_valid,false);assert.equal(result.episode.eligibility.trajectory.eligible,false);
 const index=JSON.parse(await readFile(join(trial,'package/trajectories/index.json'),'utf8'));assert.match(index.trajectories[1].reason,/stale_step_trajectory/);
});
