import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest,sha,treeHash} from '../restore/core.mjs';
import {exportRun} from './export-run.mjs';
import {buildSnapshot} from './build-snapshot.mjs';

const json=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const jsonl=async(path,values)=>writeFile(path,values.map(value=>JSON.stringify(value)+'\n').join(''));
const readLines=async path=>(await readFile(path,'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);

async function fixture(t,{sourceReuse='forbidden',runId='run-clean'}={}){
  const root=await mkdtemp(join(tmpdir(),'restore-data-source-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const directory of ['evidence','observations','snapshots/base','snapshots/candidate','restored'])await mkdir(join(root,...directory.split('/')),{recursive:true});
  const reference=Buffer.from('reference-frame'),candidate=Buffer.from('<main>candidate</main>'),base=Buffer.from('<main>base</main>');
  await writeFile(join(root,'evidence','reference.png'),reference);await writeFile(join(root,'snapshots','base','index.html'),base);await writeFile(join(root,'snapshots','candidate','index.html'),candidate);await writeFile(join(root,'restored','index.html'),candidate);
  const baseHash=await treeHash(join(root,'snapshots','base')),candidateHash=await treeHash(join(root,'snapshots','candidate'));
  await rename(join(root,'snapshots','base'),join(root,'snapshots',baseHash));await rename(join(root,'snapshots','candidate'),join(root,'snapshots',candidateHash));
  const policy={mode:sourceReuse==='allowed'?'source_assisted':'fixture_only',case_metadata_visibility:'id_only',source_reuse:sourceReuse};
  const contract={schema_version:'restore/v0.2',requested_url:'https://example.test',observed_url:'https://example.test/',start_command:'open index.html',environment:{browser:'test',os:'test',dpr:1,locale:'en'},case_source:{case_id:'UIR-DATA'},generation_policy:policy,states:[{id:'home'}],obligations:[{id:'layout',reference_evidence:['ref']}],interactive_scene:null,reference_evidence:[{id:'ref',kind:'screenshot',uri:'evidence/reference.png',sha256:sha(reference)}],resources:[],unknowns:[]};
  const contractHash=digest(contract),binding={artifact_sha256:baseHash,contract_sha256:contractHash};
  const baseline={schema_version:'LoopAssessment/v0.2',binding,assessor:{role:'independent',id:'reviewer'},evidence:contract.reference_evidence,covered_states:['home'],units:[],gates:[],findings:[{id:'gap'}]};
  const assessment={...baseline,binding:{...binding,artifact_sha256:candidateHash},findings:[]};
  const verification={schema_version:'IterationDecision/v0.2',binding:assessment.binding,issue_id:'gap',verifier:{role:'independent',id:'pair-reviewer'},evidence:[],forward:'candidate',reverse:'candidate',visible_improvement:true,reason:'Candidate is closer'};
  const diff={schema_version:'ArtifactDiff/v1',from_artifact_sha256:baseHash,to_artifact_sha256:candidateHash,files:{added:[],modified:['index.html'],removed:[],unchanged_count:0}};
  const pointers=[];for(const [name,value] of [['baseline',baseline],['assessment',assessment],['verification',verification],['diff',diff]]){const uri=`observations/${name}.json`;await json(join(root,...uri.split('/')),value);pointers.push([name,{uri,sha256:digest(value)}]);}
  const refs=Object.fromEntries(pointers),at='2026-11-06T00:00:00.000Z';
  const run={schema_version:'restore/v0.2',run_id:runId,started_at:at,tier:'ordinary',phase:'complete',rounds:[{round:1,version_id:'v1',issue_id:'gap',hypothesis:'Fix layout',strategy:'css',scope:'local',affected_states:['home'],expected_change:'Closer layout',preserve:'Runtime',before:baseHash,candidate:candidateHash,assessment:refs.assessment.uri,verification:refs.verification.uri,diff:refs.diff,decision:'keep',at:'2026-11-06T00:01:00.000Z',regressions:[],gate_regressions:[],improvements:{unit_scores:['layout'],gates:[],resolved_findings:['gap']}}],static_checks:[],best:candidateHash,baseline:baseHash,baseline_assessment:refs.baseline.uri,best_assessment:refs.assessment.uri,pending:null,stop:{reason:'target_reached',detail:'',at:'2026-11-06T00:02:00.000Z',artifact_sha256:candidateHash},e2e:null,approval:null,enforcement:'cooperative',profile_changes:0,contract_sha256:contractHash};
  await json(join(root,'contract.json'),contract);await json(join(root,'run.json'),run);await jsonl(join(root,'events.jsonl'),[{at,type:'init'},{at:'2026-11-06T00:01:00.000Z',type:'record'},{at:run.stop.at,type:'end'}]);
  const trajectory=await mkdtemp(join(tmpdir(),'restore-data-trajectory-'));t.after(()=>rm(trajectory,{recursive:true,force:true}));await mkdir(join(trajectory,'capture-delivery'),{recursive:true});
  await json(join(trajectory,'binding.json'),{schema_version:'TrajectoryBinding/v1',run_id:runId,task_id:'task-1',capture_id:'capture-1'});await json(join(trajectory,'capture-delivery','manifest.json'),{trace_ids:['trace-1'],status:'sent'});
  return {root,trajectory,contract,run};
}

test('exports authoritative Restore facts and optional Langfuse linkage',async t=>{
  const {root,trajectory}=await fixture(t),output=await mkdtemp(join(tmpdir(),'restore-package-parent-'));await rm(output,{recursive:true,force:true});t.after(()=>rm(output,{recursive:true,force:true}));
  const result=await exportRun(root,output,{trajectoryDirectory:trajectory});
  assert.equal(result.manifest.integrity.status,'valid');assert.equal(result.steps.length,3);assert.equal(result.episode.observability.trace_ids[0],'trace-1');
  assert.equal(result.episode.generation_input.model_input_proof,false);assert.equal(result.episode.eligibility.sft.eligible,true);assert.equal(result.episode.eligibility.preference.eligible,true);
  const withoutTrajectory=output+'-without-trajectory';t.after(()=>rm(withoutTrajectory,{recursive:true,force:true}));const second=await exportRun(root,withoutTrajectory);assert.equal(second.episode.fingerprint,result.episode.fingerprint);
  assert.doesNotMatch(await readFile(join(output,'steps.jsonl'),'utf8'),/hidden_reasoning|chain_of_thought|scratchpad/i);
});

test('source reuse quarantines SFT and preference exports without redefining Loop acceptance',async t=>{
  const {root}=await fixture(t,{sourceReuse:'allowed',runId:'run-assisted'}),output=join(await mkdtemp(join(tmpdir(),'restore-package-parent-')),'package');t.after(()=>rm(join(output,'..'),{recursive:true,force:true}));
  const result=await exportRun(root,output);
  assert.equal(result.episode.outcome.loop_stop,'target_reached');assert.equal(result.episode.quarantine,true);assert.equal(result.episode.eligibility.sft.eligible,false);assert.deepEqual(result.episode.eligibility.sft.reasons,['source_reuse_allowed']);
});

test('fails closed when authoritative evidence changes',async t=>{
  const {root}=await fixture(t),output=join(await mkdtemp(join(tmpdir(),'restore-package-parent-')),'package');t.after(()=>rm(join(output,'..'),{recursive:true,force:true}));
  await writeFile(join(root,'evidence','reference.png'),'tampered');
  await assert.rejects(()=>exportRun(root,output),/Evidence changed/);
});

test('builds deterministic grouped splits, deduplicates, and exports only eligible views',async t=>{
  const clean=await fixture(t,{runId:'run-clean-snapshot'}),assisted=await fixture(t,{sourceReuse:'allowed',runId:'run-assisted-snapshot'});
  const parent=await mkdtemp(join(tmpdir(),'restore-snapshot-parent-'));t.after(()=>rm(parent,{recursive:true,force:true}));const p1=join(parent,'p1'),p2=join(parent,'p2'),duplicate=join(parent,'duplicate'),snapshot=join(parent,'snapshot');
  await exportRun(clean.root,p1);await exportRun(assisted.root,p2);await cp(p1,duplicate,{recursive:true});
  const result=await buildSnapshot(snapshot,[p1,p2,duplicate],{datasetId:'test-dataset'});
  assert.equal(result.manifest.counts.episodes,2);assert.equal(result.manifest.counts.duplicates,1);assert.equal(result.manifest.counts.quarantine,1);
  const episodes=await readLines(join(snapshot,'episodes.jsonl'));assert.equal(new Set(episodes.map(item=>item.dataset.split)).size,1);
  const sft=await readLines(join(snapshot,'exports','sft.jsonl')),preference=await readLines(join(snapshot,'exports','preference.jsonl'));assert.deepEqual(new Set(sft.map(item=>item.episode_id)),new Set(['restore:run-clean-snapshot']));assert.deepEqual(new Set(preference.map(item=>item.episode_id)),new Set(['restore:run-clean-snapshot']));
});
