import {createHash} from 'node:crypto';
import {readFile,readdir,open} from 'node:fs/promises';
import {join,basename} from 'node:path';
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const id=x=>hash(x).slice(0,40);
const iso=x=>{const n=typeof x==='number'?x:Date.parse(x);return Number.isFinite(n)?new Date(n).toISOString():null;};
const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(text).filter(Boolean).join('\n'):v&&typeof v==='object'?(v.text??v.summary_text??''):'';
export function redactText(value,secrets=[]){let s=String(value??'');for(const secret of secrets.filter(Boolean))s=s.split(secret).join('[redacted]');return s
 .replace(/\bgAAAA[A-Za-z0-9_-]{60,}={0,2}/g,v=>'[protected-content-sha256:'+hash(v)+']')
 .replace(/\b(?:sk|pk)-lf-[a-z0-9-]+\b/gi,'[redacted-langfuse-key]')
 .replace(/\bsk-(?:proj-)?[a-zA-Z0-9_-]{16,}\b/g,'[redacted-model-key]')
 .replace(/(Authorization\s*[:=]\s*["']?\s*(?:Basic|Bearer)\s+)[^\s"'\\]+/gi,'$1[redacted]')
 .replace(/((?:[A-Z_]*(?:API_KEY|SECRET_KEY|ACCESS_TOKEN)|apiKey|secretKey)\s*["']?\s*[:=]\s*["']?)[^"'\s,;]+/g,'$1[redacted]')
 .replace(/C:[\\/]+Users[\\/]+[^\\/\s"']+/gi,'[user-home]');}
function clean(v,secrets){if(typeof v==='string'){
 const media=v.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);if(media){const b=Buffer.from(media[2],'base64');return {media_sha256:hash(b),mime:media[1],bytes:b.length,storage:'original transcript media reference; binary not duplicated in text'};}
 return redactText(v,secrets).replace(/data:(image\/[^;]+);base64,[A-Za-z0-9+/=]+/g,m=>'[media-sha256:'+hash(m)+']');
 }if(Array.isArray(v))return v.map(x=>clean(x,secrets));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['encrypted_content','raw_content','base_instructions','replacement_history','internal_chat_message_metadata_passthrough'].includes(k)).map(([k,x])=>[k,/secret|password|authorization|api_key/i.test(k)?'[redacted]':clean(x,secrets)]));return v;}
function skillPaths(command){const result=[];for(const m of String(command).matchAll(/(?:[A-Za-z]:)?[^\s"'`;,()]+[\\/]SKILL\.md/g)){const path=m[0].replaceAll('\\','/'),parts=path.split('/');result.push({path,skill_name:parts.at(-2)});}return result;}

export function normalizeSession(source,{source_id='unknown-source',from=null,to=null,process_end=null,secrets=[],user_messages_only=false}={}){
 const parsed=[],coverage={scope:'exported_host_records',parse_errors:0,excluded_out_of_scope:0,unpaired_calls:0,protected_reasoning_records:0,public_reasoning_summaries:0,private_reasoning:'not_exported',private_context:'hash_only',observed_usage:{},unknown_item_types:{}};
 let line=0;for(const raw of source.split(/\r?\n/)){line++;if(!raw.trim())continue;try{parsed.push({row:JSON.parse(raw),line,hash:hash(raw)});}catch{coverage.parse_errors++;}}
 const metadata=parsed.find(x=>x.row.type==='session_meta')?.row.payload??{},thread=metadata.id??metadata.session_id??source_id,spawn=metadata.source?.subagent?.thread_spawn;
 const session={thread_id:thread,parent_thread_id:metadata.parent_thread_id??spawn?.parent_thread_id??null,agent_path:metadata.agent_path??spawn?.agent_path??'main',host_version:metadata.cli_version??null,source_id,context_inherited:Boolean(metadata.history_base||metadata.history_mode==='full')};
 const nativeIds=new Set(parsed.filter(x=>x.row.type==='event_msg'&&x.row.payload?.type==='item_completed').map(x=>x.row.payload.item?.id).filter(Boolean));
 const events=[],calls=new Map(),usage=new Map(),seen=new Set();let model=null,effort=null,currentTurn=null;
 const add=(kind,input,output,r,extra={})=>{
  const p=r.row.payload??{},timestamp=iso(r.row.timestamp);if(!timestamp)return;
  const key=extra.native_id??p.id??`${r.line}/${kind}`;const event_id=id(`${thread}/${kind}/${key}/${timestamp}`);if(seen.has(event_id))return;seen.add(event_id);
  events.push({schema_version:'AgentTrajectoryEvent/v1',event_id,thread_id:thread,parent_thread_id:session.parent_thread_id,agent_path:session.agent_path,turn_id:p.turn_id??currentTurn,kind,track:process_end&&Date.parse(timestamp)>Date.parse(process_end)?'final_acceptance':'agent_process',started_at:timestamp,completed_at:timestamp,status:'observed',input:clean(input,secrets),output:clean(output,secrets),model,effort,source:{source_id,line:r.line,record_sha256:r.hash},...extra});
 };
 for(const r of parsed){const row=r.row,p=row.payload??{};if(row.type==='session_meta')continue;const time=Date.parse(row.timestamp);if((from&&time<Date.parse(from))||(to&&time>Date.parse(to))){coverage.excluded_out_of_scope++;continue;}
  if(user_messages_only&&row.type==='turn_context'){currentTurn=p.turn_id??null;continue;}
  if(user_messages_only&&!((row.type==='response_item'&&p.type==='message'&&p.role==='user')||(row.type==='event_msg'&&p.type==='item_completed'&&p.item?.type==='UserMessage')))continue;
  if(row.type==='turn_context'){model=p.model??null;effort=p.effort??null;currentTurn=p.turn_id??null;add('context',{model,effort,turn_id:currentTurn},{context_payload_sha256:hash(p),private_context:'not_exported'},r);continue;}
  if(row.type==='response_item'&&(p.type==='custom_tool_call'||p.type==='function_call')){calls.set(p.call_id??p.id,{r,p});continue;}
  if(row.type==='response_item'&&(p.type==='custom_tool_call_output'||p.type==='function_call_output')){
   const call=calls.get(p.call_id);if(call){const start=iso(call.r.row.timestamp);add('tool',{name:call.p.name,arguments:call.p.input??call.p.arguments},{result:p.output},r,{native_id:p.call_id,started_at:start,completed_at:iso(row.timestamp),status:'returned',layer:'orchestration'});calls.delete(p.call_id);}else add('orphan_observation',{call_id:p.call_id},{result:p.output,missing:'tool_call'},r);continue;
  }
  if(row.type==='response_item'&&p.type==='reasoning'){
   coverage.protected_reasoning_records+=Boolean(p.encrypted_content||p.content);if(nativeIds.has(p.id))continue;const summary=text(p.summary);if(summary){add('reasoning_summary',{}, {text:summary,visibility:'public_summary'},r,{native_id:p.id});coverage.public_reasoning_summaries++;}continue;
  }
  if(row.type==='token_usage_record'){
   const key=p.response_id??p.turn_id??r.hash;usage.set(key,{r,p});continue;
  }
  if(row.type==='response_item'&&p.type==='message'){
   if(p.channel==='analysis'||p.phase==='analysis'){add('context_boundary',{role:p.role},{content_sha256:hash(p.content??[]),private_context:'analysis_not_exported'},r,{native_id:p.id});continue;}
   if(['developer','system'].includes(p.role)){add('context_boundary',{role:p.role},{content_sha256:hash(p.content??[]),private_context:'not_exported'},r,{native_id:p.id});continue;}
   if(['user','assistant'].includes(p.role)&&!nativeIds.has(p.id))add(p.role+'_message',{}, {text:text(p.content),phase:p.phase??null},r,{native_id:p.id});continue;
  }
  if(row.type==='response_item'&&p.type==='agent_message'){add('handoff',{author:clean(p.author,secrets),recipient:clean(p.recipient,secrets)},{text:text(p.content),body_status:p.content?.some?.(x=>x.type==='encrypted_content')?'encrypted_body_not_exported':'public_text_only'},r,{native_id:p.id});continue;}
  if(row.type==='compacted'){add('compaction',{}, {context_sha256:hash(p),original_history:'not_exported',window_number:p.window_number??null},r);continue;}
  if(row.type!=='event_msg')continue;
  if(p.type==='task_started'||p.type==='task_complete'||p.type==='turn_aborted'){add(p.type,{turn_id:p.turn_id},{error:p.error??null,reason:p.reason??null},r);continue;}
  if(p.type!=='item_completed')continue;
  const item=p.item??{},native_id=item.id,started=iso(p.started_at_ms)??iso(row.timestamp),ended=iso(p.completed_at_ms)??iso(row.timestamp),timing={native_id,started_at:started,completed_at:ended,layer:'host_execution'};
  if(item.type==='CommandExecution'){
   const success=item.exit_code===0;add('command',{command:item.command,cwd:item.cwd},{stdout:item.aggregated_output??'',exit_code:item.exit_code??null,host_truncated:/truncated output|output truncated/i.test(item.aggregated_output??'')},r,{...timing,status:item.exit_code===null||item.exit_code===undefined?'unknown':success?'success':'error'});
   if(success&&/Get-Content|\bcat\b|readFile|\btype\b/i.test(item.command??''))for(const s of skillPaths(item.command))add('skill_read',s,{interpretation:'read_observed_not_usage_proven',historical_skill_version:null,read_observation_id:native_id},r,{native_id:`${native_id}/${s.skill_name}`});
  }else if(item.type==='FileChange')add('file_change',{changes:item.changes??[]},{status:item.status,stdout:item.stdout??'',stderr:item.stderr??''},r,timing);
  else if(item.type==='ImageView')add('image_view',{path:item.path},{media_content:'original file referenced; not a new visual judgment'},r,timing);
  else if(item.type==='Reasoning'){const summary=text(item.summary_text);coverage.protected_reasoning_records+=Boolean(item.raw_content);if(summary){add('reasoning_summary',{}, {text:summary,visibility:'public_summary'},r,timing);coverage.public_reasoning_summaries++;}}
  else if(item.type==='AgentMessage'){if(item.phase==='analysis'||item.channel==='analysis')add('context_boundary',{role:'assistant'},{content_sha256:hash(item.content??[]),private_context:'analysis_not_exported'},r,timing);else add('assistant_message',{}, {text:text(item.content),phase:item.phase??null},r,timing);}
  else if(item.type==='UserMessage')add('user_message',{}, {text:text(item.content)},r,timing);
  else if(item.type==='SubAgentActivity')add('subagent_activity',{kind:item.kind,agent_thread_id:item.agent_thread_id,agent_path:item.agent_path,model:item.model,effort:item.reasoning_effort},{execution_node:'represented by child transcript when available'},r,timing);
  else if(item.type==='CollabAgentToolCall')add('communication',{tool:item.tool,receiver_thread_ids:item.receiver_thread_ids??[]},{status:item.status,agents_states:item.agents_states??null},r,timing);
  else if(item.type==='WebSearch')add('web_search',{query:item.query,action:item.action},{status:'recorded'},r,timing);
  else if(item.type==='ContextCompaction')add('compaction',{}, {context_sha256:hash(item),original_history:'not_exported'},r,timing);
  else coverage.unknown_item_types[item.type??'missing']=(coverage.unknown_item_types[item.type??'missing']??0)+1;
 }
 for(const [response_id,{r,p}] of usage){const value={};for(const [k,v] of Object.entries(p.usage??{}))if(Number.isFinite(v)&&v>=0){value[k]=v;coverage.observed_usage[k]=(coverage.observed_usage[k]??0)+v;}add('usage',{response_id},{usage:value,scope:'per_response_observed_only',cost_usd:null},r,{native_id:response_id});}
 coverage.unpaired_calls=calls.size;coverage.orphan_observations=events.filter(e=>e.kind==='orphan_observation').length;coverage.events=events.length;coverage.skill_reads=events.filter(e=>e.kind==='skill_read').length;coverage.full_model_request_context='unavailable';coverage.nested_internal_approval_agents='excluded';coverage.host_schema=session.host_version??'unknown';
 return {schema_version:'AgentTrajectorySession/v1',session,events:events.sort((a,b)=>a.completed_at.localeCompare(b.completed_at)),coverage};
}

export function selectFamily(inventory,rootId){const ids=new Set([rootId]);let changed=true;while(changed){changed=false;for(const x of inventory)if(ids.has(x.parent_thread_id??x.source?.subagent?.thread_spawn?.parent_thread_id)&&x.source?.subagent?.thread_spawn&&!ids.has(x.id)){ids.add(x.id);changed=true;}}return inventory.filter(x=>ids.has(x.id)&&(!x.source?.subagent?.other));}
export async function discoverSessions(directories,rootId){const all=[];for(const dir of directories){let files;try{files=await readdir(dir);}catch(e){if(e.code==='ENOENT')continue;throw e;}for(const name of files.filter(n=>n.endsWith('.jsonl'))){const path=join(dir,name),h=await open(path,'r');let first;try{const b=Buffer.alloc(Math.min(65536,(await h.stat()).size));await h.read(b,0,b.length,0);first=JSON.parse(b.toString('utf8').split('\n')[0]);}catch{continue;}finally{await h.close();}if(first.type==='session_meta')all.push({path,...first.payload});}}return selectFamily(all,rootId);}
export async function collectSessions(files,options){const result=[];for(const f of files){const bytes=await readFile(f.path);const session=normalizeSession(bytes.toString('utf8'),{...options,source_id:hash(f.path)});if(session.events.length)result.push({...session,source_file:{path:f.path,sha256:hash(bytes.toString('utf8')),bytes:bytes.length}});}return result;}
export async function collectInstructionHistory(files,{root_id,before,secrets=[]}){if(!Number.isFinite(Date.parse(before)))throw new Error('Instruction history needs an explicit cutoff');return collectSessions(files.filter(f=>f.id===root_id),{to:new Date(Date.parse(before)-1).toISOString(),user_messages_only:true,secrets});}

const attribute=(key,value)=>({key,value:{stringValue:typeof value==='string'?value:JSON.stringify(value)}});
const ns=t=>(BigInt(Date.parse(t))*1000000n).toString();
const spanId=x=>hash(x).slice(0,16);
export function projectTraces(sessions,{task_id,capture_id,run_id=null,max_output_chars=16000,views=null}={}){
 if(views)sessions=views.sessions;
 const events=sessions.flatMap(s=>s.events);if(!events.length)return {traces:[],coverage:{events:0}};
 const traceId=hash(task_id+'/'+capture_id).slice(0,32),rootId=spanId(traceId+'/capture'),starts=events.map(e=>e.started_at).filter(Boolean).sort(),ends=events.map(e=>e.completed_at).filter(Boolean).sort(),start=starts[0],end=ends.at(-1);
 const unique=new Map();for(const s of sessions){const prev=unique.get(s.session.thread_id);if(prev){prev.events.push(...s.events);prev.coverage.sources.push(s.coverage);}else unique.set(s.session.thread_id,{...s,events:[...s.events],coverage:{sources:[s.coverage]}});}
 const agentIds=new Map([...unique.keys()].map(k=>[k,spanId(traceId+'/agent/'+k)]));
 function make(name,type,key,from,to,parent,input,output,metadata={}){return {traceId,spanId:spanId(traceId+'/'+key),...(parent?{parentSpanId:parent}:{}),name,kind:1,startTimeUnixNano:ns(from),endTimeUnixNano:ns(to),attributes:[attribute('langfuse.session.id',task_id),attribute('langfuse.trace.name','restore.agent-trajectory'),attribute('langfuse.environment','development'),attribute('langfuse.observation.type',type),attribute('langfuse.observation.input',input),attribute('langfuse.observation.output',output),...Object.entries({restore_schema:'AgentTrajectory/v1',restore_capture_id:capture_id,restore_run_id:run_id,restore_provisional:true,...metadata}).map(([k,v])=>attribute('langfuse.observation.metadata.'+k,v))],status:{code:metadata.restore_status==='error'?2:0}};}
 const spans=[make('restore.capture','chain','capture',start,end,null,{task_id,capture_id},{sessions:unique.size,events:events.length,coverage:'exported_host_surface_only'})];spans[0].spanId=rootId;
 if(views){const messages=views.conversations.find(c=>c.thread_id===views.root_thread_id)?.messages??[];spans[0].attributes.find(a=>a.key==='langfuse.observation.input').value.stringValue=JSON.stringify(messages.filter(m=>m.actor_type==='end_user').map(m=>({role:m.role,content:m.content})));spans[0].attributes.find(a=>a.key==='langfuse.observation.output').value.stringValue=JSON.stringify(messages.filter(m=>m.role==='assistant'&&m.actor_type==='agent').map(m=>({role:m.role,content:m.content})));spans[0].attributes.push(attribute('langfuse.observation.metadata.restore_conversation_origin','derived_host_event_view_not_model_request'),attribute('langfuse.observation.metadata.restore_view_coverage',views.coverage));}
 const allSeen=new Set();for(const [thread,s] of unique){const parent=agentIds.get(s.session.parent_thread_id)??rootId,agent=make(`agent.${s.session.agent_path==='main'?'main':s.session.agent_path}.${thread}`,'agent','agent/'+thread,start,end,parent,{thread_id:thread,parent_thread_id:s.session.parent_thread_id},{coverage:s.coverage,interval:'capture envelope, not model generation latency'},{restore_agent_id:thread,restore_agent_path:s.session.agent_path});spans.push(agent);
  if(views){const messages=views.conversations.find(c=>c.thread_id===thread)?.messages??[];agent.attributes.find(a=>a.key==='langfuse.observation.input').value.stringValue=JSON.stringify(messages.filter(m=>m.role==='user').map(m=>({role:m.role,content:m.content})));agent.attributes.find(a=>a.key==='langfuse.observation.output').value.stringValue=JSON.stringify(messages.filter(m=>m.role==='assistant').map(m=>({role:m.role,content:m.content})));agent.attributes.push(attribute('langfuse.observation.metadata.restore_conversation_origin','derived_host_event_view_not_model_request'),attribute('langfuse.observation.metadata.restore_delegation_sources',views.delegations.filter(d=>d.recipient_thread_id===thread).map(d=>d.sender_event_id)));}
  for(const e of s.events){if(allSeen.has(e.event_id))continue;allSeen.add(e.event_id);const type=['command','tool','file_change','image_view','communication','web_search'].includes(e.kind)?'tool':'event';
   const inputText=JSON.stringify(e.input),outputText=JSON.stringify(e.output),chunks=[];const compact=(value,serialized,field)=>{if(serialized.length<=max_output_chars)return value;for(let i=0;i<serialized.length;i+=max_output_chars)chunks.push({field,index:i/max_output_chars,text:serialized.slice(i,i+max_output_chars)});return {content_sha256:hash(serialized),chunked:true,characters:serialized.length,field};};
   let input=compact(e.input,inputText,'input'),output=compact(e.output,outputText,'output');if(e.message?.purpose==='dialogue'){const message={role:e.message.role,content:e.output.text};if(message.role==='user'){input=[message];output=[];}else{input=[];output=[message];}}
   const node=make(`${e.kind}.${e.input?.name??e.event_id.slice(0,8)}`,type,'event/'+e.event_id,e.started_at,e.completed_at,agent.spanId,input,output,{restore_event_id:e.event_id,restore_agent_id:thread,restore_kind:e.kind,restore_track:e.track,restore_status:e.status,restore_source_ref:e.source,restore_layer:e.layer??'recorded',restore_content_chunked:Boolean(chunks.length),...(e.message?{restore_message_role:e.message.role,restore_actor_type:e.message.actor_type,restore_message_purpose:e.message.purpose,restore_message_sources:e.message.source_event_ids}: {})});spans.push(node);
   for(const chunk of chunks)spans.push(make(`content.${chunk.field}.${chunk.index}`,'event',`chunk/${e.event_id}/${chunk.field}/${chunk.index}`,e.completed_at,e.completed_at,node.spanId,{transport_chunk:true,field:chunk.field,index:chunk.index},{text:chunk.text},{restore_track:'administrative',restore_transport_chunk:true,restore_event_id:e.event_id}));
  }
 }
 if(views){for(const h of views.instruction_history??[]){const context=make('instruction_context.'+h.id.slice(0,8),'event','history/'+h.id,h.at,h.at,rootId,[{role:'user',content:h.text}],{applicability:'not_inferred',record_origin:'prior_public_user_context'},{restore_event_id:h.id,restore_actor_type:'prior_user_context',restore_kind:'instruction_context',restore_track:'instruction_context',restore_source_ref:h.source});spans.push(context);if(BigInt(context.startTimeUnixNano)<BigInt(spans[0].startTimeUnixNano))spans[0].startTimeUnixNano=context.startTimeUnixNano;}for(const s of spans)s.attributes.find(a=>a.key==='langfuse.observation.metadata.restore_schema').value.stringValue='AgentTrajectory/v2';}
 return {traces:[{traceId,rootId,spans}],coverage:{sessions:unique.size,events:allSeen.size,spans:spans.length,private_reasoning:'not_exported',model_request_context:'unavailable',original_media:'referenced_not_uploaded',...(views?{view:views.coverage}:{})}};
}
