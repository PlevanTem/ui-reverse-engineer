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
test('report footer allows unbroken integrity hashes to wrap on narrow screens',async()=>{
  const template=await readFile(new URL('../../../assets/restore/report.html',import.meta.url),'utf8');
  assert.match(template,/\.footer\s*\{[^}]*overflow-wrap\s*:\s*anywhere\b/);
});
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
  return {schema_version:'LoopAssessment/v0.2',binding:request.binding,assessor:{role,id:'synthetic-reviewer'},evidence:[ev],covered_states:['home'],units:[{obligation_id:'layout',status:'scored',score:scores[0],reason:'Compared hero proportions',evidence:[ev.id]},{obligation_id:'style',status:'scored',score:scores[1],reason:'Compared hero materials',evidence:[ev.id]},{obligation_id:'motion',status:'not_applicable',score:null,reason:'Reference is static',evidence:[ev.id]}],gates:[{id:'runnable',status:'pass',evidence:[ev.id]},{id:'reachable',status:'pass',evidence:[ev.id]},{id:'unobstructed',status:'pass',evidence:[ev.id]}],findings:findings.map(([id,obligation_id,severity='obvious'])=>({id,obligation_id,severity,description:id,evidence:[ev.id]})),stability:{status:'stable',reason:'Two captures identical',evidence:[ev.id]}};
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
async function pairDecision(root,a,issue,better=true) {
  return {schema_version:'IterationDecision/v0.2',issue_id:issue,binding:a.binding,verifier:{role:'independent',id:'synthetic-pairwise'},evidence:await pairEvidence(root,a,issue,better),forward:better?'candidate':'best',reverse:better?'candidate':'best',visible_improvement:better,reason:better?'Candidate is visibly closer':'Best remains visibly closer'};
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
  const second=await act(root,'record',r=>core.record(root,r,worse,reversed));assert.equal(second.decision,'revert');assert.equal(second.action,'repair');
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'bad-style',hypothesis:'Try a second texture treatment',strategy:'texture-css-2',scope:'local',affected_states:['home'],expected_change:'Closer texture without layout regression',preserve:'Keep hero width'}));
  await writeFile(join(root,'restored','index.html'),'<h1>worse again</h1>');
  const worseAgain=await assessment(root,await core.readJSON(join(root,'run.json')),[1,2],[['bad-style','style'],['bad-layout','layout']]);
  const reversedAgain={...verification,issue_id:'bad-style',binding:worseAgain.binding,evidence:await pairEvidence(root,worseAgain,'bad-style',false),forward:'best',reverse:'best',visible_improvement:false,reason:'Still worse than the best version'};
  const final=await act(root,'record',r=>core.record(root,r,worseAgain,reversedAgain));assert.equal(final.decision,'revert');assert.equal(final.stop.reason,'budget_exhausted');
  assert.equal(await readFile(join(root,'restored','index.html'),'utf8'),'<h1>better</h1>');
  const packet=await report(root,await core.readJSON(join(root,'run.json')));
  const html=await readFile(packet.report,'utf8');assert.ok(html.includes('独立 E2E'));assert.ok(html.includes('展开本版本完整 Diff'));assert.ok(html.includes('index.html'));assert.ok(html.includes('门禁变化'));
  const data=await core.readJSON(join(root,'report.json'));assert.equal(data.e2e,null);assert.equal(data.rounds.length,3);
  assert.equal(data.trajectory.length,4);assert.equal(data.trajectory[0].version_id,'v0');assert.equal(data.trajectory[3].decision,'revert');
  assert.ok(data.trajectory[1].diff.files.modified.includes('index.html'));
  assert.equal(data.trajectory[1].diff.gates.length,3);
  const completed=await core.readJSON(join(root,'run.json')),request=await core.finalInput(root,completed);
  await act(root,'eval-record',r=>core.recordE2E(root,r,{schema_version:'E2EResultRef/v0.2',binding:request.binding,status:'incomplete',reason:'No independent judge configured',dimensions:[],redlines:[],evidence:[],total_100:null,provisional:true}));
  await assert.rejects(()=>act(root,'eval-record',r=>core.recordE2E(root,r,{schema_version:'E2EResultRef/v0.2',binding:request.binding,status:'pass'})),/recorded once/);
  await report(root,await core.readJSON(join(root,'run.json')));
  assert.equal((await core.readJSON(join(root,'report.json'))).e2e.status,'incomplete');
  if(process.env.RESTORE_DEMO_DEST)await cp(root,resolve(process.env.RESTORE_DEMO_DEST),{recursive:true,errorOnExist:true,force:false});
});
test('tiers expose 3/6/9 repair attempts',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(core.TIERS).map(([id,tier])=>[id,tier.rounds])),{ordinary:3,refined:6,complex:9});
});
test('pre-existing failed gates may partially improve and keep without claiming target reached',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);
  base.gates[0].status='fail';base.gates[1].status='fail';await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Restore enough runtime to make one gate observable',strategy:'partial-runtime-repair',scope:'local',affected_states:['home'],expected_change:'runnable improves from fail to unknown',preserve:'Keep current layout score'}));
  await writeFile(join(root,'restored','index.html'),'<h1>partially repaired</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[2,2],[['layout-gap','layout']]);candidate.gates[0].status='unknown';candidate.gates[1].status='fail';
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'keep');assert.equal(result.action,'repair');
  const recorded=await core.readJSON(join(root,'run.json')),diff=await core.readJSON(join(root,recorded.rounds[0].diff.uri));
  assert.deepEqual(recorded.rounds[0].improvements.gates,['runnable']);assert.deepEqual(recorded.rounds[0].gate_regressions,[]);
  assert.deepEqual(diff.gates.map(({gate_id,change})=>[gate_id,change]),[['runnable','improved'],['reachable','unchanged'],['unobstructed','unchanged']]);
  assert.equal(recorded.stop,null);assert.equal(recorded.best_assessment!==recorded.baseline_assessment,true);
});
test('gate regression reverts even when scores improve and a finding is resolved',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Improve layout without breaking runtime',strategy:'layout-repair',scope:'local',affected_states:['home'],expected_change:'layout score rises',preserve:'Keep runtime gates'}));
  await writeFile(join(root,'restored','index.html'),'<h1>better layout but broken runtime</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[3,2]);candidate.gates[0].status='fail';
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'revert');
  const recorded=await core.readJSON(join(root,'run.json'));assert.deepEqual(recorded.rounds[0].gate_regressions,['runnable']);assert.equal(recorded.best,recorded.baseline);
});
test('pairwise preference without an auditable unit gate or finding improvement stays inconclusive',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Cosmetic change with no measured delta',strategy:'cosmetic-only',scope:'local',affected_states:['home'],expected_change:'pairwise preference only',preserve:'Keep measured state'}));
  await writeFile(join(root,'restored','index.html'),'<h1>different but not measurably better</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[2,2],[['layout-gap','layout']]);
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'inconclusive');
  const recorded=await core.readJSON(join(root,'run.json'));assert.deepEqual(recorded.rounds[0].improvements,{unit_scores:[],gates:[],resolved_findings:[]});assert.equal(recorded.best,recorded.baseline);
});
test('resolved in-scope minor finding is an auditable improvement',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['minor-spacing-gap','layout','minor']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'minor-spacing-gap',hypothesis:'Correct the measured spacing detail',strategy:'minor-spacing-repair',scope:'local',affected_states:['home'],expected_change:'minor spacing finding disappears',preserve:'Keep scores and runtime gates'}));
  await writeFile(join(root,'restored','index.html'),'<h1>minor spacing repaired</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[2,2]);
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'minor-spacing-gap')));assert.equal(result.decision,'keep');
  const recorded=await core.readJSON(join(root,'run.json'));assert.deepEqual(recorded.rounds[0].improvements,{unit_scores:[],gates:[],resolved_findings:['minor-spacing-gap']});assert.notEqual(recorded.best,recorded.baseline);
});
test('unresolved in-scope minor finding stays inconclusive despite pairwise preference',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['minor-spacing-gap','layout','minor']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'minor-spacing-gap',hypothesis:'Try to correct the measured spacing detail',strategy:'minor-spacing-attempt',scope:'local',affected_states:['home'],expected_change:'minor spacing finding disappears',preserve:'Keep scores and runtime gates'}));
  await writeFile(join(root,'restored','index.html'),'<h1>minor spacing still present</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[2,2],[['minor-spacing-gap','layout','minor']]);
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'minor-spacing-gap')));assert.equal(result.decision,'inconclusive');
  const recorded=await core.readJSON(join(root,'run.json'));assert.deepEqual(recorded.rounds[0].improvements,{unit_scores:[],gates:[],resolved_findings:[]});assert.equal(recorded.best,recorded.baseline);
});
test('required unit becoming scored for the first time is an auditable improvement without a numeric delta',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);base.units[0]={...base.units[0],status:'unknown',score:null,reason:'Long-path evidence is not yet available'};await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Capture the missing long-path evidence',strategy:'long-path-capture',scope:'local',affected_states:['home'],expected_change:'layout becomes scored from fresh evidence',preserve:'Keep existing scores and gates'}));
  await writeFile(join(root,'restored','index.html'),'<h1>long path is now measurable</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[1,2],[['layout-gap','layout']]);
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'keep');
  const recorded=await core.readJSON(join(root,'run.json')),diff=await core.readJSON(join(root,recorded.rounds[0].diff.uri)),layout=diff.units.find(unit=>unit.obligation_id==='layout');
  assert.deepEqual(recorded.rounds[0].improvements.unit_scores,['layout']);assert.equal(layout.status_change,'newly_scored');assert.equal(layout.before_score,null);assert.equal(layout.candidate_score,1);assert.equal(layout.delta,null);
  await report(root,recorded);assert.ok((await readFile(join(root,'report.html'),'utf8')).includes('layout 首次评分 1'));
});
test('required unit remaining unknown is not an auditable improvement',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);base.units[0]={...base.units[0],status:'unknown',score:null,reason:'Long-path evidence is not yet available'};await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Try to capture the missing long-path evidence',strategy:'incomplete-long-path-capture',scope:'local',affected_states:['home'],expected_change:'layout becomes scored from fresh evidence',preserve:'Keep existing scores and gates'}));
  await writeFile(join(root,'restored','index.html'),'<h1>long path remains unknown</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[2,2],[['layout-gap','layout']]);candidate.units[0]={...candidate.units[0],status:'unknown',score:null,reason:'Long-path evidence is still unavailable'};
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'inconclusive');
  const recorded=await core.readJSON(join(root,'run.json')),diff=await core.readJSON(join(root,recorded.rounds[0].diff.uri));assert.deepEqual(recorded.rounds[0].improvements.unit_scores,[]);assert.equal(diff.units.find(unit=>unit.obligation_id==='layout').status_change,'unchanged');assert.equal(recorded.best,recorded.baseline);
});
test('required unit losing a score reverts even when its finding is resolved',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Attempt a repair without losing evidence',strategy:'evidence-losing-repair',scope:'local',affected_states:['home'],expected_change:'finding resolves while layout remains scored',preserve:'Keep the existing scored unit'}));
  await writeFile(join(root,'restored','index.html'),'<h1>layout evidence lost</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[2,2]);candidate.units[0]={...candidate.units[0],status:'unknown',score:null,reason:'Candidate no longer has verifiable layout evidence'};
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'revert');
  const recorded=await core.readJSON(join(root,'run.json')),diff=await core.readJSON(join(root,recorded.rounds[0].diff.uri));assert.deepEqual(recorded.rounds[0].regressions,['layout']);assert.equal(diff.units.find(unit=>unit.obligation_id==='layout').status_change,'lost_score');assert.equal(recorded.best,recorded.baseline);
});
test('all-pass candidate still keeps when a unit score audibly improves',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Increase the measured layout score',strategy:'measured-layout-repair',scope:'local',affected_states:['home'],expected_change:'layout score rises',preserve:'Keep all gates passing'}));
  await writeFile(join(root,'restored','index.html'),'<h1>measurably better</h1>');
  const run=await core.readJSON(join(root,'run.json')),candidate=await assessment(root,run,[3,2],[['layout-gap','layout']]);
  const result=await act(root,'record',async r=>core.record(root,r,candidate,await pairDecision(root,candidate,'layout-gap')));assert.equal(result.decision,'keep');
  const recorded=await core.readJSON(join(root,'run.json'));assert.deepEqual(recorded.rounds[0].improvements.unit_scores,['layout']);assert.ok(candidate.gates.every(gate=>gate.status==='pass'));
});
test('linked continuation preserves the parent, inherits frozen inputs and remeasures the working artifact as a fresh v0',async t=>{
  const {root,c}=await workspace(t);
  c.generation_policy={mode:'source_assisted',case_metadata_visibility:'id_only',source_reuse:'allowed'};
  await core.writeJSON(join(root,'contract.json'),c);
  await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);
  await act(root,'baseline',r=>core.baseline(root,r,base));
  await report(root,await core.readJSON(join(root,'run.json')));
  const parentBriefBefore=await readFile(join(root,'design_brief.md'));
  await rm(join(root,'report.html'));
  await writeFile(join(root,'restored','index.html'),'<h1>unverified continuation candidate</h1>');
  const parentRunBefore=await readFile(join(root,'run.json')),parentEventsBefore=await readFile(join(root,'events.jsonl'));
  const child=resolve(root+'-continuation');
  t.after(async()=>{assert.ok(child.startsWith(resolve(tmpdir())+sep));await rm(child,{recursive:true,force:true});});
  const created=await core.continueRun(root,child,'complex');
  assert.equal(created.phase,'baseline');assert.equal(created.tier,'complex');
  assert.deepEqual(await readFile(join(root,'run.json')),parentRunBefore);assert.deepEqual(await readFile(join(root,'events.jsonl')),parentEventsBefore);
  const childRun=await core.readJSON(join(child,'run.json')),lineage=await core.readJSON(join(child,'lineage.json'));
  assert.notEqual(childRun.run_id,(await core.readJSON(join(root,'run.json'))).run_id);
  assert.equal(childRun.lineage.artifact_source,'working_tree_unverified');
  assert.equal(lineage.parent.run_json_sha256,core.sha(parentRunBefore));assert.equal(lineage.parent.events_jsonl_sha256,core.sha(parentEventsBefore));
  assert.equal(lineage.inherited.generation_policy.mode,'source_assisted');assert.equal(lineage.parent.report.href,'../'+root.split(/[\\/]/).at(-1)+'/report.html');assert.equal('sha256' in lineage.parent.report,false);
  assert.equal(lineage.inherited.design_brief.source,'parent_copy');assert.equal(lineage.inherited.design_brief.initial_sha256,core.sha(parentBriefBefore));assert.deepEqual(await readFile(join(child,'design_brief.md')),parentBriefBefore);
  await writeFile(join(child,'design_brief.md'),'# Child-owned working brief\n');assert.deepEqual(await readFile(join(root,'design_brief.md')),parentBriefBefore);
  assert.equal(await readFile(join(child,'restored','index.html'),'utf8'),'<h1>unverified continuation candidate</h1>');
  assert.equal(await core.treeHash(join(child,'restored')),lineage.inherited.artifact_sha256);
  assert.equal(core.digest(await core.readJSON(join(child,'contract.json'))),childRun.contract_sha256);
  assert.equal(core.sha(await readFile(join(child,'evidence','reference.png'))),c.reference_evidence[0].sha256);
  const request=await core.generationInput(child,childRun);assert.equal(request.generation_policy.mode,'source_assisted');
  const fresh=await assessment(child,childRun,[3,3]);await act(child,'initial-record',r=>core.baseline(child,r,fresh));
  await report(child,await core.readJSON(join(child,'run.json')));
  const reportData=await core.readJSON(join(child,'report.json')),html=await readFile(join(child,'report.html'),'utf8');
  assert.equal(reportData.lineage.parent.run_id,lineage.parent.run_id);assert.equal(reportData.trajectory.length,1);
  assert.ok(html.includes('延续运行'));assert.ok(html.includes('working_tree_unverified'));assert.ok(html.includes('父报告'));
  await assert.rejects(()=>core.continueRun(root,child),/already exists/);
  await core.writeJSON(join(child,'lineage.json'),{...lineage,relationship:'rewritten'});
  const childAfterTamper=await core.readJSON(join(child,'run.json'));
  await assert.rejects(()=>report(child,childAfterTamper),/Continuation lineage changed/);
});
test('continuation projects a writable brief when the parent has no report brief',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  const child=resolve(root+'-brief-projection');t.after(async()=>{assert.ok(child.startsWith(resolve(tmpdir())+sep));await rm(child,{recursive:true,force:true});});
  await core.continueRun(root,child);
  const lineage=await core.readJSON(join(child,'lineage.json')),brief=await readFile(join(child,'design_brief.md'),'utf8');
  assert.equal(lineage.inherited.design_brief.source,'contract_projection');assert.equal(lineage.inherited.design_brief.initial_sha256,core.sha(Buffer.from(brief)));
  assert.equal(lineage.parent.design_brief.href,'../'+root.split(/[\\/]/).at(-1)+'/design_brief.md');assert.equal('sha256' in lineage.parent.design_brief,false);
  assert.ok(brief.includes('Restore continuation brief'));assert.ok(brief.includes('contract.json remains authoritative'));
});
test('working-tree continuation report labels inherited v0 as candidate and eagerly loads candidate screenshots',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await writeFile(join(root,'restored','index.html'),'<h1>unverified inherited candidate</h1>');
  const child=resolve(root+'-candidate-report');t.after(async()=>{assert.ok(child.startsWith(resolve(tmpdir())+sep));await rm(child,{recursive:true,force:true});});
  await core.continueRun(root,child);
  const childRun=await core.readJSON(join(child,'run.json'));
  assert.equal(childRun.lineage.artifact_source,'working_tree_unverified');
  const childBase=await assessment(child,childRun,[3,3]);await act(child,'baseline',r=>core.baseline(child,r,childBase));
  await report(child,await core.readJSON(join(child,'run.json')));
  const html=await readFile(join(child,'report.html'),'utf8');
  assert.match(html,/v0 继承候选 · 独立基线/);
  assert.match(html,/loading="eager"[^>]+src="observations\/evidence-archive\//);
});
test('contract refreeze inherits only the parent best and starts a changed hash-bound contract in prepare',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  const parentRun=await core.readJSON(join(root,'run.json')),parentBestHtml=await readFile(join(root,'snapshots',parentRun.best,'index.html'));
  await writeFile(join(root,'restored','index.html'),'<h1>unverified parent working tree</h1>');
  const staging=resolve(root+'-refreeze-source');const child=resolve(root+'-refreeze');const fileChild=resolve(root+'-refreeze-file');
  t.after(async()=>{for(const path of [staging,child,fileChild]){assert.ok(path.startsWith(resolve(tmpdir())+sep));await rm(path,{recursive:true,force:true});}});
  await mkdir(join(staging,'evidence'),{recursive:true});await writeFile(join(staging,'evidence','reference.png'),png);
  const changed=await core.readJSON(join(root,'contract.json'));changed.observed_url='https://example.com/refrozen';changed.unknowns=['Newly discovered post-entry path must be frozen'];
  await core.writeJSON(join(staging,'contract.json'),changed);
  const created=await core.refreezeRun(root,child,staging,'refined');
  assert.equal(created.phase,'prepare');assert.equal(created.tier,'refined');assert.equal(created.lineage.relationship,'contract_refreeze');
  const childRun=await core.readJSON(join(child,'run.json')),lineage=await core.readJSON(join(child,'lineage.json'));
  assert.equal(childRun.contract_sha256,undefined);assert.equal(childRun.best,null);assert.equal(childRun.baseline,null);assert.deepEqual(childRun.rounds,[]);
  assert.equal(lineage.parent.contract_sha256,parentRun.contract_sha256);assert.notEqual(lineage.contract_refreeze.source.canonical_sha256,parentRun.contract_sha256);
  assert.equal(lineage.inherited.artifact_sha256,parentRun.best);assert.equal(lineage.inherited.artifact_source,'best_snapshot');
  assert.deepEqual(await readFile(join(child,'restored','index.html')),parentBestHtml);assert.equal(await core.treeHash(join(child,'restored')),parentRun.best);
  assert.equal(core.digest(await core.readJSON(join(child,'refreeze-contract-source.json'))),lineage.contract_refreeze.source.canonical_sha256);
  assert.equal(core.sha(await readFile(join(child,'evidence','reference.png'))),changed.reference_evidence[0].sha256);
  const prepared=await core.readJSON(join(child,'contract.json'));prepared.unknowns.push('Prepare-stage refinement remains separately visible');await core.writeJSON(join(child,'contract.json'),prepared);
  await act(child,'freeze',r=>core.freeze(child,r));
  const frozen=await core.readJSON(join(child,'run.json'));assert.notEqual(frozen.contract_sha256,lineage.contract_refreeze.source.canonical_sha256);assert.equal(frozen.phase,'baseline');
  const fresh=await assessment(child,frozen,[3,3]);await act(child,'initial-record',r=>core.baseline(child,r,fresh));
  await report(child,await core.readJSON(join(child,'run.json')));
  const reportData=await core.readJSON(join(child,'report.json')),html=await readFile(join(child,'report.html'),'utf8');
  assert.equal(reportData.lineage.relationship,'contract_refreeze');assert.equal(reportData.trajectory.length,1);assert.ok(html.includes('合同重新冻结'));assert.ok(html.includes(lineage.parent.contract_sha256));assert.ok(html.includes(lineage.contract_refreeze.source.canonical_sha256));assert.ok(html.includes(frozen.contract_sha256));
  await writeFile(join(child,'snapshots',lineage.inherited.artifact_sha256,'index.html'),'<h1>tampered inherited snapshot</h1>');
  const childAfterArtifactTamper=await core.readJSON(join(child,'run.json'));
  await assert.rejects(()=>report(child,childAfterArtifactTamper),/Inherited artifact snapshot changed/);
  await writeFile(join(child,'snapshots',lineage.inherited.artifact_sha256,'index.html'),parentBestHtml);
  await core.writeJSON(join(child,'refreeze-contract-source.json'),{...changed,unknowns:['tampered source archive']});
  const childAfterTamper=await core.readJSON(join(child,'run.json'));
  await assert.rejects(()=>report(child,childAfterTamper),/Refreeze contract source changed/);

  const explicitJson=join(staging,'new-contract.json');await core.writeJSON(explicitJson,changed);
  await core.refreezeRun(root,fileChild,explicitJson);
  assert.equal((await core.readJSON(join(fileChild,'lineage.json'))).contract_refreeze.source.kind,'json_file');
});
test('contract refreeze rejects a final contract reverted to the parent and managed-path evidence collisions',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  const parentContract=await core.readJSON(join(root,'contract.json'));
  const staging=resolve(root+'-refreeze-guard-source'),child=resolve(root+'-refreeze-guard-child'),collisionChild=resolve(root+'-refreeze-collision-child');
  t.after(async()=>{for(const path of [staging,child,collisionChild]){assert.ok(path.startsWith(resolve(tmpdir())+sep));await rm(path,{recursive:true,force:true});}});
  await mkdir(join(staging,'evidence'),{recursive:true});await writeFile(join(staging,'evidence','reference.png'),png);
  const changed=structuredClone(parentContract);changed.observed_url='https://example.com/refrozen-guard';
  await core.writeJSON(join(staging,'contract.json'),changed);
  await core.refreezeRun(root,child,staging);
  await core.writeJSON(join(child,'contract.json'),parentContract);
  await assert.rejects(()=>act(child,'freeze',r=>core.freeze(child,r)),/final contract must differ from the parent frozen contract/);

  await mkdir(join(staging,'RESTORED'),{recursive:true});await writeFile(join(staging,'RESTORED','reference.png'),png);
  const collision=structuredClone(changed);collision.reference_evidence[0]={...collision.reference_evidence[0],uri:'RESTORED/reference.png'};
  await core.writeJSON(join(staging,'contract.json'),collision);
  await assert.rejects(()=>core.refreezeRun(root,collisionChild,staging),/evidence path conflicts with managed run content/);
  collision.reference_evidence[0]={...collision.reference_evidence[0],uri:'evidence/../RESTORED/reference.png'};
  await core.writeJSON(join(staging,'contract.json'),collision);
  await assert.rejects(()=>core.refreezeRun(root,collisionChild,staging),/evidence path conflicts with managed run content/);
  for(const uri of ['report.html','docs/reference.png','evidence/trailing.','evidence/trailing ','evidence/item:stream','evidence/NUL.txt']) {
    collision.reference_evidence[0]={...collision.reference_evidence[0],uri};
    await core.writeJSON(join(staging,'contract.json'),collision);
    await assert.rejects(()=>core.refreezeRun(root,collisionChild,staging),/Refreeze evidence path conflicts|Unsupported Windows-equivalent refreeze evidence path/);
  }

  const finalCollision=structuredClone(changed);await core.writeJSON(join(staging,'contract.json'),finalCollision);
  await core.refreezeRun(root,collisionChild,staging);
  finalCollision.reference_evidence[0]={...finalCollision.reference_evidence[0],uri:'report.html'};
  await writeFile(join(collisionChild,'report.html'),png);
  finalCollision.reference_evidence[0].sha256=core.sha(png);
  await core.writeJSON(join(collisionChild,'contract.json'),finalCollision);
  await assert.rejects(()=>act(collisionChild,'freeze',r=>core.freeze(collisionChild,r)),/evidence path conflicts with managed run content/);
});
test('contract refreeze rejects a parent without a frozen contract or verified best',async t=>{
  const {root,c}=await workspace(t);const staging=resolve(root+'-refreeze-preconditions');const child=resolve(root+'-invalid-refreeze');
  t.after(async()=>{for(const path of [staging,child]){assert.ok(path.startsWith(resolve(tmpdir())+sep));await rm(path,{recursive:true,force:true});}});
  await mkdir(join(staging,'evidence'),{recursive:true});await writeFile(join(staging,'evidence','reference.png'),png);
  c.observed_url='https://example.com/refrozen';await core.writeJSON(join(staging,'contract.json'),c);
  await assert.rejects(()=>core.refreezeRun(root,child,staging),/frozen restore\/v0\.2 contract/);
  await act(root,'freeze',r=>core.freeze(root,r));
  await assert.rejects(()=>core.refreezeRun(root,child,staging),/no verified best artifact/);
});
test('generation input excludes evaluation-only source and stack evidence',async t=>{
  const {root,c}=await workspace(t);
  const source=Buffer.from('evaluation-only source evidence');
  await writeFile(join(root,'evidence','source.txt'),source);
  c.reference_evidence.push({id:'source-eval',kind:'source',uri:'evidence/source.txt',sha256:core.sha(source)});
  c.obligations[0].reference_evidence.push('source-eval');
  c.case_source={case_id:'UIR-TEST',dataset_sha256:'a'.repeat(64),technology_stack_evidence:['secret source note']};
  await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>act(root,'freeze',r=>core.freeze(root,r)),/evaluation-only case metadata/);
  c.case_source={case_id:'UIR-TEST',dataset_sha256:'a'.repeat(64)};
  c.generation_policy={mode:'fixture_only',case_metadata_visibility:'id_only',source_reuse:'forbidden'};
  await core.writeJSON(join(root,'contract.json'),c);
  await act(root,'freeze',r=>core.freeze(root,r));
  const input=await core.generationInput(root,await core.readJSON(join(root,'run.json')));
  assert.equal(input.case_id,'UIR-TEST');
  assert.equal(input.generation_policy.mode,'fixture_only');
  assert.ok(!JSON.stringify(input).includes('technology_stack'));
  assert.ok(!JSON.stringify(input).includes('secret source note'));
  assert.ok(!JSON.stringify(input).includes('source-eval'));
  assert.ok(!('case_source' in input));
});
test('static check suites are normalized, bound to a version, and rendered in the trajectory report',async t=>{
  const {root,c}=await workspace(t);
  c.generation_policy={mode:'fixture_only',case_metadata_visibility:'id_only',source_reuse:'forbidden'};
  await core.writeJSON(join(root,'contract.json'),c);
  await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);
  await act(root,'baseline',r=>core.baseline(root,r,base));
  const run=await core.readJSON(join(root,'run.json'));
  const uri='evidence/static-check.txt';await writeFile(join(root,uri),'fixture static check evidence');
  const evidence=[{id:'static-log',kind:'checks',uri,sha256:core.sha(await readFile(join(root,uri)))}];
  const suite={schema_version:'StaticCheckSuite/v1',suite_id:'initial-static',label:'Initial static checks',stage:'initial',binding:{run_id:run.run_id,artifact_sha256:run.best,contract_sha256:run.contract_sha256},executor:{role:'tool',id:'fixture-checker'},started_at:'2026-10-18T00:00:00.000Z',completed_at:'2026-10-18T00:00:01.000Z',evidence,checks:[
    {id:'syntax',category:'syntax',status:'pass',severity:'blocking',description:'JavaScript parses',expected:'parse success',actual:'parse success',evidence:['static-log']},
    {id:'browser',category:'browser',status:'unknown',severity:'obvious',description:'Browser rendering',expected:'rendered',actual:'browser unavailable',evidence:['static-log']},
    {id:'lint',category:'quality',status:'skipped',severity:'informational',description:'Optional lint',expected:'no errors',actual:'not configured',evidence:['static-log']}
  ]};
  const recorded=await act(root,'static-check-record',r=>core.recordStaticChecks(root,r,suite));
  assert.deepEqual(recorded.summary,{total:3,pass:1,fail:0,unknown:1,skipped:1,blocking_failures:0,coverage_percent:50,overall_status:'incomplete'});
  const recordedBytes=await readFile(join(root,recorded.uri)),storedSuite=JSON.parse(recordedBytes.toString('utf8'));
  assert.equal(recorded.sha256,core.digest(storedSuite));
  assert.match(recorded.uri,new RegExp(`static-check-${recorded.sha256}\\.json$`));
  const recordedFileSha=core.sha(recordedBytes);assert.notEqual(recordedFileSha,recorded.sha256);
  const suiteAsEvidence=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2]);
  suiteAsEvidence.evidence.push({id:'recorded-static-suite',kind:'checks',uri:recorded.uri,sha256:recordedFileSha});
  await core.assess(root,await core.readJSON(join(root,'run.json')),c,suiteAsEvidence,run.best);
  const wrongEvidenceHash=structuredClone(suiteAsEvidence);wrongEvidenceHash.evidence.at(-1).sha256=recorded.sha256;
  const currentRun=await core.readJSON(join(root,'run.json'));
  await assert.rejects(()=>core.assess(root,currentRun,c,wrongEvidenceHash,run.best),/Evidence changed: recorded-static-suite/);
  await act(root,'stop',r=>core.end(root,r,'failed','fixture stop after static checks'));
  await report(root,await core.readJSON(join(root,'run.json')));
  const data=await core.readJSON(join(root,'report.json'));
  assert.equal(data.static_checks.length,1);assert.equal(data.static_checks[0].summary.overall_status,'incomplete');
  assert.equal(data.trajectory[0].static_checks[0].suite_id,'initial-static');
  const html=await readFile(join(root,'report.html'),'utf8');assert.ok(html.includes('自动检查'));assert.ok(html.includes('initial-static'));assert.ok(html.includes('browser'));
});
test('version-bound restored evidence resolves against its immutable snapshot',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  let run=await core.readJSON(join(root,'run.json'));const baselineHash=run.best;
  const sourceUri='restored/index.html',sourceHash=core.sha(await readFile(join(root,sourceUri)));
  const suite={schema_version:'StaticCheckSuite/v1',suite_id:'bound-source',label:'Bound source check',stage:'initial',binding:{run_id:run.run_id,artifact_sha256:baselineHash,contract_sha256:run.contract_sha256},executor:{role:'tool',id:'fixture-checker'},started_at:'2026-10-20T00:00:00.000Z',completed_at:'2026-10-20T00:00:01.000Z',evidence:[{id:'bound-index',kind:'source',uri:sourceUri,sha256:sourceHash}],checks:[{id:'source-syntax',category:'syntax',status:'pass',severity:'blocking',description:'Bound source parses',expected:'source hash matches checked artifact',actual:'source hash matched at check time',evidence:['bound-index']}]};
  await act(root,'static-check-record',r=>core.recordStaticChecks(root,r,suite));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'Replace the baseline page',strategy:'fixture-replacement',scope:'local',affected_states:['home'],expected_change:'Resolve the layout gap',preserve:'Keep runtime gates'}));
  await writeFile(join(root,'restored','index.html'),'<h1>later best</h1>');run=await core.readJSON(join(root,'run.json'));
  const candidate=await assessment(root,run,[3,3]);const candidatePath=join(root,'bound-candidate.json');await core.writeJSON(candidatePath,candidate);
  const paired=await compare(root,run,candidatePath,fileURLToPath(new URL('./mock-adapter.mjs',import.meta.url)));
  await act(root,'record',async r=>core.record(root,r,await core.readJSON(paired.assessment),await core.readJSON(paired.verification)));
  run=await core.readJSON(join(root,'run.json'));assert.notEqual(run.best,baselineHash);
  await report(root,run);
  const rendered=await core.readJSON(join(root,'report.json'));assert.equal(rendered.trajectory[0].static_checks[0].suite_id,'bound-source');
  await writeFile(join(root,'snapshots',baselineHash,'index.html'),'<h1>tampered snapshot</h1>');
  await report(root,run);
  let degraded=await core.readJSON(join(root,'report.json'));assert.equal(degraded.integrity.status,'degraded');assert.equal(degraded.integrity.issues[0].version_id,'static:bound-source');assert.match(degraded.integrity.issues[0].error,/Bound evidence snapshot changed/);
  await rm(join(root,'snapshots',baselineHash),{recursive:true,force:true});
  await report(root,run);
  degraded=await core.readJSON(join(root,'report.json'));assert.equal(degraded.integrity.status,'degraded');assert.ok(degraded.integrity.issues.some(issue=>/Bound evidence snapshot missing/.test(issue.error)));
  assert.ok((await readFile(join(root,'report.html'),'utf8')).includes('INTEGRITY DEGRADED'));
});
test('runtime assessment validation remains fail-closed when evidence drifts before record',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const run=await core.readJSON(join(root,'run.json')),base=await assessment(root,run,[2,2]);
  await writeFile(core.local(root,base.evidence[0].uri),Buffer.from('drifted before record'));
  await assert.rejects(()=>act(root,'baseline',r=>core.baseline(root,r,base)),/Evidence changed/);
});
test('historical reused evidence URI degrades report replay without rendering a valid thumbnail',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const run=await core.readJSON(join(root,'run.json')),base=await assessment(root,run,[2,2]);
  await act(root,'baseline',r=>core.baseline(root,r,base));
  const recordedRun=await core.readJSON(join(root,'run.json')),stored=await core.readJSON(join(root,recordedRun.baseline_assessment));
  const sharedUri='evidence/shared-version.png',evidenceId=stored.evidence[0].id;
  stored.evidence[0]={...stored.evidence[0],uri:sharedUri,sha256:core.sha(png)};
  await core.writeJSON(join(root,recordedRun.baseline_assessment),stored);
  await writeFile(join(root,sharedUri),Buffer.from('later version overwrote the shared path'));
  await report(root,recordedRun);
  const data=await core.readJSON(join(root,'report.json')),html=await readFile(join(root,'report.html'),'utf8');
  assert.equal(data.integrity.status,'degraded');
  const issue=data.integrity.issues.find(item=>item.version_id==='v0'&&item.evidence_id===evidenceId);
  assert.equal(issue.uri,sharedUri);assert.equal(issue.expected_sha256,core.sha(png));assert.equal(issue.actual_sha256,core.sha(Buffer.from('later version overwrote the shared path')));assert.match(issue.error,/Evidence changed/);
  assert.equal(data.baseline.units.find(unit=>unit.obligation_id==='layout').status,'unknown');
  assert.ok(html.includes('INTEGRITY DEGRADED'));assert.ok(html.includes(sharedUri));assert.ok(!html.includes(`src="${sharedUri}"`));
});
test('new assessment records archive evidence by content hash before a reused path is overwritten',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const run=await core.readJSON(join(root,'run.json')),base=await assessment(root,run,[2,2]);
  const sharedUri='evidence/shared-version.png';await writeFile(join(root,sharedUri),png);base.evidence[0]={...base.evidence[0],uri:sharedUri,sha256:core.sha(png)};
  await act(root,'baseline',r=>core.baseline(root,r,base));
  const recordedRun=await core.readJSON(join(root,'run.json')),stored=await core.readJSON(join(root,recordedRun.baseline_assessment));
  assert.match(stored.evidence[0].uri,new RegExp(`^observations/evidence-archive/${core.sha(png)}/`));
  await writeFile(join(root,sharedUri),Buffer.from('later version overwrote the shared path'));
  assert.deepEqual(await readFile(join(root,stored.evidence[0].uri)),png);
  await report(root,recordedRun);
  assert.equal((await core.readJSON(join(root,'report.json'))).integrity.status,'valid');
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
  const sequence=Buffer.from(JSON.stringify({frames:['reference.png','reference.png']}));
  await writeFile(join(root,'evidence','reference-sequence.json'),sequence);
  c.reference_evidence.push({id:'motion-ref',kind:'sequence',uri:'evidence/reference-sequence.json',sha256:core.sha(sequence)});
  c.obligations[2].reference_evidence=['motion-ref'];
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
test('freeze rejects text-only visual evidence and unsupported scene gestures',async t=>{
  const {root,c}=await workspace(t);
  c.reference_evidence[0].kind='checks';
  await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>act(root,'freeze',r=>core.freeze(root,r)),/requires screenshot/);
  c.reference_evidence[0].kind='screenshot';c.states[0].steps=[{action:'drag',selector:'canvas',path:[]}];
  await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>act(root,'freeze',r=>core.freeze(root,r)),/Drag requires/);
});
test('scene facts survive measure, both verify orders, final request and report regeneration',async t=>{
  const {root,c}=await workspace(t);
  const scene={schema_version:'InteractiveScene/v1',transitions:[{id:'turn',state_id:'home',input:'fixture input',precondition:'fixture initial state',feedback:'fixture feedback remains visible',timing:'unknown',terminal_state:'fixture end state',repeat_reset:'reload fixture',status:'inferred',evidence:['ref']}],rendering:[{aspect:'camera',description:'fixture camera is unknown',status:'unknown',evidence:['ref']}]};
  c.interactive_scene=scene;await core.writeJSON(join(root,'contract.json'),c);await act(root,'freeze',r=>core.freeze(root,r));
  let run=await core.readJSON(join(root,'run.json'));
  assert.deepEqual((await core.assessmentInput(root,run)).interactive_scene,scene);
  const base=await assessment(root,run,[2,2],[['layout-gap','layout']]);await act(root,'baseline',r=>core.baseline(root,r,base));
  await act(root,'begin',r=>core.begin(root,r,{issue_id:'layout-gap',hypothesis:'fixture resize',strategy:'fixture-width',scope:'local',affected_states:['home'],expected_change:'closer width',preserve:'fixture style'}));
  await writeFile(join(root,'restored','index.html'),'<h1>verified fixture</h1>');run=await core.readJSON(join(root,'run.json'));
  const a=await assessment(root,run,[3,3]);const input=join(root,'candidate.json');await core.writeJSON(input,a);
  const result=await compare(root,run,input,fileURLToPath(new URL('./mock-adapter.mjs',import.meta.url)));
  const assessed=await core.readJSON(result.assessment);
  for(const item of assessed.evidence.filter(e=>e.id.startsWith('pairwise-'))) {
    const raw=await core.readJSON(core.local(root,item.uri));assert.deepEqual(raw.request_context.interactive_scene,scene);assert.equal(raw.request_context.states[0].id,'home');
  }
  await act(root,'record',async r=>core.record(root,r,assessed,await core.readJSON(result.verification)));
  run=await core.readJSON(join(root,'run.json'));assert.equal(run.stop.reason,'target_reached');assert.deepEqual((await core.finalInput(root,run)).interactive_scene,scene);
  await report(root,run);await report(root,run);
  assert.deepEqual((await core.readJSON(join(root,'report.json'))).contract.interactive_scene,scene);
  assert.ok((await readFile(join(root,'design_brief.md'),'utf8')).includes(scene.transitions[0].feedback));
  assert.ok((await readFile(join(root,'report.html'),'utf8')).includes(scene.rendering[0].description));
});
test('report preserves the scoped blocker and rejects changed stop evidence',async t=>{
  const {root}=await workspace(t);await act(root,'freeze',r=>core.freeze(root,r));
  const base=await assessment(root,await core.readJSON(join(root,'run.json')),[2,2]);await act(root,'baseline',r=>core.baseline(root,r,base));
  const uri='evidence/verify-unavailable.json';await core.writeJSON(join(root,uri),{kind:'fixture failure',stage:'loop_verify'});
  const blocker={schema_version:'RestoreBlocker/v1',scope:'loop_verify',reason:'fixture verifier unavailable',
    evidence:[{id:'missing-verifier',kind:'checks',uri,sha256:core.sha(await readFile(join(root,uri)))}],
    attempts:[{capability:'fixture verifier',status:'unavailable',reason:'fixture has no verifier',evidence:['missing-verifier']}],
    remaining_work:[{task:'verify',status:'blocked',reason:'fixture needs independent comparison',evidence:['missing-verifier']}]};
  await act(root,'stop',r=>core.end(root,r,'blocked','fixture stop',blocker));
  const run=await core.readJSON(join(root,'run.json'));await report(root,run);
  assert.equal((await core.readJSON(join(root,'report.json'))).blocker.scope,'loop_verify');
  assert.ok((await readFile(join(root,'report.html'),'utf8')).includes(blocker.reason));
  await core.writeJSON(join(root,run.stop.blocker.uri),{...blocker,reason:'rewritten'});
  await assert.rejects(()=>report(root,run),/Blocker record changed/);
});
