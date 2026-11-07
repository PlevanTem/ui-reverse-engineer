import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, release } from 'node:os';
import { assert, readJSON, contract, local, treeHash, binding, budget } from './core.mjs';
import { validateCaptureStep, validateCaptureReadiness } from './capture-actions.mjs';

export function selectCaptureStates(states,pending,side) {
  if(!pending||side==='reference')return states;
  const requested=new Set(pending.required_states??[]),sessionLastIndex=new Map();
  for(const [index,state] of states.entries())if(requested.has(state.id)&&state.session_id)sessionLastIndex.set(state.session_id,index);
  return states.filter((state,index)=>requested.has(state.id)||(state.session_id&&index<=(sessionLastIndex.get(state.session_id)??-1)));
}

// Both capture adapters use the same hashes, exclusions, state scope and deadline.
export async function capturePlan(directory,side) {
  assert(['reference','candidate'].includes(side),'Capture side must be reference or candidate');
  const root=resolve(directory);let run=null;
  try{run=await readJSON(join(root,'run.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const lock=run??await readJSON(join(root,'contract-lock.json'));
  const c=lock.contract_sha256?await contract(root,lock):await readJSON(join(root,'contract.json'));
  const sessions=new Map();
  for(const s of c.states) {
    validateCaptureReadiness(s);for(const step of s.steps??[]) validateCaptureStep(step);
    if(s.session_id!==undefined) {
      assert(typeof s.session_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s.session_id),'State session_id must be a stable 1-64 character identifier');
      assert(!s.storage_state,'Shared-session states cannot preload storage_state');
      const signature=JSON.stringify({viewport:s.viewport,color_scheme:s.color_scheme??'light'}),prior=sessions.get(s.session_id);
      assert(!prior||prior===signature,`Shared session ${s.session_id} must keep one viewport and color scheme`);sessions.set(s.session_id,signature);
    }
  }
  const time=run?budget(run):null;
  const operationTimeout=Number(process.env.RESTORE_CAPTURE_TIMEOUT_MS??180000);
  if(!run)assert(Number.isFinite(operationTimeout)&&operationTimeout>0&&operationTimeout<=300000,'Capture operation timeout must be 1..300000 ms; Harbor owns the step deadline');
  const remaining=run?(run.stop?time.remaining_ms:Math.min(time.remaining_ms,time.repair_remaining_ms)):operationTimeout;
  assert(remaining>0,'Capture deadline exhausted');
  return {schema_version:'CapturePlan/v1',root,side,contract:c,frozen:!!lock.contract_sha256,deadline_basis:run?'local_run_budget':'harbor_bounded_operation',
    deadline_ms:Date.now()+remaining,os:platform()+' '+release(),
    binding:side==='candidate'?binding(lock,c,await treeHash(local(root,'restored'))):null,
    states:selectCaptureStates(c.states,run?.pending,side)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.stdout.write(JSON.stringify(await capturePlan(...process.argv.slice(2))));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
