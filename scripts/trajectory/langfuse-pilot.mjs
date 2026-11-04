#!/usr/bin/env node
// Bounded Firewood integration pilot. No host tool or model trace is invented.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as core from '../restore/core.mjs';
import {scoreFinal} from '../../evals/pipeline/grader.mjs';
import {configFrom,request,postJSON,getAll,toUnixNano,otlp,reconcile,reconcileScores,validatePayload} from './langfuse.mjs';
// Compatibility imports remain valid; shared transport is owned by langfuse.mjs.
export {configFrom,request,postJSON,getAll,toUnixNano,otlp,reconcile,reconcileScores,validatePayload} from './langfuse.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const id=(x,n)=>sha(x).slice(0,n);
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const attr=(key,value)=>({key,value:{stringValue:typeof value==='string'?value:JSON.stringify(value)}});
const prefix='langfuse.observation.metadata.';
const sanitize=v=>JSON.parse(JSON.stringify(v).replace(/[A-Z]:[\\/](?:[^"\r\n]|\\")*/gi,'[local-path]'));

function common(s,origin,track,scope){return [attr('langfuse.session.id',s.taskId),attr('langfuse.trace.name','restore.firewood.'+(origin==='historical_import'?'ledger':'evaluation-pilot')),attr('langfuse.environment','development'),...Object.entries({restore_task_id:s.taskId,restore_run_id:s.runId,restore_contract_sha256:s.contract,restore_record_origin:origin,restore_track:track,restore_capture_scope:scope,restore_schema:'FirewoodLangfusePilot/v1'}).map(([k,v])=>attr(prefix+k,v))];}
function span(traceId,spanId,name,type,start,end,attributes,input,output,parentSpanId){return {traceId,spanId,...(parentSpanId?{parentSpanId}:{}),name,kind:1,startTimeUnixNano:toUnixNano(start),endTimeUnixNano:toUnixNano(end),attributes:[...attributes,attr('langfuse.observation.type',type),attr('langfuse.observation.input',input),attr('langfuse.observation.output',output)],status:{code:1}};}
export function ledgerTrace(events,s){
 assert.ok(events.length,'Ledger is empty');const times=events.map(e=>BigInt(toUnixNano(e.at)));const sorted=[...times].sort((a,b)=>a<b?-1:a>b?1:0);
 const traceId=id(`firewood-ledger/v1/${s.runId}/${s.ledgerHash}`,32),rootId=id(traceId+'/root',16),base=common(s,'historical_import','administrative','restore_ledger_only');
 const root=span(traceId,rootId,'firewood.historical-ledger','chain',new Date(Number(sorted[0]/1000000n)).toISOString(),new Date(Number(sorted.at(-1)/1000000n)).toISOString(),base,{run_id:s.runId,ledger_sha256:s.ledgerHash},{events:events.length,coverage:'partial',limitations:['Control events only; not host tool or model traces','Envelope duration is not active Agent work time','No model/token/cost data inferred']});
 const spans=[root,...events.map((e,i)=>{
  const track=e.type==='eval-record'?'final_acceptance':e.type==='report'?'administrative':'agent_process';
  const metadata=[...common(s,'historical_import',track,'restore_ledger_only'),attr(prefix+'restore_event_type',e.type),attr(prefix+'restore_raw_locator',`events.jsonl:L${i+1}`),attr(prefix+'restore_canonical_record_sha256',sha(core.canonical(e)))];
  if(e.best)metadata.push(attr(prefix+'restore_artifact_sha256',e.best));
  return span(traceId,id(`${traceId}/${i}/${core.canonical(e)}`,16),`restore.${e.type}`,'event',e.at,e.at,metadata,{event_type:e.type,phase:e.phase??null,actor:'unknown',duration:'unknown'},sanitize(e),rootId);
 })];return {traceId,rootId,spans};
}
export function sourceClassification(source,candidate,observer){return candidate.subarray(0,source.length).equals(source)&&candidate.subarray(source.length).equals(observer)?'full_runtime_reuse':'unknown';}
async function timed(name,fn){const start=new Date().toISOString(),output=await fn();return {name,start,end:new Date().toISOString(),output};}

export async function prepareFirewood(runRoot,outRoot){
 runRoot=resolve(runRoot);outRoot=resolve(outRoot);await mkdir(outRoot,{recursive:true});
 // An immutable prepared bundle must not be silently regenerated after delivery.
 const guard=await import('node:fs/promises');try{await guard.access(join(outRoot,'manifest.json'));throw new Error('Pilot output already exists; choose a fresh directory');}catch(e){if(e.code!=='ENOENT')throw e;}
 const start=new Date().toISOString(),run=await json(join(runRoot,'run.json')),contract=await core.contract(runRoot,run),ledgerBytes=await readFile(join(runRoot,'events.jsonl')),events=ledgerBytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
 assert.equal(contract.observed_url,'https://screen.toys/firewood/','This pilot is scoped to the observed Firewood case');assert.equal(run.phase,'complete');
 const provenance=await json(join(runRoot,'source-provenance.json'));assert.equal(contract.generation_policy.source_reuse,'allowed');
 const stages=[];
 stages.push(await timed('artifact-and-evidence-integrity',async()=>{
  assert.equal(await core.treeHash(join(runRoot,'restored')),run.best,'Current artifact differs from frozen best');
  const final=await json(join(runRoot,run.e2e.uri));assert.equal(core.digest(final),run.e2e.sha256,'Stored E2E digest mismatch');
  const ids=await core.verifyEvidence(runRoot,final.evidence,{artifact_sha256:run.best});return {artifact_verified:true,evidence_verified:true,evidence_count:ids.size};
 }));
 const sourceDir=join(dirname(runRoot),'inspect-20261101-live'),source=await readFile(join(sourceDir,'reference/index-C6RyM-i2.js')),candidate=await readFile(join(runRoot,'restored/app.js'));
 stages.push(await timed('source-runtime-classification',async()=>{
  assert.equal(sha(source),provenance.source_runtime_sha256);assert.equal(sha(candidate),provenance.local_runtime_sha256);
  const {footer}=await import(pathToFileURL(join(sourceDir,'native-observer.mjs')));const classification=sourceClassification(source,candidate,Buffer.from(footer));
  return {classification,source_sha256:sha(source),candidate_sha256:sha(candidate),source_bytes:source.length,added_bytes:candidate.length-source.length,originality_percentage:null,scope:'core runtime byte preservation; no full-context or per-asset originality audit'};
 }));
 stages.push(await timed('historical-e2e-regrade',async()=>{
  const request=await core.finalInput(runRoot,run),raw=await json(join(runRoot,'final-judge-raw.json')),scored=scoreFinal(request,raw),stored=await json(join(runRoot,run.e2e.uri));
  assert.equal(scored.total_100,stored.total_100);assert.equal(scored.status,stored.status);assert.equal(core.canonical(scored.binding),core.canonical(stored.binding));
  return {status:scored.status,total_100:scored.total_100,calibration:scored.calibration.status,provisional:scored.provisional,scope:'Recompute existing independent judgment; no fresh visual E2E or model Judge call',original_assessor:scored.assessor.id};
 }));
 const taskId='firewood-langfuse-'+randomUUID(),settings={taskId,runId:run.run_id,contract:run.contract_sha256,runBest:run.best,ledgerHash:sha(ledgerBytes)},historical=ledgerTrace(events,settings);
 const traceId=id(taskId+'/evaluation',32),rootId=id(traceId+'/root',16),base=common(settings,'runtime','administrative','local_code_evaluators_only');
 const liveSpans=stages.map((s,i)=>span(traceId,id(traceId+'/'+i,16),s.name,'evaluator',s.start,s.end,[...base,attr(prefix+'restore_artifact_sha256',run.best),attr(prefix+'restore_evaluator_kind','code')],{run_id:run.run_id,artifact_sha256:run.best},s.output,rootId));
 const root=span(traceId,rootId,'firewood.langfuse-evaluation-pilot','chain',start,new Date().toISOString(),base,{case_id:contract.case_source?.case_id??null,run_id:run.run_id,source_reuse:contract.generation_policy.source_reuse},{evaluators:stages.length,historical_control_events:events.length,process_quality:'unknown',full_agent_trace:false,missing:['Host model calls','Full subagent contexts','Historical file-read audit','Token and cost attribution']});
 const live={traceId,rootId,spans:[root,...liveSpans]},traces=[historical,live],summary=validatePayload(traces),scores=[];
 const add=(name,value,dataType,t,observationId,scope)=>scores.push({id:sha(`${taskId}/${name}/${observationId}/v1`),traceId:t,observationId,name,value,dataType,comment:JSON.stringify({rubric:'firewood-pilot/v1',scope,calibration:'unmeasured',run_id:run.run_id})});
 add('restore.integrity.artifact',1,'BOOLEAN',traceId,liveSpans[0].spanId,'Current frozen candidate');add('restore.integrity.evidence',1,'BOOLEAN',traceId,liveSpans[0].spanId,'Final evidence hash verification');
 add('restore.source.classification',stages[1].output.classification,'CATEGORICAL',traceId,liveSpans[1].spanId,'Core runtime only; not whole-task originality');
 add('restore.historical_e2e.total_100',stages[2].output.total_100,'NUMERIC',traceId,liveSpans[2].spanId,'Existing provisional independent result, regraded');add('restore.historical_e2e.status',stages[2].output.status,'CATEGORICAL',traceId,liveSpans[2].spanId,'Historical final artifact evaluation');add('restore.historical_e2e.calibration',stages[2].output.calibration,'CATEGORICAL',traceId,liveSpans[2].spanId,'Original judge calibration');
 add('restore.process.status','unknown','CATEGORICAL',traceId,rootId,'Incomplete historical Agent trace; no four-dimension total');add('restore.trace.capture_scope','restore_ledger_only','CATEGORICAL',historical.traceId,historical.rootId,'Historical control records, not complete tool trajectory');
 const payload=otlp(traces),manifest={schema_version:'FirewoodLangfusePilot/v1',task_id:taskId,run_id:run.run_id,source_run:runRoot,source_run_sha256:sha(await readFile(join(runRoot,'run.json'))),source_ledger_sha256:settings.ledgerHash,artifact_sha256:run.best,contract_sha256:run.contract_sha256,...summary,expected_scores:scores.length,status:'prepared',remote_validation:'not_run',observations_sha256:sha(JSON.stringify(traces)),payload_sha256:sha(JSON.stringify(payload)),scores_sha256:sha(JSON.stringify(scores)),missing:['Langfuse destination and project credentials not yet checked','Complete host/model/subagent trajectory unavailable']};
 await save(join(outRoot,'observations.json'),traces);await save(join(outRoot,'otlp.json'),payload);await save(join(outRoot,'scores.json'),scores);await save(join(outRoot,'local-evaluation.json'),stages);await save(join(outRoot,'manifest.json'),manifest);
 return manifest;
}

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,deadlineMs=60000){const deadline=Date.now()+deadlineMs;let result;do{result=await fn();if(result.status==='pass')return result;await pause(2000);}while(Date.now()<deadline);return result;}
export async function sendPilot(outRoot,configPath,{env=process.env,fetchImpl=fetch}={}){
 outRoot=resolve(outRoot);const c={...configFrom(configPath?await readFile(resolve(configPath),'utf8'):'',env),fetchImpl},manifest=await json(join(outRoot,'manifest.json')),traces=await json(join(outRoot,'observations.json')),payload=await json(join(outRoot,'otlp.json')),scores=await json(join(outRoot,'scores.json'));
 assert.equal(sha(JSON.stringify(traces)),manifest.observations_sha256,'Prepared observations changed');assert.equal(sha(JSON.stringify(payload)),manifest.payload_sha256,'Prepared OTLP changed');assert.equal(sha(JSON.stringify(scores)),manifest.scores_sha256,'Prepared scores changed');assert.equal(core.canonical(payload),core.canonical(otlp(traces)),'Prepared projection mismatch');validatePayload(traces);
 const projects=await request(c,'/api/public/projects');assert.equal(projects.data?.length,1,'Expected one project for the supplied project key');const project=projects.data[0],destination=sha(c.baseUrl+'/'+project.id);
 const receiptPath=join(outRoot,'delivery.json');let receipt;try{receipt=await json(receiptPath);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(receipt){assert.equal(receipt.destination,destination,'Prepared pilot already bound to another destination');if(receipt.status==='uncertain'||receipt.status==='partial')console.log('Prior delivery uncertain or partial; readback only, no OTLP resend.');}
 else{
  // Verify the v4 read path exists before writing the actual case.
  await getAll(c,'/api/public/v2/observations',{traceId:traces[0].traceId,fields:'core,basic,io,metadata',limit:'100'});
  receipt={destination,project_id:project.id,base_url:c.baseUrl,status:'uncertain',created_at:new Date().toISOString()};await save(receiptPath,receipt);
  try{await postJSON(c,'/api/public/otel/v1/traces',payload);receipt.status='api_accepted';await save(receiptPath,receipt);}catch(e){receipt.error=redact(e.message,c);receipt.status=/partial/i.test(e.message)?'partial':'uncertain';await save(receiptPath,receipt);throw e;}
 }
 console.log('OTLP accepted; polling observation readback.');
 const observationCheck=await poll(async()=>{const rows=[];for(const t of traces)rows.push(...await getAll(c,'/api/public/v2/observations',{traceId:t.traceId,fields:'core,basic,io,metadata,trace_context',limit:'100'}));await save(join(outRoot,'observations-readback.json'),rows);return reconcile(traces,rows);});
 await save(join(outRoot,'observations-reconciliation.json'),observationCheck);assert.equal(observationCheck.status,'pass','Observation readback incomplete; Scores were not sent');
 receipt.status='observations_confirmed';await save(receiptPath,receipt);
 if(!receipt.scores_api_accepted){await postJSON(c,'/api/public/scores',scores);receipt.scores_api_accepted=true;await save(receiptPath,receipt);}
 console.log('Scores accepted; polling subject/value readback.');
 const scoreCheck=await poll(async()=>{const rows=[];for(const t of traces)rows.push(...await getAll(c,'/api/public/v3/scores',{traceId:t.traceId,fields:'details,subject',limit:'100'}));await save(join(outRoot,'scores-readback.json'),rows);return reconcileScores(scores,rows);});
 await save(join(outRoot,'scores-reconciliation.json'),scoreCheck);assert.equal(scoreCheck.status,'pass','Score readback incomplete');
 receipt.status='confirmed';receipt.confirmed_at=new Date().toISOString();receipt.trace_urls=traces.map(t=>`${c.baseUrl}/project/${project.id}/traces/${t.traceId}`);await save(receiptPath,receipt);
 return {status:'confirmed',project_id:project.id,observations:observationCheck,scores:scoreCheck,trace_urls:receipt.trace_urls};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,a,b,...rest]=process.argv.slice(2);try{
  if(command==='prepare')console.log(JSON.stringify(await prepareFirewood(a,b),null,2));
  else if(command==='send'){const args=[b,...rest],i=args.indexOf('--config');console.log(JSON.stringify(await sendPilot(a,i>=0?args[i+1]:undefined),null,2));}
  else throw new Error('Usage: node scripts/trajectory/langfuse-pilot.mjs prepare FIREWOOD_RUN NEW_OUTPUT | send OUTPUT [--config FILE]');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
