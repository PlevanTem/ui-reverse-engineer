import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import * as core from '../restore/core.mjs';
import {initEvaluation,checkpointEvaluation,drainEvaluation} from './coordinator.mjs';
import {deliverEvaluation} from './delivery.mjs';

test('checkpoint API delivery preserves unknown and resumes without repeating accepted writes',async t=>{
 const workspace=await mkdtemp(join(tmpdir(),'codex-eval-delivery-'));t.after(async()=>{assert.ok(resolve(workspace).startsWith(resolve(tmpdir())+sep)&&basename(workspace).startsWith('codex-eval-delivery-'));await rm(workspace,{recursive:true,force:true});});
 const runRoot=join(workspace,'case'),store=join(workspace,'reverse_output/evaluation/case');await core.init(runRoot,'https://example.com');await writeFile(join(runRoot,'restored/index.html'),'fixture');
 const config={schema_version:'CodexEvaluationConfig/v1',suites:[{id:'fixture',runner:'engineering',triggers:['checkpoint']}],budget:{max_jobs:2,max_wall_ms:600000,max_job_ms:30000,max_judge_calls:1}};
 await initEvaluation(store,runRoot,{workspace,session_id:'owner',config});await checkpointEvaluation(store);await drainEvaluation(store,{executors:{engineering:async()=>({status:'unknown',reason:'insufficient evidence'})}});
 let rows=[],scores=[],spanPosts=0,scorePosts=0,remoteReads=0;
 const remote={baseUrl:'https://fixture.invalid',publicKey:'public',secretKey:'secret',fetchImpl:async(url,init)=>{
  const p=new URL(url).pathname;let output;if(init.method==='GET')remoteReads++;
  if(p==='/api/public/projects')output={data:[{id:'fixture-project'}]};
  else if(p==='/api/public/otel/v1/traces'){
   spanPosts++;const spans=JSON.parse(init.body).resourceSpans.flatMap(r=>r.scopeSpans.flatMap(s=>s.spans));
   rows=spans.map(s=>{const a=Object.fromEntries(s.attributes.map(a=>[a.key,a.value.stringValue]));return {id:s.spanId,traceId:s.traceId,name:s.name,parentObservationId:s.parentSpanId??null,type:a['langfuse.observation.type'].toUpperCase(),sessionId:a['langfuse.session.id'],input:JSON.parse(a['langfuse.observation.input']),output:JSON.parse(a['langfuse.observation.output']),startTime:new Date(Number(BigInt(s.startTimeUnixNano)/1000000n)).toISOString(),endTime:new Date(Number(BigInt(s.endTimeUnixNano)/1000000n)).toISOString(),metadata:Object.fromEntries(Object.entries(a).filter(([k])=>k.startsWith('langfuse.observation.metadata.')).map(([k,v])=>[k.slice('langfuse.observation.metadata.'.length),v]))};});output={};
  }else if(p==='/api/public/v2/observations')output={data:rows,meta:{cursor:null}};
  else if(p==='/api/public/scores'){scorePosts++;scores=JSON.parse(init.body).map(s=>({...s,source:'API',subject:{kind:'observation',id:s.observationId,traceId:s.traceId}}));output=[];}
  else if(p==='/api/public/v3/scores')output={data:scores,meta:{cursor:null}};
  else throw new Error('Unexpected checkpoint endpoint');return new Response(JSON.stringify(output),{status:200});
 }};
 const first=await Promise.all([deliverEvaluation(store,{session_id:'owner',config:remote}),deliverEvaluation(store,{session_id:'owner',config:remote})]);const a=first.find(x=>x.status==='pass');assert.ok(a);assert.ok(first.every(x=>['pass','busy_or_stale_lock'].includes(x.status)));assert.equal(a.deliveries[0].score_sources[0],'API');assert.equal(scores[0].value,'unknown');assert.ok(!scores.some(s=>s.dataType==='NUMERIC'));
 const before=remoteReads;assert.equal((await deliverEvaluation(store,{session_id:'owner',config:remote})).status,'pass');assert.equal(spanPosts,1);assert.equal(scorePosts,1);assert.equal(remoteReads,before,'confirmed immutable delivery should reuse its receipt');
});
