import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const phase=e=>e.layer==='host_execution'?'native':'api';
const purpose=text=>/^# AGENTS\.md instructions|^<INSTRUCTIONS>|^<environment_context>/i.test(text)?'policy_context':'dialogue';

// This is an attributed host-event view, not a reconstruction of private model requests.
export function createViews(sessions,{instruction_history=[],delegation_specs=[]}={}){
 const merged=new Map();for(const s of sessions){const old=merged.get(s.session.thread_id);if(old)old.events.push(...s.events);else merged.set(s.session.thread_id,{...s,events:[...s.events]});}sessions=[...merged.values()];
 const result=sessions.map(s=>({...s,events:[]})),conversations=result.map(s=>({thread_id:s.session.thread_id,agent_path:s.session.agent_path,record_origin:'derived_from_host_events',messages:[]})),policy_contexts=[],delegations=[];
 const byId=new Map(result.map(s=>[s.session.thread_id,s])),conversation=new Map(conversations.map(s=>[s.thread_id,s]));let duplicates=0;
 for(let n=0;n<sessions.length;n++){
  const groups=[];
  for(const original of sessions[n].events){const e=structuredClone(original);
   if(['user_message','assistant_message'].includes(e.kind)){
    const text=e.output?.text??'',role=e.kind==='user_message'?'user':'assistant',key=sha([e.thread_id,e.turn_id,role,purpose(text),text]);
    const pair=e.turn_id&&groups.find(g=>g.key===key&&!g.layers.has(phase(e))&&g.layers.size===1&&Math.abs(Date.parse(g.event.completed_at)-Date.parse(e.completed_at))<=1000);
    if(pair){pair.layers.add(phase(e));pair.event.message.source_event_ids.push(e.event_id);pair.event.message.sources.push(e.source);duplicates++;continue;}
    const kind=role==='user'?purpose(text):'dialogue';e.message={role,actor_type:role==='user'?'end_user':'agent',purpose:kind,source_event_ids:[e.event_id],sources:[e.source]};
    if(kind==='policy_context'){e.kind='policy_context';e.message.actor_type='policy_context';policy_contexts.push({id:e.event_id,source_event_id:e.event_id,thread_id:e.thread_id,at:e.completed_at,text,scope:'observed_public_policy_not_privileged_system_context'});}
    groups.push({key,event:e,layers:new Set([phase(e)])});
   }
   result[n].events.push(e);
  }
 }
 for(const s of result)for(const e of s.events){
  if(e.message?.purpose==='dialogue')conversation.get(s.session.thread_id).messages.push({id:e.event_id,at:e.completed_at,role:e.message.role,actor_type:e.message.actor_type,content:e.output.text,source_event_ids:e.message.source_event_ids,phase:e.output.phase??null});
  if(e.kind!=='tool'||!['spawn_agent','send_message','followup_task'].includes(e.input?.name))continue;
  let args;try{args=typeof e.input.arguments==='string'?JSON.parse(e.input.arguments):e.input.arguments;}catch{continue;}if(typeof args?.message!=='string')continue;
  const target=args.task_name??args.target,matches=result.filter(r=>r.session.thread_id===target||r.session.agent_path===target||(e.input.name==='spawn_agent'&&r.session.parent_thread_id===e.thread_id&&r.session.agent_path?.endsWith('/'+target))||(e.input.name!=='spawn_agent'&&r.session.agent_path?.endsWith('/'+target)));
  const recipient=matches.length===1?matches[0].session.thread_id:null;
  const protectedBody=/\[protected-content-sha256:|^gAAAA[A-Za-z0-9_-]{60,}/.test(args.message);
  const d={id:'delegation-'+e.event_id,sender_event_id:e.event_id,sender_thread_id:e.thread_id,recipient_thread_id:recipient,target,at:e.started_at,text:protectedBody?null:args.message,text_sha256:protectedBody?null:sha(args.message),body_status:protectedBody?'encrypted_body':'public_sender_text',declared_fork:args.fork_turns??null,source:'recorded_sender_arguments',recipient_context_proven:false,delivery_status:recipient?'sender_record_with_matching_child':'recipient_unresolved'};delegations.push(d);
  if(protectedBody&&e.input.name==='spawn_agent'){const specs=delegation_specs.filter(s=>s.task_name===target&&Date.parse(s.created_at)<=Date.parse(d.at)).sort((a,b)=>b.created_at.localeCompare(a.created_at));if(specs.length){const spec=specs[0];const reads=byId.get(recipient)?.events.filter(x=>x.kind==='command'&&JSON.stringify(x.input).includes(spec.id)&&Date.parse(x.completed_at)>=Date.parse(d.at))??[];d.prepared_spec={id:spec.id,prompt_sha256:spec.prompt_sha256,exported_text_sha256:sha(spec.prompt),exported_text_redacted:spec.exported_text_redacted??false,created_at:spec.created_at,text:spec.prompt,recipient_read_event_ids:reads.map(x=>x.event_id),actual_delivery_proven:false};}}
  if(recipient&&d.text)conversation.get(recipient).messages.push({id:d.id,at:d.at,role:'user',actor_type:'parent_agent',content:d.text,source_event_ids:[e.event_id],record_origin:'sender_declaration_not_decrypted_recipient_context'});
 }
 for(const c of conversations)c.messages.sort((a,b)=>a.at.localeCompare(b.at));
 const root=sessions.find(s=>!byId.has(s.session.parent_thread_id));
 return {schema_version:'AgentTrajectoryView/v2',sessions:result,root_thread_id:root?.session.thread_id??sessions[0]?.session.thread_id,conversations,policy_contexts,delegations,instruction_history,coverage:{raw_events:sessions.reduce((n,s)=>n+s.events.length,0),logical_events:result.reduce((n,s)=>n+s.events.length,0),duplicate_views:duplicates,end_user_messages:conversations.reduce((n,c)=>n+c.messages.filter(m=>m.actor_type==='end_user').length,0),recipient_context:'not_proven',history_applicability:'requires_semantic_review'}};
}
