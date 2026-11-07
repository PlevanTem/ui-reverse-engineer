import {createHash} from 'node:crypto';
import {cp,lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TIERS,sha,treeHash} from '../restore/core.mjs';
import {STOP_REASONS} from './verifier.mjs';

export const HARBOR_VERSION='0.25.0';
export const ATIF_VERSION='ATIF-v1.7';
export const TASK_SCHEMA_VERSION='1.4';
export const DEFAULT_IMAGE='mcr.microsoft.com/playwright:v1.58.0-noble@sha256:35c7d48b4ccaf3aca5018f5f1bf7f50c7da7d61d176c530741f4f2e9ca336c34';
export const TIER_ROUNDS=Object.freeze(Object.fromEntries(Object.entries(TIERS).map(([name,value])=>[name,value.rounds])));
const workspace=fileURLToPath(new URL('../../',import.meta.url));
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const fail=message=>{throw new Error(message);};
const q=value=>JSON.stringify(value);
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'restore-task';
const pinned=image=>/^[^\s@]+(?::[^\s@]+)?@sha256:[a-f0-9]{64}$/.test(image);
const json=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');

export function parseCasesYaml(text){
  const start=text.split(/\r?\n/).findIndex(line=>line.trim()==='cases:');
  if(start<0)fail('cases.yaml has no cases section');
  const cases=[];let current=null;
  const scalar=raw=>{raw=raw.trim();if(raw==='null')return null;if(/^".*"$/.test(raw)||/^'.*'$/.test(raw))return raw.slice(1,-1).replaceAll('\\"','"');return raw;};
  for(const line of text.split(/\r?\n/).slice(start+1)){
    const begin=line.match(/^  - id:\s*(.+?)\s*$/);if(begin){if(current)cases.push(current);current={id:scalar(begin[1])};continue;}
    if(!current)continue;const field=line.match(/^    ([a-z_]+):\s*(.*?)\s*$/);if(field&&field[2]!==''&&!field[2].startsWith('|'))current[field[1]]=scalar(field[2]);
  }
  if(current)cases.push(current);return cases;
}

export async function validateFixtureManifest(fixtureRoot,expectedCaseId=null){
  const root=resolve(fixtureRoot),path=join(root,'manifest.json');if(!await exists(path))fail(`Fixture manifest missing: ${path}`);
  const manifest=JSON.parse(await readFile(path,'utf8'));
  if(manifest.schema_version!=='RestoreFixtureManifest/v1')fail('Expected RestoreFixtureManifest/v1');
  if(expectedCaseId&&manifest.case_id!==expectedCaseId)fail('Fixture case_id mismatch');
  if(!/^https?:\/\//.test(manifest.url??''))fail('Fixture URL is required');
  if(!pinned(manifest.environment?.docker_image??''))fail('Fixture requires a digest-pinned environment image');
  if(!Array.isArray(manifest.viewports)||!manifest.viewports.length||!Array.isArray(manifest.states)||!manifest.states.length)fail('Fixture requires viewports and states');
  if(!Array.isArray(manifest.reference_evidence)||!manifest.reference_evidence.length)fail('Fixture requires frozen reference evidence');
  if(!Array.isArray(manifest.resources)||!manifest.resources.length)fail('Fixture requires a frozen resource manifest');
  for(const item of [...manifest.reference_evidence,...manifest.resources]){
    if(!item.uri||!/^[a-f0-9]{64}$/.test(item.sha256??''))fail('Invalid fixture evidence entry');
    const bytes=await readFile(resolve(root,item.uri));if(sha(bytes)!==item.sha256)fail(`Fixture evidence changed: ${item.uri}`);
  }
  return manifest;
}

function instructions({url,tier,caseId,sourcePolicy,steps,inputRoute,urlTaskPrompt}){
  const common=`Target: ${url}\nTier: ${tier} (${TIER_ROUNDS[tier]} repair rounds maximum)\nCase: ${caseId??'exploratory'}\nSource policy: ${sourcePolicy}\n\nHarbor owns the trial and step lifecycle. Use the injected ui-reverse-engineer Skill and only its low-level Restore tools. Write durable work under /home/pwuser/restore-run. Never create or run a second loop/coordinator. Do not expose private reasoning, credentials, evaluator-only fixtures, or hidden analysis. Harbor owns native sessions and ATIF export. Do not author trajectory.json, search session files, or edit copied-context metadata yourself. Use Playwright from /ms-playwright or install the Python playwright adapter if needed. The runtime Skill contains no eval case metadata. Read references/harbor/restore-step-evaluation.schema.json from the injected Skill. The contract schema_version is restore/v0.2; use the field definitions in references/restore/interfaces.md, not an invented schema. A continuing evaluation example is {\"schema_version\":\"RestoreStepEvaluation/v1\",\"step\":\"prepare\",\"status\":\"complete\",\"continue_gate\":1,\"stop_reason\":null,\"limitations\":[]}; use the current step name. Every step must write /home/pwuser/restore-run/evaluations/<step>.json as RestoreStepEvaluation/v1. continue_gate controls only whether Harbor proceeds; it is not a quality score. If continue_gate is 0, use exactly one allowed stop_reason (${STOP_REASONS.join(', ')}) and complete Final E2E plus report sealing in the same step. Unknown or missing evidence makes final_e2e.status incomplete; never replace unknown with zero.`;
  return Object.fromEntries(steps.map((step,index)=>{
    let task;
    if(step==='prepare')task=inputRoute==='ready_case'?`Use the manually frozen case contract and generation-allowed fixtures. Do not rediscover the live website or infer new requirements. Preserve the authored task description if present; generate design_brief.md only as a projection of that contract. If the frozen generation input is unavailable, record incomplete/blocked instead of replacing the fixture with a live URL. Write evaluations/prepare.json before the deadline.`:urlTaskPrompt;
    else if(step==='baseline')task=`Read only the frozen contract and allowed generation inputs from prepare. Generate the initial runnable restored project. Capture and measure the declared states with the existing Loop Criteria. If the target is already reached, finalize now; otherwise publish the highest-priority evidenced gap.`;
    else task=`Continue from the persistent filesystem. Repair one evidenced highest-priority gap, measure the same bound states, compare against the previous accepted artifact, and keep, revert, or mark inconclusive. Do not count a round as improvement without independent evidence. ${index===steps.length-1?'This is the maximum declared iteration: finalize the result and use budget_exhausted if no earlier stop condition applies.':'Finalize in this step whenever an existing stop condition applies.'}`;
    return [step,`# Restore ${step}\n\n${common}\n\n## This step\n\n${task}\n`];
  }));
}

function taskToml({taskName,tier,caseId,inputRoute,sourcePolicy,image,allowedHosts,steps}){
  const lines=[`schema_version = ${q(TASK_SCHEMA_VERSION)}`,`multi_step_reward_strategy = "final"`,`artifacts = [{ source = "/home/pwuser/restore-run", destination = "restore-run" }]`,'',`[task]`,`name = ${q(taskName)}`,`version = "1.0.0"`,`description = ${q('Harbor-native bounded UI restoration task')}`,`authors = []`,`keywords = ["ui-restore", "atif", "multi-step"]`,'',`[metadata]`,`harbor_version = ${q(HARBOR_VERSION)}`,`atif_version = ${q(ATIF_VERSION)}`,`restore_tier = ${q(tier)}`,`restore_rounds = ${TIER_ROUNDS[tier]}`,`input_route = ${q(inputRoute)}`,`source_policy = ${q(sourcePolicy)}`,`case_id = ${q(caseId??'')}`,`runtime_acceptance = "not_run"`,'',`[verifier]`,`timeout_sec = 900`,`environment_mode = "separate"`,`network_mode = "no-network"`,'',`[agent]`,`timeout_sec = ${TIERS[tier].minutes*60}`,`user = "pwuser"`,`network_mode = "allowlist"`,`allowed_hosts = [${allowedHosts.map(q).join(', ')}]`,'',`[environment]`,`docker_image = ${q(image)}`,`network_mode = "allowlist"`,`allowed_hosts = [${allowedHosts.map(q).join(', ')}]`,`workdir = "/home/pwuser"`,''];
  for(const [index,step] of steps.entries()){
    lines.push('[[steps]]',`name = ${q(step)}`);if(index<steps.length-1)lines.push('min_reward = { continue_gate = 1 }');
    lines.push('',`[steps.agent]`,`timeout_sec = ${(step==='prepare'?TIERS[tier].minutes*10:Math.floor((TIERS[tier].minutes*50)/(steps.length-1)))}`,`user = "pwuser"`,'',`[steps.verifier]`,`timeout_sec = 300`,`environment_mode = "separate"`,`network_mode = "no-network"`,'');
  }
  return lines.join('\n')+'\n';
}

export async function createTask(output,{url,tier='ordinary',caseId=null,taskName=null,inputRoute='direct_url',sourcePolicy='fixture_only',image=DEFAULT_IMAGE,resourceHosts=[],fixtureRoot=null}={}){
  if(!/^https?:\/\//.test(url??''))fail('A valid --url is required');if(!TIER_ROUNDS[tier])fail('Tier must be ordinary, refined, or complex');
  if(!['fixture_only','source_assisted'].includes(sourcePolicy))fail('source policy must be fixture_only or source_assisted');if(!pinned(image))fail('Harbor image must be digest-pinned');
  output=resolve(output);if(await exists(output))fail(`Output already exists: ${output}`);await mkdir(output,{recursive:true});
  const host=new URL(url).hostname.toLowerCase(),normalizedResourceHosts=resourceHosts.map(value=>{const result=value.toLowerCase();if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(result))fail(`Invalid resource host: ${value}`);return result;}),allowedHosts=[...new Set([host,...normalizedResourceHosts])].sort();
  const steps=['prepare','baseline',...Array.from({length:TIER_ROUNDS[tier]},(_,index)=>`iteration-${index+1}`)];
  const name=taskName??`ui-reverse-engineer/${slug(caseId??host)}`;
  await writeFile(join(output,'task.toml'),taskToml({taskName:name,tier,caseId,inputRoute,sourcePolicy,image,allowedHosts,steps}));
  await mkdir(join(output,'environment'),{recursive:true});
  await mkdir(join(output,'tests'),{recursive:true});
  await writeFile(join(output,'tests','verify-step.mjs'),(await readFile(join(workspace,'scripts/harbor/verifier.mjs'),'utf8')).replace("'../restore/task-description.mjs'","'./task-description.mjs'"));
  await cp(join(workspace,'scripts/restore/task-description.mjs'),join(output,'tests','task-description.mjs'));
  const urlTaskPrompt=await readFile(join(workspace,'references/restore/url-task-prompt.md'),'utf8');
  const perStep=instructions({url,tier,caseId,sourcePolicy,steps,inputRoute,urlTaskPrompt});
  for(const step of steps){
    const dir=join(output,'steps',step);await mkdir(join(dir,'tests'),{recursive:true});await writeFile(join(dir,'instruction.md'),perStep[step]);
    await writeFile(join(dir,'tests','test.sh'),`#!/bin/bash\nset -euo pipefail\nRESTORE_INPUT_ROUTE=${q(inputRoute)} RESTORE_STEP=${q(step)} node /tests/verify-step.mjs\n`);
  }
  if(fixtureRoot){await cp(resolve(fixtureRoot),join(output,'tests','fixture'),{recursive:true});}
  const sourceReuse=sourcePolicy==='source_assisted'?'allowed':'forbidden';
  await json(join(output,'restore-task.json'),{schema_version:'RestoreHarborTask/v1',harbor_version:HARBOR_VERSION,atif_version:ATIF_VERSION,task_name:name,input_route:inputRoute,url,tier,rounds:TIER_ROUNDS[tier],steps,case_id:caseId,source_policy:{mode:sourcePolicy,source_reuse:sourceReuse},environment:{docker_image:image,allowed_hosts:allowedHosts},runtime_acceptance:'not_run'});
  const contentSha=await treeHash(output);return {output,task_name:name,task_sha256:contentSha,steps};
}

export async function compileCases(output,{casesPath=join(workspace,'evals/cases.yaml'),fixturesRoot=join(workspace,'evals/fixtures'),caseId=null}={}){
  output=resolve(output);if(await exists(output))fail(`Output already exists: ${output}`);const cases=parseCasesYaml(await readFile(casesPath,'utf8'));
  if(caseId&&!cases.some(item=>item.id===caseId))fail(`Unknown case: ${caseId}`);const selected=cases.filter(item=>(!caseId||item.id===caseId)&&item.status==='ready');if(caseId&&!selected.length)fail(`Case is not ready: ${caseId}`);
  await mkdir(join(output,'tasks'),{recursive:true});const tasks=[];
  for(const item of selected){
    const fixtureRoot=join(fixturesRoot,item.id),manifest=await validateFixtureManifest(fixtureRoot,item.id),taskDir=join(output,'tasks',item.id.toLowerCase());if(item.url!==manifest.url)fail(`Fixture URL mismatch for ${item.id}`);
    const result=await createTask(taskDir,{url:manifest.url,tier:manifest.tier??({easy:'ordinary',medium:'refined',hard:'complex'}[item.difficulty]??'ordinary'),caseId:item.id,taskName:`ui-reverse-engineer/${item.id.toLowerCase()}`,inputRoute:'ready_case',sourcePolicy:manifest.source_policy?.mode??'fixture_only',image:manifest.environment.docker_image,resourceHosts:manifest.resources.map(resource=>resource.host).filter(Boolean),fixtureRoot});tasks.push(result);
  }
  const toml=['# Dataset manifest for ui-reverse-engineer/restore-ready','# Generated only from cases with status=ready and complete frozen fixtures.','', '[dataset]','name = "ui-reverse-engineer/restore-ready"','version = "1.0.0"','description = "Ready Restore cases compiled as Harbor tasks"','keywords = ["ui-restore", "atif"]','', '[[dataset.authors]]','name = "UI Reverse Engineer"',''];
  for(const task of tasks)toml.push('[[tasks]]',`name = ${q(task.task_name)}`,`digest = ${q('sha256:'+task.task_sha256)}`,'');
  await writeFile(join(output,'dataset.toml'),toml.join('\n'));await json(join(output,'compile-result.json'),{schema_version:'RestoreHarborCompileResult/v1',cases_source:casesPath,selected_case:caseId,ready_count:tasks.length,draft_excluded:cases.filter(item=>item.status==='draft').length,retired_excluded:cases.filter(item=>item.status==='retired').length,tasks:tasks.map(({task_name,task_sha256,output})=>({task_name,task_sha256,path:basename(output)})),runtime_acceptance:'not_run'});
  return {output,tasks};
}
