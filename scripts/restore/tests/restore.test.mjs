import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../core.mjs';
import { scoreFinal } from '../../../evals/pipeline/grader.mjs';
import { report } from '../report.mjs';
import { normalizeChoice, compare } from '../pairwise.mjs';
import { invoke } from '../adapter.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
async function workspace(t) {
  const root=resolve(await mkdtemp(join(tmpdir(),'restore-v02-')));
  assert.ok(root.startsWith(resolve(tmpdir())+sep));
  t.after(async()=>{assert.ok(root.startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});});
  await core.init(root,'https://example.com','ordinary');
  await writeFile(join(root,'evidence','reference.png'),png);
  const c=await core.readJSON(join(root,'contract.json'));
  c.demo=true;
  c.observed_url='https://example.com/';c.start_command='open index.html';
  c.environment={browser:'test-chromium',os:'test-os',dpr:1,locale:'en-US'};
  c.states=[{id:'home',page_id:'home',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_selector:'body',regions:['hero'],steps:[],sentinel:true}];
  c.reference_evidence=[{id:'ref',kind:'screenshot',uri:'evidence/reference.png',sha256:core.sha(png)}];
  c.obligations=[
    {id:'layout',criterion_id:'C1',state_id:'home',region_id:'hero',expected:'Hero layout matches',method:'visual comparison',importance:'obvious',required:true,target:3,applicability:'applicable',reference_evidence:['ref']},
    {id:'style',criterion_id:'C2',state_id:'home',region_id:'hero',expected:'Hero style matches',method:'visual comparison',importance:'obvious',required:true,target:3,applicability:'applicable',reference_evidence:['ref']},
    {id:'motion',criterion_id:'C3',state_id:'home',region_id:'hero',expected:'No visual motion',method:'reference observation',importance:'minor',required:true,target:3,applicability:'not_applicable',reason:'Reference is static',reference_evidence:['ref']}
  ];
  await core.writeJSON(join(root,'contract.json'),c);
  await writeFile(join(root,'restored','index.html'),'<h1>baseline</h1>');
  return {root,c};
}
async function act(root,name,fn) {return core.locked(root,name,fn);}
async function assessment(root,run,scores,findings=[],role='independent') {
  const request=await core.assessmentInput(root,run), uri=`evidence/candidate-${Math.random().toString(36).slice(2)}.png`;
  await writeFile(core.local(root,uri),png);
  const ev={id:'visual-'+uri,kind:'screenshot',uri,sha256:core.sha(png)};
  return {schema_version:'LoopAssessment/v0.2',binding:request.binding,assessor:{role,id:'synthetic-reviewer'},evidence:[ev],covered_states:['home'],units:[{obligation_id:'layout',status:'scored',score:scores[0],reason:'Compared hero proportions',evidence:[ev.id]},{obligation_id:'style',status:'scored',score:scores[1],reason:'Compared hero materials',evidence:[ev.id]},{obligation_id:'motion',status:'not_applicable',score:null,reason:'Reference is static',evidence:[ev.id]}],gates:[{id:'runnable',status:'pass',evidence:[ev.id]},{id:'reachable',status:'pass',evidence:[ev.id]},{id:'unobstructed',status:'pass',evidence:[ev.id]}],findings:findings.map(([id,obligation_id])=>({id,obligation_id,severity:'obvious',description:id,evidence:[ev.id]})),stability:{status:'stable',reason:'Two captures identical',evidence:[ev.id]}};
}
async function pairEvidence(root,a,issue,better) {
  const choices=better?['B','A']:['A','B'],orders=[['best','candidate'],['candidate','best']];
  const ids=[];
  for(let i=0;i<2;i++) {
    const uri=`evidence/pair-${Math.random().toString(36).slice(2)}.json`;
    await core.writeJSON(core.local(root,uri),{schema_version:'PairwiseVerdict/v0.2',binding:a.binding,issue_id:issue,assessor:{role:'independent',id:'synthetic-pairwise'},order:orders[i],choice:choices[i],visible_improvement:better,reason:'Compared reference with two candidates'});
    const id='pair-'+uri;a.evidence.push({id,uri,kind:'checks',sha256:core.sha(await readFile(core.local(root,uri)))});ids.push(id);
  }
  return ids;
}
test('bounded loop preserves the best artifact, keeps intra-grade visible gain, and separates E2E',async t=>{
  const {root}=await workspace(t);
  await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['bad-layout','layout'],['bad-style','style']]);
  await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'bad-layout',hypothesis:'Adjust hero width',strategy:'width-css',scope:'local',affected_states:['home'],expected_change:'Closer hero proportion',preserve:'Keep style'}));
  await writeFile(join(root,'restored','index.html'),'<h1>better</h1>');
  const candidate=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['bad-style','style']]);
  const candidatePath=join(root,'candidate-input.json');await core.writeJSON(candidatePath,candidate);
  const paired=await compare(root,await core.readJSON(join(root,'run.json')),candidatePath,fileURLToPath(new URL('./mock-adapter.mjs',import.meta.url)));
  const verification=await core.readJSON(paired.verification),assessed=await core.readJSON(paired.assessment);
  const result=await act(root,'record',r=>core.record(root,r,assessed,verification));
  assert.equal(result.decision,'keep');
  const best=await core.readJSON(join(root,'run.json'));assert.notEqual(best.best,best.baseline);
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'bad-style',hypothesis:'Change main texture',strategy:'texture-css',scope:'local',affected_states:['home'],expected_change:'Closer texture',preserve:'Keep hero width'}));
  await writeFile(join(root,'restored','index.html'),'<h1>worse</h1>');
  const worse=await assessment(root,await core.readJSON(join(root,'run.json')),[1,2],[['bad-style','style'],['bad-layout','layout']]);
  const reversed={...verification,issue_id:'bad-style',binding:worse.binding,evidence:await pairEvidence(root,worse,'bad-style',false),forward:'best',reverse:'best',visible_improvement:false,reason:'Worse composition'};
  const final=await act(root,'record',r=>core.record(root,r,worse,reversed));assert.equal(final.decision,'revert');assert.equal(final.stop.reason,'budget_exhausted');
  assert.equal(await readFile(join(root,'restored','index.html'),'utf8'),'<h1>better</h1>');
  const packet=await report(root,await core.readJSON(join(root,'run.json')));
  assert.ok((await readFile(packet.report,'utf8')).includes('独立 E2E'));
  const data=await core.readJSON(join(root,'report.json'));assert.equal(data.e2e,null);assert.equal(data.rounds.length,2);
  const completed=await core.readJSON(join(root,'run.json')),request=await core.finalInput(root,completed);
  await act(root,'eval-record',r=>core.recordE2E(root,r,{schema_version:'E2EResultRef/v0.2',binding:request.binding,status:'incomplete',reason:'No independent judge configured',dimensions:[],redlines:[],evidence:[],total_100:null,provisional:true}));
  await assert.rejects(()=>act(root,'eval-record',r=>core.recordE2E(root,r,{schema_version:'E2EResultRef/v0.2',binding:request.binding,status:'pass'})),/recorded once/);
  await report(root,await core.readJSON(join(root,'run.json')));
  assert.equal((await core.readJSON(join(root,'report.json'))).e2e.status,'incomplete');
  if(process.env.RESTORE_DEMO_DEST)await cp(root,resolve(process.env.RESTORE_DEMO_DEST),{recursive:true,errorOnExist:true,force:false});
});
test('frozen reference cannot be changed after baseline',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  await writeFile(join(root,'evidence','reference.png'),Buffer.from('tampered'));
  await assert.rejects(()=>act(root,'next',r=>core.advance(root,r)),/Evidence changed/);
});
test('independent E2E requires five scores; binding mismatch is rejected',()=>{
  const binding={artifact_sha256:'a',reference_sha256:'b',contract_sha256:'c',environment_sha256:'d',rubric_version:'v1',scorer_version:'v1'};
  const request={schema_version:'FinalEvalRequest/v0.2',binding,states:[{id:'home'}]};
  const evidence=[{id:'ev',kind:'checks',uri:'evidence/checks.json',sha256:'a'}];
  const raw={binding,assessor:{role:'independent',id:'judge-1'},evidence,covered_states:['home'],dimensions:[['layout',3],['style',3],['content',3],['interaction',3],['robustness',3]].map(([id,score])=>({id,score,status:'scored',reason:'Observed final artifact',evidence:['ev']})),redlines:['runnable','structure','interaction','obstruction','fabrication','external_writes'].map(id=>({schema_version:'E2ERedlineAssessment/v1',id,applicability:'applicable',status:'pass',severity:'S0',impact:'none',affected_states:['home'],affected_regions:[],reason:'Checked final artifact',evidence:['ev']})),calibration:{status:'unmeasured'}};
  const score=scoreFinal(request,raw);assert.equal(score.status,'pass');assert.equal(score.total_100,75);assert.equal(score.provisional,true);
  assert.match(score.thresholds,/all applicable dimensions >=3/);
  assert.throws(()=>scoreFinal(request,{...raw,binding:{...binding,artifact_sha256:'wrong'}}),/binding mismatch/);
  assert.throws(()=>scoreFinal(request,{...raw,dimensions:raw.dimensions.slice(1)}),/Five unique/);
  assert.throws(()=>scoreFinal(request,{...raw,dimensions:[...raw.dimensions,{id:'fidelity',score:3,status:'scored',reason:'Legacy process dimension',evidence:['ev']}]}),/Five unique/);
});
test('redline grader rejects severity/status contradictions and accepts minor non-blocking obstruction',()=>{
  const binding={artifact_sha256:'a',reference_sha256:'b',contract_sha256:'c',environment_sha256:'d',rubric_version:'v1',scorer_version:'v1'};
  const request={schema_version:'FinalEvalRequest/v0.2',binding,states:[{id:'desktop-settings'}]};
  const evidence=[{id:'ev',kind:'screenshot',uri:'evidence/settings.png',sha256:'a'}];
  const base={binding,assessor:{role:'independent',id:'judge-1'},evidence,covered_states:['desktop-settings'],dimensions:[['layout',3],['style',3],['content',3],['interaction',3],['robustness',3]].map(([id,score])=>({id,score,status:'scored',reason:'Observed final artifact',evidence:['ev']})),redlines:['runnable','structure','interaction','obstruction','fabrication','external_writes'].map(id=>({schema_version:'E2ERedlineAssessment/v1',id,applicability:'applicable',status:'pass',severity:'S0',impact:'none',affected_states:['desktop-settings'],affected_regions:[],reason:'Checked final artifact',evidence:['ev']})),calibration:{status:'unmeasured'}};
  const minor=base.redlines.map(r=>r.id==='obstruction'?{...r,status:'pass',severity:'S1',impact:'minor_degradation',affected_regions:['brand','statement'],reason:'Small logo overlap; required text remains present and usable.'}:r);
  assert.equal(scoreFinal(request,{...base,redlines:minor}).status,'pass');
  const contradiction=base.redlines.map(r=>r.id==='obstruction'?{...r,status:'fail',severity:'S1',impact:'minor_degradation'}:r);
  assert.throws(()=>scoreFinal(request,{...base,redlines:contradiction}),/Failing redline requires S2 or S3 impact/);
  const wrongRule=base.redlines.map(r=>r.id==='obstruction'?{...r,status:'fail',severity:'S3',impact:'external_write'}:r);
  assert.throws(()=>scoreFinal(request,{...base,redlines:wrongRule}),/Redline impact does not match its UI criterion/);
  const uncoveredState=base.redlines.map(r=>r.id==='obstruction'?{...r,affected_states:['mobile-hero']}:r);
  assert.throws(()=>scoreFinal(request,{...base,redlines:uncoveredState}),/state outside E2E coverage/);
  const missing=base.redlines.map(r=>r.id==='obstruction'?{schema_version:'E2ERedlineAssessment/v1',id:r.id,applicability:'applicable',status:'fail',reason:r.reason,evidence:r.evidence}:r);
  assert.throws(()=>scoreFinal(request,{...base,redlines:missing}),/Invalid E2E redline severity\/impact contract/);
  const profile={schema_version:'RedlineProfile/v1',case_id:'UIR-0007',rubric_version:'site-restore-v1.1-draft',redlines:['runnable','structure','interaction','obstruction','fabrication','external_writes'].map(id=>({id,applicability:'applicable',scope:{state_ids:['desktop-settings'],region_ids:[]},obligation_ids:[],trigger_examples:['Frozen UI requirement is blocked'],non_trigger_examples:['Minor visual drift without task impact'],evidence_requirements:['screenshot'],rationale:'Mapped to a required UI state.'}))};
  const profileRequest={...request,case_id:'UIR-0007',binding:{...binding,rubric_version:'site-restore-v1.1-draft'},redline_profile:profile};
  assert.equal(scoreFinal(profileRequest,{...base,binding:profileRequest.binding}).status,'pass');
  assert.throws(()=>scoreFinal({...profileRequest,redline_profile:null},base),/RedlineProfile\/v1 is required/);
});
test('pairwise order normalization and dynamic evidence gate',async t=>{
  assert.equal(normalizeChoice('B',['best','candidate']),'candidate');
  assert.equal(normalizeChoice('A',['candidate','best']),'candidate');
  const {root,c}=await workspace(t);
  c.obligations[2]={...c.obligations[2],applicability:'applicable',reason:undefined,expected:'Animated hero matches'};
  await core.writeJSON(join(root,'contract.json'),c);
  await act(root,'freeze',r=>core.freeze(root,r));
  const r=await core.readJSON(join(root,'run.json'));
  const a=await assessment(root,r,[3,3],[]);a.units[2]={...a.units[2],status:'scored',score:3,reason:'Motion appears right'};
  await assert.rejects(()=>core.assess(root,r,c,a,a.binding.artifact_sha256),/Dynamic score requires sequence\/video/);
});
test('adapter accepts a single JSON request under restricted process hosts',async()=>{
  const result=await invoke(fileURLToPath(new URL('./mock-adapter.mjs',import.meta.url)),{kind:'probe'},5000);
  assert.equal(result.received,'probe');
});
