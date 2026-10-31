#!/usr/bin/env node
import { readdir, lstat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pathBoundary, scanRunText } from './archive-audit.mjs';

function containsPath(content,path) {
  let index=-1;
  while((index=content.indexOf(path,index+1))!==-1) {
    if(pathBoundary(content,index,path.length))return true;
  }
  return false;
}

// A read-only inventory, not a reference closure or deletion decision.
export async function auditScratch(runRoot) {
  const root=resolve(runRoot), scratch=join(root,'scratch'),errors=[],reference_scan_errors=[],files=[];
  const label=p=>relative(root,p).replaceAll('\\','/');
  const limitations=['Literal references in selected text files inside this run only; other runs, dynamic references, unreadable and large files are not covered. Unknown never means unreferenced.'];
  let stat;
  try { stat=await lstat(scratch); }
  catch(error) {
    if(error.code==='ENOENT') {
      try { if(!(await lstat(root)).isDirectory())throw new Error('Not a directory'); }
      catch(e) { return {scratch_status:'unknown',complete:false,deletion_safe:false,limitations,files,errors:[{path:'.',code:e.code??'NOT_DIRECTORY'}],reference_scan_errors}; }
      return {scratch_status:'not_created',complete:true,deletion_safe:false,limitations,files,errors,reference_scan_errors};
    }
    return {scratch_status:'unknown',complete:false,deletion_safe:false,limitations,files,errors:[{path:'scratch',code:error.code??'ERROR'}],reference_scan_errors};
  }
  if(stat.isSymbolicLink()||!stat.isDirectory())return {scratch_status:'unknown',complete:false,deletion_safe:false,limitations,files,errors:[{path:'scratch',code:'UNSUPPORTED_ENTRY'}],reference_scan_errors};
  async function inventory(dir) {
    let entries;try { entries=await readdir(dir,{withFileTypes:true}); }catch(e) { errors.push({path:label(dir),code:e.code??'ERROR'});return; }
    for(const entry of entries) {
      const path=join(dir,entry.name);
      if(entry.isSymbolicLink()) { errors.push({path:label(path),code:'SYMLINK_SKIPPED'});continue; }
      if(entry.isDirectory()) { await inventory(path);continue; }
      if(!entry.isFile()) { errors.push({path:label(path),code:'UNSUPPORTED_ENTRY'});continue; }
      try { const info=await lstat(path);files.push({path:label(path),bytes:info.size,status:'unknown',sources:[]}); }
      catch(e) { errors.push({path:label(path),code:e.code??'ERROR'}); }
    }
  }
  await inventory(scratch);if(files.length)reference_scan_errors.push(...await scanRunText(root,{exclude:scratch,onText:(content,source)=>{
    for(const file of files)if(containsPath(content,file.path)) { file.status='observed';file.sources.push(source); }
  }}));
  files.sort((a,b)=>a.path.localeCompare(b.path));for(const file of files)file.sources.sort();
  return {scratch_status:'present',complete:errors.length===0&&reference_scan_errors.length===0,deletion_safe:false,limitations,files,errors,reference_scan_errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.length!==3) { process.stderr.write('Usage: node scripts/restore/scratch-audit.mjs RUN\n');process.exitCode=2; }
  else { const result=await auditScratch(process.argv[2]);process.stdout.write(JSON.stringify(result,null,2)+'\n');if(!result.complete)process.exitCode=1; }
}
