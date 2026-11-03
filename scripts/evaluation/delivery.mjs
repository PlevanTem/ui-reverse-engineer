// Checkpoint observations/API Scores have a separate namespace from full-task native EVAL scores.
import {readFile,mkdir,writeFile,open,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {digest,sha,readJSON,writeJSON,safeFile,assert} from '../restore/core.mjs';
import {configFrom,postJSON,getAll,reconcileScores} from '../trajectory/langfuse.mjs';
import {sendTraces} from '../trajectory/transport.mjs';
import {redactText} from '../trajectory/collector.mjs';
import {evaluationStatus} from './coordinator.mjs';
const attr=(key,value)=>({key,value:{stringValue:typeof value==='string'?value:JSON.stringify(value)}});
const ns=t=>(BigInt(Date.parse(t))*1000000n).toString();
function scoresFor(job,result,traceId,observationId){
 const out=[],add=(name,value,dataType)=>out.push({id:sha(job.job_id+'/'+name).slice(0,32),traceId,observationId,name,value,dataType,comment:'Codex development checkpoint; not final acceptance; preserve unknown and calibration'});
 add('restore.checkpoint.'+job.suite.id+'.status',result.status,'CATEGORICAL');
 for(const d of result.dimensions??[]){add('restore.checkpoint.e2e.'+d.id+'.status',d.status,'CATEGORICAL');if(d.status==='scored')add('restore.checkpoint.e2e.'+d.id,d.score,'NUMERIC');}
 for(const j of result.judgments??[])for(const m of j.result.metrics){add('restore.checkpoint.process.'+m.id+'.status',m.status,'CATEGORICAL');if(m.status==='scored')add('restore.checkpoint.process.'+m.id,m.score,'NUMERIC');}
 if(result.calibration||result.assessment)add('restore.checkpoint.calibration','unmeasured','CATEGORICAL');return out;
}
export async function deliverEvaluation(store,options={}){
 const view=await evaluationStatus(store,{session_id:options.session_id});if(view.paused)return {status:'paused'};
 const path=join(store,'delivery.lock');let lock;try{lock=await open(path,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));}catch(e){if(e.code==='EEXIST')return {status:'busy_or_stale_lock'};throw e;}
 try{return await deliver(store,options);}finally{await lock.close();await unlink(path);}
}
async function deliver(store,{session_id,config,fetchImpl}={}){
 const view=await evaluationStatus(store,{session_id}),state=await readJSON(join(store,'state.json'));
 if(!config&&!state.config.langfuse_config)return {status:'not_configured',scope:'local_results_preserved'};
 config??=configFrom(await readFile(await safeFile(state.workspace,state.config.langfuse_config),'utf8'),{});if(fetchImpl)config={...config,fetchImpl};const deliveries=[];
 for(const job of view.jobs.filter(j=>j.state==='completed'&&j.result)){
  const result=await readJSON(await safeFile(store,job.result.uri));assert(digest(result)===job.result.sha256,'Evaluation result changed');
  const traceId=sha('codex-checkpoint/'+job.job_id).slice(0,32),spanId=sha(traceId+'/result').slice(0,16),out=join(store,'results',job.job_id,'delivery');await mkdir(out,{recursive:true});
  const secrets=[config.publicKey,config.secretKey,Buffer.from(config.publicKey+':'+config.secretKey).toString('base64')],output=JSON.parse(redactText(JSON.stringify(result),secrets));
  const trace={traceId,spans:[{traceId,spanId,name:'restore.codex-checkpoint.'+job.suite.id,kind:1,startTimeUnixNano:ns(job.started_at),endTimeUnixNano:ns(job.completed_at),attributes:[attr('langfuse.session.id',state.run_id),attr('langfuse.trace.name','restore.codex-development-evaluation'),attr('langfuse.environment','development'),attr('langfuse.observation.type','evaluator'),attr('langfuse.observation.input',{job_id:job.job_id,checkpoint_id:job.checkpoint_id}),attr('langfuse.observation.output',output),attr('langfuse.observation.metadata.restore_agent_role','evaluator'),attr('langfuse.observation.metadata.restore_scope','checkpoint_development_not_full_task'),attr('langfuse.observation.metadata.restore_run_id',state.run_id)],status:{code:0}}]};
  const expected=scoresFor(job,output.result,traceId,spanId),key=digest({destination:sha(config.baseUrl+'/'+config.publicKey),trace,scores:expected,result_sha256:job.result.sha256}),completeFile=join(out,'confirmed.json');
  let confirmed;try{confirmed=await readJSON(completeFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(confirmed){assert(confirmed.key===key&&confirmed.delivery.status==='pass','Confirmed checkpoint delivery changed');deliveries.push({...confirmed.delivery,reused_confirmation:true});continue;}
  const spans=await sendTraces([trace],out,config,{deadlineMs:30000});assert(spans.status==='pass','Checkpoint observations unconfirmed');
  const file=join(out,'score-attempt.json'),intent={schema_version:'CodexCheckpointScoreDelivery/v1',destination:sha(config.baseUrl+'/'+config.publicKey),payload_sha256:digest(expected)};
  let previous;try{previous=await readJSON(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(previous)assert(digest(previous)===digest(intent),'Checkpoint score destination/payload changed');
  else{await writeFile(file,JSON.stringify(intent,null,2)+'\n',{flag:'wx'});await postJSON(config,'/api/public/scores',expected);}
  let rows,check;const deadline=Date.now()+30000;
  do{rows=await getAll(config,'/api/public/v3/scores',{traceId,fields:'details,subject',limit:'100'});check=reconcileScores(expected,rows);if(check.status==='pass')break;await new Promise(r=>setTimeout(r,3000));}while(Date.now()<deadline);
  await writeJSON(join(out,'scores-readback.json'),rows);await writeJSON(join(out,'scores-reconciliation.json'),check);
  const record={job_id:job.job_id,status:check.status,observations:spans,score_count:expected.length,score_sources:[...new Set(rows.map(r=>r.source??'unknown'))]};
  if(check.status==='pass')await writeFile(completeFile,JSON.stringify({key,confirmed_at:new Date().toISOString(),delivery:record},null,2)+'\n',{flag:'wx'});deliveries.push(record);
 }
 return {status:deliveries.every(d=>d.status==='pass')?'pass':'incomplete',deliveries,scope:'checkpoint_development_not_final_acceptance'};
}
