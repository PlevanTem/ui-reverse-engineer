#!/usr/bin/env node
import {lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,sha} from '../restore/core.mjs';
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const fail=message=>{throw new Error(message);};
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const readLines=async path=>(await readFile(path,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeJSON=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const writeLines=async(path,values)=>writeFile(path,values.map(value=>JSON.stringify(value)+'\n').join(''));
async function verifiedFile(root,uri,expected){
  const path=resolve(root,...uri.split('/'));
  if(!path.startsWith(root+sep))fail(`Unsafe Trial Package path: ${uri}`);
  const bytes=await readFile(path);if(sha(bytes)!==expected)fail(`Trial Package file changed: ${uri}`);return bytes;
}
const split=group=>{const n=parseInt(digest(group).slice(0,8),16)%100;return n<80?'train':n<90?'validation':'test';};
const trainingSteps=trajectory=>trajectory.steps.filter(step=>step.is_copied_context!==true).map(({reasoning_content,...step})=>step);
const trainingSubagents=trajectory=>(trajectory.subagent_trajectories??[]).map(item=>({...item,steps:trainingSteps(item),subagent_trajectories:trainingSubagents(item)}));
function sftRecords(episode,trajectory,stepName){const rows=[],items=trainingSteps(trajectory);for(let i=0;i<items.length;i++){if(items[i].source!=='agent')continue;rows.push({schema_version:'RestoreSFTView/v1',episode_id:episode.episode_id,harbor_step:stepName,atif_trajectory_id:trajectory.trajectory_id??null,context:items.slice(0,i).map(step=>({source:step.source,message:step.message,tool_calls:step.tool_calls??null,observation:step.observation??null})),response:{message:items[i].message,tool_calls:items[i].tool_calls??null},source_policy:episode.source_policy,dataset:episode.dataset});}return rows;}

export async function buildSnapshot(outputDirectory,packageDirectories,{datasetId='restore-harbor-snapshot'}={}){
  const output=resolve(outputDirectory);if(await exists(output))fail(`Output already exists: ${output}`);if(!packageDirectories.length)fail('At least one Trial Package is required');
  const episodes=[],steps=[],quarantine=[],trajectoryViews=[],sft=[],preference=[],rl=[],duplicates=[],sourcePackages=[],seen=new Set(),episodeVersions=new Map();
  for(const directory of packageDirectories){
    const root=resolve(directory),manifest=await readJSON(join(root,'manifest.json'));if(manifest.schema_version!=='TrialDataManifest/v1'||manifest.integrity?.status!=='valid')fail(`Invalid Trial Package: ${root}`);
    const episodeBytes=await readFile(join(root,'episode.json')),stepBytes=await readFile(join(root,'steps.jsonl')),indexBytes=await readFile(join(root,'trajectories','index.json')),artifactBytes=await readFile(join(root,'artifacts.index.jsonl'));
    if(sha(episodeBytes)!==manifest.files.episode_sha256||sha(stepBytes)!==manifest.files.steps_sha256||sha(indexBytes)!==manifest.files.trajectories_sha256||sha(artifactBytes)!==manifest.files.artifacts_sha256)fail(`Trial Package changed: ${root}`);
    const episode=JSON.parse(episodeBytes),key=episode.fingerprint;
    if(episodeVersions.has(episode.episode_id)&&episodeVersions.get(episode.episode_id)!==key)fail(`Conflicting versions of episode ${episode.episode_id}; select one package explicitly`);
    episodeVersions.set(episode.episode_id,key);if(seen.has(key)){duplicates.push(episode.episode_id);continue;}seen.add(key);
    const group=episode.case_id??episode.task_name??episode.trial_id,dataset={id:datasetId,group,split:split(group)};episode.dataset=dataset;episodes.push(episode);sourcePackages.push({episode_id:episode.episode_id,manifest_sha256:sha(await readFile(join(root,'manifest.json')))});
    const episodeSteps=(await readLines(join(root,'steps.jsonl'))).map(item=>({...item,dataset}));steps.push(...episodeSteps);
    if(episode.quarantine)quarantine.push({episode_id:episode.episode_id,reasons:Object.fromEntries(Object.entries(episode.eligibility).filter(([,value])=>!value.eligible).map(([purpose,value])=>[purpose,value.reasons])),dataset});
    const index=JSON.parse(indexBytes);for(const record of index.trajectories.filter(item=>item.status==='valid')){const trajectory=JSON.parse(await verifiedFile(root,record.canonical,record.canonical_sha256));for(const media of record.media??[])await verifiedFile(root,media.uri,media.sha256);const view={schema_version:'RestoreTrajectoryView/v1',episode_id:episode.episode_id,harbor_step:record.step,atif_version:trajectory.schema_version,session_id:trajectory.session_id??null,trajectory_id:trajectory.trajectory_id??null,steps:trainingSteps(trajectory),subagent_trajectories:trainingSubagents(trajectory),copied_context_filtered:record.copied_context_steps,dataset};if(episode.eligibility.trajectory.eligible)trajectoryViews.push(view);if(episode.eligibility.sft.eligible)sft.push(...sftRecords(episode,trajectory,record.step));}
    if(episode.eligibility.preference.eligible)for(const item of episodeSteps.filter(item=>['keep','revert'].includes(item.decision?.label)))preference.push({schema_version:'RestorePreferenceView/v1',episode_id:episode.episode_id,step_id:item.step_id,decision:item.decision.label,action:item.action,observation:item.observation,evidence:item.evidence,dataset});
    if(episode.eligibility.rl.eligible)rl.push({schema_version:'RestoreRLView/v1',episode_id:episode.episode_id,rewards:episode.outcome.formal_rewards,trajectory_ids:index.trajectories.filter(item=>item.status==='valid').map(item=>item.trajectory_id),dataset});
  }
  await mkdir(join(output,'exports'),{recursive:true});await writeLines(join(output,'episodes.jsonl'),episodes);await writeLines(join(output,'steps.jsonl'),steps);await writeLines(join(output,'quarantine.jsonl'),quarantine);await writeLines(join(output,'exports','trajectory.jsonl'),trajectoryViews);await writeLines(join(output,'exports','sft.jsonl'),sft);await writeLines(join(output,'exports','preference.jsonl'),preference);await writeLines(join(output,'exports','rl.jsonl'),rl);
  const files={episodes_sha256:sha(await readFile(join(output,'episodes.jsonl'))),steps_sha256:sha(await readFile(join(output,'steps.jsonl'))),quarantine_sha256:sha(await readFile(join(output,'quarantine.jsonl'))),trajectory_sha256:sha(await readFile(join(output,'exports','trajectory.jsonl'))),sft_sha256:sha(await readFile(join(output,'exports','sft.jsonl'))),preference_sha256:sha(await readFile(join(output,'exports','preference.jsonl'))),rl_sha256:sha(await readFile(join(output,'exports','rl.jsonl')))};
  const manifest={schema_version:'DatasetSnapshot/v2',dataset_id:datasetId,created_at:new Date().toISOString(),source_packages:sourcePackages,counts:{episodes:episodes.length,steps:steps.length,duplicates:duplicates.length,quarantine:quarantine.length,trajectory:trajectoryViews.length,sft:sft.length,preference:preference.length,rl:rl.length},split_policy:{unit:'case_id_or_task_name',method:'sha256_mod_100',thresholds:{train:80,validation:10,test:10}},duplicates,files};await writeJSON(join(output,'manifest.json'),manifest);return {output,manifest};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),output=args.shift();let datasetId='restore-harbor-snapshot';const packages=[];while(args.length){const arg=args.shift();if(arg==='--dataset-id')datasetId=args.shift();else packages.push(arg);}if(!output||!packages.length){console.error('node scripts/data-factory/build-snapshot.mjs NEW_SNAPSHOT PACKAGE... [--dataset-id ID]');process.exitCode=1;}else buildSnapshot(output,packages,{datasetId}).then(result=>console.log(JSON.stringify(result.manifest,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
