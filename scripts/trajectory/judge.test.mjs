import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {validateJudgment,dimensionScores,buildPayload,cloudEvaluatorSource,runCodexJudge} from './judge.mjs';
const metrics=prefix=>[1,2,3].map(n=>({id:prefix+n,status:'scored',score:4,reason:'Supported by the supplied event.',evidence_refs:['event-1'],missing:[],confidence:'high'}));
const pack={dimension:'D',evidence_ids:['event-1'],schema_version:'TrajectoryJudgePayload/v1'};
async function cleanup(dir){const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('restore-judge-test-'));await rm(target,{recursive:true,force:true});}
test('an interrupted Judge start marker prevents an implicit repeat',async()=>{const dir=await mkdtemp(join(tmpdir(),'restore-judge-test-'));try{await writeFile(join(dir,'attempt.json'),'{}');await assert.rejects(runCodexJudge(pack,dir),e=>e.code==='EEXIST');}finally{await cleanup(dir);}});
test('a real failed CLI process retains execution evidence and refuses overwrite',async()=>{const dir=await mkdtemp(join(tmpdir(),'restore-judge-test-'));try{await assert.rejects(runCodexJudge(pack,dir,{codexBin:join(dir,'missing-cli.mjs'),timeoutMs:5000}),/Codex Judge failed/);const before=await readFile(join(dir,'execution.json'),'utf8'),e=JSON.parse(before);assert.equal(e.exit_code,1);assert.ok(e.started_at&&e.completed_at);await assert.rejects(runCodexJudge(pack,dir),/already exists/);assert.equal(await readFile(join(dir,'execution.json'),'utf8'),before);}finally{await cleanup(dir);}});
test('requires exactly the dimension metrics, real evidence references and 0-4 scores',()=>{
 const good={dimension:'D',metrics:metrics('D'),scope:'fixture'};assert.equal(validateJudgment(good,pack).dimension_score,4);
 for(const change of [r=>r.metrics[0].evidence_refs=['invented'],r=>r.metrics[0].score=5,r=>r.metrics[1].id='I1']){const r=structuredClone(good);change(r);assert.throws(()=>validateJudgment(r,pack));}
});
test('unknown remains null and prevents a misleading dimension or four-dimension total',()=>{
 const r={dimension:'D',metrics:metrics('D'),scope:'fixture'};r.metrics[0]={...r.metrics[0],status:'unknown',score:null,missing:['initial context unavailable']};const scored=validateJudgment(r,pack);assert.equal(scored.dimension_score,null);assert.equal(dimensionScores([scored]).total_100,null);
 r.metrics[0].score=0;assert.throws(()=>validateJudgment(r,pack));
});
test('actual N/A can redistribute within a dimension, but an absent dimension is not silently dropped',()=>{
 const r={dimension:'D',metrics:metrics('D'),scope:'fixture'};r.metrics[2]={...r.metrics[2],status:'not_applicable',score:null};assert.equal(validateJudgment(r,pack).dimension_score,4);assert.equal(dimensionScores([validateJudgment(r,pack)]).total_100,null);
});
test('payload excludes final acceptance and protected context and records text omissions',()=>{
 const sessions=[{session:{thread_id:'main'},coverage:{},events:[{event_id:'event-1',kind:'assistant_message',track:'agent_process',completed_at:'2026-11-01T10:00:00Z',input:{},output:{text:'Plan '.repeat(3000)}},{event_id:'heldout',kind:'assistant_message',track:'final_acceptance',input:{},output:{text:'FINAL_SCORE_95'}},{event_id:'context',kind:'context_boundary',track:'agent_process',input:{},output:{text:'PRIVATE_CONTEXT'}}]}];
 const result=buildPayload('D',sessions,{generation_policy:{mode:'source_assisted'}},[]);const text=JSON.stringify(result);assert.ok(!text.includes('FINAL_SCORE_95'));assert.ok(!text.includes('PRIVATE_CONTEXT'));assert.ok(result.omitted_content.length>0);assert.ok(result.evidence_ids.includes('event-1'));
});
test('cloud adapter preserves external LLM provenance and never converts unknown to numeric zero',()=>{
 const source=cloudEvaluatorSource('D');assert.ok(source.includes('external_codex'));assert.ok(source.includes('unknown'));assert.ok(!source.includes('|| 0'));assert.ok(!source.includes('?? 0'));
});
const check=(more={})=>({id:'check-1',statement:'The run had ten passing checks.',status:'supported',critical:true,claim_ref:'claim',action_ref:null,requirement_refs:[],evidence_refs:['result'],context_refs:[],missing_reason:null,reason:'The earlier recorded result reports ten passes.',...more});
const v2pack={schema_version:'TrajectoryJudgePayload/v2',dimension:'T',evidence_ids:['claim','result','later'],review_units:[{claim_ref:'claim',at:'2026-11-01T11:02:00Z'}],evidence:[{id:'claim',at:'2026-11-01T11:02:00Z'},{id:'result',at:'2026-11-01T11:01:00Z'},{id:'later',at:'2026-11-01T11:03:00Z'}],readiness:{unselected_process_events:2}};
test('v2 validates claim-level evidence timing and exposes metric coverage',()=>{const r={dimension:'T',scope:'bounded',metrics:metrics('T').map(m=>({...m,evidence_refs:['result'],checks:m.id==='T1'?[check()]:[]}))};const x=validateJudgment(r,v2pack);assert.equal(x.coverage.scored,3);assert.equal(x.coverage_limited,true);r.metrics[0].checks[0].evidence_refs=['later'];assert.throws(()=>validateJudgment(r,v2pack),/future evidence/);});
test('v2 cannot give a numerical metric over an unknown critical check or skip a claim',()=>{const r={dimension:'T',scope:'bounded',metrics:metrics('T').map(m=>({...m,evidence_refs:['result'],checks:m.id==='T1'?[check({status:'unknown',missing_reason:'binding_missing'})]:[]}))};assert.throws(()=>validateJudgment(r,v2pack),/critical unknown/);r.metrics[0].checks=[];assert.throws(()=>validateJudgment(r,v2pack),/claim coverage/);});
test('later diagnostic context can explain unknown but cannot become contemporaneous proof',()=>{const r={dimension:'T',scope:'bounded',metrics:metrics('T').map(m=>({...m,evidence_refs:['result'],checks:m.id==='T1'?[check({status:'unknown',evidence_refs:[],context_refs:['later'],missing_reason:'retrieval_gap'})]:[]}))};r.metrics[0].status='unknown';r.metrics[0].score=null;r.metrics[0].missing=['Earlier context absent'];assert.equal(validateJudgment(r,v2pack).coverage.unknown,1);r.metrics[0].checks[0].evidence_refs=['later'];assert.throws(()=>validateJudgment(r,v2pack),/future evidence/);});
test('a later requirement cannot retroactively authorize a recorded action',()=>{const p={...v2pack,dimension:'F',instruction_context:{prior_messages:[{id:'later',at:'2026-11-01T11:03:00Z'}]}};const r={dimension:'F',scope:'bounded',metrics:metrics('F').map(m=>({...m,evidence_refs:['result'],checks:m.id==='F2'?[check({claim_ref:null,action_ref:'result',requirement_refs:['later']})]:[]}))};assert.throws(()=>validateJudgment(r,p),/future permission/);});
