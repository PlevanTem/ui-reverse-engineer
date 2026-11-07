// Domain artifact sealing only. Harbor remains the lifecycle owner.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {validateContract,generationInput,digest} from './core.mjs';
import {validateTaskDescription,taskDescriptionMarkdown} from './task-description.mjs';
const [root]=process.argv.slice(2);if(!root)throw Error('Usage: node seal-prepare.mjs RUN_DIR');
const contract=JSON.parse(await readFile(join(root,'contract.json'),'utf8'));
await validateContract(root,contract);validateTaskDescription(contract,{required:true});
const contractHash=digest(contract),lock={schema_version:'RestoreContractLock/v1',contract_sha256:contractHash};
try{await writeFile(join(root,'contract-lock.json'),JSON.stringify(lock,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const prior=JSON.parse(await readFile(join(root,'contract-lock.json'),'utf8'));if(prior.contract_sha256!==contractHash)throw Error('Frozen contract changed');}
const input=await generationInput(root,{run_id:`contract:${contractHash}`,contract_sha256:contractHash});
await writeFile(join(root,'generation-input.json'),JSON.stringify(input,null,2)+'\n');
await writeFile(join(root,'design_brief.md'),`# Restore brief\n\n${taskDescriptionMarkdown(contract)}参考：${contract.requested_url}\n\n范围、状态、验收与资源见 [contract.json](contract.json)。此 brief 由冻结合同投影。\n`);
await mkdir(join(root,'evaluations'),{recursive:true});
await writeFile(join(root,'evaluations/prepare.json'),JSON.stringify({schema_version:'RestoreStepEvaluation/v1',step:'prepare',status:'complete',continue_gate:1,stop_reason:null,limitations:contract.unknowns??[]},null,2)+'\n');
console.log(JSON.stringify({status:'sealed',contract_sha256:contractHash,states:contract.states.length,task:contract.task_description.title}));
