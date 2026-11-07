import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const workspace=fileURLToPath(new URL('../../',import.meta.url));
const dimensions=new Set(['D','I','F','T']);
const privateKey=/(reasoning_content|chain.?of.?thought|private.?reasoning|hidden.?reasoning|scratchpad)/i;
function assertPublic(value,path='$'){if(Array.isArray(value)){value.forEach((item,index)=>assertPublic(item,`${path}[${index}]`));return;}if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){assert.ok(!privateKey.test(key),`Private field in Judge input: ${path}.${key}`);assertPublic(item,`${path}.${key}`);}}

export async function loadRubrics(){return JSON.parse(await readFile(join(workspace,'evals/trajectory/rubrics.json'),'utf8'));}

export function buildProcessJudgePayload(dimension,trajectoryRecords,artifactRecords,{source_policy=null,task_digest=null}={}){
  assert.ok(dimensions.has(dimension),'Unknown process dimension');const evidence=[],claims=[],requirements=[];
  const addTrajectory=(trajectory,harborStep,parentTrajectoryId=null)=>{assert.equal(trajectory.schema_version,'ATIF-v1.8');for(const step of trajectory.steps){if(step.is_copied_context===true)continue;const id=`${harborStep??trajectory.trajectory_id}:atif:${trajectory.trajectory_id??'anonymous'}:${step.step_id}`,row={id,harbor_step:harborStep??null,trajectory_id:trajectory.trajectory_id??null,parent_trajectory_id:parentTrajectoryId,step_id:step.step_id,source:step.source,timestamp:step.timestamp??null,message:step.message,tool_calls:step.tool_calls??[],observation:step.observation??null};assertPublic(row);evidence.push(row);if(step.source==='agent'&&typeof step.message==='string'&&step.message.trim())claims.push({id:`claim:${id}`,claim_ref:id,statement:step.message});if(['system','user'].includes(step.source))requirements.push({id:`requirement:${id}`,source_ref:id,text:step.message});}for(const subagent of trajectory.subagent_trajectories??[])addTrajectory(subagent,harborStep,trajectory.trajectory_id??parentTrajectoryId);};
  for(const record of trajectoryRecords)addTrajectory(record.trajectory??record,record.harbor_step??null);
  for(const item of artifactRecords)evidence.push({id:`artifact:${item.sha256}`,kind:'artifact',uri:item.uri,sha256:item.sha256,step:item.step??null});
  const payload={schema_version:'HarborProcessJudgePayload/v1',dimension,scope:'ATIF and Harbor artifacts from one bounded trial; Final E2E is excluded from process scoring',policy:{source_policy,task_digest},requirements,claims,evidence,evidence_ids:evidence.map(item=>item.id),coverage:{trajectory_count:trajectoryRecords.length,artifact_count:artifactRecords.length,copied_context_excluded:true,nonpublic_fields:'not_exported',calibration:'unmeasured'},limits:['ATIF records observable messages, tool calls and observations; it does not authorize reconstruction of nonpublic analysis.','Artifacts are evidence candidates, not automatic proof of a claim.','Final E2E quality must not be converted into a process score.','Unknown and not_applicable remain null rather than zero.']};assertPublic(payload);return payload;
}

export function validateProcessJudgment(result,payload){
  assert.equal(result.dimension,payload.dimension);assert.equal(result.metrics?.length,3,'Exactly three metrics required');const allowed=new Set(payload.evidence_ids);
  for(let index=1;index<=3;index++)assert.ok(result.metrics.some(item=>item.id===`${payload.dimension}${index}`),`Missing metric ${payload.dimension}${index}`);
  for(const metric of result.metrics){assert.ok(['scored','unknown','not_applicable'].includes(metric.status));assert.ok(Array.isArray(metric.evidence_refs)&&metric.evidence_refs.every(id=>allowed.has(id)),'Unknown evidence reference');assert.ok(Array.isArray(metric.missing));if(metric.status==='scored')assert.ok(Number.isInteger(metric.score)&&metric.score>=0&&metric.score<=4&&metric.evidence_refs.length);else assert.equal(metric.score,null);if(metric.status==='unknown')assert.ok(metric.missing.length);}
  const applicable=result.metrics.filter(item=>item.status!=='not_applicable'),complete=applicable.length&&applicable.every(item=>item.status==='scored');return {...result,dimension_score:complete?applicable.reduce((sum,item)=>sum+item.score,0)/applicable.length:null,provisional:true,calibration:'unmeasured',coverage:payload.coverage};
}

export async function processJudgePrompt(payload){const rubrics=await loadRubrics();return `You are an independent process evaluator. Return JSON only. Use only evidence_ids. Unknown and not_applicable have null scores. Do not infer hidden reasoning or use Final E2E as process evidence.\nRUBRIC:\n${JSON.stringify(rubrics.dimensions[payload.dimension])}\nEVIDENCE:\n${JSON.stringify(payload)}`;}
