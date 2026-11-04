const finite=v=>typeof v==='number'&&Number.isFinite(v);
import {readFile} from 'node:fs/promises';
import {contract,binding,canonical,treeHash,local,safeFile,verifyEvidence,sha,digest,normalizeStaticCheckSuite,assert} from './core.mjs';
function validate(b){if(!b||!['x','y','width','height'].every(k=>finite(b[k]))||b.width<=0||b.height<=0)throw Error('Geometry must have finite coordinates and positive size');}
export function compareRegionGeometry(reference,candidate,options={}){
 if(!reference)return {status:'unknown',reason:'Reference geometry unavailable',metrics:null};validate(reference);
 if((options.reference_space??'viewport')!==(options.candidate_space??'viewport'))return {status:'unknown',reason:'Coordinate systems differ',metrics:null};
 if(!candidate)return {status:'fail',reason:'Required element missing',metrics:null};validate(candidate);
 const position=options.position_ratio??0.05,size=options.size_ratio??0.05,min=options.min_px??2;
 if(![position,size,min].every(v=>finite(v)&&v>=0))throw Error('Nonnegative geometry tolerances required');
 const m={center_dx_px:Math.abs(candidate.x+candidate.width/2-reference.x-reference.width/2),center_dy_px:Math.abs(candidate.y+candidate.height/2-reference.y-reference.height/2),width_error_ratio:Math.abs(candidate.width-reference.width)/reference.width,height_error_ratio:Math.abs(candidate.height-reference.height)/reference.height};
 const pass=m.center_dx_px<=Math.max(min,position*reference.width)&&m.center_dy_px<=Math.max(min,position*reference.height)&&Math.abs(candidate.width-reference.width)<=Math.max(min,size*reference.width)&&Math.abs(candidate.height-reference.height)<=Math.max(min,size*reference.height);
 return {status:pass?'pass':'fail',reason:pass?'Geometry within declared diagnostic tolerance':'Geometry outside declared diagnostic tolerance',metrics:m,tolerances:{position_ratio:position,size_ratio:size,min_px:min},limitation:'Geometry diagnostic only; not visual or interaction acceptance'};
}
export function diagnoseCaptureGeometry(c,capture){
 return (c.optimization?.design.regions??[]).map(region=>{
  const state=c.states.find(s=>s.id===region.state_id),observed=capture.states?.find(s=>s.state_id===region.state_id||s.id===region.state_id),fact=observed?.facts?.regions?.find(f=>f.selector===region.selector);
  let result;const unknown=reason=>({status:'unknown',reason,metrics:null});
  if(!observed)result=unknown('Candidate state not captured');
  else if(observed.facts?.viewport?.width!==state.viewport.width||observed.facts?.viewport?.height!==state.viewport.height)result=unknown('Viewport differs from frozen state');
  else if(!region.selector)result=unknown('No declared DOM mapping; canvas subjects require separate measured boxes');
  else if(!region.tolerances)result=unknown('No frozen diagnostic tolerance');
  else if(!fact)result=unknown('Selector not sampled');
  else if(fact.missing||fact.visible===false)result={status:'fail',reason:'Required element missing or hidden',metrics:null};
  else result=compareRegionGeometry(region.reference_box,fact.rect,{...region.tolerances,reference_space:region.coordinate_space,candidate_space:'viewport'});
  return {state_id:region.state_id,region_id:region.id,...result};
 });
}
export async function geometrySuite(root,run,capturePath){
 const started_at=new Date().toISOString(),c=await contract(root,run),bytes=await readFile(await safeFile(root,capturePath)),captured=JSON.parse(bytes);
 const artifact=await treeHash(local(root,'restored'));assert(c.optimization,'Optimized contract required');assert(captured.side==='candidate'&&canonical(captured.binding)===canonical(binding(run,c,artifact)),'Candidate geometry capture binding mismatch');await verifyEvidence(root,captured.evidence);
 const evidenceId='geometry-capture-'+sha(bytes).slice(0,16),evidence=[...captured.evidence,{id:evidenceId,kind:'checks',uri:capturePath,sha256:sha(bytes),artifact_sha256:artifact}];
 const checks=diagnoseCaptureGeometry(c,captured).map((r,i)=>({id:`geometry-${i}`,category:'quality',severity:'obvious',status:r.status,description:`${r.state_id}/${r.region_id} geometry diagnostic`,expected:'Element visible and within frozen per-region tolerance',actual:JSON.stringify(r),evidence:[evidenceId]}));
 assert(checks.length,'No frozen regions to diagnose');return normalizeStaticCheckSuite({schema_version:'StaticCheckSuite/v1',suite_id:'geometry-'+digest({artifact,capture:sha(bytes)}).slice(0,20),label:'Frozen region geometry diagnostics',stage:'supplemental',binding:{run_id:run.run_id,contract_sha256:run.contract_sha256,artifact_sha256:artifact},executor:{role:'tool',id:'geometry/v1'},started_at,completed_at:new Date().toISOString(),checks,evidence});
}
