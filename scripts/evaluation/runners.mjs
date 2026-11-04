import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {buildPlan,runChecks} from '../check.mjs';
import {checkPreparation} from '../restore/optimization.mjs';
import {finalRequest,verifyEvidence,assert} from '../restore/core.mjs';
import {invoke} from '../restore/adapter.mjs';
import {scoreFinal,incomplete} from '../../evals/pipeline/grader.mjs';
import {validateRedlineProfile} from '../../evals/pipeline/redline-contract.mjs';
import {buildEvidencePayload} from '../trajectory/evidence.mjs';
import {runCodexJudge,dimensionScores} from '../trajectory/judge.mjs';
const framework=fileURLToPath(new URL('../../',import.meta.url)),exec=promisify(execFile);

export async function executeSuite(c){
 const suite=c.job.suite;
 if(suite.runner==='preparation')return {...await checkPreparation(c.state.run_root,c.contract),scope:'preparation_not_site_acceptance'};
 if(suite.runner==='engineering'){
  const deadline=Date.now()+c.timeout_ms;
  const result=await runChecks(buildPlan(suite.profile??'local',{root:framework}),{execute:async step=>{
   const remaining=deadline-Date.now();if(remaining<=0)return {exit_code:1,stdout:'',stderr:'Evaluation job deadline exhausted'};
   try{const r=await exec(step.command,step.args,{cwd:step.cwd,windowsHide:true,encoding:'utf8',timeout:remaining,maxBuffer:8*1024*1024});return {exit_code:0,...r};}catch(e){return {exit_code:1,stdout:e.stdout??'',stderr:e.stderr??e.message};}
  },onRecord:async(record,logs)=>{if(logs)await writeFile(join(c.output_root,record.id+'.log'),logs.stdout+'\n'+logs.stderr);}});
  return {...result,scope:'harness_engineering_not_candidate_visual_quality'};
 }
 if(suite.runner==='development_e2e'){
  if(!suite.adapter)return {status:'unavailable',reason:'An explicit independent development E2E adapter is required'};
  if(!c.checkpoint.contract_frozen)return {status:'incomplete',reason:'Freeze the development contract before E2E'};
  const request=finalRequest({run_id:c.state.run_id,contract_sha256:c.checkpoint.contract_sha256},c.contract,c.checkpoint.artifact_sha256,new Date(Date.now()+c.timeout_ms).toISOString(),c.artifact_root);
  try{validateRedlineProfile(request);}catch(e){return {...incomplete(request,e.message),scope:'development_not_holdout'};}
  const envelope={schema_version:'CodexDevelopmentE2EInput/v1',request,paths:{source_run:c.state.run_root,artifact:c.artifact_root,output:c.output_root},scope:'development_not_holdout'};
  const raw=await invoke(join(c.state.workspace,suite.adapter),envelope,c.timeout_ms);
  const result=scoreFinal(request,raw);await verifyEvidence(c.output_root,result.evidence);
  // The coordinator verifies its immutable checkpoint before/after evaluation;
  // this separate output root contains captures, not a second Restore snapshot tree.
  assert(result.evidence.every(e=>!e.artifact_sha256||e.artifact_sha256===c.checkpoint.artifact_sha256),'Development evidence artifact identity mismatch');
  return {...result,scope:'development_not_holdout'};
 }
 if(suite.runner==='trajectory'){
  if(!c.source?.sessions?.some(s=>s.events.length))return {status:'unavailable',reason:'Explicit bound Codex public transcript window is unavailable'};
  const judgments=[],deadline=Date.now()+c.timeout_ms;
  for(const dimension of suite.dimensions??['F','T']){
   assert(Date.now()<deadline,'Trajectory checkpoint deadline exhausted');
   const payload=buildEvidencePayload(dimension,c.source.views,{...c.contract,contract_sha256:c.checkpoint.contract_sha256},[{id:'checkpoint-binding',scope:'controller_binding_not_source_originality_proof',artifact_sha256:c.checkpoint.artifact_sha256,contract_sha256:c.checkpoint.contract_sha256}]);
   const out=join(c.output_root,'judges',dimension);await mkdir(out,{recursive:true});
   const result=await runCodexJudge(payload,out,{timeoutMs:deadline-Date.now()});judgments.push({dimension,result:result.result});
  }
  return {status:'completed',scope:'checkpoint_window_not_full_task',from:c.source.from,to:c.source.to,judgments,assessment:dimensionScores(judgments.map(j=>j.result))};
 }
 throw new Error('Unsupported Codex development evaluator');
}
