#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyFile,lstat,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,sha} from '../restore/core.mjs';
import {validateTaskDescription} from '../restore/task-description.mjs';

const exec=promisify(execFile),workspace=fileURLToPath(new URL('../../',import.meta.url));
export const EXPORTER_DIGEST=sha(await readFile(fileURLToPath(import.meta.url)));
const PRIVATE_KEY=/(chain.?of.?thought|private.?reasoning|hidden.?reasoning|scratchpad|internal.?monologue|reasoning_content)/i;
const SECRET_KEY=/(authorization|api.?key|password|secret|access.?token|refresh.?token)/i;
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const fail=message=>{throw new Error(message);};
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJSON=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const jsonLine=value=>JSON.stringify(value)+'\n';
const python=()=>join(workspace,'tools/harbor/.venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');

function sanitize(value,stats){
  if(Array.isArray(value))return value.map(item=>sanitize(item,stats));
  if(!value||typeof value!=='object'){
    if(typeof value==='string'&&/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)){stats.redactions++;return value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,'Bearer [REDACTED]');}
    return value;
  }
  const out={};for(const [key,item] of Object.entries(value)){
    if(PRIVATE_KEY.test(key)){stats.private_fields_removed++;continue;}
    if(SECRET_KEY.test(key)){stats.redactions++;out[key]='[REDACTED]';continue;}
    out[key]=sanitize(item,stats);
  }return out;
}

function validateAtifShape(value,label){
  if(!['ATIF-v1.7','ATIF-v1.8'].includes(value?.schema_version)||!value.agent||!Array.isArray(value.steps)||!value.steps.length)fail(`${label}: expected native ATIF-v1.7 or ATIF-v1.8 trajectory`);
  value.steps.forEach((step,index)=>{if(step.step_id!==index+1)fail(`${label}: ATIF step IDs must start at 1 and remain sequential`);if(!['system','user','agent'].includes(step.source))fail(`${label}: invalid ATIF step source`);});
}

const copiedSourceDigest=step=>digest({source:step.source,message:step.message,tool_calls:step.tool_calls??null,observation:step.observation??null});
function validateCopiedContext(trajectory,priorSteps,label){
  for(const step of trajectory.steps){
    if(step.is_copied_context!==true)continue;
    const ref=step.extra?.copied_context;
    if(!ref?.source_trajectory_id||!Number.isInteger(ref.source_step_id)||!/^sha256:[a-f0-9]{64}$/.test(ref.source_sha256??''))fail(`${label}: copied context requires exact source trajectory, step and sha256`);
    const source=priorSteps.get(`${ref.source_trajectory_id}:${ref.source_step_id}`);
    if(!source)fail(`${label}: copied context source does not resolve to an earlier trajectory step`);
    const expected=`sha256:${copiedSourceDigest(source)}`;
    if(ref.source_sha256!==expected||copiedSourceDigest(step)!==copiedSourceDigest(source))fail(`${label}: copied context source/hash mismatch`);
  }
}

async function officialValidate(path,runner=null){
  if(runner)return runner(path);if(!await exists(python()))fail('Pinned Harbor environment missing; run uv sync --project tools/harbor --locked');
  await exec(python(),['-m','harbor.utils.trajectory_validator',path],{cwd:workspace,windowsHide:true,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},maxBuffer:4*1024*1024});
}

async function walk(root){const files=[];if(!await exists(root))return files;for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory())files.push(...await walk(path));else if(entry.isFile())files.push(path);}return files.sort();}
const artifactRoot=stepRoot=>join(stepRoot,'artifacts','restore-run');
async function firstExisting(paths){for(const path of paths)if(await exists(path))return path;return null;}

export async function exportTrial(trialDirectory,outputDirectory,{validator=null}={}){
  const trial=resolve(trialDirectory),output=resolve(outputDirectory);if(await exists(output))fail(`Output already exists: ${output}`);
  const resultPath=join(trial,'result.json'),lockPath=join(trial,'lock.json'),configPath=join(trial,'config.json');for(const path of [resultPath,lockPath,configPath])if(!await exists(path))fail(`Incomplete Harbor trial: missing ${basename(path)}`);
  const result=await readJSON(resultPath),lock=await readJSON(lockPath),config=await readJSON(configPath);result.step_results??=[];
  const executionFailed=Boolean(result.exception_info)||!result.step_results.length||result.step_results.some(step=>step.exception_info)||result.step_results.some(step=>!step.verifier_result);
  const trialId=String(result.id??result.trial_name),episodeId=`harbor:${trialId}`,executed=result.step_results.map(item=>item.step_name);
  await mkdir(join(output,'trajectories'),{recursive:true});await mkdir(join(output,'rewards'),{recursive:true});
  const trajectories=[],artifacts=[],steps=[],eligibilityReasons=new Set(),evaluations=[],priorSteps=new Map();let copiedContext=0,privateRemoved=0,redactions=0,sessionId=null,previousTrajectoryPath=null,previousContinuationRef=null,priorTrajectory=null,priorIdentity=null,priorSourceHash=null;
  for(const [index,stepResult] of result.step_results.entries()){
    const name=stepResult.step_name,stepRoot=join(trial,'steps',name),trajectoryPath=join(stepRoot,'agent','trajectory.json'),restoreArtifacts=artifactRoot(stepRoot);let trajectoryRecord={step:name,status:'missing',source:null,canonical:null},trajectory=null;
    if(await exists(trajectoryPath)){
      try{
        await officialValidate(trajectoryPath,validator);const source=await readJSON(trajectoryPath);validateAtifShape(source,name);
        const prompts=source.steps.filter(step=>step.source==='user'&&typeof step.message==='string').map(step=>step.message);
        if(prompts.some(message=>/^# Restore /m.test(message))&&!prompts.some(message=>message.split(/\r?\n/).includes(`# Restore ${name}`)))fail(`${name}: stale_step_trajectory does not contain this Harbor step instruction`);
        if(sessionId==null)sessionId=source.session_id??null;else if(source.session_id!==sessionId)fail(`${name}: ATIF session_id changed inside one trial`);
        // Native Codex v1.7 omits optional continuation refs. Harbor step order is
        // recorded in the index; do not invent IDs or reject official native output.
        if(previousTrajectoryPath&&previousContinuationRef&&resolve(dirname(previousTrajectoryPath),previousContinuationRef)!==resolve(trajectoryPath))fail(`${name}: explicit ATIF continuation points to a different step trajectory`);
        const stats={private_fields_removed:0,redactions:0},clean=sanitize(source,stats);validateAtifShape(clean,name);copiedContext+=clean.steps.filter(item=>item.is_copied_context===true).length;privateRemoved+=stats.private_fields_removed;redactions+=stats.redactions;
        const sourceHash=sha(await readFile(trajectoryPath)),identity=clean.trajectory_id??`sha256:${sourceHash}`;
        if(priorTrajectory){for(let i=0;i<Math.min(priorTrajectory.steps.length,clean.steps.length);i++){
          const original=priorTrajectory.steps[i],step=clean.steps[i];if(copiedSourceDigest(original)!==copiedSourceDigest(step))break;
          if(step.is_copied_context!==true){step.is_copied_context=true;step.extra={...step.extra,copied_context:original.is_copied_context===true?original.extra.copied_context:{source_trajectory_id:priorIdentity,source_step_id:original.step_id,source_sha256:`sha256:${copiedSourceDigest(original)}`,source_atif_sha256:priorSourceHash}};copiedContext++;}
        }}
        validateCopiedContext(clean,priorSteps,name);
        for(const step of clean.steps)if(step.is_copied_context!==true)priorSteps.set(`${identity}:${step.step_id}`,step);
        priorTrajectory=clean;priorIdentity=identity;priorSourceHash=sourceHash;
        previousTrajectoryPath=trajectoryPath;previousContinuationRef=clean.continued_trajectory_ref??null;
        const targetDir=join(output,'trajectories',name);await mkdir(targetDir,{recursive:true});const target=join(targetDir,'trajectory.json');await writeJSON(target,clean);
        // Preserve local media alongside the native trajectory and verify the exported copy.
        const mediaPaths=[],mediaRecords=[];const visit=value=>{if(Array.isArray(value))return value.forEach(visit);if(!value||typeof value!=='object')return;if(['image','audio'].includes(value.type)&&value.source?.path&&!value.source.path.includes('://'))mediaPaths.push(value.source.path);Object.values(value).forEach(visit);};visit(clean);
        for(const media of new Set(mediaPaths)){const sourceMedia=resolve(dirname(trajectoryPath),media),targetMedia=resolve(targetDir,media);if(!sourceMedia.startsWith(dirname(trajectoryPath)+sep)||!targetMedia.startsWith(targetDir+sep))fail('Unsafe ATIF media path');await mkdir(dirname(targetMedia),{recursive:true});await copyFile(sourceMedia,targetMedia);mediaRecords.push({uri:relative(output,targetMedia).replaceAll('\\','/'),sha256:sha(await readFile(targetMedia))});}
        await officialValidate(target,validator);
        trajectoryRecord={step:name,status:'valid',schema_version:clean.schema_version,provenance_id:identity,media:mediaRecords,sequence_index:index,previous_step:index?executed[index-1]:null,continuation_basis:index?(trajectories.at(-1)?.status==='valid'?'harbor_step_order':'unverified_previous_step'):null,source_sha256:sha(await readFile(trajectoryPath)),canonical_sha256:sha(await readFile(target)),source:`steps/${name}/agent/trajectory.json`,canonical:`trajectories/${name}/trajectory.json`,trajectory_id:clean.trajectory_id??null,session_id:clean.session_id??null,copied_context_steps:clean.steps.filter(item=>item.is_copied_context===true).length,private_fields_removed:stats.private_fields_removed,redactions:stats.redactions};trajectory=clean;
      }catch(error){trajectoryRecord={step:name,status:'invalid',reason:error.message,source:`steps/${name}/agent/trajectory.json`};eligibilityReasons.add('invalid_atif');}
    }else eligibilityReasons.add('missing_atif');
    trajectories.push(trajectoryRecord);
    const evaluationPath=await firstExisting([join(restoreArtifacts,'evaluations',`${name}.json`),join(stepRoot,'verifier','restore-evaluation.json')]);let evaluation=null;if(evaluationPath){evaluation=await readJSON(evaluationPath);evaluations.push({step:name,value:evaluation});}
    const rewardPath=join(stepRoot,'verifier','reward.json');let rewards=null;if(await exists(rewardPath)){rewards=await readJSON(rewardPath);await copyFile(rewardPath,join(output,'rewards',`${name}.json`));}
    const files=await walk(join(stepRoot,'artifacts'));for(const path of files)artifacts.push({step:name,uri:relative(trial,path).replaceAll('\\','/'),sha256:sha(await readFile(path)),hash_basis:'bytes'});
    const messages=trajectory?.steps.filter(item=>item.source==='agent'&&item.is_copied_context!==true).map(item=>item.message)??[],toolCalls=trajectory?.steps.filter(item=>item.is_copied_context!==true).flatMap(item=>item.tool_calls??[]).map(item=>({tool_call_id:item.tool_call_id,function_name:item.function_name,arguments:item.arguments}))??[],observations=trajectory?.steps.filter(item=>item.is_copied_context!==true).flatMap(item=>item.observation?.results??[]).map(item=>({source_call_id:item.source_call_id??null,content:item.content??null}))??[];
    const body={schema_version:'AgentStep/v1',episode_id:episodeId,step_id:`${episodeId}:s${String(index+1).padStart(4,'0')}`,index:index+1,kind:name==='prepare'?'prepare':name==='baseline'?'baseline':'iteration',at:stepResult.agent_execution?.finished_at??null,action:{messages,tool_calls:toolCalls},observation:{results:observations,evaluation_status:evaluation?.status??null},state:{harbor_step:name,trajectory_status:trajectoryRecord.status,artifact_files:files.length,rewards},decision:evaluation?{label:evaluation.decision??null,continue_gate:evaluation.continue_gate??null,stop_reason:evaluation.stop_reason??null}:null,evidence:artifacts.filter(item=>item.step===name).map(({uri,sha256})=>({uri,sha256}))};steps.push({...body,fingerprint:digest(body)});
  }
  if(executionFailed)eligibilityReasons.add('trial_execution_incomplete');
  const lastStep=executed.at(-1)??'__not_executed',lastRewardPath=join(trial,'steps',lastStep,'verifier','reward.json'),lastVerifierPath=join(trial,'steps',lastStep,'verifier','restore-evaluation.json'),lastRewards=await exists(lastRewardPath)?await readJSON(lastRewardPath):null,lastVerifier=await exists(lastVerifierPath)?await readJSON(lastVerifierPath):null,lastEvaluation=evaluations.find(item=>item.step===lastStep)?.value??null,qualityKeys=['restore_layout','restore_style','restore_content','restore_interaction','restore_robustness','restore_total','restore_redline_pass'];
  const formalBound=lastEvaluation?.status==='complete'&&lastEvaluation?.final_e2e?.status==='complete'&&lastVerifier?.status==='complete'&&lastVerifier?.formal_quality_reward===true&&lastVerifier?.step===lastStep;
  const formalRewards=formalBound&&lastRewards&&qualityKeys.every(key=>Number.isFinite(lastRewards[key])&&lastRewards[key]>=0&&lastRewards[key]<=1&&lastEvaluation.final_e2e.rewards?.[key]===lastRewards[key])?Object.fromEntries(qualityKeys.map(key=>[key,lastRewards[key]])):null;if(!formalRewards)eligibilityReasons.add('formal_reward_incomplete');
  const roots=[...executed].reverse().map(name=>artifactRoot(join(trial,'steps',name))),contractPath=await firstExisting(roots.map(root=>join(root,'contract.json'))),contract=contractPath?await readJSON(contractPath):null,sourcePolicy=contract?.generation_policy??contract?.source_policy??null,sourceReuse=sourcePolicy?.source_reuse==='allowed'||sourcePolicy?.mode==='source_assisted';
  if(!sourcePolicy)eligibilityReasons.add('source_policy_missing');if(sourceReuse)eligibilityReasons.add('source_reuse_allowed');const allValid=executed.length>0&&trajectories.length===executed.length&&trajectories.every(item=>item.status==='valid'),pairwise=evaluations.some(item=>['keep','revert'].includes(item.value.decision)&&Array.isArray(item.value.evidence)&&item.value.evidence.length),safeAtif=allValid&&privateRemoved===0&&redactions===0;if(privateRemoved)eligibilityReasons.add('private_reasoning_removed');if(redactions)eligibilityReasons.add('secret_redaction_required');
  const eligibility={trajectory:{eligible:safeAtif&&!sourceReuse,reasons:[]},sft:{eligible:safeAtif&&!sourceReuse,reasons:[]},preference:{eligible:safeAtif&&!sourceReuse&&pairwise,reasons:[]},rl:{eligible:safeAtif&&!sourceReuse&&Boolean(formalRewards),reasons:[]}};
  for(const [purpose,item] of Object.entries(eligibility)){const reasons=[];if(['sft','preference'].includes(purpose)&&!formalRewards)reasons.push('final_quality_incomplete');if(executionFailed&&purpose!=='trajectory')reasons.push('trial_execution_incomplete');if(!allValid)reasons.push(trajectories.some(x=>x.status==='invalid')?'invalid_atif':'missing_atif');if(privateRemoved)reasons.push('private_reasoning_removed');if(redactions)reasons.push('secret_redaction_required');if(sourceReuse)reasons.push('source_reuse_allowed');if(purpose==='preference'&&!pairwise)reasons.push('no_decisive_pairwise_evidence');if(purpose==='rl'&&!formalRewards)reasons.push('formal_reward_incomplete');if(!sourcePolicy)reasons.push('source_policy_missing');item.reasons=[...new Set(reasons)];if(reasons.length)item.eligible=false;}
  const skillLocks=Array.isArray(lock.skills)?lock.skills.map(item=>({name:item.name,digest:item.digest,git_commit_id:item.git_commit_id??null})):[],stop=evaluations.map(item=>item.value).reverse().find(value=>value?.continue_gate===0)??null;
  const episodeCore={schema_version:'AgentEpisode/v1',episode_id:episodeId,trial_id:trialId,task_name:result.task_name,case_id:contract?.case_source?.case_id??contract?.case_id??null,source_policy:sourcePolicy,started_at:result.started_at??null,completed_at:result.finished_at??null,task:{description:contract?.task_description?validateTaskDescription(contract):null,contract_sha256:contractPath?sha(await readFile(contractPath)):null,task_digest:lock.task?.digest??result.task_checksum,skill_locks:skillLocks,executed_steps:executed},outcome:{stop_reason:stop?.stop_reason??null,formal_rewards:formalRewards,harbor_exception:result.exception_info??null,data_status:!executionFailed&&formalRewards&&allValid?'complete':'incomplete'},steps:steps.map(item=>item.step_id),eligibility,quarantine:Object.values(eligibility).some(item=>!item.eligible),provenance:{harbor_version:lock.harbor?.version??'0.25.0',atif_version:[...new Set(trajectories.filter(x=>x.status==='valid').map(x=>x.schema_version))].join(',')||null,session_id:sessionId,copied_context_steps:copiedContext,private_fields_removed:privateRemoved,redactions,trajectory_index:'trajectories/index.json'}};
  const episode={...episodeCore,fingerprint:digest(episodeCore)},manifestCore={schema_version:'TrialDataManifest/v1',created_at:new Date().toISOString(),harbor:{trial_id:trialId,trial_result_sha256:sha(await readFile(resultPath)),trial_name:result.trial_name,task_name:result.task_name,task_digest:lock.task?.digest??result.task_checksum,job_id:config.job_id??null},package:{episode_id:episodeId,exporter_sha256:EXPORTER_DIGEST},integrity:{status:'valid',checked_artifacts:artifacts.length,atif_valid:allValid},source_policy:sourcePolicy,eligibility,quarantine_reasons:[...eligibilityReasons].sort(),privacy:{private_fields_removed:privateRemoved,redactions,copied_context_steps:copiedContext},runtime_acceptance:executionFailed?'failed':formalRewards?'accepted':'incomplete',files:{episode:'episode.json',steps:'steps.jsonl',trajectories:'trajectories/index.json',artifacts:'artifacts.index.jsonl',rewards:'rewards/'}};
  await writeJSON(join(output,'episode.json'),episode);await writeFile(join(output,'steps.jsonl'),steps.map(jsonLine).join(''));await writeFile(join(output,'artifacts.index.jsonl'),artifacts.map(jsonLine).join(''));await writeJSON(join(output,'trajectories','index.json'),{schema_version:'ATIFIndex/v1',atif_version:[...new Set(trajectories.filter(x=>x.status==='valid').map(x=>x.schema_version))].join(',')||null,session_id:sessionId,trajectories});
  const outputFiles={episode_sha256:sha(await readFile(join(output,'episode.json'))),steps_sha256:sha(await readFile(join(output,'steps.jsonl'))),trajectories_sha256:sha(await readFile(join(output,'trajectories','index.json'))),artifacts_sha256:sha(await readFile(join(output,'artifacts.index.jsonl')))},manifest={...manifestCore,files:{...manifestCore.files,...outputFiles}};await writeJSON(join(output,'manifest.json'),manifest);return {output,manifest,episode,steps};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [trial,output,...rest]=process.argv.slice(2);if(!trial||!output||rest.length){console.error('node scripts/data-factory/export-trial.mjs HARBOR_TRIAL NEW_PACKAGE');process.exitCode=1;}else exportTrial(trial,output).then(result=>console.log(JSON.stringify({output:result.output,trial_id:result.manifest.harbor.trial_id,eligibility:result.manifest.eligibility},null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
