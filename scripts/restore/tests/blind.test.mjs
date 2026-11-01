import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
const mod=await import('../blind.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('blind payload contains media bytes without paths, hashes, version identities or old verdicts',async t=>{
 assert.equal(typeof mod.blindRequest,'function');const root=await mkdtemp(join(tmpdir(),'blind-'));t.after(()=>rm(root,{recursive:true,force:true}));
 async function media(id,content){const uri=id+'.png';await writeFile(join(root,uri),content);return {id,uri,kind:'screenshot',sha256:createHash('sha256').update(content).digest('hex')};}
 const reference=[await media('reference-frame','reference')],before=[await media('best-v0-before','old')],after=[await media('candidate-v1-after','new')];
 const request=await mod.blindRequest(root,{reference,before,after,order:['candidate','best'],task:{states:[{id:'ready',viewport:{width:800,height:600}}],expected:[{criterion_id:'C2',expected:'Texture matches'}]}});
 const text=JSON.stringify(request);for(const forbidden of ['best-v0','candidate-v1','sha256','uri','order','before','after','best_evidence','candidate_evidence','binding','run_dir'])assert.ok(!text.includes(forbidden),forbidden);
 assert.equal(Buffer.from(request.A[0].data_base64,'base64').toString(),'new');assert.equal(Buffer.from(request.B[0].data_base64,'base64').toString(),'old');
 assert.equal(request.schema_version,'BlindPairwiseRequest/v1');assert.ok(request.request_id);assert.equal(request.reference[0].mime_type,'image/png');
 assert.equal(request.task.scope,'visual_only');
});
test('blind media is bounded and refuses hash drift or unavailable sequences',async t=>{
 assert.equal(typeof mod.blindRequest,'function');const root=await mkdtemp(join(tmpdir(),'blind-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'frame.png'),'small');
 const item={id:'r',uri:'frame.png',kind:'screenshot',sha256:'0'.repeat(64)};await assert.rejects(()=>mod.blindRequest(root,{reference:[item],before:[item],after:[item],order:['best','candidate'],task:{}}),/hash/i);
 const h=createHash('sha256').update('small').digest('hex');item.sha256=h;await assert.rejects(()=>mod.blindRequest(root,{reference:[item],before:[item],after:[item],order:['best','candidate'],task:{}},{max_total_bytes:4}),/limit|budget/i);
});
test('sequence frame IDs are scoped per side and cannot alias a different version',async t=>{
 const root=await mkdtemp(join(tmpdir(),'blind-scope-'));t.after(()=>rm(root,{recursive:true,force:true}));
 async function side(prefix){const frame={id:'same-id',uri:prefix+'.png',kind:'screenshot',sha256:createHash('sha256').update(prefix).digest('hex')};await writeFile(join(root,frame.uri),prefix);const sequence=JSON.stringify({frames:[{id:'same-id',at:100}]});await writeFile(join(root,prefix+'.json'),sequence);return [frame,{id:'sequence',kind:'sequence',uri:prefix+'.json',sha256:createHash('sha256').update(sequence).digest('hex')}];}
 const reference=await side('r'),before=await side('old'),after=await side('new');const request=await mod.blindRequest(root,{reference,before,after,order:['best','candidate'],task:{}});
 assert.equal(Buffer.from(request.A[1].frames[0].media.data_base64,'base64').toString(),'old');assert.equal(Buffer.from(request.reference[1].frames[0].media.data_base64,'base64').toString(),'r');
});
test('local visual comparison declares a frozen obligation scope instead of silently truncating unrelated media',()=>{
 assert.equal(typeof mod.focusVisualEvidence,'function');const items=[{id:'ready',state_id:'ready',kind:'screenshot'},{id:'move',state_id:'play',kind:'screenshot'},{id:'seq',state_id:'play',kind:'sequence'},{id:'log',state_id:'ready',kind:'checks'}];
 assert.deepEqual(mod.focusVisualEvidence(items,{state_id:'ready',criterion_id:'C2'}).map(e=>e.id),['ready']);assert.deepEqual(mod.focusVisualEvidence(items,{state_id:'play',criterion_id:'C3'}).map(e=>e.id),['move','seq']);
});
