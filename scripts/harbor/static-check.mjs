#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileCases,createTask,DEFAULT_IMAGE} from './task-builder.mjs';
import {sha} from '../restore/core.mjs';
const exec=promisify(execFile),workspace=fileURLToPath(new URL('../../',import.meta.url));
process.env.PYTHONUTF8='1';
process.env.PYTHONIOENCODING='utf-8';
const windows=process.platform==='win32',bin=name=>join(workspace,'tools/harbor/.venv',windows?'Scripts':'bin',windows?name+'.exe':name);
const root=await mkdtemp(join(tmpdir(),'restore-harbor-static-'));
try{
  const task=join(root,'task');await createTask(task,{url:'https://example.test/',tier:'ordinary'});
  const lint=await exec(bin('harbor'),['lint',task,'--json','--extend-select','ALL'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});const findings=JSON.parse(lint.stdout);if(findings.length)throw new Error(`Harbor lint findings: ${JSON.stringify(findings)}`);
  const preflight=JSON.parse((await exec(bin('python'),[join(workspace,'tools/harbor/preflight_agent.py'),'codex'],{encoding:'utf8',windowsHide:true})).stdout);if(preflight.status!=='passed')throw new Error(`Codex Harbor agent preflight failed: ${JSON.stringify(preflight)}`);
  const casesPath=join(root,'cases.yaml'),fixtureRoot=join(root,'fixtures'),fixture=join(fixtureRoot,'UIR-SYNTHETIC'),evidence=Buffer.from('synthetic frozen reference');await mkdir(fixture,{recursive:true});await writeFile(join(fixture,'reference.png'),evidence);await writeFile(casesPath,'schema_version: "1.2"\ncases:\n  - id: UIR-SYNTHETIC\n    title: Synthetic\n    url: https://example.test/\n    difficulty: easy\n    status: ready\n');await writeFile(join(fixture,'manifest.json'),JSON.stringify({schema_version:'RestoreFixtureManifest/v1',case_id:'UIR-SYNTHETIC',url:'https://example.test/',tier:'ordinary',source_policy:{mode:'fixture_only',source_reuse:'forbidden'},environment:{docker_image:DEFAULT_IMAGE},viewports:[{width:1280,height:720}],states:[{id:'home'}],reference_evidence:[{id:'home',kind:'screenshot',uri:'reference.png',sha256:sha(evidence)}],resources:[{id:'reference-resource',uri:'reference.png',sha256:sha(evidence),host:null}]},null,2));
  const dataset=join(root,'dataset');await compileCases(dataset,{casesPath,fixturesRoot:fixtureRoot});await exec(bin('python'),[join(workspace,'tools/harbor/validate_dataset.py'),join(dataset,'dataset.toml')],{encoding:'utf8',windowsHide:true});const datasetLint=await exec(bin('harbor'),['lint',join(dataset,'tasks','uir-synthetic'),'--json','--extend-select','ALL'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});const datasetFindings=JSON.parse(datasetLint.stdout);if(datasetFindings.length)throw new Error(`Compiled dataset task lint findings: ${JSON.stringify(datasetFindings)}`);
  const atifFixtures=['single.json','continuation-1.json','continuation-2.json','subagent.json'].map(name=>join(workspace,'scripts/harbor/fixtures/atif',name));
  for(const fixture of atifFixtures)await exec(bin('python'),['-m','harbor.utils.trajectory_validator','--no-validate-images',fixture],{encoding:'utf8',windowsHide:true});
  const roundTrip=await exec(bin('python'),[join(workspace,'tools/harbor/validate_atif.py'),...atifFixtures],{encoding:'utf8',windowsHide:true});
  console.log(JSON.stringify({status:'passed',harbor:'0.25.0',agent_preflight:{agent:preflight.agent,atif:preflight.capabilities.atif,resume:preflight.capabilities.resume,skills:preflight.capabilities.skills},task_lint_findings:findings.length+datasetFindings.length,dataset_model_round_trip:'passed',atif:JSON.parse(roundTrip.stdout),runtime_acceptance:'not_run'},null,2));
}finally{await rm(root,{recursive:true,force:true});}
