#!/usr/bin/env node
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,join,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest,generationInput,readJSON,sha,treeHash,verifyEvidence} from '../restore/core.mjs';

const HEX=/^[a-f0-9]{64}$/;
const PRIVATE_KEYS=/(chain.?of.?thought|private.?reasoning|hidden.?reasoning|scratchpad|internal.?monologue)/i;
const now=()=>new Date().toISOString();
const fail=message=>{throw new Error(message);};
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const safe=(root,uri)=>{
  if(typeof uri!=='string'||!uri||isAbsolute(uri)||/^[a-z][a-z\d+.-]*:/i.test(uri))fail(`Expected local relative path: ${uri}`);
  const path=resolve(root,uri),base=resolve(root);
  if(!path.startsWith(base+sep))fail(`Path outside run: ${uri}`);
  return path;
};
const jsonLine=value=>JSON.stringify(value)+'\n';
const fileRef=async(root,uri,kind='json',expected=null)=>{
  const bytes=await readFile(safe(root,uri)),actual=kind==='json'?digest(JSON.parse(bytes)):sha(bytes);
  if(expected&&actual!==expected)fail(`Artifact changed: ${uri}`);
  return {uri,sha256:actual,hash_basis:kind==='json'?'canonical_json':'bytes'};
};
const assertNoPrivate=(value,path='$')=>{
  if(Array.isArray(value)){value.forEach((item,index)=>assertNoPrivate(item,`${path}[${index}]`));return;}
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){
    if(PRIVATE_KEYS.test(key))fail(`Private reasoning field is not exportable: ${path}.${key}`);
    assertNoPrivate(item,`${path}.${key}`);
  }
};
const writeJSON=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const loadPointer=async(root,pointer,label,artifacts)=>{
  const uri=typeof pointer==='string'?pointer:pointer?.uri,expected=typeof pointer==='string'?null:pointer?.sha256;
  if(!uri||(expected!=null&&!HEX.test(expected)))fail(`Invalid ${label} pointer`);
  const value=await readJSON(safe(root,uri)),actual=digest(value);
  if(expected&&actual!==expected)fail(`${label} changed: ${uri}`);
  artifacts.push({role:label,...await fileRef(root,uri,'json',actual)});
  return value;
};
const validateBoundRecord=async(root,value,label,{contractSha=null,artifactSha=null}={})=>{
  if(contractSha&&value.binding?.contract_sha256!==contractSha)fail(`${label} contract binding mismatch`);
  if(artifactSha&&value.binding?.artifact_sha256!==artifactSha)fail(`${label} artifact binding mismatch`);
  if(Array.isArray(value.evidence)&&value.evidence.length)await verifyEvidence(root,value.evidence,{artifact_sha256:artifactSha??undefined});
};

async function loadObservability(runId,trajectoryRoot,artifacts){
  if(!trajectoryRoot)return null;
  const root=resolve(trajectoryRoot),bindingPath=join(root,'binding.json');
  if(!await exists(bindingPath))return {status:'not_bound'};
  const binding=await readJSON(bindingPath);
  if(binding.run_id!==runId)fail('Trajectory binding run_id mismatch');
  artifacts.push({role:'trajectory_binding',uri:relative(resolve(trajectoryRoot,'..'),bindingPath).replaceAll('\\','/'),sha256:digest(binding),hash_basis:'canonical_json'});
  const candidates=['capture-delivery/manifest.json','capture-delivery/result.json','automatic-result.json'];
  const refs=[];const traceIds=new Set();let deliveryStatus='bound';
  for(const uri of candidates){
    const path=join(root,...uri.split('/'));if(!await exists(path))continue;
    const value=await readJSON(path);refs.push({uri,sha256:digest(value)});
    for(const id of value.trace_ids??value.delivery?.trace_ids??[])traceIds.add(id);
    deliveryStatus=value.status??value.delivery?.status??deliveryStatus;
  }
  return {status:deliveryStatus,binding:{task_id:binding.task_id??null,capture_id:binding.capture_id??null},trace_ids:[...traceIds].sort(),records:refs};
}

function step({episodeId,index,kind,at=null,action,observation,state,decision=null,evidence=[]}){
  const body={schema_version:'AgentStep/v1',episode_id:episodeId,step_id:`${episodeId}:s${String(index).padStart(4,'0')}`,index,kind,at,action,observation,state,decision,evidence};
  return {...body,fingerprint:digest(body)};
}

export async function exportRun(runDirectory,outputDirectory,{trajectoryDirectory=null}={}){
  const runRoot=resolve(runDirectory),output=resolve(outputDirectory);
  if(await exists(output))fail(`Output already exists: ${output}`);
  const run=await readJSON(join(runRoot,'run.json')),contract=await readJSON(join(runRoot,'contract.json'));
  if(run.schema_version!=='restore/v0.2'||!run.run_id||!run.contract_sha256)fail('Expected frozen restore/v0.2 run');
  if(contract.schema_version!=='restore/v0.2')fail('Contract version must be restore/v0.2');
  if(digest(contract)!==run.contract_sha256)fail('Frozen contract changed');
  const policy=contract.generation_policy;if(!policy||!['fixture_only','source_assisted'].includes(policy.mode)||!['forbidden','allowed'].includes(policy.source_reuse)||(policy.mode==='source_assisted')!==(policy.source_reuse==='allowed'))fail('Invalid frozen generation policy');
  await verifyEvidence(runRoot,contract.reference_evidence);
  if(!run.baseline||!run.stop)fail('Run must have a baseline and Loop stop before export');
  if(await treeHash(safe(runRoot,`snapshots/${run.baseline}`))!==run.baseline)fail('Baseline snapshot changed');
  if(await treeHash(safe(runRoot,`snapshots/${run.best}`))!==run.best)fail('Best snapshot changed');

  const eventText=await readFile(join(runRoot,'events.jsonl'),'utf8');
  const events=eventText.split(/\r?\n/).filter(Boolean).map((line,index)=>{try{return JSON.parse(line);}catch{fail(`Invalid events.jsonl line ${index+1}`);}});
  if(!events.length)fail('events.jsonl is empty');
  const artifacts=[
    {role:'contract',uri:'contract.json',sha256:run.contract_sha256,hash_basis:'canonical_json'},
    {role:'run',uri:'run.json',sha256:digest(run),hash_basis:'canonical_json'},
    {role:'events',uri:'events.jsonl',sha256:sha(eventText),hash_basis:'bytes'},
    {role:'baseline_snapshot',uri:`snapshots/${run.baseline}`,sha256:run.baseline,hash_basis:'tree'},
    {role:'best_snapshot',uri:`snapshots/${run.best}`,sha256:run.best,hash_basis:'tree'}
  ];
  for(const item of contract.reference_evidence)artifacts.push({role:'reference_evidence',uri:item.uri,sha256:item.sha256,hash_basis:'bytes',evidence_id:item.id});

  const generationPath=join(runRoot,'generation-input.json');let generation;
  if(await exists(generationPath)){
    generation=await readJSON(generationPath);
    if(generation.run_id!==run.run_id||generation.binding?.contract_sha256!==run.contract_sha256)fail('generation-input.json binding mismatch');
    assertNoPrivate(generation);
    artifacts.push({role:'generation_input',uri:'generation-input.json',sha256:digest(generation),hash_basis:'canonical_json'});
  }else generation=await generationInput(runRoot,run);

  const episodeId=`restore:${run.run_id}`,steps=[];
  const baselineAssessment=await loadPointer(runRoot,run.baseline_assessment,'baseline_assessment',artifacts);
  await validateBoundRecord(runRoot,baselineAssessment,'baseline assessment',{contractSha:run.contract_sha256,artifactSha:run.baseline});
  steps.push(step({episodeId,index:0,kind:'baseline',at:run.started_at,action:{type:'generate_baseline',input:generation},observation:{assessment:baselineAssessment},state:{artifact_sha256:run.baseline,phase:'loop'},evidence:baselineAssessment.evidence??[]}));
  for(const round of run.rounds??[]){
    if(!round.assessment||!round.verification){
      steps.push(step({episodeId,index:steps.length,kind:'iteration',at:round.at??null,action:{type:'repair',issue_id:round.issue_id,hypothesis:round.hypothesis,strategy:round.strategy,scope:round.scope,affected_states:round.affected_states,expected_change:round.expected_change,preserve:round.preserve},observation:{status:'aborted',reason:round.reason??'No candidate assessment was recorded'},state:{before_artifact_sha256:round.before,candidate_artifact_sha256:null,best_artifact_sha256:round.before},decision:{label:'inconclusive',reason:round.reason??null}}));
      continue;
    }
    const assessment=await loadPointer(runRoot,round.assessment,`round_${round.round}_assessment`,artifacts);
    const verification=await loadPointer(runRoot,round.verification,`round_${round.round}_verification`,artifacts);
    await validateBoundRecord(runRoot,assessment,`round ${round.round} assessment`,{contractSha:run.contract_sha256,artifactSha:round.candidate});
    if(canonical(verification.binding)!==canonical(assessment.binding))fail(`Round ${round.round} verification binding mismatch`);
    const evidenceIds=new Set((assessment.evidence??[]).map(item=>item.id));if(!(verification.evidence??[]).every(id=>evidenceIds.has(id)))fail(`Round ${round.round} verification evidence mismatch`);
    let diff=null;if(round.diff?.uri)diff=await loadPointer(runRoot,round.diff,`round_${round.round}_diff`,artifacts);
    steps.push(step({episodeId,index:steps.length,kind:'iteration',at:round.at??null,action:{type:'repair',issue_id:round.issue_id,hypothesis:round.hypothesis,strategy:round.strategy,scope:round.scope,affected_states:round.affected_states,expected_change:round.expected_change,preserve:round.preserve},observation:{assessment,verification,diff,improvements:round.improvements??null,regressions:round.regressions??[],gate_regressions:round.gate_regressions??[]},state:{before_artifact_sha256:round.before,candidate_artifact_sha256:round.candidate,best_artifact_sha256:round.decision==='keep'?round.candidate:round.before},decision:{label:round.decision,reason:verification.reason??null},evidence:assessment.evidence??[]}));
  }
  steps.push(step({episodeId,index:steps.length,kind:'stop',at:run.stop.at,action:{type:'stop_loop'},observation:{reason:run.stop.reason,detail:run.stop.detail??''},state:{artifact_sha256:run.stop.artifact_sha256,phase:run.phase},decision:{label:run.stop.reason,reason:run.stop.detail??null}}));

  const finalPointer=run.post_run_e2e_review??run.e2e;let finalEvaluation=null;
  if(finalPointer?.uri){finalEvaluation=await loadPointer(runRoot,finalPointer,'final_e2e',artifacts);await validateBoundRecord(runRoot,finalEvaluation,'final E2E',{contractSha:run.contract_sha256,artifactSha:run.best});}
  for(const pointer of run.static_checks??[]){const suite=await loadPointer(runRoot,pointer,`static_check_${pointer.suite_id}`,artifacts);await validateBoundRecord(runRoot,suite,`static check ${pointer.suite_id}`,{contractSha:run.contract_sha256,artifactSha:pointer.artifact_sha256});}
  if(run.lineage?.uri)await loadPointer(runRoot,run.lineage,'lineage',artifacts);
  if(run.token_usage?.uri)await loadPointer(runRoot,run.token_usage,'token_usage',artifacts);

  const independent=steps.some(item=>item.observation?.assessment?.assessor?.role==='independent');
  const pairwise=steps.filter(item=>item.kind==='iteration').some(item=>item.observation.verification?.verifier?.role==='independent'&&['keep','revert'].includes(item.decision.label));
  const hasKeep=steps.some(item=>item.decision?.label==='keep');
  const sourceReuse=contract.generation_policy?.source_reuse==='allowed';
  const reasons=[];
  if(sourceReuse)reasons.push('source_reuse_allowed');
  if(!independent)reasons.push('no_independent_assessment');
  if(!hasKeep)reasons.push('no_accepted_iteration');
  const eligibility={
    sft:{eligible:!sourceReuse&&independent&&hasKeep,reasons:[...(sourceReuse?['source_reuse_allowed']:[]),...(!independent?['no_independent_assessment']:[]),...(!hasKeep?['no_accepted_iteration']:[])]},
    preference:{eligible:!sourceReuse&&pairwise,reasons:[...(sourceReuse?['source_reuse_allowed']:[]),...(!pairwise?['no_decisive_independent_pair']:[])]},
    trajectory:{eligible:true,reasons:sourceReuse?['review_source_reuse_boundary']:[]}
  };
  const observability=await loadObservability(run.run_id,trajectoryDirectory,artifacts);
  const coreEpisode={schema_version:'AgentEpisode/v1',episode_id:episodeId,run_id:run.run_id,case_id:contract.case_source?.case_id??null,lineage_root_run_id:run.lineage?.parent_run_id??run.run_id,contract_sha256:run.contract_sha256,source_policy:contract.generation_policy,started_at:run.started_at,completed_at:run.stop.at,task:{requested_url:contract.requested_url,observed_url:contract.observed_url,states:contract.states.map(item=>item.id)},outcome:{loop_stop:run.stop.reason,best_artifact_sha256:run.best,final_e2e:finalEvaluation?.status??'not_run'},generation_input:{origin:await exists(generationPath)?'recorded':'contract_projection',model_input_proof:await exists(generationPath),sha256:digest(generation)},steps:steps.map(item=>item.step_id),eligibility,quarantine:sourceReuse||(!eligibility.sft.eligible&&!eligibility.preference.eligible),observability};
  assertNoPrivate(coreEpisode);assertNoPrivate(steps);
  const stepContent=steps.map(({episode_id,step_id,index,at,fingerprint,...content})=>content);
  const episode={...coreEpisode,fingerprint:digest({contract_sha256:run.contract_sha256,source_policy:contract.generation_policy,task:coreEpisode.task,outcome:coreEpisode.outcome,generation_input_sha256:coreEpisode.generation_input.sha256,steps:stepContent})};
  const manifestCore={schema_version:'RunDataManifest/v1',created_at:now(),run:{run_id:run.run_id,source:'local_restore_run',path_redacted:true},package:{episode_id:episodeId},integrity:{status:'valid',checked_artifacts:artifacts.length},source_policy:contract.generation_policy,eligibility,quarantine_reasons:reasons,files:{episode:'episode.json',steps:'steps.jsonl',artifacts:'artifacts.index.jsonl'}};
  await mkdir(output,{recursive:true});
  await writeJSON(join(output,'episode.json'),episode);
  await writeFile(join(output,'steps.jsonl'),steps.map(jsonLine).join(''));
  await writeFile(join(output,'artifacts.index.jsonl'),artifacts.map(jsonLine).join(''));
  const outputFiles={episode_sha256:sha(await readFile(join(output,'episode.json'))),steps_sha256:sha(await readFile(join(output,'steps.jsonl'))),artifacts_sha256:sha(await readFile(join(output,'artifacts.index.jsonl')))};
  const manifest={...manifestCore,files:{...manifestCore.files,...outputFiles}};
  await writeJSON(join(output,'manifest.json'),manifest);
  return {output,manifest,episode,steps};
}

function parse(argv){
  if(argv.includes('--help'))return {help:true};
  const args=[...argv],run=args.shift(),output=args.shift();let trajectoryDirectory=null;
  while(args.length){const arg=args.shift();if(arg==='--trajectory')trajectoryDirectory=args.shift();else fail(`Unknown argument: ${arg}`);}
  if(!run||!output)fail('Usage: node scripts/data-factory/export-run.mjs RUN OUTPUT [--trajectory DIRECTORY]');
  return {run,output,trajectoryDirectory};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const options=parse(process.argv.slice(2));if(options.help)console.log('node scripts/data-factory/export-run.mjs RUN OUTPUT [--trajectory DIRECTORY]\nCreates a new immutable run package. No uploads or model calls.');else console.log(JSON.stringify((await exportRun(options.run,options.output,{trajectoryDirectory:options.trajectoryDirectory})).manifest,null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
