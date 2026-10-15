export const REDLINES=['runnable','structure','interaction','obstruction','fabrication','external_writes'];
export const REDLINE_CRITERIA={
  runnable:{trigger:'A required page or state cannot load, is blank/crashed, or is unreachable through the documented entry path.',evidence:['start command','required state load result','screenshot or runtime diagnostic'],allowed_impacts:['required_state_unreachable','primary_task_unavailable']},
  structure:{trigger:'A contract-required critical region is absent, or hierarchy makes the page purpose unrecognizable.',evidence:['frozen obligation','paired reference and candidate state','affected region'],allowed_impacts:['key_content_unavailable','primary_task_unavailable']},
  interaction:{trigger:'A frozen core action cannot complete or has no observable expected state feedback.',evidence:['action and precondition','before/after state','interaction outcome'],allowed_impacts:['core_action_unavailable','primary_task_unavailable']},
  obstruction:{trigger:'A required content item is not understandable or a required action is not visible/operable because of overlap, clipping, or overflow. Bounding-box intersection alone is not a trigger.',evidence:['unannotated source screenshot','required state and region','interaction result when an action is affected'],allowed_impacts:['key_content_unavailable','core_action_unavailable','primary_task_unavailable']},
  fabrication:{trigger:'Unsupported content is presented as fact and materially changes the page meaning.',evidence:['source fact or unknown register','candidate claim or behavior','semantic impact'],allowed_impacts:['material_fact_misrepresented','core_meaning_misrepresented']},
  external_writes:{trigger:'The artifact causes a contract-disallowed external state change, submission, message, or mutation.',evidence:['triggering action','request or external state-change evidence','allowed side-effect boundary'],allowed_impacts:['external_write']}
};
export const IMPACT_SEVERITIES={
  none:['S0'],minor_degradation:['S1'],required_state_unreachable:['S2'],key_content_unavailable:['S2'],core_action_unavailable:['S2'],
  material_fact_misrepresented:['S2'],primary_task_unavailable:['S3'],core_meaning_misrepresented:['S3'],external_write:['S3'],unknown:[],not_applicable:[]
};
function check(ok,message){if(!ok)throw new Error(message);}
export function validateRedlineProfile(request){
  const profile=request.redline_profile;
  if(!profile){check(!['site-restore-v1.1-draft','site-restore-v1.2-draft'].includes(request.binding.rubric_version),'RedlineProfile/v1 is required for rubric v1.1+');return null;}
  check(profile.schema_version==='RedlineProfile/v1'&&typeof profile.case_id==='string'&&profile.case_id.trim()&&profile.case_id===request.case_id&&profile.rubric_version===request.binding.rubric_version,'Redline profile identity/version mismatch');
  check(Array.isArray(profile.redlines)&&profile.redlines.length===REDLINES.length&&new Set(profile.redlines.map(x=>x.id)).size===REDLINES.length,'Redline profile must define six unique IDs');
  const stateIds=new Set((request.states??[]).map(x=>x.id));
  const obligationIds=new Set((request.obligations??[]).map(x=>x.id));
  const regionIds=new Set([...(request.states??[]).flatMap(x=>x.regions??[]),...(request.obligations??[]).map(x=>x.region_id).filter(Boolean)]);
  for(const id of REDLINES){
    const entry=profile.redlines.find(x=>x.id===id);
    check(entry&&['applicable','not_applicable'].includes(entry.applicability)&&Array.isArray(entry.scope?.state_ids)&&Array.isArray(entry.scope?.region_ids)&&Array.isArray(entry.obligation_ids),'Invalid case redline profile entry');
    check(Array.isArray(entry.trigger_examples)&&entry.trigger_examples.length>0&&Array.isArray(entry.non_trigger_examples)&&entry.non_trigger_examples.length>0&&Array.isArray(entry.evidence_requirements)&&entry.evidence_requirements.length>0&&typeof entry.rationale==='string'&&entry.rationale.trim(),'Redline profile must include examples, evidence, and rationale');
    check(entry.scope.state_ids.every(x=>stateIds.has(x))&&entry.scope.region_ids.every(x=>regionIds.has(x))&&entry.obligation_ids.every(x=>obligationIds.has(x)),'Redline profile references unknown state, region, or obligation');
    if(entry.applicability==='applicable')check(entry.scope.state_ids.length>0,'Applicable redline needs at least one required state');
    else check(entry.scope.state_ids.length===0&&entry.scope.region_ids.length===0&&entry.obligation_ids.length===0,'Not-applicable redline cannot claim case scope');
  }
  return profile;
}
export function validateRedlineAssessments(redlines,{evidenceIds,coveredStates,profile=null}){
  check(Array.isArray(redlines)&&redlines.length===REDLINES.length&&new Set(redlines.map(r=>r.id)).size===REDLINES.length,'All E2E redlines required');
  for(const id of REDLINES){
    const r=redlines.find(x=>x.id===id);
    check(r&&r.schema_version==='E2ERedlineAssessment/v1'&&['applicable','unknown','not_applicable'].includes(r.applicability)&&['pass','fail','unknown','not_applicable'].includes(r.status)&&typeof r.reason==='string'&&r.reason.trim()&&Array.isArray(r.evidence)&&r.evidence.length>0,'Invalid E2E redline');
    check(['S0','S1','S2','S3',null].includes(r.severity)&&Object.hasOwn(IMPACT_SEVERITIES,r.impact)&&Array.isArray(r.affected_states)&&Array.isArray(r.affected_regions),'Invalid E2E redline severity/impact contract');
    check(r.affected_states.every(x=>typeof x==='string')&&r.affected_regions.every(x=>typeof x==='string'),'Invalid E2E redline impact scope');
    check(r.affected_states.every(state=>coveredStates.includes(state)),'Redline impact cites a state outside E2E coverage');
    if(r.applicability==='not_applicable')check(r.status==='not_applicable'&&r.severity===null&&r.impact==='not_applicable'&&r.affected_states.length===0&&r.affected_regions.length===0,'Not-applicable redline must have no severity or impact scope');
    else if(r.applicability==='unknown')check(r.status==='unknown'&&r.severity===null&&r.impact==='unknown','Unknown redline must remain unscored');
    else {
      check(['pass','fail'].includes(r.status)&&IMPACT_SEVERITIES[r.impact].includes(r.severity),'Redline status, severity, and impact do not agree');
      if(r.status==='fail')check(['S2','S3'].includes(r.severity),'Failing redline requires S2 or S3 impact');
      else check(['S0','S1'].includes(r.severity),'Passing redline cannot carry S2 or S3 impact');
      check((r.status==='pass'&&['none','minor_degradation'].includes(r.impact))||(r.status==='fail'&&REDLINE_CRITERIA[id].allowed_impacts.includes(r.impact)),'Redline impact does not match its UI criterion');
      check(r.affected_states.length>0,'Applicable redline must identify evaluated states');
      if(id==='external_writes'&&r.status==='fail')check(r.severity==='S3'&&r.impact==='external_write','Unexpected external write is always S3');
    }
    if(profile){
      const entry=profile.redlines.find(x=>x.id===id);
      if(entry.applicability==='not_applicable')check(r.applicability==='not_applicable','Redline result conflicts with case profile applicability');
      else {
        check(r.applicability!=='not_applicable','Applicable case redline cannot be marked not_applicable');
        check(r.affected_states.every(state=>entry.scope.state_ids.includes(state))&&r.affected_regions.every(region=>entry.scope.region_ids.includes(region)),'Redline impact exceeds frozen case profile scope');
      }
    }
    for(const evidenceId of r.evidence??[])check(evidenceIds.has(evidenceId),`Unknown evidence ${evidenceId} for redline ${id}`);
  }
}
