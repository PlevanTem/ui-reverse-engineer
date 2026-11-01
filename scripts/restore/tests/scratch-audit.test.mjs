import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditScratch } from '../scratch-audit.mjs';

test('scratch inventory is read-only and reports observed references without declaring other files safe',async t=>{
  const root=await mkdtemp(join(tmpdir(),'restore-scratch-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'scratch','diagnostic'),{recursive:true});
  await writeFile(join(root,'scratch','diagnostic','referenced.png'),'sample');
  await writeFile(join(root,'scratch','free.png'),'other');
  await writeFile(join(root,'contract.json'),JSON.stringify({evidence:'scratch/diagnostic/referenced.png',other:'scratch/free.png.backup',unrelated:'not-scratch/free.png',plus:'other+scratch/free.png'}));
  const result=await auditScratch(root);
  assert.equal(result.scratch_status,'present');assert.equal(result.complete,true);assert.equal(result.deletion_safe,false);
  assert.equal(result.files.length,2);
  assert.deepEqual(result.files.find(f=>f.path.endsWith('referenced.png')).sources,['contract.json']);
  assert.equal(result.files.find(f=>f.path.endsWith('referenced.png')).status,'observed');
  assert.equal(result.files.find(f=>f.path==='scratch/free.png').status,'unknown');
  assert.equal(await readFile(join(root,'scratch','free.png'),'utf8'),'other');
});

test('absent scratch directory is a valid empty inventory',async t=>{
  const root=await mkdtemp(join(tmpdir(),'restore-scratch-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const result=await auditScratch(root);assert.equal(result.scratch_status,'not_created');assert.equal(result.complete,true);assert.deepEqual(result.files,[]);assert.equal(result.deletion_safe,false);
});

test('skipped oversized text makes the reference scan incomplete',async t=>{
  const root=await mkdtemp(join(tmpdir(),'restore-scratch-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'scratch'));await writeFile(join(root,'scratch','image.png'),'image');
  await writeFile(join(root,'large.json'),Buffer.alloc(16*1024*1024+1));
  const result=await auditScratch(root);
  assert.equal(result.complete,false);assert.equal(result.files[0].status,'unknown');
  assert.ok(result.reference_scan_errors.some(e=>e.path==='large.json'&&e.code==='TEXT_TOO_LARGE'));
});
