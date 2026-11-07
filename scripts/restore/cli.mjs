#!/usr/bin/env node
// Low-level Restore domain tools. Harbor owns task, trial, loop, stop and regrade.
import {lstat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as core from './core.mjs';
import {compare} from './pairwise.mjs';
import {report} from './report.mjs';

const [command,directory,...args]=process.argv.slice(2),root=directory&&resolve(directory);
const usage=`Restore low-level tools (Harbor-native)\ncontract-validate RUN\nartifact-hash PATH\nartifact-diff RUN BEFORE_SNAPSHOT_SHA AFTER_SNAPSHOT_SHA [output.json]\nassessment-input RUN [output.json]\npairwise-verify RUN candidate-assessment.json pairwise-adapter.mjs\nfinal-eval-input RUN [output.json]\nreport RUN\n\nCapture, archive audit and scratch audit retain their dedicated scripts. Full loop lifecycle commands were removed; use Harbor multi-step tasks.`;
const input=async path=>JSON.parse(await readFile(resolve(path),'utf8'));
const save=async(value,path)=>{if(path)await core.writeJSON(resolve(path),value);return value;};

try{
  if(!command||command==='--help')console.log(usage);
  else if(command==='artifact-hash'){
    core.assert(root,'Path required');const stat=await lstat(root);console.log(JSON.stringify({path:root,sha256:stat.isDirectory()?await core.treeHash(root):core.sha(await readFile(root)),hash_basis:stat.isDirectory()?'tree':'bytes'},null,2));
  }else{
    core.assert(root,'Run directory required');let result;
    if(command==='contract-validate'){const contract=await input(join(root,'contract.json'));await core.validateContract(root,contract);result={status:'valid',schema_version:contract.schema_version,contract_sha256:core.digest(contract)};}
    else if(command==='artifact-diff'){core.assert(args[0]&&args[1],'Before and after snapshot hashes required');result=await save(await core.artifactDiff(root,args[0],args[1]),args[2]);}
    else if(command==='assessment-input'){const run=await input(join(root,'run.json'));result=await save(await core.assessmentInput(root,run),args[0]);}
    else if(command==='pairwise-verify'){core.assert(args[0]&&args[1],'Candidate assessment and pairwise adapter required');result=await core.locked(root,command,run=>compare(root,run,resolve(args[0]),resolve(args[1])));}
    else if(command==='final-eval-input'){const run=await input(join(root,'run.json'));result=await save(await core.finalInput(root,run),args[0]);}
    else if(command==='report'){const run=await input(join(root,'run.json'));result=await report(root,run);}
    else throw new Error(usage);
    console.log(JSON.stringify(result,null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
