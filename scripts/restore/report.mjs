import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPACT_SEVERITIES, REDLINE_CRITERIA } from '../../evals/pipeline/redline-contract.mjs';
import { assert, budget, readJSON, local, safeFile, treeHash, digest, sha, text, validateTokenUsage, normalizeStaticCheckSuite, writeJSON } from './core.mjs';

const templatePath=fileURLToPath(new URL('../../assets/restore/report.html',import.meta.url));
const escape=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(headers,rows)=>`<div class="scroll"><table><thead><tr>${headers.map(x=>`<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const mdCell=v=>String(v??'—').replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
const mdTable=(headers,rows)=>`| ${headers.map(mdCell).join(' | ')} |\n| ${headers.map(()=> '---').join(' | ')} |\n${rows.map(row=>`| ${row.map(mdCell).join(' | ')} |`).join('\n')}\n`;
async function replayEvidence(root,items,versionId,issues,{artifact_sha256=null}={}) {
  assert(Array.isArray(items)&&items.length>0,'Evidence is required');
  const ids=new Set(),badIds=new Set();let artifactRoot=null,artifactError=null,artifactActual=null;
  if(artifact_sha256) {
    assert(/^[a-f0-9]{64}$/.test(artifact_sha256),'Invalid evidence artifact binding');
    artifactRoot=local(root,`snapshots/${artifact_sha256}`);
    try { artifactActual=await treeHash(artifactRoot);if(artifactActual!==artifact_sha256)artifactError=`Bound evidence snapshot changed: ${artifact_sha256}`; }
    catch(error) { artifactError=error.code==='ENOENT'?`Bound evidence snapshot missing: ${artifact_sha256}`:error.message; }
  }
  const replay=[];
  for(const item of items) {
    assert(text(item.id)&&!ids.has(item.id),'Evidence IDs must be unique');ids.add(item.id);
    assert(['screenshot','sequence','video','checks','source'].includes(item.kind),'Invalid evidence kind');
    let actual=null,error=artifactError;
    try {
      const normalized=item.uri.replaceAll('\\','/');
      const path=artifactRoot&&normalized.startsWith('restored/')?await safeFile(artifactRoot,normalized.slice('restored/'.length)):await safeFile(root,item.uri);
      actual=sha(await readFile(path));if(actual!==item.sha256&&!error)error=`Evidence changed: ${item.id}`;
    } catch(readError) { if(!error)error=readError.code==='ENOENT'?`Evidence missing: ${item.id}`:readError.message; }
    if(error) {
      badIds.add(item.id);
      issues.push({version_id:versionId,evidence_id:item.id,uri:item.uri,expected_sha256:item.sha256,actual_sha256:actual,error,...(artifact_sha256?{artifact_sha256,artifact_actual_sha256:artifactActual}:{})});
    }
    replay.push({...item,integrity_status:error?'degraded':'valid'});
  }
  return {items:replay,badIds};
}
function replayAssessment(raw,badIds,referenceBadIds,c) {
  const referenceAffected=new Set(c.obligations.filter(o=>(o.reference_evidence??[]).some(id=>referenceBadIds.has(id))).map(o=>o.id));
  const affected=refs=>(refs??[]).some(id=>badIds.has(id));
  const units=raw.units.map(unit=>affected(unit.evidence)||referenceAffected.has(unit.obligation_id)?{...unit,recorded_status:unit.status,recorded_score:unit.score,status:'unknown',score:null,reason:'Evidence integrity degraded; the recorded quality conclusion is withheld.',integrity_status:'degraded'}:unit);
  const gates=raw.gates.map(gate=>affected(gate.evidence)?{...gate,recorded_status:gate.status,status:'unknown',integrity_status:'degraded'}:gate);
  const findings=raw.findings.map(finding=>affected(finding.evidence)||referenceAffected.has(finding.obligation_id)?{...finding,integrity_status:'degraded'}:finding);
  const degraded=badIds.size>0||referenceAffected.size>0;
  return {...raw,evidence:raw.evidence,units,gates,findings,...(degraded?{integrity_status:'degraded'}:{integrity_status:'valid'})};
}
function replayFinalE2E(raw,badIds,referenceDegraded) {
  if(!raw)return null;
  const affected=refs=>referenceDegraded||(refs??[]).some(id=>badIds.has(id));
  const degraded=referenceDegraded||badIds.size>0;
  if(!degraded)return raw;
  return {...raw,status:'incomplete',reason:'Evidence integrity degraded; quality conclusions that depend on unavailable or changed evidence are withheld.',total_100:null,provisional:true,integrity_status:'degraded',dimensions:(raw.dimensions??[]).map(item=>affected(item.evidence)?{...item,recorded_status:item.status,recorded_score:item.score,status:'unknown',score:null,reason:'Evidence integrity degraded; recorded conclusion withheld.'}:item),redlines:(raw.redlines??[]).map(item=>affected(item.evidence)?{...item,recorded_status:item.status,status:'unknown',reason:'Evidence integrity degraded; recorded conclusion withheld.'}:item)};
}
async function model(root,run) {
  const integrityIssues=[];
  const c=await readJSON(join(root,'contract.json'));assert(digest(c)===run.contract_sha256,'Frozen contract changed; start an explicitly linked new run with remaining budget');
  const contractEvidence=await replayEvidence(root,c.reference_evidence,'reference',integrityIssues);c.reference_evidence=contractEvidence.items;
  const referenceBadIds=contractEvidence.badIds;
  let lineage=null;
  if(run.lineage){
    lineage=await readJSON(await safeFile(root,run.lineage.uri));
    assert(digest(lineage)===run.lineage.sha256,'Continuation lineage changed');
    assert(lineage.schema_version==='RestoreLineage/v1'&&['continuation','contract_refreeze'].includes(lineage.relationship)&&lineage.child_run_id===run.run_id,'Invalid restore lineage');
    assert(lineage.parent?.run_id===run.lineage.parent_run_id&&lineage.inherited?.artifact_sha256===run.lineage.inherited_artifact_sha256,'Restore artifact lineage mismatch');
    assert(await treeHash(local(root,`snapshots/${lineage.inherited.artifact_sha256}`))===lineage.inherited.artifact_sha256,'Inherited artifact snapshot changed');
    if(run.lineage.relationship)assert(lineage.relationship===run.lineage.relationship,'Restore lineage relationship mismatch');
    if(lineage.relationship==='continuation') {
      assert(lineage.inherited?.contract_sha256===run.contract_sha256,'Continuation lineage binding mismatch');
    } else {
      const source=lineage.contract_refreeze?.source;
      assert(source?.uri==='refreeze-contract-source.json'&&['directory','json_file'].includes(source.kind),'Invalid refreeze contract source lineage');
      const sourceBytes=await readFile(await safeFile(root,source.uri)),sourceContract=JSON.parse(sourceBytes.toString('utf8'));
      assert(sha(sourceBytes)===source.input_file_sha256&&sha(sourceBytes)===source.archived_file_sha256&&digest(sourceContract)===source.canonical_sha256,'Refreeze contract source changed');
      assert(digest(sourceContract.reference_evidence)===source.reference_evidence_sha256,'Refreeze reference evidence binding mismatch');
      assert(run.lineage.source_contract_sha256===source.canonical_sha256,'Refreeze source contract pointer mismatch');
      assert(lineage.parent.contract_sha256!==source.canonical_sha256,'Contract refreeze must provide a changed contract source');
      assert(run.contract_sha256!==lineage.parent.contract_sha256,'Contract refreeze final contract must differ from the parent frozen contract');
      assert(lineage.inherited.artifact_source==='best_snapshot'&&lineage.inherited.artifact_sha256===lineage.parent.best_artifact_sha256,'Refreeze must inherit the parent best snapshot');
      assert(digest(sourceContract.generation_policy)===digest(lineage.contract_refreeze.generation_policy),'Refreeze generation policy binding mismatch');
      await replayEvidence(root,sourceContract.reference_evidence,'refreeze-source',integrityIssues);
    }
    if(lineage.inherited?.design_brief){
      assert(lineage.inherited.design_brief.uri==='design_brief.md'&&['parent_copy','contract_projection','contract_refreeze_projection'].includes(lineage.inherited.design_brief.source)&&/^[a-f0-9]{64}$/.test(lineage.inherited.design_brief.initial_sha256),'Invalid linked brief lineage');
      assert(text(lineage.parent?.design_brief?.href),'Parent design brief lineage missing');
    }
  }
  let blocker=null;
  if(run.stop?.blocker) {
    blocker=await readJSON(local(root,run.stop.blocker.uri));
    assert(digest(blocker)===run.stop.blocker.sha256,'Blocker record changed');
    const checked=await replayEvidence(root,blocker.evidence,'blocker',integrityIssues);blocker={...blocker,evidence:checked.items,integrity_status:checked.badIds.size?'degraded':'valid'};
  }
  if(run.best) assert(await treeHash(local(root,'restored'))===run.best,'Delivered artifact differs from best snapshot');
  let e2e=null;
  if(run.e2e){e2e=await readJSON(local(root,run.e2e.uri));assert(digest(e2e)===run.e2e.sha256,'E2E result changed');if(e2e.evidence?.length){const checked=await replayEvidence(root,e2e.evidence,'final-e2e',integrityIssues);e2e={...e2e,evidence:checked.items};e2e=replayFinalE2E(e2e,checked.badIds,referenceBadIds.size>0);}}
  let postRunE2EReview=null;
  if(run.post_run_e2e_review){
    postRunE2EReview=await readJSON(local(root,run.post_run_e2e_review.uri));
    assert(digest(postRunE2EReview)===run.post_run_e2e_review.sha256,'Post-run E2E review changed');
    assert(postRunE2EReview.schema_version==='PostRunE2EReview/v1'&&postRunE2EReview.run_id===run.run_id,'Invalid post-run E2E review');
    assert(postRunE2EReview.binding?.artifact_sha256===run.best&&postRunE2EReview.binding?.contract_sha256===run.contract_sha256,'Post-run E2E review is not bound to the final artifact and contract');
    assert(postRunE2EReview.evaluation?.request_schema_version==='FinalEvalRequest/v0.2'&&postRunE2EReview.evaluation?.evaluated_at,'Final E2E evaluation metadata missing');
    if(postRunE2EReview.result?.evidence?.length){const checked=await replayEvidence(root,postRunE2EReview.result.evidence,'post-run-e2e',integrityIssues);postRunE2EReview={...postRunE2EReview,result:replayFinalE2E({...postRunE2EReview.result,evidence:checked.items},checked.badIds,referenceBadIds.size>0)};}
  }
  let base=null,best=null;
  if(run.baseline_assessment){const raw=await readJSON(local(root,run.baseline_assessment)),checked=await replayEvidence(root,raw.evidence,'v0',integrityIssues);base=replayAssessment({...raw,evidence:checked.items},checked.badIds,referenceBadIds,c);}
  if(run.best_assessment){const raw=await readJSON(local(root,run.best_assessment)),checked=await replayEvidence(root,raw.evidence,'best',integrityIssues);best=replayAssessment({...raw,evidence:checked.items},checked.badIds,referenceBadIds,c);}
  const rounds=[];
  for(const r of run.rounds){let assessment=null,verification=null,diff=null;const versionId=r.version_id??`v${r.round}`;if(r.assessment){const raw=await readJSON(local(root,r.assessment)),checked=await replayEvidence(root,raw.evidence,versionId,integrityIssues);assessment=replayAssessment({...raw,evidence:checked.items},checked.badIds,referenceBadIds,c);}if(r.verification)verification=await readJSON(local(root,r.verification));if(r.diff){diff=await readJSON(local(root,r.diff.uri));assert(digest(diff)===r.diff.sha256,'Artifact diff changed');}const degraded=assessment?.integrity_status==='degraded';rounds.push({...r,...(degraded?{recorded_decision:r.decision,decision:'integrity_degraded'}:{}),assessment,verification,diff:degraded?{...diff,integrity_status:'degraded'}:diff});}
  const staticChecks=[];
  for(const pointer of run.static_checks??[]) {
    const raw=await readJSON(local(root,pointer.uri));assert(digest(raw)===pointer.sha256,'Static check suite changed');
    let suite=normalizeStaticCheckSuite(raw);assert(digest(suite.summary)===digest(pointer.summary),'Static check summary changed');const checked=await replayEvidence(root,suite.evidence,`static:${suite.suite_id}`,integrityIssues,{artifact_sha256:suite.binding.artifact_sha256});const checks=suite.checks.map(check=>(check.evidence??[]).some(id=>checked.badIds.has(id))?{...check,recorded_status:check.status,status:'unknown',actual:'Evidence integrity degraded; recorded conclusion withheld.'}:check);suite=normalizeStaticCheckSuite({...suite,evidence:checked.items,checks});staticChecks.push({...suite,integrity_status:checked.badIds.size?'degraded':'valid',uri:pointer.uri,sha256:pointer.sha256});
  }
  const checksFor=artifact=>staticChecks.filter(suite=>suite.binding.artifact_sha256===artifact);
  const trajectory=[];
  if(run.baseline) trajectory.push({version_id:'v0',kind:'initial',artifact_sha256:run.baseline,parent_artifact_sha256:null,decision:'initial',assessment:base,diff:null,static_checks:checksFor(run.baseline)});
  for(const item of rounds) trajectory.push({version_id:item.version_id??`v${item.round}`,kind:'candidate',artifact_sha256:item.candidate,parent_artifact_sha256:item.before,decision:item.decision,issue_id:item.issue_id,hypothesis:item.hypothesis,strategy:item.strategy,assessment:item.assessment,verification:item.verification,diff:item.diff,static_checks:checksFor(item.candidate)});
  const stopBudget=run.stop?budget(run,Date.parse(run.stop.at)):null;
  const misclassified=run.stop?.reason==='budget_exhausted'&&stopBudget?.remaining_ms>0;
  const timeAccounting=stopBudget?{at:run.stop.at,wall_elapsed_ms:stopBudget.wall_elapsed_ms,excluded_ms:stopBudget.excluded_ms,active_elapsed_ms:stopBudget.elapsed_ms,remaining_ms:stopBudget.remaining_ms,exclusions:run.time_exclusions??[],budget_exhaustion_misclassified:misclassified,effective_stop_reason:misclassified?'external_interruption_after_pause':run.stop.reason}:null;
  let tokenUsage={schema_version:'TokenUsageSummary/v0.2',status:'unavailable',coverage:'unavailable',coverage_note:'No attributable model usage record was supplied.',observed_total_tokens:null,records:[]};
  if(run.token_usage){
    const raw=validateTokenUsage(await readJSON(await safeFile(root,run.token_usage.uri)));
    assert(digest(raw)===run.token_usage.sha256,'Token usage record changed');
    const sum=key=>raw.records.reduce((total,record)=>total+record.usage[key],0);
    tokenUsage={schema_version:'TokenUsageSummary/v0.2',status:'observed',coverage:raw.coverage,coverage_note:raw.coverage_note,observed_total_tokens:sum('total_tokens'),input_tokens:sum('input_tokens'),cached_input_tokens:sum('cached_input_tokens'),output_tokens:sum('output_tokens'),reasoning_output_tokens:sum('reasoning_output_tokens'),response_count:raw.records.reduce((total,record)=>total+record.response_count,0),records:raw.records,source_uri:run.token_usage.uri,source_sha256:run.token_usage.sha256};
  }
  let selectedFinalE2E=postRunE2EReview?.result??e2e;
  if(selectedFinalE2E&&referenceBadIds.size>0)selectedFinalE2E=replayFinalE2E(selectedFinalE2E,new Set(),true);
  const finalE2E=selectedFinalE2E?Object.fromEntries(Object.entries(selectedFinalE2E).filter(([key])=>key!=='assessor'&&key!=='evaluation_metadata')):null;
  const applicableDimensions=(finalE2E?.dimensions??[]).filter(x=>x.status!=='not_applicable');
  const scoredDimensions=applicableDimensions.filter(x=>x.status==='scored'&&Number.isFinite(x.score)&&Number.isFinite(x.weight)&&x.weight>0);
  const assessedWeight=scoredDimensions.reduce((sum,x)=>sum+x.weight,0);
  const applicableWeight=applicableDimensions.reduce((sum,x)=>sum+(Number.isFinite(x.weight)?x.weight:0),0);
  const partialScore=assessedWeight?100*scoredDimensions.reduce((sum,x)=>sum+x.weight*x.score/4,0)/assessedWeight:null;
  const completeScore=finalE2E?.total_100;
  const e2eScoringSummary=partialScore==null?null:{score_100:completeScore??partialScore,score_type:completeScore==null?'partial_normalized':'complete',assessed_weight:assessedWeight,applicable_weight:applicableWeight,coverage_percent:applicableWeight?100*assessedWeight/applicableWeight:0,unscored_dimensions:applicableDimensions.filter(x=>x.status!=='scored').map(x=>x.id)};
  const finalE2EEvaluation=postRunE2EReview?.evaluation??null;
  const finalE2ELimitations=postRunE2EReview?.limitations??[];
  const integrity={status:integrityIssues.length?'degraded':'valid',issues:integrityIssues};
  const data={schema_version:'RestoreReport/v0.2',run_id:run.run_id,demo:c.demo===true,integrity,contract:c,contract_sha256:run.contract_sha256,tier:run.tier,started_at:run.started_at,enforcement:run.enforcement,lineage,stop:run.stop,time_accounting:timeAccounting,token_usage:tokenUsage,artifact_sha256:run.best,baseline:base,best,rounds,trajectory,static_checks:staticChecks,e2e:finalE2E,e2e_scoring_summary:e2eScoringSummary,e2e_evaluation:finalE2EEvaluation,e2e_limitations:finalE2ELimitations};
  if(blocker)data.blocker=blocker;
  let supplements;
  try {supplements=await readJSON(local(root,'report-supplements.json'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(supplements){
    assert(supplements.schema_version==='RestoreReportSupplements/v0.2'&&supplements.run_id===run.run_id&&Array.isArray(supplements.audits),'Invalid report supplements');
    for(const audit of supplements.audits){
      assert(text(audit.id)&&text(audit.label)&&text(audit.status)&&text(audit.html_uri)&&text(audit.json_uri),'Invalid supplemental audit');
      assert(sha(await readFile(await safeFile(root,audit.html_uri)))===audit.html_sha256,'Supplemental HTML changed');
      assert(sha(await readFile(await safeFile(root,audit.json_uri)))===audit.json_sha256,'Supplemental JSON changed');
    }
    data.supplemental_audits=supplements.audits;
  }
  let visualAnnotations;
  try {visualAnnotations=await readJSON(local(root,'evidence/visual-annotations.json'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(visualAnnotations){
    assert(visualAnnotations.schema_version==='VisualAnnotationSet/v1'&&visualAnnotations.run_id===run.run_id&&Array.isArray(visualAnnotations.annotations),'Invalid visual annotation set');
    for(const annotation of visualAnnotations.annotations){
      assert(text(annotation.id)&&text(annotation.target_redline_id)&&text(annotation.annotation_uri)&&text(annotation.screenshot_uri),'Invalid visual annotation');
      const annotated=await readFile(await safeFile(root,annotation.annotation_uri));
      const screenshot=await readFile(await safeFile(root,annotation.screenshot_uri));
      assert(sha(annotated)===annotation.annotation_sha256,'Visual annotation changed');
      assert(sha(screenshot)===annotation.screenshot_sha256,'Visual annotation source screenshot changed');
      assert(annotation.bbox&&[annotation.bbox.x,annotation.bbox.y,annotation.bbox.width,annotation.bbox.height].every(Number.isFinite),'Visual annotation bbox missing or invalid');
    }
    data.visual_annotations=visualAnnotations.annotations;
  }
  let humanAdjudicationSet,humanAdjudicationSource;
  try {
    const path=await safeFile(root,'evidence/human-adjudications.json');
    humanAdjudicationSet=await readJSON(path);
    humanAdjudicationSource={uri:'evidence/human-adjudications.json',sha256:sha(await readFile(path))};
  } catch(error){if(error.code!=='ENOENT')throw error;}
  if(humanAdjudicationSet&&data.e2e?.integrity_status!=='degraded'){
    assert(humanAdjudicationSet.schema_version==='HumanAdjudicationSet/v1'&&humanAdjudicationSet.run_id===run.run_id&&Array.isArray(humanAdjudicationSet.adjudications),'Invalid human adjudication set');
    assert(['pass','fail','incomplete'].includes(humanAdjudicationSet.final_result_status),'Invalid adjudicated final E2E status');
    assert(data.e2e,'Cannot adjudicate an absent E2E result');
    const independentResult=structuredClone(data.e2e);
    const adjudicatedResult=structuredClone(data.e2e);
    const adjudicatedIds=new Set();
    for(const adjudication of humanAdjudicationSet.adjudications){
      assert(text(adjudication.id)&&text(adjudication.target_redline_id)&&text(adjudication.reason)&&text(adjudication.scope),'Invalid human adjudication entry');
      assert(!adjudicatedIds.has(adjudication.target_redline_id),'Duplicate human adjudication for one redline');
      adjudicatedIds.add(adjudication.target_redline_id);
      const redline=adjudicatedResult.redlines.find(x=>x.id===adjudication.target_redline_id);
      assert(redline&&redline.status===adjudication.original_status,'Human adjudication does not match the original redline');
      assert(['pass','fail','not_applicable'].includes(adjudication.adjudicated_status),'Invalid adjudicated redline status');
      assert(Number.isFinite(Date.parse(adjudication.recorded_at)),'Human adjudication timestamp missing or invalid');
      if(adjudication.adjudicated_severity){
        assert(['S0','S1','S2','S3'].includes(adjudication.adjudicated_severity)&&text(adjudication.adjudicated_impact),'Invalid adjudicated redline severity');
        assert(IMPACT_SEVERITIES[adjudication.adjudicated_impact]?.includes(adjudication.adjudicated_severity),'Adjudicated redline severity conflicts with impact');
        assert((['S0','S1'].includes(adjudication.adjudicated_severity)&&adjudication.adjudicated_status==='pass')||(['S2','S3'].includes(adjudication.adjudicated_severity)&&adjudication.adjudicated_status==='fail'),'Adjudicated redline status conflicts with severity');
        assert((adjudication.adjudicated_status==='pass'&&['none','minor_degradation'].includes(adjudication.adjudicated_impact))||(adjudication.adjudicated_status==='fail'&&REDLINE_CRITERIA[adjudication.target_redline_id]?.allowed_impacts.includes(adjudication.adjudicated_impact)),'Adjudicated impact does not match the redline criterion');
        redline.severity=adjudication.adjudicated_severity;
        redline.impact=adjudication.adjudicated_impact;
        redline.affected_states=adjudication.affected_states??[];
        redline.affected_regions=adjudication.affected_regions??[];
      }
      redline.status=adjudication.adjudicated_status;
      redline.reason=adjudication.reason;
      redline.adjudication_id=adjudication.id;
      for(const note of adjudication.dimension_notes??[]){
        const dimension=adjudicatedResult.dimensions?.find(x=>x.id===note.dimension_id);
        assert(dimension&&text(note.reason),'Human dimension note targets an absent dimension');
        dimension.reason=note.reason;
        dimension.adjudication_id=adjudication.id;
      }
    }
    if(humanAdjudicationSet.final_result_status==='pass'){
      assert(adjudicatedResult.redlines.every(x=>['pass','not_applicable'].includes(x.status)),'Cannot adjudicate a failing redline set to pass');
      assert((adjudicatedResult.dimensions??[]).filter(x=>x.status==='scored').every(x=>x.score>=3),'Cannot adjudicate a below-threshold dimension to pass');
    }
    adjudicatedResult.status=humanAdjudicationSet.final_result_status;
    data.e2e_judge_result=independentResult;
    data.e2e=adjudicatedResult;
    data.human_adjudications=humanAdjudicationSet.adjudications;
    data.human_adjudication_source=humanAdjudicationSource;
  }
  return data;
}
function eligible(m,decision){
  const r=m.e2e;
  return Boolean(m.integrity?.status!=='degraded' && !m.demo && m.stop && r && r.status!=='incomplete' && r.redlines?.length===6 && r.redlines.every(x=>['pass','not_applicable'].includes(x.status)) && (decision==='conditional_go'||r.status==='pass'));
}
async function material(root,run){const data=await model(root,run),template=await readFile(templatePath,'utf8');return {data,template,report_sha256:digest(data),template_sha256:sha(template)};}
export async function approve(root,run,a) {
  const m=await material(root,run);
  assert(a.report_sha256===m.report_sha256&&a.template_sha256===m.template_sha256,'Approval is stale');
  assert(['go','conditional_go','no_go'].includes(a.decision)&&text(a.reviewer)&&text(a.reason),'Approval decision/reviewer/reason required');
  if(a.decision!=='no_go') {assert(eligible(m.data,a.decision),'Positive approval blocked by E2E gates');assert(!m.data.e2e.provisional||a.manual_reviewed===true,'Provisional Judge requires manual review');}
  if(a.decision==='conditional_go')assert(text(a.conditions),'Conditional approval requires conditions');
  run.approval={...a,recorded_at:new Date().toISOString()};await writeJSON(join(root,'approval.json'),run.approval);await report(root,run);return run.approval;
}
async function evidenceView(root,e,loading='lazy') {
  if(e.integrity_status==='degraded')return `<figure class="evidence-figure"><figcaption>${escape(e.id)} · ${escape(e.kind)}</figcaption><div class="empty">证据完整性已降级；不显示缩略图，也不用于质量结论。</div></figure>`;
  await safeFile(root,e.uri); const uri=e.uri.split(/[\\/]/).map(encodeURIComponent).join('/');
  return `<figure class="evidence-figure"><figcaption>${escape(e.id)} · ${escape(e.kind)}${e.source_label?` · ${escape(e.source_label)}`:''}</figcaption>${e.kind==='screenshot'?`<a href="${uri}" target="_blank" rel="noopener"><img loading="${loading}" decoding="async" src="${uri}" alt="${escape(e.id)}"></a>`:e.kind==='video'?`<video controls preload="metadata" src="${uri}"></video>`:`<a href="${uri}" target="_blank" rel="noopener">打开证据</a>`}</figure>`;
}
async function renderEvidenceMatrix(root,d) {
  const states=d.contract.states, stateIds=new Set(states.map(s=>s.id));
  const inheritedCandidate=d.lineage?.inherited?.artifact_source==='working_tree_unverified'&&d.baseline?.binding?.artifact_sha256===d.lineage.inherited.artifact_sha256;
  const columns=[
    {id:'reference',label:'参考版本',items:d.contract.reference_evidence??[]},
    {id:'baseline',label:inheritedCandidate?'v0 继承候选 · 独立基线':'v0 初始版本',items:d.baseline?.evidence??[],assessment:d.baseline,artifact_sha256:d.baseline?.binding?.artifact_sha256},
    ...d.rounds.map(x=>({id:`round-${x.round}`,label:`第 ${x.round} 轮候选`,items:x.assessment?.evidence??[],assessment:x.assessment,artifact_sha256:x.assessment?.binding?.artifact_sha256??x.candidate,round:x}))
  ];
  const bestHash=d.artifact_sha256;
  let best=columns.find(c=>bestHash&&c.artifact_sha256===bestHash);
  if(!best&&d.best) { best={id:'best',label:'最佳版本',items:d.best.evidence??[],assessment:d.best,artifact_sha256:bestHash}; columns.push(best); }
  if(best&&d.best) best.items=[...best.items,...(d.best.evidence??[])];
  if(best&&d.e2e?.evidence?.length) best.items=[...best.items,...d.e2e.evidence.map(e=>({...e,source_label:'最终 E2E'}))];
  const seenEvidence=new Set();
  for(const c of columns) {
    c.items=c.items.filter(e=>{if(seenEvidence.has(e.id))return false;seenEvidence.add(e.id);return true;});
    c.isBest=c===best;
  }
  const captureStateByUri=new Map();
  for(const c of columns) for(const e of c.items) if(e.integrity_status!=='degraded'&&e.kind==='sequence'&&e.uri.endsWith('.json')) {
    const sequence=await readJSON(await safeFile(root,e.uri));
    for(const [captureId,record] of Object.entries(sequence.states??{})) {
      const explicit=record.state_id;
      const matched=explicit&&stateIds.has(explicit)?explicit:states.map(s=>s.id).filter(id=>captureId===id||captureId.startsWith(`${id}-`)).sort((a,b)=>b.length-a.length)[0];
      if(matched&&record.uri)captureStateByUri.set(record.uri,matched);
    }
  }
  function statesFor(e,c) {
    const found=new Set();
    if(stateIds.has(e.state_id))found.add(e.state_id);
    const capturedState=captureStateByUri.get(e.uri); if(capturedState)found.add(capturedState);
    if(!found.size&&c.id==='reference') for(const o of d.contract.obligations) if(o.reference_evidence?.includes(e.id)) found.add(o.state_id);
    if(!found.size) for(const u of c.assessment?.units??[]) if(u.evidence?.includes(e.id)) {
      const o=d.contract.obligations.find(x=>x.id===u.obligation_id); if(o)found.add(o.state_id);
    }
    if(!found.size&&c.assessment?.covered_states?.length===1&&stateIds.has(c.assessment.covered_states[0]))found.add(c.assessment.covered_states[0]);
    return [...found];
  }
  const cells=new Map(states.map(s=>[s.id,new Map(columns.map(c=>[c.id,[]]))]));
  const unassigned=new Map(columns.map(c=>[c.id,[]]));
  const other=new Map(columns.map(c=>[c.id,[]]));
  for(const c of columns) for(const e of c.items) {
    if(e.kind!=='screenshot') { other.get(c.id).push(e); continue; }
    const matches=statesFor(e,c);
    if(!matches.length)unassigned.get(c.id).push(e);
    for(const id of matches)cells.get(id).get(c.id).push(e);
  }
  const header=columns.map(c=>`<div class="compare-head">${escape(c.label)}${c.isBest?'<span class="version-badge">当前最佳 · E2E 评审对象</span>':''}</div>`).join('');
  async function cell(items,column) { return items.length?(await Promise.all(items.map(e=>evidenceView(root,e,column.id==='reference'?'lazy':'eager')))).join(''):'<div class="empty">无关联截图</div>'; }
  const rows=[];
  for(const s of states) {
    const body=await Promise.all(columns.map(c=>cell(cells.get(s.id).get(c.id),c)));
    rows.push(`<div class="compare-state"><strong>${escape(s.page_id===s.id?s.id:`${s.page_id} · ${s.id}`)}</strong><span>${s.viewport.width}×${s.viewport.height} · ${escape(s.viewport_id)}</span></div>${body.map(x=>`<div class="compare-cell">${x}</div>`).join('')}`);
  }
  if([...unassigned.values()].some(items=>items.length)) {
    const body=await Promise.all(columns.map(c=>cell(unassigned.get(c.id),c)));
    rows.push(`<div class="compare-state"><strong>未关联状态</strong><span>Schema 未提供可确认的 state_id</span></div>${body.map(x=>`<div class="compare-cell">${x}</div>`).join('')}`);
  }
  const minWidth=190+columns.length*250;
  const matrix=`<div class="comparison-scroll"><div class="comparison-grid" style="grid-template-columns:190px repeat(${columns.length},minmax(250px,1fr));min-width:${minWidth}px"><div class="compare-head">页面状态</div>${header}${rows.join('')}</div></div>`;
  const otherGroups=columns.filter(c=>other.get(c.id).length).map(async c=>`<details><summary>${escape(c.label)} · ${other.get(c.id).length} 项非截图证据</summary><div class="details-body">${(await Promise.all(other.get(c.id).map(evidenceView.bind(null,root)))).join('')}</div></details>`);
  return `${matrix}${otherGroups.length?`<div class="evidence-secondary"><h3>检查与其他证据</h3>${(await Promise.all(otherGroups)).join('')}</div>`:''}`;
}
export async function report(root,run) {
  const m=await material(root,run),d=m.data;
  const approval=run.approval&&run.approval.report_sha256===m.report_sha256&&run.approval.template_sha256===m.template_sha256?run.approval:null;
  const r=d.e2e, scoring=d.e2e_scoring_summary, accounting=d.time_accounting, tokens=d.token_usage;
  const stopLabels={target_reached:'视觉目标达成',plateau:'连续两轮无收益',cycle_detected:'重复或振荡',budget_exhausted:'预算或轮数耗尽',blocked:'运行阶段阻塞',failed:'执行失败'};
  const e2eLabels={pass:'通过（按当前提案）',fail:'未通过',incomplete:'未完成评分'};
  const duration=ms=>`${Math.floor(ms/3600000)?Math.floor(ms/3600000)+'h ':''}${Math.floor(ms%3600000/60000)}m ${Math.floor(ms%60000/1000)}s`;
  const elapsed=accounting?duration(accounting.active_elapsed_ms):'运行中';
  const stopLabel=accounting?.budget_exhaustion_misclassified?'外部暂停后收束（原预算误判）':stopLabels[d.stop?.reason]??d.stop?.reason??'运行中';
  const e2eReason=r?.reason??'对最终交付产物进行独立五维 E2E 评定；Loop 自评分不计入最终结果。';
  const statusClass=value=>String(value??'pending').toLowerCase().replace(/[^a-z0-9_-]/g,'_');
  const statusBadge=(value,label=value)=>`<span class="badge ${escape(statusClass(value))}">${escape(label)}</span>`;
  const kv=(key,value)=>`<div class="kv"><div class="kv-key">${escape(key)}</div><div class="kv-value">${escape(value)}</div></div>`;
  const processStages=[['T0','任务边界','docs/T0-input.md'],['T1','参考取证','docs/T1-evidence.md'],['T2','版本轨迹','docs/T2-trajectory.md'],['T3','迭代决策','docs/T3-iterations.md'],['T4','最终交付','docs/T4-final.md']];
  const processCards=processStages.map(([id,label,path])=>`<div class="process-card"><strong>${id} · ${label}</strong><span>本次运行阶段记录</span><a href="${path}">打开文档</a></div>`).join('');
  const evaluation=d.e2e_evaluation;
  const judgeModelLabel=evaluation?.judge_model_status==='verified'?evaluation.judge_model:evaluation?.judge_model_status==='not_exposed'?'运行时未暴露具体模型':'未记录';
  const evaluationEnvironment=evaluation?.environment?[evaluation.environment.browser,evaluation.environment.os,evaluation.environment.dpr?`DPR ${evaluation.environment.dpr}`:null,evaluation.environment.locale].filter(Boolean).join(' / '):'未知';
  const e2eRows=(r?.dimensions??[]).map(x=>[x.id,x.status==='scored'?`${x.score}/4`:x.status,x.weight??'—',x.reason??'—',(x.evidence??[]).join(', ')||'—']);
  const humanAdjudications=d.human_adjudications??[];
  const adjudicationByRedline=new Map(humanAdjudications.map(a=>[a.target_redline_id,a]));
  const redlineRows=(r?.redlines??[]).map(x=>{const a=adjudicationByRedline.get(x.id);const annotationEvidence=(d.visual_annotations??[]).filter(v=>v.target_redline_id===x.id).map(v=>v.id);const evidence=[...new Set([...(x.evidence??[]),...(a?.evidence??[]),...annotationEvidence])];return [x.id,a?`${x.status}（人工裁决）`:x.status,x.severity??'未记录',x.impact??'未记录',x.reason??'—',evidence.join(', ')||'—'];});
  const adjudicationRows=humanAdjudications.map(a=>[a.target_redline_id,a.original_status,a.adjudicated_status,a.adjudicated_severity??'未记录',a.adjudicated_impact??'未记录',a.reason,a.scope,a.recorded_at??'未记录',(a.evidence??[]).join(', ')||'—']);
  const integrityRows=(d.integrity?.issues??[]).map(issue=>[issue.version_id,issue.evidence_id,issue.uri,issue.expected_sha256,issue.actual_sha256??'缺失',issue.error]);
  const integrityBanner=d.integrity?.status==='degraded'?`<div class="demo-banner"><strong>INTEGRITY DEGRADED</strong> · 报告仅为历史重放；以下证据缺失或哈希漂移，不显示为有效缩略图，也不用于质量结论。${table(['版本','证据 ID','URI','Expected SHA-256','Actual SHA-256','Error'],integrityRows)}</div>`:'';
  const visualAnnotationHtml=(d.visual_annotations??[]).map(a=>{
    const bbox=a.bbox?`bbox x=${a.bbox.x}, y=${a.bbox.y}, w=${a.bbox.width}, h=${a.bbox.height} ${a.bbox.unit??'px'}`:'bbox 未记录';
    const viewport=a.viewport?`${a.viewport.width}×${a.viewport.height}`:'视口未记录';
    return `<figure class="evidence-figure"><figcaption>${escape(a.id)} · ${escape(a.title??'红线视觉证据')} · ${escape(a.state_id??'状态未记录')} · ${escape(viewport)}</figcaption><a href="${escape(a.annotation_uri)}" target="_blank" rel="noopener"><img loading="lazy" src="${escape(a.annotation_uri)}" alt="${escape(a.title??a.id)}"></a><p class="metric-detail">${escape(a.description??'')} · 来源截图：<a href="${escape(a.screenshot_uri)}" target="_blank" rel="noopener">${escape(a.screenshot_id??a.screenshot_uri)}</a> · ${escape(bbox)}</p></figure>`;
  }).join('');
  const obligationRows=d.contract.obligations.map(o=>{const b=d.baseline?.units.find(u=>u.obligation_id===o.id),f=d.best?.units.find(u=>u.obligation_id===o.id);return [o.id,o.criterion_id,`${o.state_id} / ${o.region_id}`,o.expected,b?.score??b?.status??'未测',f?.score??f?.status??'未测',o.applicability==='not_applicable'?`不适用：${o.reason??''}`:o.applicability];});
  const timeRows=(accounting?.exclusions??[]).map(x=>[x.start_at,x.end_at,x.reason,x.source]);
  const tokenRows=(tokens.records??[]).map(x=>[x.stage,x.agent,x.usage.input_tokens.toLocaleString('en-US'),x.usage.cached_input_tokens.toLocaleString('en-US'),x.usage.output_tokens.toLocaleString('en-US'),x.usage.total_tokens.toLocaleString('en-US'),x.source_ref]);
  const changedFiles=diff=>diff?`${diff.files.added.length} 新增 / ${diff.files.modified.length} 修改 / ${diff.files.removed.length} 删除`:'未记录';
  const scoreDelta=diff=>diff?.integrity_status==='degraded'?'证据完整性降级，不采用原评分':(diff?.units??[]).filter(x=>(x.delta!=null&&x.delta!==0)||x.status_change==='newly_scored').map(x=>x.status_change==='newly_scored'?`${x.obligation_id} 首次评分 ${x.candidate_score}`:`${x.obligation_id} ${x.delta>0?'+':''}${x.delta}`).join('、')||'无可计算变化';
  const gateDelta=diff=>diff?.integrity_status==='degraded'?'证据完整性降级，不采用原门禁变化':(diff?.gates??[]).filter(x=>x.change!=='unchanged').map(x=>`${x.gate_id} ${x.before_status}→${x.candidate_status} (${x.change})`).join('、')||'无变化';
  const diffDetails=diff=>diff?`<details><summary>展开本版本完整 Diff</summary><div class="details-body">${table(['变化','文件'],[['新增',diff.files.added.join('、')||'无'],['修改',diff.files.modified.join('、')||'无'],['删除',diff.files.removed.join('、')||'无']])}${diff.integrity_status==='degraded'?'<p class="metric-detail">证据完整性降级；原评分、门禁变化和 finding 结论不展示。</p>':`${table(['义务','此前','候选','变化'],(diff.units??[]).map(u=>[u.obligation_id,`${u.before_status}${u.before_score==null?'':` ${u.before_score}`}`,`${u.candidate_status}${u.candidate_score==null?'':` ${u.candidate_score}`}`,u.status_change==='newly_scored'?'首次评分':u.status_change==='lost_score'?'失去评分':u.delta==null?'不可计算':u.delta>0?`+${u.delta}`:u.delta]))}${(diff.gates??[]).length?table(['门禁','此前','候选','变化'],diff.gates.map(g=>[g.gate_id,g.before_status,g.candidate_status,g.change])):''}<p class="metric-detail">已解决 finding：${escape(diff.findings?.resolved?.join('、')||'无')}；新增 finding：${escape(diff.findings?.introduced?.join('、')||'无')}</p>`}</div></details>`:'';
  const roundCards=d.rounds.map(x=>`<article class="timeline-item"><div class="timeline-title">${escape(x.version_id??`v${x.round}`)} · 第 ${escape(x.round)} 轮 ${statusBadge(x.decision,x.decision)} <span class="mono">${escape(x.issue_id??'')}</span></div><p><b>生成/修复：</b>${escape(x.hypothesis)}　<b>方法：</b>${escape(x.strategy)}</p><p><b>Diff：</b>${escape(changedFiles(x.diff))}　<b>评分变化：</b>${escape(scoreDelta(x.diff))}　<b>门禁变化：</b>${escape(gateDelta(x.diff))}</p><p><b>验证：</b>${escape(x.verification?.reason??x.reason??'未记录')}　<b>回归：</b>${escape((x.regressions??[]).join('、')||'无已记录回归')}</p>${diffDetails(x.diff)}</article>`).join('');
  const trajectoryRows=d.trajectory.map(x=>[x.version_id,x.kind==='initial'?'初始可运行版本':`${x.issue_id??'候选修复'}`,x.decision,(x.artifact_sha256??'').slice(0,12),changedFiles(x.diff),scoreDelta(x.diff),gateDelta(x.diff),x.static_checks.map(s=>`${s.suite_id}: ${s.summary.overall_status}`).join('；')||'未记录']);
  const staticSummaryRows=d.static_checks.map(s=>[s.suite_id,s.stage,s.summary.overall_status,`${s.summary.pass}/${s.summary.total}`,s.summary.fail,s.summary.unknown,s.summary.skipped,`${s.summary.coverage_percent}%`,s.binding.artifact_sha256.slice(0,12)]);
  const staticCheckRows=d.static_checks.flatMap(s=>s.checks.map(c=>[s.suite_id,c.id,c.category,c.status,c.severity,c.expected,c.actual,(c.evidence??[]).join(', ')||'—']));
  const residualRows=(d.best?.findings??[]).filter(f=>f.integrity_status!=='degraded').map(f=>[f.description,f.severity,f.obligation_id]);
  const evidenceMatrix=await renderEvidenceMatrix(root,d);
  const scene=d.contract.interactive_scene;
  const transitionRows=(scene?.transitions??[]).map(t=>[t.id,t.state_id,t.status,t.precondition,t.input,t.feedback,t.timing,t.terminal_state,t.repeat_reset,t.evidence.join(', ')]);
  const renderingRows=(scene?.rendering??[]).map(x=>[x.aspect,x.status,x.description,x.evidence.join(', ')]);
  const sceneHeaders=['转换','采集状态','证据状态','前置','输入','反馈','时序','终态','重复/重置','证据'];
  const sceneBrief=scene?mdTable(sceneHeaders,transitionRows)+'\n'+mdTable(['渲染项','证据状态','说明','证据'],renderingRows):'本次未登记结构化交互场景。';
  const blockerHtml=d.blocker?`<h3 class="subhead">停止证据</h3><p>${escape(d.blocker.scope)} · ${escape(d.blocker.reason)}</p>${table(['能力','结果','原因','证据'],d.blocker.attempts.map(a=>[a.capability,a.status,a.reason,a.evidence.join(', ')]))}${table(['剩余工作','处理','原因'],d.blocker.remaining_work.map(w=>[w.task,w.status,w.reason]))}`:'';
  const lineageHtml=d.lineage?`<div class="notice ${d.lineage.inherited.artifact_source==='working_tree_unverified'?'warning':''}"><b>${d.lineage.relationship==='contract_refreeze'?'合同重新冻结':'延续运行'}：</b>父 run ${escape(d.lineage.parent.run_id)}；继承产物 <span class="mono">${escape(d.lineage.inherited.artifact_sha256)}</span>（${escape(d.lineage.inherited.artifact_source)}）。${d.lineage.relationship==='contract_refreeze'?`父冻结合同 <span class="mono">${escape(d.lineage.parent.contract_sha256)}</span>；显式新合同来源 <span class="mono">${escape(d.lineage.contract_refreeze.source.canonical_sha256)}</span>；本 run 冻结合同 <span class="mono">${escape(d.contract_sha256)}</span>。`:''}本报告只展示本 run 轨迹，父轨迹${d.lineage.parent.report?`见 <a href="${escape(d.lineage.parent.report.href)}">父报告</a>`:'未发现可链接报告'}；${d.lineage.inherited.design_brief?`初始工作 brief 来源为 ${escape(d.lineage.inherited.design_brief.source)}，创建时哈希记录在 lineage，当前副本可随实现更新；`:''}父账本与 run 快照哈希保存在 <a href="lineage.json">lineage.json</a>。</div>`:'';
  let body=`${integrityBanner}${d.demo?'<div class="demo-banner">合成演示数据 · 并非真实网站还原，不能用于正向审批</div>':''}
    <header class="hero" id="overview"><div class="hero-main"><div class="eyebrow">Restore run review · ${escape(d.run_id)}</div><h1>视觉还原交付报告</h1><p class="subtitle">${escape(d.contract.requested_url)}</p><div class="chips"><span class="chip">${escape(d.tier)} 档</span><span class="chip">${escape(d.enforcement)} 执行</span><span class="chip">${escape(d.contract.e2e_profile.rubric_version)}</span><span class="chip">${escape(d.contract.e2e_profile.scorer_version)}</span></div></div><div class="hero-status"><div><div class="status-title">Loop 停止原因</div><div class="status-value">${escape(stopLabel)}</div><div class="status-note">停止原因、最终 E2E 和审批分别记录</div></div><span class="status-pill">${escape(d.run_id)}</span></div></header>
    <div class="metric-grid"><div class="metric"><div class="metric-label">最终 E2E</div><div class="metric-value">${escape(e2eLabels[r?.status]??'待评')}</div><div class="metric-detail">${scoring?`${scoring.score_type==='partial_normalized'?'已评分维度折算':'完整加权'} ${escape(scoring.score_100.toFixed(1))}/100 · 覆盖 ${escape(scoring.coverage_percent.toFixed(0))}% 权重${scoring.unscored_dimensions.length?` · 未评：${escape(scoring.unscored_dimensions.join(', '))}`:''}`:'尚无可计算评分'}</div></div><div class="metric"><div class="metric-label">红线通过</div><div class="metric-value">${r?.redlines?.length?`${r.redlines.filter(x=>['pass','not_applicable'].includes(x.status)).length}/${r.redlines.length}`:'待评'}</div><div class="metric-detail">${r?.provisional?'暂定评分 · Judge 未校准':'六项状态见最终质量'}</div></div><div class="metric"><div class="metric-label">版本轨迹</div><div class="metric-value">${d.trajectory.length}</div><div class="metric-detail">v0 初始版本 + ${d.rounds.length} 个修复候选</div></div><div class="metric"><div class="metric-label">有效耗时</div><div class="metric-value">${escape(elapsed)}</div><div class="metric-detail">${accounting?`墙钟 ${escape(duration(accounting.wall_elapsed_ms))} · 排除等待 ${escape(duration(accounting.excluded_ms))}`:'运行中'}</div></div></div>
    <section class="panel" id="task"><div class="panel-head"><h2>任务与交付</h2><span>冻结输入、运行环境和最终项目</span></div>${lineageHtml}<div class="kv-grid">${kv('实际页面',d.contract.observed_url)}${kv('页面状态',d.contract.states.map(s=>s.id).join('、'))}${kv('目标视口',d.contract.states.map(s=>`${s.viewport.width}×${s.viewport.height}`).join('、'))}${kv('浏览器 / 系统',`${d.contract.environment.browser} / ${d.contract.environment.os}`)}${kv('启动命令',d.contract.start_command)}${kv('最佳产物 SHA-256',d.artifact_sha256)}${kv('执行档位 / 限制',`${d.tier} / ${d.enforcement}`)}${kv('尚未确认',d.contract.unknowns?.join('；')||'无已登记未知项')}</div></section>
    <section class="panel" id="quality"><div class="panel-head"><h2>最终质量</h2><span>独立五维 E2E 结果与人工裁决分开记录；Loop 分数只用于修复诊断</span></div><p>${escape(e2eReason)} ${r?.provisional?'当前结果为暂定，不能单独作为正向审批依据。':''}${humanAdjudications.length?' 人工裁决覆盖项见下表，原 Judge 记录保留。':''}</p>${e2eRows.length?table(['维度','得分','权重','评定依据','证据 ID'],e2eRows):'<div class="empty">最终交付产物尚无完整五维评分。</div>'}${redlineRows.length?`<h3 class="subhead">交付红线</h3>${table(['红线','状态','严重度','影响','依据','证据 ID'],redlineRows)}`:''}${adjudicationRows.length?`<h3 class="subhead">人工裁决</h3><p class="metric-detail">该记录调整本次 run 的最终报告口径，不覆盖独立 Judge 原始结果。</p>${table(['红线','Judge 原判定','人工裁决','严重度','影响','裁决理由','适用范围','时间','证据 ID'],adjudicationRows)}`:''}${visualAnnotationHtml?`<h3 class="subhead">红线视觉标注</h3>${visualAnnotationHtml}`:''}<div class="kv-grid">${kv('Judge 提供方',evaluation?.judge_provider??'未记录')}${kv('Judge 模型',judgeModelLabel)}${kv('评测开始',evaluation?.started_at??'未记录')}${kv('评测完成',evaluation?.completed_at??evaluation?.evaluated_at??'未记录')}${kv('评测时区',evaluation?.timezone??'UTC')}${kv('评测环境',evaluationEnvironment)}${kv('请求 Schema',evaluation?.request_schema_version??'未记录')}${kv('Rubric / Scorer',evaluation?`${d.contract.e2e_profile.rubric_version} / ${d.contract.e2e_profile.scorer_version}`:'—')}${kv('校准状态',r?.calibration?.status??'未知')}${kv('绑定产物 SHA-256',d.artifact_sha256??'未知')}</div>${scoring?`<p><b>${scoring.score_type==='partial_normalized'?'已评分维度折算分':'完整加权分'}：</b>${escape(scoring.score_100.toFixed(1))}/100 · 覆盖权重 ${escape(scoring.assessed_weight.toFixed(0))}/${escape(scoring.applicable_weight.toFixed(0))} (${escape(scoring.coverage_percent.toFixed(0))}%)${scoring.unscored_dimensions.length?` · 未评维度：${escape(scoring.unscored_dimensions.join(', '))}`:''}${r?.provisional?' · 暂定':''}</p>`:'<p>没有可计算的已评分维度。</p>'}${d.e2e_limitations?.length?`<p><b>限制：</b>${escape(d.e2e_limitations.join('；'))}</p>`:''}<details><summary>展开 Loop 视觉义务：初始版本与最佳版本</summary><div class="details-body">${table(['义务','标准','页面 / 区域','预期','v0 初始版本','最佳版本','适用性'],obligationRows)}<p class="metric-detail">目标是每项达到 3；不计算三项加权总分，也不替代最终 E2E 结果。</p></div></details></section>
    <section class="panel" id="process"><div class="panel-head"><h2>版本演进与运行过程</h2><span>完整保存生成 → 评估 → diff → 修复 → 验证 → 决策</span></div><div class="process-list">${processCards}</div>${table(['版本','目的','决策','产物','文件 Diff','评分变化','门禁变化','检查套件'],trajectoryRows)}${blockerHtml}${roundCards?`<h3 class="subhead">Generate → Measure → Diff → Repair → Verify</h3><div class="timeline">${roundCards}</div>`:'<div class="empty">只有 v0 初始版本，本次运行没有修复候选。</div>'}<p class="metric-detail">结构化记录：<a href="report.json">report.json</a> · 操作账本：<a href="events.jsonl">events.jsonl</a> · 实施 brief：<a href="design_brief.md">design_brief.md</a></p></section>
    <section class="panel" id="checks"><div class="panel-head"><h2>自动检查</h2><span>规则门禁与诊断证据，不替代独立视觉 Judge</span></div>${staticSummaryRows.length?`${table(['套件','阶段','结论','通过/总数','失败','未知','跳过','覆盖','产物'],staticSummaryRows)}<details><summary>展开全部检查项</summary><div class="details-body">${table(['套件','检查项','类别','状态','严重度','预期','实际','证据'],staticCheckRows)}</div></details>`:'<div class="empty">未记录 StaticCheckSuite/v1；不得把“脚本存在”写成“静态检查通过”。</div>'}</section>
    <section class="panel" id="evidence"><div class="panel-head"><h2>证据与残差</h2><span>每行对应页面状态，每列对应一个版本</span></div>${residualRows.length?table(['问题','严重度','关联义务'],residualRows):'<div class="empty">没有登记的最佳版本残差。</div>'}${scene?`<h3 class="subhead">玩法与渲染依据</h3>${table(sceneHeaders,transitionRows)}${table(['渲染项','证据状态','说明','证据'],renderingRows)}`:''}<h3 class="subhead">截图版本对照</h3>${evidenceMatrix}</section>
    <section class="panel" id="accounting"><div class="panel-head"><h2>时间与用量</h2><span>只汇总有来源的数据；缺失保持未知</span></div><div class="kv-grid">${kv('有效执行时间',accounting?duration(accounting.active_elapsed_ms):'运行中')}${kv('墙钟跨度',accounting?duration(accounting.wall_elapsed_ms):'运行中')}${kv('已排除外部等待',accounting?duration(accounting.excluded_ms):'无记录')}${kv('Token 覆盖状态',`${tokens.coverage} · ${tokens.coverage_note}`)}${kv('已观察 Token 总量',tokens.observed_total_tokens==null?'未知':Number(tokens.observed_total_tokens).toLocaleString('en-US'))}${kv('Token 来源响应数',tokens.response_count??'未知')}</div>${timeRows.length?`<h3 class="subhead">外部暂停区间</h3>${table(['开始','结束','原因','来源'],timeRows)}`:''}${tokenRows.length?`<h3 class="subhead">Token 来源明细</h3>${table(['阶段','Agent','输入','缓存输入','输出','总量','来源'],tokenRows)}`:''}${d.supplemental_audits?.length?`<h3 class="subhead">补充审计</h3>${table(['审计','状态','摘要','报告文件'],d.supplemental_audits.map(a=>[a.label,a.status,a.summary??'—',a.html_uri]))}`:''}</section>
    <section class="panel" id="approval"><div class="panel-head"><h2>审批记录</h2><span>审批绑定本报告与模板哈希</span></div><div class="notice ${approval?'':'warning'}">本页面只导出本地审批 JSON，不验证身份或提交服务器。正向审批受独立 E2E、红线和人工复核门禁限制。</div><p>${approval?`${statusBadge(approval.decision,approval.decision)} ${escape(approval.reviewer)} · ${escape(approval.reason)}`:statusBadge('pending','待审批')}</p><form id="approval-form"><div class="form-grid"><label>结论<select name="decision"><option value="no_go">不批准</option><option value="conditional_go" ${eligible(d,'conditional_go')?'':'disabled'}>有条件批准</option><option value="go" ${eligible(d,'go')?'':'disabled'}>批准</option></select></label><label>审阅者<input name="reviewer" required></label><label class="full">理由<textarea name="reason" required></textarea></label><label class="full">后续条件<textarea name="conditions"></textarea></label><label class="full"><input type="checkbox" name="manual_reviewed"> 我已对照参考、还原图和交互证据完成复核</label><div class="form-foot full"><button class="primary">导出审批 JSON</button><output id="message"></output></div></div></form></section><div class="footer">Restore Report v0.2 · ${escape(d.run_id)} · SHA-256 ${escape(m.report_sha256)}</div>`;
  const context={report_sha256:m.report_sha256,template_sha256:m.template_sha256,run_id:run.run_id,provisional:r?.provisional??true};
  const html=m.template.replace('{{BODY}}',body).replace('{{CONTEXT}}',JSON.stringify(context).replaceAll('<','\\u003c'));
  await writeJSON(join(root,'report.json'),d);await writeFile(join(root,'report.html'),html);
  const qa=mdTable(['义务','维度','状态 / 区域','可观察目标','重要性','适用性'],d.contract.obligations.map(o=>[o.id,o.criterion_id,`${o.state_id} / ${o.region_id}`,o.expected,o.importance,o.applicability]));
  const stateTable=mdTable(['状态','页面','视口','路径','哨兵'],d.contract.states.map(s=>[s.id,s.page_id,`${s.viewport.width}×${s.viewport.height}`,s.path,s.sentinel?'是':'否']));
  const resources=mdTable(['资源','用途 / 区域','来源 / 状态'],(d.contract.resources??[]).map(x=>[x.id??x.name??x.url,x.role??x.region,x.url??x.status]));
  const findings=mdTable(['问题','严重度','视觉义务'],(d.best?.findings??[]).filter(x=>x.integrity_status!=='degraded').map(x=>[x.description,x.severity,x.obligation_id]));
  const files={
    'T0-input':`# T0 输入与任务边界\n\n参考：${d.contract.requested_url}\n\n实际页面：${d.contract.observed_url}\n\n环境：${JSON.stringify(d.contract.environment)}\n\n档位：${d.tier}\n\n${d.lineage?`${d.lineage.relationship==='contract_refreeze'?'合同重新冻结自':'延续自'}父 run：${d.lineage.parent.run_id}；继承产物：${d.lineage.inherited.artifact_sha256}（${d.lineage.inherited.artifact_source}）。${d.lineage.relationship==='contract_refreeze'?`父合同：${d.lineage.parent.contract_sha256}；新合同来源：${d.lineage.contract_refreeze.source.canonical_sha256}；本 run 冻结合同：${d.contract_sha256}。`:''}父轨迹不复制，见 lineage.json${d.lineage.parent.report?` 与 [父报告](${d.lineage.parent.report.href})`:''}。\n\n`:''}## 页面状态\n\n${stateTable}\n## 页面专属视觉 QA\n\n${qa}\n`,
    'T1-evidence':`# T1 参考取证与资源\n\n${mdTable(['证据','类型','文件','SHA-256'],d.contract.reference_evidence.map(x=>[x.id,x.kind,x.uri,x.sha256]))}\n## 资源映射\n\n${resources}\n## 玩法与渲染依据\n\n${sceneBrief}\n## 未知\n\n${(d.contract.unknowns??[]).map(x=>'- '+mdCell(x)).join('\n')||'无已登记未知项'}\n`,
    'T2-trajectory':`# T2 完整版本轨迹\n\n本页记录 v0 初始可运行版本和所有候选版本，包括未采用、回退和结论不确定的版本。\n\n${mdTable(['版本','目的','决策','产物 SHA-256','文件 Diff','评分变化','门禁变化','检查套件'],trajectoryRows)}\n## v0 初始门禁\n\n${mdTable(['门禁','结果'],(d.baseline?.gates??[]).map(x=>[x.id,x.status]))}\n## 自动检查汇总\n\n${staticSummaryRows.length?mdTable(['套件','阶段','结论','通过 / 总数','失败','未知','跳过','覆盖','产物'],staticSummaryRows):'未记录 StaticCheckSuite/v1。'}\n`,
    'T2-baseline':`# 已迁移到完整版本轨迹\n\n旧版 T2 只展示第一个版本，不能表达 AI 自迭代过程。请查看 [T2 完整版本轨迹](T2-trajectory.md)。\n`,
    'T3-iterations':`# T3 生成、评估、Diff 与修复决策\n\n${mdTable(['版本','问题 / 假设','方法','判断','文件 Diff','评分变化','门禁变化','验证','回归','候选快照'],d.rounds.map(x=>[x.version_id??`v${x.round}`,`${x.issue_id}: ${x.hypothesis}`,x.strategy,x.decision,changedFiles(x.diff),scoreDelta(x.diff),gateDelta(x.diff),x.verification?.reason??x.reason??'未记录',[...(x.regressions??[]),...(x.gate_regressions??[])].join(', ')||'无已记录回归',x.candidate]))}\n每轮原始证据、评委与判断记录保存在 observations/，操作时序保存在 events.jsonl；未采用候选仍保留在 T2 轨迹中。\n`,
    'T4-final':`# T4 最终产物与验收\n\n停止原因原记录：${d.stop?.reason??'运行中'}${accounting?.budget_exhaustion_misclassified?'；时间校正后预算未耗尽':''}\n\n有效耗时：${accounting?duration(accounting.active_elapsed_ms):'运行中'}；外部暂停：${accounting?duration(accounting.excluded_ms):'0m 0s'}\n\nToken 记录：${tokens.observed_total_tokens??'未知'}；覆盖：${tokens.coverage}；${tokens.coverage_note}\n\n版本数：${d.trajectory.length}；自动检查套件：${d.static_checks.length}\n\n最佳快照：${d.artifact_sha256??'无'}\n\n启动：${d.contract.start_command}\n\n最终 E2E：${r?.status??'pending'}；${scoring?`${scoring.score_100.toFixed(1)}/100 ${scoring.score_type==='partial_normalized'?'已评分维度折算':''}（覆盖 ${scoring.coverage_percent.toFixed(0)}%）`:'无可计算评分'}；${r?.provisional?'暂定':'校准状态见报告'}\n\nJudge 模型：${judgeModelLabel}；评测时间：${evaluation?.evaluated_at??'未记录'}；Rubric / Scorer：${d.contract.e2e_profile.rubric_version} / ${d.contract.e2e_profile.scorer_version}；产物哈希：${d.artifact_sha256??'无'}。\n\n${mdTable(['E2E 维度','等级','权重'],(r?.dimensions??[]).map(x=>[x.id,x.score??x.status,x.weight]))}\n## 自动检查\n\n${staticSummaryRows.length?mdTable(['套件','阶段','结论','通过 / 总数','失败','未知','跳过','覆盖','产物'],staticSummaryRows):'未记录 StaticCheckSuite/v1。'}\n## 剩余明显问题与未知\n\n${findings}\n${(d.contract.unknowns??[]).map(x=>'- '+mdCell(x)).join('\n')}\n`
  };
  for(const [name,content] of Object.entries(files))await writeFile(local(root,`docs/${name}.md`),content);
  await writeFile(join(root,'design_brief.md'),`# Restore brief\n\n参考：${d.contract.requested_url}\n\n实际页面：${d.contract.observed_url}\n\n交付：restored/；启动：${d.contract.start_command}\n\n## 范围与状态\n\n${stateTable}\n## 视觉目标与可见依据\n\n${qa}\n## 玩法与渲染依据\n\n${sceneBrief}\n## 资源与实现依赖\n\n${resources}\n## 最终结果与残差\n\nLoop 原记录：${d.stop?.reason??'运行中'}${accounting?.budget_exhaustion_misclassified?'（时间校正后预算未耗尽）':''}；有效耗时：${accounting?duration(accounting.active_elapsed_ms):'运行中'}；最终 E2E：${r?.status??'pending'}；评测时间：${evaluation?.evaluated_at??'未记录'}；最佳快照：${d.artifact_sha256??'无'}\n\n${findings}\n详细参考见 [T1](docs/T1-evidence.md)，完整版本轨迹见 [T2](docs/T2-trajectory.md)，逐轮判断见 [T3](docs/T3-iterations.md)，最终验收见 [T4](docs/T4-final.md)。\n\n本 brief 由结构化记录生成。\n`);
  return {report:join(root,'report.html'),report_sha256:m.report_sha256,template_sha256:m.template_sha256,approval:approval?.decision??'pending'};
}
