import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectJob,runtimeSkill,main} from './restore.mjs';
const json=(p,v)=>writeFile(p,JSON.stringify(v));
test('setup failure automatically produces one audit episode with missing ATIF',async t=>{
 const root=await mkdtemp(join(tmpdir(),'restore-auto-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const job=join(root,'job'),trial=join(job,'trial');await mkdir(trial,{recursive:true});
 await json(join(trial,'result.json'),{id:'setup-failure',task_name:'test/setup',task_checksum:'a'.repeat(64),step_results:[],exception_info:{exception_type:'SetupError'}});
 await json(join(trial,'lock.json'),{});await json(join(trial,'config.json'),{});
 const results=await collectJob(job,join(root,'packages'),{validator:async()=>{}});
 assert.equal(results.length,1);assert.equal(results[0].eligibility.sft.eligible,false);
 const manifest=JSON.parse(await readFile(join(results[0].package,'manifest.json'),'utf8'));
 assert.equal(manifest.runtime_acceptance,'failed');assert.equal(manifest.integrity.atif_valid,false);
 assert.deepEqual((JSON.parse(await readFile(join(results[0].package,'trajectories/index.json'),'utf8'))).trajectories,[]);
 assert.deepEqual(await collectJob(job,join(root,'packages'),{validator:async()=>{throw Error('should reuse existing package');}}),results);
 manifest.package.exporter_sha256='older-exporter';await json(join(results[0].package,'manifest.json'),manifest);
 const updated=await collectJob(job,join(root,'packages'),{validator:async()=>{}});assert.equal(updated[0].package,results[0].package);
 const latest=await readFile(join(updated[0].package,'manifest.json'),'utf8');assert.notEqual(JSON.parse(latest).package.exporter_sha256,'older-exporter');
 assert.deepEqual(await readdir(join(root,'packages')),['trial']);
 // A failed refresh must leave the previous package byte-for-byte intact.
 const changed={id:'setup-failure',task_name:'test/setup',step_results:[],exception_info:{exception_type:'ChangedSetupError'}};
 await json(join(trial,'result.json'),changed);await rm(join(trial,'lock.json'));
 const failed=await collectJob(job,join(root,'packages'),{validator:async()=>{}});assert.equal(failed[0].status,'export_failed');
 assert.equal(await readFile(join(updated[0].package,'manifest.json'),'utf8'),latest);assert.deepEqual(await readdir(join(root,'packages')),['trial']);
 await json(join(trial,'lock.json'),{});
 const refreshed=await collectJob(job,join(root,'packages'),{validator:async()=>{}});assert.equal(refreshed[0].package,results[0].package);
 const refreshedManifest=await readFile(join(updated[0].package,'manifest.json'),'utf8');assert.notEqual(JSON.parse(refreshedManifest).harbor.trial_result_sha256,manifest.harbor.trial_result_sha256);
 assert.deepEqual(await readdir(join(root,'packages')),['trial']);
 await json(join(trial,'result.json'),{...changed,id:'different-trial'});
 const collision=await collectJob(job,join(root,'packages'));assert.match(collision[0].error,/different trial/);assert.equal(await readFile(join(updated[0].package,'manifest.json'),'utf8'),refreshedManifest);
});
test('runtime Skill excludes case metadata and dependency environments',async t=>{
 const root=await mkdtemp(join(tmpdir(),'restore-skill-'));t.after(()=>rm(root,{recursive:true,force:true}));
 assert.match(await runtimeSkill(join(root,'skill')),/^[a-f0-9]{64}$/);
 assert.deepEqual((await readdir(join(root,'skill','evals'))).sort(),['pipeline','restore.md']);
 assert.ok(!(await readdir(join(root,'skill'))).includes('.git'));
 assert.ok((await readdir(join(root,'skill','references'))).includes('harbor'));
});
test('manual case routing rejects drafts and conflicting URL input before launching',async()=>{
 await assert.rejects(()=>main(['--url','https://example.test','--case','POLA']),/Choose one input/);
 await assert.rejects(()=>main(['--case','POLA']),/requires a manually prepared ready fixture/);
});
