#!/usr/bin/env node
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {validateTaskDescription} from '../restore/task-description.mjs';

export const STOP_REASONS=Object.freeze(['target_reached','plateau','cycle_detected','budget_exhausted','blocked','failed']);
export const QUALITY_REWARDS=Object.freeze(['restore_layout','restore_style','restore_content','restore_interaction','restore_robustness','restore_total','restore_redline_pass']);

const fail=message=>{throw new Error(message);};
const finite01=value=>Number.isFinite(value)&&value>=0&&value<=1;

export function verifyStepEvaluation(value,expectedStep){
  if(value?.schema_version!=='RestoreStepEvaluation/v1')fail('Expected RestoreStepEvaluation/v1');
  if(value.step!==expectedStep)fail(`Step mismatch: expected ${expectedStep}`);
  if(!['complete','incomplete'].includes(value.status))fail('Evaluation status must be complete or incomplete');
  if(![0,1].includes(value.continue_gate))fail('continue_gate must be 0 or 1');
  if(value.continue_gate===1&&value.stop_reason!==null)fail('Continuing step must have stop_reason=null');
  if(value.continue_gate===0&&!STOP_REASONS.includes(value.stop_reason))fail('Stopped step requires an existing stop_reason');
  const rewards={continue_gate:value.continue_gate};
  let formal=false;
  if(value.final_e2e!=null){
    const final=value.final_e2e;
    if(final.status==='complete'){
      if(!final.rewards||Object.keys(final.rewards).some(key=>!QUALITY_REWARDS.includes(key)))fail('Final E2E contains an unknown reward');
      for(const key of QUALITY_REWARDS)if(!finite01(final.rewards[key]))fail(`Missing or invalid final reward: ${key}`);
      Object.assign(rewards,final.rewards);formal=true;
    }else if(final.status!=='incomplete')fail('Final E2E status must be complete or incomplete');
  }
  if(value.status==='incomplete'&&formal)fail('Incomplete step cannot publish formal quality rewards');
  return {rewards,record:{schema_version:'RestoreVerifierRecord/v1',step:expectedStep,status:value.status,continue_gate:value.continue_gate,stop_reason:value.stop_reason,formal_quality_reward:formal,quality_reward_keys:formal?[...QUALITY_REWARDS]:[],limitations:Array.isArray(value.limitations)?value.limitations:[]}};
}

export async function runVerifier({step=process.env.RESTORE_STEP,runRoot=process.env.RESTORE_RUN_ROOT??'/home/pwuser/restore-run',logsRoot=process.env.RESTORE_VERIFIER_LOGS??'/logs/verifier'}={}){
  if(!step)fail('RESTORE_STEP is required');
  const input=join(runRoot,'evaluations',`${step}.json`),value=JSON.parse(await readFile(input,'utf8'));
  const result=verifyStepEvaluation(value,step);
  if(step==='prepare'&&value.continue_gate===1&&process.env.RESTORE_INPUT_ROUTE==='direct_url'){
    const contract=JSON.parse(await readFile(join(runRoot,'contract.json'),'utf8'));
    validateTaskDescription(contract,{required:true});
  }
  await mkdir(logsRoot,{recursive:true});
  await writeFile(join(logsRoot,'reward.json'),JSON.stringify(result.rewards,null,2)+'\n');
  await writeFile(join(logsRoot,'restore-evaluation.json'),JSON.stringify(result.record,null,2)+'\n');
  return result;
}

if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\/[A-Za-z]:/,'')===process.argv[1].replaceAll('\\','/')){
  runVerifier().then(result=>console.log(JSON.stringify(result.record))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
