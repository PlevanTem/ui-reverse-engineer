import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function writeDelegationSpec(captureRoot,input){
 assert.ok(typeof input?.task_name==='string'&&/^[a-zA-Z0-9_/-]+$/.test(input.task_name),'Task name required');assert.ok(typeof input.prompt==='string'&&input.prompt.trim(),'Public prompt required');
 assert.ok(!/gAAAA[A-Za-z0-9_-]{60,}|\[protected-content-sha256:/.test(input.prompt),'A protected body cannot become a public task spec');assert.ok(!/\b(?:sk|pk)-lf-|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|Authorization\s*:\s*(?:Bearer|Basic)\s+\S+/i.test(input.prompt),'Public prompt contains a credential');
 const id=randomUUID(),directory=join(resolve(captureRoot),'delegation-specs'),file=join(directory,id+'.json'),created_at=new Date().toISOString(),hash=sha(input.prompt);await mkdir(directory,{recursive:true});
 const spec={schema_version:'PublicDelegationSpec/v1',id,task_name:input.task_name,prompt:input.prompt,prompt_sha256:hash,created_at,purpose:'initial_task',record_origin:'prepared_public_spec_not_proof_of_actual_delivery'};await writeFile(file,JSON.stringify(spec,null,2)+'\n',{flag:'wx'});
 return {id,file,sha256:hash,created_at,handoff_message:`Read the public task specification at ${file}. Verify prompt_sha256=${hash}. Follow its prompt and read only the resources it permits.`,recipient_context_proven:false};
}
export async function loadDelegationSpecs(captureRoot){const directory=join(resolve(captureRoot),'delegation-specs');let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return [];throw e;}const result=[];for(const name of names.filter(n=>n.endsWith('.json'))){const x=JSON.parse(await readFile(join(directory,name),'utf8'));assert.equal(x.schema_version,'PublicDelegationSpec/v1');assert.equal(sha(x.prompt),x.prompt_sha256,'Public delegation spec changed');result.push(x);}return result;}
