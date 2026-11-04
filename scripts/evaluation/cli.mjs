#!/usr/bin/env node
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {bindCodexEvaluation} from './codex.mjs';
import {checkpointEvaluation,drainEvaluation,evaluationStatus,pauseEvaluation,resumeEvaluation} from './coordinator.mjs';
import {deliverEvaluation} from './delivery.mjs';
const [command,path,...args]=process.argv.slice(2),session=()=>process.env.CODEX_THREAD_ID??process.env.CODEX_SESSION_ID;
try{
 let result;const store=path&&resolve(path);
 if(command==='bind'){if(!path||!args[0]||!args[1])throw new Error('bind STORE RUN CONFIG_JSON [SESSION_ID]');result=await bindCodexEvaluation(store,resolve(args[0]),JSON.parse(await readFile(resolve(args[1]),'utf8')),{session_id:args[2]??session()});}
 else if(command==='checkpoint')result=await checkpointEvaluation(store,{trigger:args[0]??'checkpoint'});
 else if(command==='drain'){result=await drainEvaluation(store);const s=JSON.parse(await readFile(resolve(store,'state.json'),'utf8'));if(s.config.langfuse_config&&!['paused','busy_or_stale_lock'].includes(result.status)){try{result.delivery=await deliverEvaluation(store,{session_id:s.session_id});}catch(e){result.delivery={status:'incomplete',reason:e.message,recovery:'Local results preserved; deliver reconciles existing receipts without re-running Judges'};}}}
 else if(command==='deliver')result=await deliverEvaluation(store,{session_id:args[0]??session()});
 else if(command==='status')result=await evaluationStatus(store,{session_id:args[0]??session()});
 else if(command==='doctor'){const s=await evaluationStatus(store,{session_id:args[0]??session()}),state=JSON.parse(await readFile(resolve(store,'state.json'),'utf8'));result={host:'codex',node:process.version,owner_verified:true,run_id:s.run_id,paused:s.paused,suites:state.config.suites.map(s=>({id:s.id,runner:s.runner,independent_adapter:!!s.adapter})),source_configured:!!state.config.source,langfuse_configured:!!state.config.langfuse_config,native_activation:'unverified',scope:'development_only'};}
 else if(command==='pause')result=await pauseEvaluation(store,args[0]??session());
 else if(command==='resume'){await resumeEvaluation(store,args[0]??session());result=await drainEvaluation(store);}
 else result={usage:'bind STORE RUN CONFIG.json [SESSION_ID] | checkpoint STORE [TRIGGER] | drain STORE | status/doctor/deliver STORE [SESSION_ID] | pause/resume STORE [SESSION_ID]. Codex development only; see references/evaluation/interfaces.md.'};
 console.log(JSON.stringify(result,null,2));if(result.failed||result.delivery?.status==='incomplete'||['paused','uncertain','incomplete','budget_exhausted','judge_budget_exhausted'].includes(result.status))process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
