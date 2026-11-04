// Current Codex integration only. Hook callbacks signal work; workers own expensive I/O.
import {readFile,mkdir,open,lstat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {sha,digest,readJSON,writeJSON,assert,safeFile} from '../restore/core.mjs';
import {frameworkRoot,initEvaluation,signalEvaluation,pauseEvaluation} from './coordinator.mjs';
const owner=o=>o.session_id??o.env?.CODEX_THREAD_ID??o.env?.CODEX_SESSION_ID??process.env.CODEX_THREAD_ID??process.env.CODEX_SESSION_ID;
const registry=(workspace,o)=>o.evaluationRegistry??join(workspace,'reverse_output/evaluation-bindings');
async function entries(workspace,session_id,o){
 if(!session_id)return [];let doc;try{doc=await readJSON(join(registry(workspace,o),sha(session_id)+'.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 assert(doc.session_id===session_id&&doc.workspace===resolve(workspace),'Evaluation registry owner mismatch');
 for(const entry of doc.stores){const rel=relative(resolve(workspace),resolve(entry.store));assert(!rel.startsWith('..')&&!isAbsolute(rel),'Evaluation store outside workspace');const s=await readJSON(await safeFile(workspace,join(rel,'state.json')));assert(s.session_id===session_id&&s.run_id===entry.run_id,'Evaluation registry binding changed');}
 return doc.stores;
}
export async function bindCodexEvaluation(store,runRoot,config,o={}){
 const workspace=o.workspace??frameworkRoot,session_id=owner(o);assert(session_id,'Explicit Codex session ID required');
 const relativeStore=relative(resolve(workspace),resolve(store));assert(!relativeStore.startsWith('..')&&!isAbsolute(relativeStore),'Evaluation store outside workspace');
 const dir=registry(workspace,o);await mkdir(dir,{recursive:true});const lock=await open(join(dir,'.lock'),'wx');
 try{
  let state;try{state=await readJSON(join(store,'state.json'));assert(state.session_id===session_id&&state.run_root===resolve(runRoot)&&state.workspace===resolve(workspace)&&state.config_sha256===digest(config),'Existing evaluation binding differs');}catch(e){if(e.code!=='ENOENT')throw e;state=await initEvaluation(store,runRoot,{workspace,session_id,config});}
  const records=await entries(workspace,session_id,o),existing=records.find(x=>x.run_id===state.run_id);assert(!existing||existing.store===resolve(store),'Run already bound; use its existing evaluation directory');
  if(!existing)records.push({store:resolve(store),run_id:state.run_id,run_root:resolve(runRoot)});
  await writeJSON(join(dir,sha(session_id)+'.json'),{schema_version:'CodexEvaluationBinding/v1',session_id,workspace:resolve(workspace),stores:records});return {status:'bound',store:resolve(store),session_id,run_id:state.run_id};
 }finally{await lock.close();await import('node:fs/promises').then(fs=>fs.unlink(join(dir,'.lock')));}
}
export async function startEvaluationWorker(store,{start=true}={}){
 try{await lstat(join(store,'pause.json'));return {status:'paused',store};}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!start)return {status:'queued',store};
 try{await lstat(join(store,'worker.lock'));return {status:'busy_or_stale_lock',store};}catch(e){if(e.code!=='ENOENT')throw e;}
 const log=await open(join(store,'worker.log'),'a');try{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./cli.mjs',import.meta.url)),'drain',resolve(store)],{windowsHide:true,detached:true,stdio:['ignore',log.fd,log.fd],cwd:frameworkRoot});await new Promise((ok,bad)=>{child.once('spawn',ok);child.once('error',bad);});child.unref();return {status:'worker_started',pid:child.pid,store,completion:'Use evaluation status; startup is not a result'};
 }finally{await log.close();}
}
export async function afterCodexCommand(runRoot,trigger,o={}){
 const workspace=o.workspace??frameworkRoot,session_id=owner(o);const bound=await entries(workspace,session_id,o),entry=bound.find(x=>x.run_root===resolve(runRoot));if(!entry)return null;
 const s=await readJSON(join(entry.store,'state.json'));if(!s.config.suites.some(x=>x.triggers.includes(trigger)))return null;
 await signalEvaluation(entry.store,{session_id,trigger});return startEvaluationWorker(entry.store,o);
}
export async function handleEvaluationHook(event,o={}){
 const workspace=o.workspace??frameworkRoot;if(!['Stop','SessionStart','Interrupt','PreCompact','PostCompact'].includes(event.hook_event_name)||!event.session_id||!event.cwd||event.agent_id||event.source==='fork')return {};
 const rel=relative(resolve(workspace),resolve(event.cwd));if(rel.startsWith('..')||isAbsolute(rel))return {};
 const bound=await entries(workspace,event.session_id,o);if(!bound.length)return {};
 for(const entry of bound){
  if(event.hook_event_name==='Interrupt'){await pauseEvaluation(entry.store,event.session_id);continue;}
  const s=await readJSON(join(entry.store,'state.json'));
  if(s.config.suites.some(x=>x.triggers.includes(event.hook_event_name)))await signalEvaluation(entry.store,{session_id:event.session_id,trigger:event.hook_event_name,turn_id:event.turn_id??null});
  await startEvaluationWorker(entry.store,o);
 }
 const text=`Codex development evaluation: run node scripts/evaluation/cli.mjs status ${JSON.stringify(bound.at(-1).store)} to verify current artifact-bound findings before using them. Execution completion is not site acceptance. Pending work and budgets are durable; interrupted work requires explicit resume.`;
 if(event.hook_event_name==='SessionStart')return {hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:text}};
 return {systemMessage:event.hook_event_name==='Interrupt'?'Codex evaluation paused; pending jobs preserved.':text};
}
