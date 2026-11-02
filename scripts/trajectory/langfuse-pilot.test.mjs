import test from 'node:test';
import assert from 'node:assert/strict';
import {configFrom,toUnixNano,ledgerTrace,sourceClassification,validatePayload,reconcile,reconcileScores,postJSON,sendPilot} from './langfuse-pilot.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const settings={taskId:'fixture-task',runId:'fixture-run',contract:'a'.repeat(64),runBest:'b'.repeat(64),ledgerHash:'c'.repeat(64)};
const events=[{at:'2026-11-01T10:00:00Z',type:'freeze',phase:'baseline',best:null},{at:'2026-11-01T10:00:01Z',type:'record',phase:'final',best:'d'.repeat(64)},{at:'2026-11-01T10:00:02Z',type:'eval-record',phase:'complete',best:'b'.repeat(64)}];
const payload=()=>ledgerTrace(events,settings);
function rows(p){return p.spans.map(s=>{const a=Object.fromEntries(s.attributes.map(a=>[a.key,a.value.stringValue]));return {id:s.spanId,traceId:s.traceId,parentObservationId:s.parentSpanId??null,type:a['langfuse.observation.type'].toUpperCase(),name:s.name,sessionId:a['langfuse.session.id'],startTime:new Date(Number(BigInt(s.startTimeUnixNano)/1000000n)).toISOString(),endTime:new Date(Number(BigInt(s.endTimeUnixNano)/1000000n)).toISOString(),input:JSON.parse(a['langfuse.observation.input']),output:JSON.parse(a['langfuse.observation.output']),metadata:Object.fromEntries(Object.entries(a).filter(([k])=>k.startsWith('langfuse.observation.metadata.')).map(([k,v])=>[k.slice('langfuse.observation.metadata.'.length),v]))};});}

test('timestamp conversion preserves milliseconds without Number nanosecond precision loss',()=>{
 assert.equal(toUnixNano('2026-11-01T10:00:00.123Z'),'1793527200123000000');
 for(const x of [null,'yesterday','2026-02-31T10:00:00Z'])assert.throws(()=>toUnixNano(x));
});
test('ledger exports actual control events with stable IDs and explicit partial coverage',()=>{
 const p=payload(),again=payload();assert.deepEqual(p,again);assert.equal(p.spans.length,4);assert.match(p.traceId,/^[a-f0-9]{32}$/);
 assert.equal(p.spans[1].startTimeUnixNano,p.spans[1].endTimeUnixNano);
 const a=Object.fromEntries(p.spans[1].attributes.map(a=>[a.key,a.value.stringValue]));
 assert.equal(a['langfuse.observation.metadata.restore_capture_scope'],'restore_ledger_only');
 assert.equal(a['langfuse.observation.metadata.restore_record_origin'],'historical_import');
 assert.ok(!a['langfuse.observation.metadata.restore_artifact_sha256']);
 const old=Object.fromEntries(p.spans[2].attributes.map(a=>[a.key,a.value.stringValue]));assert.equal(old['langfuse.observation.metadata.restore_artifact_sha256'],'d'.repeat(64));
});
test('ledger refuses missing timestamps and never pretends to contain model generations',()=>{
 assert.throws(()=>ledgerTrace([{type:'record'}],settings));
 assert.ok(payload().spans.every(s=>!s.attributes.some(a=>a.key==='langfuse.observation.type'&&a.value.stringValue==='generation')));
});
test('byte reuse classification distinguishes complete runtime reuse from unproven origin',()=>{
 assert.equal(sourceClassification(Buffer.from('source'),Buffer.from('sourceobserver'),Buffer.from('observer')),'full_runtime_reuse');
 assert.equal(sourceClassification(Buffer.from('source'),Buffer.from('rewritten'),Buffer.from('observer')),'unknown');
});
test('config is literal, scoped, and requires an explicit destination and credentials',()=>{
 const c=configFrom('LANGFUSE_BASE_URL="https://example.invalid/"\nLANGFUSE_PUBLIC_KEY=pk-test\nLANGFUSE_SECRET_KEY="literal=$VALUE"\n',{ });
 assert.equal(c.baseUrl,'https://example.invalid');assert.equal(c.secretKey,'literal=$VALUE');
 assert.throws(()=>configFrom('',{}),/LANGFUSE/);
 assert.throws(()=>configFrom('LANGFUSE_BASE_URL=https://user:pass@example.invalid\nLANGFUSE_PUBLIC_KEY=x\nLANGFUSE_SECRET_KEY=y',{}),/URL/);
});
test('payload rejects duplicate span IDs and unknown parents before any upload',()=>{
 const p=payload();assert.equal(validatePayload([p]).spans,4);
 const q=structuredClone(p);q.spans[2].spanId=q.spans[1].spanId;assert.throws(()=>validatePayload([q]),/duplicate/i);
 const bad=payload();bad.spans[1].parentSpanId='f'.repeat(16);assert.throws(()=>validatePayload([bad]),/parent/i);
});
test('readback accepts JSON strings or parsed I/O but verifies time, metadata and old candidate binding',()=>{
 const p=payload(),r=rows(p);r[1].input=JSON.stringify(r[1].input);assert.equal(reconcile([p],r).status,'pass');
 r[2].metadata.restore_artifact_sha256='x';assert.equal(reconcile([p],r).status,'incomplete');
});
test('readback reports missing and altered observations instead of trusting HTTP success',()=>{
 const p=payload(),r=rows(p);assert.equal(reconcile([p],r.slice(1)).status,'incomplete');r[1].output={changed:true};assert.equal(reconcile([p],r).status,'incomplete');
});
test('score readback checks observation subject and preserves unknown as a category',()=>{
 const scores=[{id:'score-unknown',traceId:payload().traceId,observationId:payload().spans[0].spanId,name:'restore.process.status',dataType:'CATEGORICAL',value:'unknown'}];
 const rows=[{...scores[0],subject:{kind:'observation',id:scores[0].observationId,traceId:scores[0].traceId}}];
 assert.equal(reconcileScores(scores,rows).status,'pass');rows[0].subject.id='wrong';assert.equal(reconcileScores(scores,rows).status,'incomplete');
});
test('OTLP partial success is not treated as complete delivery',async()=>{
 const c={baseUrl:'https://example.invalid',publicKey:'pk-test',secretKey:'secret-test'};
 await assert.rejects(()=>postJSON(c,'/api/public/otel/v1/traces',{},async()=>new Response(JSON.stringify({partialSuccess:{rejectedSpans:1,errorMessage:'bad span'}}),{status:200})),/partial/i);
});
test('transport errors redact credentials and auth header before reporting',async()=>{
 const c={baseUrl:'https://example.invalid',publicKey:'pk-test',secretKey:'secret-test'};
 try{await postJSON(c,'/api/public/scores',[],async()=>new Response('secret-test pk-test '+Buffer.from('pk-test:secret-test').toString('base64'),{status:401}));assert.fail();}
 catch(e){assert.ok(!e.message.includes('secret-test'));assert.ok(!e.message.includes('pk-test'));}
});
test('mocked API roundtrip confirms observations and scores; resume does not repeat accepted writes',async t=>{
 const root=await mkdtemp(join(tmpdir(),'restore-langfuse-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const traces=[payload()],hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 const attrs=[{key:'service.name',value:{stringValue:'ui-reverse-engineer-restore'}},{key:'service.version',value:{stringValue:'firewood-langfuse-pilot/v1'}}];
 const request={resourceSpans:[{resource:{attributes:attrs},scopeSpans:[{scope:{name:'restore-firewood-pilot',version:'1'},spans:traces[0].spans}]}]};
 const scores=[{id:'fixture-unknown',traceId:traces[0].traceId,observationId:traces[0].rootId,name:'restore.process.status',dataType:'CATEGORICAL',value:'unknown'}];
 const manifest={observations_sha256:hash(traces),payload_sha256:hash(request),scores_sha256:hash(scores)};
 for(const [f,d] of [['manifest.json',manifest],['observations.json',traces],['otlp.json',request],['scores.json',scores]])await writeFile(join(root,f),JSON.stringify(d));
 const config=join(root,'test.env');await writeFile(config,'LANGFUSE_BASE_URL=https://example.invalid\nLANGFUSE_PUBLIC_KEY=fixture-pk\nLANGFUSE_SECRET_KEY=fixture-sk');
 let observations=[],storedScores=[],otelWrites=0,scoreWrites=0;
 const fakeFetch=async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,'https://example.invalid');assert.equal(options.headers['x-langfuse-ingestion-version'],'4');
  let value;if(u.pathname==='/api/public/projects')value={data:[{id:'fixture-project'}]};
  else if(u.pathname==='/api/public/otel/v1/traces'){otelWrites++;assert.deepEqual(JSON.parse(options.body),request);observations=rows(traces[0]);value={};}
  else if(u.pathname==='/api/public/v2/observations')value={data:observations,meta:{cursor:null}};
  else if(u.pathname==='/api/public/scores'){scoreWrites++;storedScores=JSON.parse(options.body).map(s=>({...s,subject:{kind:'observation',id:s.observationId,traceId:s.traceId}}));value=[];}
  else if(u.pathname==='/api/public/v3/scores')value={data:storedScores,meta:{cursor:null}};
  else throw new Error('Unexpected mock endpoint');return new Response(JSON.stringify(value),{status:200});
 };
 assert.equal((await sendPilot(root,config,{env:{},fetchImpl:fakeFetch})).status,'confirmed');
 const uncertain=JSON.parse(await readFile(join(root,'delivery.json'),'utf8'));uncertain.status='uncertain';await writeFile(join(root,'delivery.json'),JSON.stringify(uncertain));
 assert.equal((await sendPilot(root,config,{env:{},fetchImpl:fakeFetch})).status,'confirmed');
 assert.equal(otelWrites,1);assert.equal(scoreWrites,1);
 const receipt=await readFile(join(root,'delivery.json'),'utf8');assert.ok(!receipt.includes('fixture-sk'));assert.equal(JSON.parse(receipt).status,'confirmed');
});
