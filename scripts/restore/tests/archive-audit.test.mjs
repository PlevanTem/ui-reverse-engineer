import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { auditArchive } from '../archive-audit.mjs';

test('read-only archive audit verifies content and reports duplicate paths without deletion advice',async t=>{
  const root=await mkdtemp(join(tmpdir(),'restore-audit-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const bytes=Buffer.from('duplicate evidence'), hash=createHash('sha256').update(bytes).digest('hex');
  const folder=join(root,'observations','evidence-archive',hash);await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'first.txt'),bytes);await writeFile(join(folder,'second.txt'),bytes);
  const bad=join(root,'observations','evidence-archive','a'.repeat(64));await mkdir(bad,{recursive:true});await writeFile(join(bad,'bad.txt'),'wrong');
  await writeFile(join(root,'run.json'),JSON.stringify({uri:`observations/evidence-archive/${hash}/first.txt`,unrelated:`not-observations/evidence-archive/${hash}/second.txt`,plus:`other+observations/evidence-archive/${hash}/second.txt`}));
  const result=await auditArchive(root);
  assert.equal(result.complete,true);assert.equal(result.duplicates.length,1);assert.equal(result.duplicates[0].paths.length,2);
  assert.equal(result.duplicates[0].duplicate_logical_bytes,bytes.length);assert.equal(result.hash_mismatches.length,1);
  const refs=result.duplicates[0].references;assert.equal(refs.find(r=>r.path.endsWith('first.txt')).status,'observed');
  assert.equal(refs.find(r=>r.path.endsWith('second.txt')).status,'unknown');assert.ok(refs.find(r=>r.path.endsWith('first.txt')).sources.includes('run.json'));
  assert.equal(result.deletion_safe,false);assert.equal(result.scope,'run evidence archive only');
});
test('missing archive is incomplete, never interpreted as an empty safe inventory',async t=>{
  const root=await mkdtemp(join(tmpdir(),'restore-audit-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const result=await auditArchive(root);assert.equal(result.complete,false);assert.equal(result.deletion_safe,false);assert.ok(result.errors.length);
});
