import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeSession,redactText,projectTraces,selectFamily} from './collector.mjs';
const at='2026-11-01T11:00:00.000Z',later='2026-11-01T11:00:01.000Z';
const meta=(id='main',parent=null)=>({timestamp:at,type:'session_meta',payload:{id,parent_thread_id:parent,cli_version:'0.166.0-alpha.5.1',source:parent?{subagent:{thread_spawn:{parent_thread_id:parent,agent_path:'/root/worker'}}}:'vscode'}});
const completed=(item,id='event')=>({timestamp:later,type:'event_msg',payload:{type:'item_completed',thread_id:'main',turn_id:'turn',started_at_ms:Date.parse(at),completed_at_ms:Date.parse(later),item:{id,...item}}});
const normalize=rows=>normalizeSession(rows.map(JSON.stringify).join('\n')+'\n',{source_id:'fixture',from:at,to:'2026-11-01T12:00:00Z'});

test('captures native inner commands and observations with recorded timing and failure',()=>{
 const r=normalize([meta(),completed({type:'CommandExecution',command:'node check.mjs',aggregated_output:'assertion failed',exit_code:1,status:'failed'})]);
 const e=r.events.find(x=>x.kind==='command');assert.equal(e.input.command,'node check.mjs');assert.equal(e.output.stdout,'assertion failed');assert.equal(e.status,'error');assert.equal(e.started_at,at);
});
test('never exports protected reasoning, ciphertext, system or developer message bodies',()=>{
 const r=normalize([meta(),{timestamp:at,type:'response_item',payload:{type:'reasoning',id:'rs',summary:[{type:'summary_text',text:'Check the recorded result.'}],encrypted_content:'PRIVATE_CIPHER',content:[{type:'reasoning_text',text:'PRIVATE_RAW'}]}},completed({type:'Reasoning',summary_text:['Public summary'],raw_content:['PRIVATE_RAW_2']},'reasoning'),{timestamp:at,type:'response_item',payload:{type:'message',role:'developer',content:[{type:'input_text',text:'PRIVATE_SYSTEM'}]}}]);
 const text=JSON.stringify(r);for(const secret of ['PRIVATE_CIPHER','PRIVATE_RAW','PRIVATE_RAW_2','PRIVATE_SYSTEM'])assert.ok(!text.includes(secret));assert.ok(text.includes('Public summary'));assert.equal(r.coverage.private_reasoning,'not_exported');
});
test('pairs actual tool input and output, keeping missing feedback as a gap',()=>{
 const r=normalize([meta(),{timestamp:at,type:'response_item',payload:{type:'custom_tool_call',id:'call',call_id:'c1',name:'exec',input:'read source'}},{timestamp:later,type:'response_item',payload:{type:'custom_tool_call_output',call_id:'c1',output:'observed output'}}]);
 const e=r.events.find(x=>x.kind==='tool');assert.equal(e.input.arguments,'read source');assert.equal(e.output.result,'observed output');assert.equal(r.coverage.unpaired_calls,0);
 const pending=normalize([meta(),{timestamp:at,type:'response_item',payload:{type:'function_call',call_id:'pending',name:'read',arguments:'{}'}}]);assert.equal(pending.coverage.unpaired_calls,1);
});
test('skill reads are evidence of access, not claims that a Skill guided the design',()=>{
 const r=normalize([meta(),completed({type:'CommandExecution',command:'Get-Content C:/skills/reverse-motion-skill/SKILL.md',aggregated_output:'name: reverse-motion-skill',exit_code:0,status:'completed'})]);
 const e=r.events.find(x=>x.kind==='skill_read');assert.equal(e.input.skill_name,'reverse-motion-skill');assert.equal(e.output.interpretation,'read_observed_not_usage_proven');assert.equal(e.output.historical_skill_version,null);
});
test('redacts exact configured keys and common credential assignments without removing source domains',()=>{
 const text=redactText('LANGFUSE_SECRET_KEY="sk-lf-12345678-1234" Authorization: Bearer secretToken https://screen.toys/firewood/', ['secretToken']);assert.ok(!text.includes('sk-lf-12345678'));assert.ok(!text.includes('secretToken'));assert.ok(text.includes('https://screen.toys/firewood/'));
});
test('deduplicates response usage, does not sum cumulative event token counts',()=>{
 const u={timestamp:at,type:'token_usage_record',payload:{response_id:'response',turn_id:'turn',usage:{input_tokens:10,output_tokens:3,total_tokens:13},turn_token_usage:{input_tokens:100}}};
 const r=normalize([meta(),u,u,{timestamp:later,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:999}}}}]);assert.equal(r.coverage.observed_usage.input_tokens,10);assert.equal(r.events.filter(x=>x.kind==='usage').length,1);
});
test('scope filters future E2E out of process review without deleting collected acceptance events',()=>{
 const r=normalizeSession([meta(),completed({type:'AgentMessage',content:'Process decision',phase:'commentary'}),{timestamp:'2026-11-01T11:02:00Z',type:'event_msg',payload:{type:'item_completed',item:{type:'AgentMessage',id:'final',content:'Acceptance result',phase:'final_answer'}}}].map(JSON.stringify).join('\n'),{source_id:'fixture',from:at,to:'2026-11-01T11:03:00Z',process_end:'2026-11-01T11:01:00Z'});
 assert.equal(r.events.find(x=>x.output?.text==='Acceptance result').track,'final_acceptance');
});
test('family selection follows real parent links and excludes internal approval agents',()=>{
 const a=[{id:'main'},{id:'child',parent_thread_id:'main',source:{subagent:{thread_spawn:{agent_path:'/root/worker'}}}},{id:'grand',parent_thread_id:'child',source:{subagent:{thread_spawn:{agent_path:'/root/worker/nested'}}}},{id:'guard',parent_thread_id:'main',source:{subagent:{other:'guardian'}}},{id:'other'}];assert.deepEqual(selectFamily(a,'main').map(x=>x.id),['main','child','grand']);
});
test('projection has distinct recursive agent nodes and no fake model generation spans',()=>{
 const main=normalize([meta(),completed({type:'CommandExecution',command:'test',aggregated_output:'ok',exit_code:0})]);const child=normalize([meta('child','main'),completed({type:'AgentMessage',content:'review',phase:'final_answer'},'child-message')]);
 const result=projectTraces([main,child],{task_id:'task',capture_id:'capture'});const spans=result.traces[0].spans;const types=spans.map(s=>s.attributes.find(a=>a.key==='langfuse.observation.type').value.stringValue);assert.equal(types.filter(x=>x==='agent').length,2);assert.ok(!types.includes('generation'));
 const agents=spans.filter(s=>s.attributes.find(a=>a.key==='langfuse.observation.type').value.stringValue==='agent');assert.equal(agents.find(a=>a.name.includes('child')).parentSpanId,agents.find(a=>a.name.includes('main')).spanId);
});
test('preserves tool output and marks source truncation; final incomplete JSON line is a gap',()=>{
 const r=normalizeSession([JSON.stringify(meta()),JSON.stringify(completed({type:'CommandExecution',command:'large',aggregated_output:'Warning: truncated output\nkept',exit_code:0})),'{"unfinished":'].join('\n'),{source_id:'fixture'});assert.equal(r.coverage.parse_errors,1);assert.equal(r.events.find(x=>x.kind==='command').output.host_truncated,true);
});
test('repeated binary media becomes a hashed reference, while public summaries are not duplicated',()=>{
 const image='data:image/png;base64,'+Buffer.from('fixture-image').toString('base64');
 const r=normalize([meta(),{timestamp:at,type:'response_item',payload:{type:'reasoning',id:'rs',summary:[{type:'summary_text',text:'same summary'}],encrypted_content:'PRIVATE'}},completed({type:'Reasoning',summary_text:['same summary'],raw_content:['PRIVATE']},'rs'),{timestamp:at,type:'response_item',payload:{type:'custom_tool_call',call_id:'img',name:'view',input:'image'}},{timestamp:later,type:'response_item',payload:{type:'custom_tool_call_output',call_id:'img',output:[{type:'image',image_url:image},{type:'image',image_url:image}]}}]);
 assert.ok(!JSON.stringify(r).includes('base64,'));assert.equal(r.events.filter(e=>e.kind==='reasoning_summary').length,1);assert.ok(JSON.stringify(r).includes(createHash('sha256').update(Buffer.from('fixture-image')).digest('hex')));
});
test('analysis-channel text never becomes an exported assistant message',()=>{const r=normalize([meta(),{timestamp:at,type:'response_item',payload:{type:'message',role:'assistant',channel:'analysis',content:[{type:'output_text',text:'PRIVATE_ANALYSIS'}]}},completed({type:'AgentMessage',channel:'analysis',content:'PRIVATE_ANALYSIS'},'analysis')]);assert.ok(!JSON.stringify(r).includes('PRIVATE_ANALYSIS'));assert.equal(r.events.filter(e=>e.kind==='context_boundary').length,2);});
test('instruction-history mode exports only prior public user messages with original source locations',()=>{const rows=[meta(),{timestamp:at,type:'response_item',payload:{type:'message',role:'user',content:[{text:'Use a clean worktree.'}]}},completed({type:'AgentMessage',content:'OLD_E2E_SCORE_95'},'a'),{timestamp:'2026-11-01T12:00:00Z',type:'response_item',payload:{type:'message',role:'user',content:[{text:'FUTURE_OVERRIDE'}]}}];const r=normalizeSession(rows.map(JSON.stringify).join('\n'),{source_id:'fixture',to:later,user_messages_only:true});assert.equal(r.events.length,1);assert.equal(r.events[0].source.line,2);assert.equal(r.events[0].output.text,'Use a clean worktree.');});
test('opaque encrypted delegation arguments are not exported as public text',()=>{const cipher='gAAAAA'+'x'.repeat(100)+'==';const r=normalize([meta(),{timestamp:at,type:'response_item',payload:{type:'function_call',call_id:'c',name:'spawn_agent',arguments:JSON.stringify({task_name:'child',message:cipher})}},{timestamp:later,type:'response_item',payload:{type:'function_call_output',call_id:'c',output:'ok'}}]);assert.ok(!JSON.stringify(r).includes(cipher));assert.ok(JSON.stringify(r).includes('protected-content-sha256'));});
