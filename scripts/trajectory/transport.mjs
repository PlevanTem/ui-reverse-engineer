import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {request,postJSON,getAll,reconcile,otlp,toUnixNano} from './langfuse.mjs';
// Shared protocol helpers have no Firewood dependency. This module owns durable delivery.
import {cloudEvaluatorSource,loadRubrics} from './judge.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const read=p=>readFile(p,'utf8').then(JSON.parse);
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const attribute=(key,value)=>({key,value:{stringValue:typeof value==='string'?value:JSON.stringify(value)}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function maybe(p){try{return await read(p);}catch(e){if(e.code!=='ENOENT')throw e;return null;}}

export function batchSpans(traces,{count=30,bytes=700000}={}){
 const batches=[];let current=[],size=0;
 function flush(){if(!current.length)return;const grouped=new Map();for(const s of current){if(!grouped.has(s.traceId))grouped.set(s.traceId,{traceId:s.traceId,spans:[]});grouped.get(s.traceId).spans.push(s);}batches.push([...grouped.values()]);current=[];size=0;}
 for(const s of traces.flatMap(t=>t.spans)){const n=Buffer.byteLength(JSON.stringify(s));assert.ok(n<=bytes,'Single span exceeds transport limit');if(current.length>=count||size+n>bytes)flush();current.push(s);size+=n;}flush();return batches;
}
export async function readObservations(config,traces){const rows=[];for(const t of traces)rows.push(...await getAll(config,'/api/public/v2/observations',{traceId:t.traceId,fields:'core,basic,io,metadata,trace_context',limit:'1000'}));return rows;}
export async function sendTraces(traces,outRoot,config,{deadlineMs=180000,onProgress=()=>{}}={}){
 await mkdir(outRoot,{recursive:true});const project=(await request(config,'/api/public/projects')).data;assert.equal(project?.length,1,'Expected one destination project');
 const manifest={schema_version:'TrajectoryDelivery/v1',destination:hash(config.baseUrl+'/'+project[0].id),project_id:project[0].id,payload_sha256:hash(traces),trace_ids:traces.map(t=>t.traceId)};
 const old=await maybe(join(outRoot,'manifest.json'));if(old)assert.deepEqual(old,manifest,'Immutable delivery changed; use a new capture ID and directory');else await save(join(outRoot,'manifest.json'),manifest);
 const batches=batchSpans(traces);await mkdir(join(outRoot,'batches'),{recursive:true});
 for(let n=0;n<batches.length;n++){const batch=batches[n],file=join(outRoot,'batches',String(n).padStart(4,'0')+'.json');let receipt=await maybe(file);
  if(receipt){assert.equal(receipt.payload_sha256,hash(batch));if(receipt.status==='api_accepted'||receipt.status==='readback_confirmed')continue;const rows=await readObservations(config,batch),check=reconcile(batch,rows);if(check.status!=='pass')throw new Error('Uncertain prior delivery: readback incomplete; no automatic resend');receipt.status='readback_confirmed';await save(file,receipt);continue;}
  receipt={index:n,payload_sha256:hash(batch),status:'uncertain',at:new Date().toISOString()};await save(file,receipt);
  try{await postJSON(config,'/api/public/otel/v1/traces',otlp(batch,{serviceVersion:'agent-trajectory/v1',scopeName:'restore-trajectory'}));receipt.status='api_accepted';await save(file,receipt);}catch(e){receipt.error=e.message;await save(file,receipt);throw e;}
  onProgress({batch:n+1,batches:batches.length});
 }
 const deadline=Date.now()+deadlineMs;let check,rows;do{rows=await readObservations(config,traces);check=reconcile(traces,rows);await save(join(outRoot,'reconciliation.json'),check);if(check.status==='pass')break;await pause(2000);}while(Date.now()<deadline);
 await save(join(outRoot,'readback.json'),rows);const result={...manifest,...check,at:new Date().toISOString(),urls:traces.map(t=>`${config.baseUrl}/project/${project[0].id}/traces/${t.traceId}`)};await save(join(outRoot,'result.json'),result);return result;
}

export function expectedScores(dimension,metrics,{version=1}={}){const scores=[];for(const m of metrics){scores.push({name:`restore.process.${m.id}.status`,value:m.status,dataType:'CATEGORICAL'});if(m.status==='scored')scores.push({name:`restore.process.${m.id}`,value:m.score,dataType:'NUMERIC'});}const active=metrics.filter(m=>m.status!=='not_applicable'),ready=active.length>0&&active.every(m=>m.status==='scored');scores.push({name:`restore.process.${dimension}.status`,value:ready?'scored':'unknown',dataType:'CATEGORICAL'});if(ready)scores.push({name:`restore.process.${dimension}`,value:active.reduce((a,b)=>a+b.score,0)/active.length,dataType:'NUMERIC'});scores.push({name:`restore.process.${dimension}.calibration`,value:'unmeasured',dataType:'CATEGORICAL'});if(version===2){for(const s of scores)s.name=s.name.replace('restore.process.','restore.process.v2.');if(active.length)scores.push({name:`restore.process.v2.${dimension}.metric_coverage`,value:active.filter(m=>m.status==='scored').length/active.length,dataType:'NUMERIC'});}return scores;}

export function judgeTrace(judgments,{task_id,capture_id,source_trace_id,rubric_version='trajectory-4d/v1'}={}){
 const traceId=hash(task_id+'/'+capture_id+'/judges').slice(0,32),rootId=hash(traceId+'/root').slice(0,16),starts=judgments.map(x=>x.execution.started_at).sort(),ends=judgments.map(x=>x.execution.completed_at).sort();
 function make(name,key,type,start,end,input,output,parent,metadata={}){return {traceId,spanId:hash(traceId+'/'+key).slice(0,16),...(parent?{parentSpanId:parent}:{}),name,kind:1,startTimeUnixNano:toUnixNano(start),endTimeUnixNano:toUnixNano(end),attributes:[attribute('langfuse.session.id',task_id),attribute('langfuse.trace.name','restore.external-judge'),attribute('langfuse.environment','development'),attribute('langfuse.observation.type',type),attribute('langfuse.observation.input',input),attribute('langfuse.observation.output',output),...Object.entries({restore_schema:'ExternalCodexJudgment/v1',restore_capture_id:capture_id,restore_source_trace_id:source_trace_id,restore_provisional:true,...metadata}).map(([k,v])=>attribute('langfuse.observation.metadata.'+k,v))],status:{code:0}};}
 const root=make('restore.judges','root','chain',starts[0],ends.at(-1),{source_trace_id},{dimensions:judgments.map(x=>x.result.dimension),calibration:'unmeasured'});root.spanId=rootId;
 return {traceId,rootId,spans:[root,...judgments.map(({result:r,execution:e})=>{const version=r.judgment_schema==='ExternalCodexJudgment/v2'?2:1;return make('restore.judge.'+(version===2?'v2.':'')+r.dimension,'judge/'+r.dimension,'evaluator',e.started_at,e.completed_at,{payload_sha256:e.payload_sha256,prompt_sha256:e.prompt_sha256,usage:e.usage,model_selection:e.model_selection,actual_model:e.actual_model??null},{schema_version:'ExternalCodexJudgment/v'+version,execution:'external_codex',rubric_version,payload_sha256:e.payload_sha256,...r},rootId,{restore_external_judge:'true',restore_dimension:r.dimension,restore_judge_version:version,restore_calibration:'unmeasured'});})]};
}

export function judgeFailureTrace(dimension,execution,failure,binding={}){
 const now=new Date().toISOString(),e={...execution,started_at:execution?.started_at??execution?.at??now,completed_at:execution?.completed_at??now};const trace=judgeTrace([{result:{dimension,metrics:[],scope:'Failed external attempt; not a semantic judgment'},execution:e}],{...binding,capture_id:(binding.capture_id??'capture')+'/failed/'+dimension});
 for(const s of trace.spans)for(const a of s.attributes){if(a.key==='langfuse.trace.name')a.value.stringValue='restore.external-judge-failure';if(a.key==='langfuse.observation.metadata.restore_schema')a.value.stringValue='ExternalCodexAttempt/v1';if(a.key==='langfuse.observation.metadata.restore_external_judge')a.value.stringValue='false';}
 const node=trace.spans[1];node.name=`restore.judge.${dimension}.failed`;node.status={code:2};node.attributes.find(a=>a.key==='langfuse.observation.output').value.stringValue=JSON.stringify({schema_version:'ExternalCodexAttempt/v1',execution:'external_codex',status:'failed',dimension,exit_code:e.exit_code??null,failure,semantic_score:null});return trace;
}

export async function registerEvaluators(config,outRoot,{version=1,dimensions=['D','I','F','T']}={}){
 await mkdir(outRoot,{recursive:true});const registry=[],rubrics=await loadRubrics({version});const evaluators=(await request(config,'/api/public/v2/evaluators?limit=100')).data??[],rules=(await request(config,'/api/public/v2/evaluation-rules?limit=100')).data??[];
 for(const dimension of dimensions){
  const observation='restore.judge.'+(version===2?'v2.':'')+dimension,name=`restore.process.${dimension}.external_codex.v${version}`,sourceCode=cloudEvaluatorSource(dimension,{version});let evaluator=evaluators.find(x=>x.name===name);
  if(!evaluator)evaluator=await postJSON(config,'/api/public/v2/evaluators',{name,description:'Development-only validator for external Codex semantic judgments; calibration unmeasured.',type:'code',sourceCode,sourceCodeLanguage:'TYPESCRIPT'});
  else {evaluator=await request(config,'/api/public/v2/evaluators/'+evaluator.id);assert.equal(evaluator.type,'code');assert.equal(evaluator.sourceCode,sourceCode,'Registered evaluator changed; version it explicitly instead of silently replacing it');}
  let rule=rules.find(x=>x.name===name);if(!rule)rule=await postJSON(config,'/api/public/v2/evaluation-rules',{name,enabled:true,sampling:1,filter:[{column:'name',type:'stringOptions',operator:'any of',value:[observation]},{column:'environment',type:'stringOptions',operator:'any of',value:['development']},{column:'metadata',key:'restore_external_judge',type:'stringObject',operator:'=',value:'true'}],evaluatorAssignments:[{evaluatorId:evaluator.id,variableMapping:null}]});
  assert.equal(rule.enabled,true,'Development evaluator rule is disabled');assert.equal(rule.sampling,1);assert.deepEqual(rule.filter,[{column:'name',type:'stringOptions',operator:'any of',value:[observation]},{column:'environment',type:'stringOptions',operator:'any of',value:['development']},{column:'metadata',key:'restore_external_judge',type:'stringObject',operator:'=',value:'true'}],'Registered rule scope changed');assert.ok(rule.evaluatorAssignments.some(x=>x.evaluatorId===evaluator.id));
  registry.push({dimension,evaluator,rule,source_sha256:hash(sourceCode),rubric_version:rubrics.version??rubrics.schema_version});await save(join(outRoot,'registry.json'),registry);
 }return registry;
}

export async function verifyCloudScores(config,trace,judgments,outRoot,{deadlineMs=180000}={}){
 const expected=judgments.flatMap(j=>{const version=j.result.judgment_schema==='ExternalCodexJudgment/v2'?2:1,name='restore.judge.'+(version===2?'v2.':'')+j.result.dimension;return expectedScores(j.result.dimension,j.result.metrics,{version}).map(s=>({...s,observationId:trace.spans.find(s=>s.name===name).spanId}));});const deadline=Date.now()+deadlineMs;let rows,issues;
 do{rows=await getAll(config,'/api/public/v3/scores',{traceId:trace.traceId,fields:'details,subject',limit:'100'});issues=expected.filter(s=>!rows.some(r=>r.source==='EVAL'&&r.name===s.name&&r.dataType===s.dataType&&r.value===s.value&&r.subject?.kind==='observation'&&r.subject.id===s.observationId&&r.subject.traceId===trace.traceId));if(!issues.length)break;await pause(3000);}while(Date.now()<deadline);
 const result={status:issues.length?'incomplete':'pass',expected:expected.length,observed:rows.length,missing:issues,calibration:'unmeasured',provisional:true};await save(join(outRoot,'scores-readback.json'),rows);await save(join(outRoot,'scores-reconciliation.json'),result);return result;
}
