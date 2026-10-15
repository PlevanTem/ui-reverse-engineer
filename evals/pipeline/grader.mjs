#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { invoke } from '../../scripts/restore/adapter.mjs';
import { assert, text, canonical, references } from '../../scripts/restore/core.mjs';
import { validateRedlineProfile, validateRedlineAssessments } from './redline-contract.mjs';
export { REDLINES, REDLINE_CRITERIA } from './redline-contract.mjs';

export const DIMENSIONS=[['layout',25],['style',20],['content',15],['interaction',20],['fidelity',10],['robustness',10]];
export function scoreFinal(request,raw) {
  assert(request.schema_version==='FinalEvalRequest/v0.2'&&request.binding,'Final frozen request required');
  const redlineProfile=validateRedlineProfile(request);
  assert(canonical(raw.binding)===canonical(request.binding),'E2E binding mismatch');
  assert(raw.assessor?.role==='independent'&&text(raw.assessor.id),'Independent E2E assessor required');
  assert(Array.isArray(raw.evidence)&&raw.evidence.length,'E2E evidence required');
  const ids=new Set(raw.evidence.map(e=>e.id)); assert(ids.size===raw.evidence.length,'Duplicate evidence IDs');
  assert(Array.isArray(raw.covered_states)&&request.states.every(s=>raw.covered_states.includes(s.id)),'Full final state coverage required');
  assert(raw.dimensions?.length===6&&new Set(raw.dimensions.map(d=>d.id)).size===6,'Six unique E2E dimensions required');
  const dimensions=DIMENSIONS.map(([id,weight])=>{
    const d=raw.dimensions.find(x=>x.id===id); assert(d&&text(d.reason),'E2E dimension reason missing'); references(ids,d.evidence,id);
    assert(['scored','unknown','not_applicable'].includes(d.status),'Invalid E2E status');
    if(d.status==='scored') assert(Number.isInteger(d.score)&&d.score>=0&&d.score<=4,'E2E score must be 0–4'); else assert(d.score===null,'Unknown/N/A score must be null');
    return {...d,weight};
  });
  validateRedlineAssessments(raw.redlines,{evidenceIds:ids,coveredStates:raw.covered_states,profile:redlineProfile});
  assert(raw.calibration&&['unmeasured','calibrated','failed'].includes(raw.calibration.status),'Calibration status required');
  if(raw.calibration.status==='calibrated') {
    assert(Number.isFinite(raw.calibration.kappa)&&raw.calibration.kappa>=0.6&&raw.calibration.sample_size>=30&&raw.calibration.bias_pass===true,'Calibration profile not satisfied');
    references(ids,raw.calibration.evidence,'calibration');
  }
  const applicable=dimensions.filter(d=>d.status!=='not_applicable');
  const incomplete=applicable.some(d=>d.status==='unknown')||!applicable.length||raw.redlines.some(r=>r.status==='unknown');
  const total=incomplete?null:100*applicable.reduce((sum,d)=>sum+d.weight*d.score/4,0)/applicable.reduce((sum,d)=>sum+d.weight,0);
  const failed=raw.redlines.some(r=>r.status==='fail')||applicable.some(d=>d.status==='scored'&&d.score<3);
  return {schema_version:'E2EResultRef/v0.2',binding:request.binding,assessor:raw.assessor,calibration:raw.calibration,evidence:raw.evidence,covered_states:raw.covered_states,dimensions,redlines:raw.redlines,total_100:total,status:failed?'fail':incomplete?'incomplete':total>=75?'pass':'fail',provisional:raw.calibration.status!=='calibrated',scoring_provenance:`independent_evaluator/${request.binding.scorer_version}`,thresholds:'draft; per-case result, not version Go/No-Go'};
}
export function incomplete(request,reason) { return {schema_version:'E2EResultRef/v0.2',binding:request.binding??null,status:'incomplete',reason,dimensions:[],redlines:[],evidence:[],total_100:null,provisional:true,scoring_provenance:request.binding?.scorer_version?`independent_evaluator/${request.binding.scorer_version}`:'independent_evaluator/e2e/v0.3'}; }
export async function evaluate(request,args=[]) {
  if(!args[0]||!request.binding)return incomplete(request,'Independent Judge adapter not configured or artifact unavailable');
  try {return scoreFinal(request,await invoke(args[0],request,Math.max(0,Date.parse(request.deadline)-Date.now())));}
  catch(error){return incomplete(request,error.message);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let source='';for await(const chunk of process.stdin)source+=chunk;
  process.stdout.write(JSON.stringify(await evaluate(JSON.parse(source),process.argv.slice(2))));
}
