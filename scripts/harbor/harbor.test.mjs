import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sha} from '../restore/core.mjs';
import {compileCases,createTask,DEFAULT_IMAGE,TIER_ROUNDS,validateFixtureManifest} from './task-builder.mjs';
import {QUALITY_REWARDS,verifyStepEvaluation} from './verifier.mjs';

const temporary=async(t,prefix)=>{const root=await mkdtemp(join(tmpdir(),prefix));t.after(()=>rm(root,{recursive:true,force:true}));return root;};

test('direct URL creates a Harbor 1.4 multi-step task with existing tier rounds',async t=>{
  const parent=await temporary(t,'restore-harbor-task-'),output=join(parent,'task');const result=await createTask(output,{url:'https://example.test/path',tier:'ordinary'});
  assert.equal(result.steps.length,2+TIER_ROUNDS.ordinary);const toml=await readFile(join(output,'task.toml'),'utf8');
  assert.equal((await lstat(join(output,'environment'))).isDirectory(),true);
  assert.match(toml,/schema_version = "1\.4"/);assert.match(toml,/multi_step_reward_strategy = "final"/);assert.match(toml,/environment_mode = "separate"/);assert.match(toml,/min_reward = \{ continue_gate = 1 \}/);assert.match(toml,/runtime_acceptance = "not_run"/);assert.doesNotMatch(toml,/LANGFUSE|OTLP/i);
  for(const name of ['prepare','baseline','iteration-1','iteration-2','iteration-3'])assert.match(toml,new RegExp(`name = "${name}"`));
});

test('verifier keeps continue_gate out of quality and never zero-fills incomplete E2E',()=>{
  const incomplete=verifyStepEvaluation({schema_version:'RestoreStepEvaluation/v1',step:'baseline',status:'incomplete',continue_gate:0,stop_reason:'blocked',limitations:['missing evidence']},'baseline');
  assert.deepEqual(incomplete.rewards,{continue_gate:0});assert.equal(incomplete.record.formal_quality_reward,false);
  const final=Object.fromEntries(QUALITY_REWARDS.map(key=>[key,key==='restore_redline_pass'?1:0.75]));const complete=verifyStepEvaluation({schema_version:'RestoreStepEvaluation/v1',step:'iteration-1',status:'complete',continue_gate:0,stop_reason:'target_reached',final_e2e:{status:'complete',rewards:final},limitations:[]},'iteration-1');
  assert.equal(complete.rewards.restore_total,0.75);assert.equal(Object.keys(complete.rewards).filter(key=>key!=='continue_gate').length,7);
  assert.throws(()=>verifyStepEvaluation({schema_version:'RestoreStepEvaluation/v1',step:'x',status:'complete',continue_gate:0,stop_reason:'new_rule',limitations:[]},'x'),/existing stop_reason/);
});

test('case compiler excludes drafts and fails closed on incomplete ready fixtures',async t=>{
  const root=await temporary(t,'restore-harbor-cases-'),casesPath=join(root,'cases.yaml'),fixtures=join(root,'fixtures');await mkdir(fixtures);
  await writeFile(casesPath,'schema_version: "1.2"\ncases:\n  - id: UIR-DRAFT\n    title: Draft\n    url: https://draft.test/\n    difficulty: easy\n    status: draft\n');
  const empty=await compileCases(join(root,'empty'),{casesPath,fixturesRoot:fixtures});assert.equal(empty.tasks.length,0);assert.doesNotMatch(await readFile(join(root,'empty','dataset.toml'),'utf8'),/\[\[tasks\]\]/);
  await writeFile(casesPath,'schema_version: "1.2"\ncases:\n  - id: UIR-READY\n    title: Ready\n    url: https://ready.test/\n    difficulty: easy\n    status: ready\n');
  await assert.rejects(()=>compileCases(join(root,'broken'),{casesPath,fixturesRoot:fixtures}),/Fixture manifest missing/);
});

test('ready fixture requires immutable evidence and a pinned image',async t=>{
  const root=await temporary(t,'restore-harbor-fixture-'),fixture=join(root,'UIR-READY');await mkdir(fixture);const bytes=Buffer.from('fixture');await writeFile(join(fixture,'reference.png'),bytes);
  const manifest={schema_version:'RestoreFixtureManifest/v1',case_id:'UIR-READY',url:'https://ready.test/',tier:'ordinary',source_policy:{mode:'fixture_only',source_reuse:'forbidden'},environment:{docker_image:DEFAULT_IMAGE},viewports:[{width:1280,height:720}],states:[{id:'home'}],reference_evidence:[{id:'home',kind:'screenshot',uri:'reference.png',sha256:sha(bytes)}],resources:[{id:'reference-resource',uri:'reference.png',sha256:sha(bytes),host:null}]};await writeFile(join(fixture,'manifest.json'),JSON.stringify(manifest));
  assert.equal((await validateFixtureManifest(fixture,'UIR-READY')).case_id,'UIR-READY');await writeFile(join(fixture,'reference.png'),'changed');await assert.rejects(()=>validateFixtureManifest(fixture,'UIR-READY'),/evidence changed/i);
});
