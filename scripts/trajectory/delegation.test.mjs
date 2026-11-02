import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {writeDelegationSpec,loadDelegationSpecs} from './delegation.mjs';
test('public task specifications are immutable, hash-bound and cannot be backdated by input',async()=>{const dir=await mkdtemp(join(tmpdir(),'delegation-test-'));try{const r=await writeDelegationSpec(dir,{task_name:'review',prompt:'Only read the frozen reference images.',created_at:'2000-01-01T00:00:00Z'});const items=await loadDelegationSpecs(dir);assert.equal(items.length,1);assert.equal(items[0].id,r.id);assert.notEqual(items[0].created_at,'2000-01-01T00:00:00Z');assert.ok(r.handoff_message.includes(r.sha256));const p=join(dir,'delegation-specs',r.id+'.json'),s=JSON.parse(await readFile(p,'utf8'));s.prompt='tampered';await writeFile(p,JSON.stringify(s));await assert.rejects(loadDelegationSpecs(dir),/changed/);}finally{const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('delegation-test-'));await rm(target,{recursive:true,force:true});}});
test('protected body tokens and credentials are rejected as public task prompts',async()=>{for(const prompt of ['gAAAAA'+'x'.repeat(100),'LANGFUSE_SECRET_KEY=sk-lf-test-123456789'])await assert.rejects(writeDelegationSpec('unused',{task_name:'review',prompt}),/protected|credential/);});
