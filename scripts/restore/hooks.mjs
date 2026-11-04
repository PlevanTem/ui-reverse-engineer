#!/usr/bin/env node
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {sha,readJSON,text} from './core.mjs';
import {taskHook} from './task.mjs';
import {handleEvaluationHook} from '../evaluation/codex.mjs';
export const workspaceRoot=fileURLToPath(new URL('../../',import.meta.url));
export const defaultRegistry=join(workspaceRoot,'reverse_output','restore-task-bindings');
async function continuityHook(event,{workspace=workspaceRoot,registry=defaultRegistry}={}){
 if(!['Stop','Interrupt','SessionStart','PreCompact','PostCompact'].includes(event.hook_event_name)||!text(event.session_id)||!text(event.cwd)||event.agent_id||event.source==='fork')return {};
 const path=relative(resolve(workspace),resolve(event.cwd));if(path.startsWith('..')||isAbsolute(path))return {};
 let binding;try{binding=await readJSON(join(registry,`${sha(event.session_id)}.json`));}catch(e){if(e.code==='ENOENT')return {};throw e;}
 const task=await readJSON(join(binding.task_root,'task.json'));
 if(binding.schema_version!=='RestoreTaskBinding/v1'||binding.session_id!==event.session_id||binding.task_id!==task.task_id||task.owner_session!==event.session_id)return {};
 const output=await taskHook(binding.task_root,event);
 // Protocol calls can be simulated. This audit is receipt evidence, not proof of native activation.
 await writeFile(join(binding.task_root,'hook-events.jsonl'),JSON.stringify({at:new Date().toISOString(),event:event.hook_event_name,session_id:event.session_id,turn_id:event.turn_id??null,stop_hook_active:event.stop_hook_active??null,source:'stdin_unverified',decision:output.decision??null})+'\n',{flag:'a'});
 return output;
}
export async function handleHook(event,options={}){
 const continuity=await continuityHook(event,options);
 let evaluation;try{evaluation=await handleEvaluationHook(event,{workspace:options.workspace??workspaceRoot,evaluationRegistry:options.evaluationRegistry,start:options.startEvaluations});}catch(error){evaluation={systemMessage:`Codex evaluation unverified: ${error.message}`};}
 const output={...continuity};if(evaluation.hookSpecificOutput){output.hookSpecificOutput={...continuity.hookSpecificOutput,...evaluation.hookSpecificOutput,additionalContext:[continuity.hookSpecificOutput?.additionalContext,evaluation.hookSpecificOutput.additionalContext].filter(Boolean).join('\n')};}
 if(evaluation.systemMessage){output.systemMessage=[continuity.systemMessage,evaluation.systemMessage].filter(Boolean).join('\n');if(output.decision==='block')output.reason+='\n'+evaluation.systemMessage;}return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1024*1024)throw new Error('Hook input too large');}
  process.stdout.write(JSON.stringify(await handleHook(JSON.parse(input))));
 }catch(error){process.stdout.write(JSON.stringify({systemMessage:`Restore continuity check failed; acceptance unverified: ${error.message}`}));process.exitCode=1;}
}
