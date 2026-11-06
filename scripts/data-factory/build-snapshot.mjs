#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha=value=>createHash('sha256').update(value).digest('hex');
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const lines=async path=>(await readFile(path,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeJSON=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const jsonl=values=>values.map(value=>JSON.stringify(value)+'\n').join('');
const fail=message=>{throw new Error(message);};

function splitFor(datasetId,group){
  const n=parseInt(sha(`${datasetId}:${group}`).slice(0,8),16)%100;
  return n<80?'train':n<90?'validation':'test';
}

export async function buildSnapshot(outputDirectory,packageDirectories,{datasetId='ui-reverse-engineer'}={}){
  const output=resolve(outputDirectory);if(await exists(output))fail(`Output already exists: ${output}`);
  const records=[];
  for(const directory of packageDirectories){
    const root=resolve(directory),manifestBytes=await readFile(join(root,'manifest.json')),manifest=JSON.parse(manifestBytes);
    if(manifest.schema_version!=='RunDataManifest/v1'||manifest.integrity.status!=='valid')fail(`Invalid run package: ${root}`);
    for(const [name,key] of [['episode.json','episode_sha256'],['steps.jsonl','steps_sha256'],['artifacts.index.jsonl','artifacts_sha256']])if(sha(await readFile(join(root,name)))!==manifest.files[key])fail(`Run package file changed: ${root}/${name}`);
    records.push({root,manifest,manifest_sha256:sha(manifestBytes),episode:await readJSON(join(root,'episode.json')),steps:await lines(join(root,'steps.jsonl'))});
  }
  const unique=[];const seen=new Set();const duplicates=[];
  for(const item of records.sort((a,b)=>a.episode.episode_id.localeCompare(b.episode.episode_id))){
    if(seen.has(item.episode.fingerprint)){duplicates.push(item.episode.episode_id);continue;}
    seen.add(item.episode.fingerprint);unique.push(item);
  }
  const episodes=[],steps=[],quarantine=[],splitRows={train:[],validation:[],test:[]};
  const exports={sft:[],preference:[],trajectory:[]};
  for(const item of unique){
    const group=item.episode.case_id??item.episode.lineage_root_run_id??item.episode.contract_sha256;
    const split=splitFor(datasetId,group),episode={...item.episode,dataset:{id:datasetId,split,group}};
    episodes.push(episode);steps.push(...item.steps);splitRows[split].push({episode_id:episode.episode_id,fingerprint:episode.fingerprint,group});
    if(episode.quarantine)quarantine.push({episode_id:episode.episode_id,reasons:[...new Set(Object.values(episode.eligibility).flatMap(item=>item.reasons))]});
    if(episode.eligibility.sft.eligible)for(const current of item.steps.filter(step=>step.decision?.label==='keep')){
      const previous=item.steps[current.index-1]??null;
      exports.sft.push({schema_version:'SFTExport/v1',episode_id:episode.episode_id,step_id:current.step_id,input:{task:episode.task,state:current.state,prior_observation:previous?.observation??null},output:{action:current.action},quality:{decision:current.decision,verified_observation:current.observation}});
    }
    if(episode.eligibility.preference.eligible)for(const current of item.steps.filter(step=>['keep','revert'].includes(step.decision?.label)))exports.preference.push({schema_version:'PreferenceExport/v1',episode_id:episode.episode_id,step_id:current.step_id,context:{task:episode.task,action:current.action,state:current.state},chosen:current.decision.label==='keep'?'candidate':'best',rejected:current.decision.label==='keep'?'best':'candidate',verification:current.observation.verification});
    if(episode.eligibility.trajectory.eligible)exports.trajectory.push({schema_version:'TrajectoryExport/v1',episode_id:episode.episode_id,task:episode.task,outcome:episode.outcome,steps:item.steps});
  }
  await mkdir(join(output,'splits'),{recursive:true});await mkdir(join(output,'exports'),{recursive:true});
  await writeFile(join(output,'episodes.jsonl'),jsonl(episodes));await writeFile(join(output,'steps.jsonl'),jsonl(steps));await writeFile(join(output,'quarantine.jsonl'),jsonl(quarantine));
  for(const [name,value] of Object.entries(splitRows))await writeFile(join(output,'splits',`${name}.jsonl`),jsonl(value));
  for(const [name,value] of Object.entries(exports))await writeFile(join(output,'exports',`${name}.jsonl`),jsonl(value));
  const manifest={schema_version:'DatasetSnapshot/v1',dataset_id:datasetId,created_at:new Date().toISOString(),source_packages:records.map(item=>({episode_id:item.episode.episode_id,manifest_sha256:item.manifest_sha256})),counts:{input_packages:records.length,episodes:episodes.length,steps:steps.length,duplicates:duplicates.length,quarantine:quarantine.length,exports:Object.fromEntries(Object.entries(exports).map(([key,value])=>[key,value.length]))},split_policy:{unit:'case_id_or_lineage_root',method:'sha256_mod_100',ranges:{train:'0-79',validation:'80-89',test:'90-99'}},duplicates,files:{episodes_sha256:sha(await readFile(join(output,'episodes.jsonl'))),steps_sha256:sha(await readFile(join(output,'steps.jsonl'))),quarantine_sha256:sha(await readFile(join(output,'quarantine.jsonl')))}};
  await writeJSON(join(output,'manifest.json'),manifest);return {output,manifest};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const args=process.argv.slice(2);if(args.includes('--help'))console.log('node scripts/data-factory/build-snapshot.mjs OUTPUT PACKAGE... [--dataset-id ID]\nCreates a new deterministic dataset snapshot. No training or uploads.');else{const output=args.shift();let datasetId='ui-reverse-engineer';const packages=[];while(args.length){const arg=args.shift();if(arg==='--dataset-id')datasetId=args.shift();else packages.push(arg);}if(!output||!packages.length)fail('OUTPUT and at least one PACKAGE are required');console.log(JSON.stringify((await buildSnapshot(output,packages,{datasetId})).manifest,null,2));}}
  catch(error){console.error(error.message);process.exitCode=1;}
}
