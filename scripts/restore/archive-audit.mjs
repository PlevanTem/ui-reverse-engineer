#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, lstat, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function fileHash(path) {
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}
export function pathBoundary(content,index,length) {
  const before=content[index-1],after=content[index+length];
  const delimiter=/[\s"'`()[\]{},<>]/u;
  return (before===undefined||delimiter.test(before))&&(after===undefined||delimiter.test(after));
}

// Limited literal search for inventories; absence is never proof of no reference.
export async function scanRunText(root,{exclude,onText}) {
  const errors=[],label=path=>relative(root,path).replaceAll('\\','/');
  async function scan(dir) {
    let list;try { list=await readdir(dir,{withFileTypes:true}); }catch(error) { errors.push({path:label(dir),code:error.code??'ERROR'});return; }
    for(const entry of list) {
      const path=join(dir,entry.name);
      if(path===exclude||['node_modules','.git'].includes(entry.name))continue;
      if(entry.isSymbolicLink()) { errors.push({path:label(path),code:'SYMLINK_SKIPPED'});continue; }
      if(entry.isDirectory()) { await scan(path);continue; }
      if(!entry.isFile()||!['.json','.jsonl','.html','.md','.js','.mjs','.py','.yml','.yaml'].includes(extname(entry.name).toLowerCase()))continue;
      try {
        const stat=await lstat(path);if(stat.size>16*1024*1024) { errors.push({path:label(path),code:'TEXT_TOO_LARGE'});continue; }
        onText(await readFile(path,'utf8'),label(path));
      } catch(error) { errors.push({path:label(path),code:error.code??'ERROR'}); }
    }
  }
  await scan(root);return errors;
}

// An inventory of one archive, never a reference scan or deletion decision.
export async function auditArchive(runRoot) {
  const root=resolve(runRoot), archive=join(root,'observations','evidence-archive');
  const errors=[],hash_mismatches=[],groups=new Map();
  const label=path=>relative(root,path).replaceAll('\\','/');
  async function entries(path) {
    try { return await readdir(path,{withFileTypes:true}); }
    catch(error) { errors.push({path:label(path),code:error.code??'ERROR'});return []; }
  }
  for(const path of [join(root,'observations'),archive]) {
    try { const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isDirectory()) { errors.push({path:label(path),code:'UNSUPPORTED_ENTRY'});break; } }
    catch(error) { errors.push({path:label(path),code:error.code??'ERROR'});break; }
  }
  if(errors.length)return {scope:'run evidence archive only',complete:false,deletion_safe:false,limitations:['References and other runs are not scanned; duplicate logical bytes do not measure allocated disk space.'],duplicates:[],hash_mismatches,errors};
  for(const dir of await entries(archive)) {
    const folder=join(archive,dir.name);
    if(!dir.isDirectory()||dir.isSymbolicLink()||!/^[a-f0-9]{64}$/.test(dir.name)) { errors.push({path:label(folder),code:'UNSUPPORTED_ENTRY'});continue; }
    for(const entry of await entries(folder)) {
      const path=join(folder,entry.name);
      if(!entry.isFile()||entry.isSymbolicLink()) { errors.push({path:label(path),code:'UNSUPPORTED_ENTRY'});continue; }
      try {
        const stat=await lstat(path),actual=await fileHash(path);
        if(actual!==dir.name) { hash_mismatches.push({path:label(path),expected:dir.name,actual});continue; }
        const group=groups.get(actual)??[];group.push({path:label(path),bytes:stat.size});groups.set(actual,group);
      } catch(error) { errors.push({path:label(path),code:error.code??'ERROR'}); }
    }
  }
  const duplicates=[...groups.entries()].filter(([,files])=>files.length>1).map(([sha256,files])=>({sha256,paths:files.map(f=>f.path).sort(),duplicate_logical_bytes:files[0].bytes*(files.length-1)})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
  const candidates=new Set(duplicates.flatMap(group=>group.paths)),observed=new Map();
  const reference_scan_errors=candidates.size?await scanRunText(root,{exclude:archive,onText:(content,source)=>{
    for(const match of content.matchAll(/observations\/evidence-archive\/[a-f0-9]{64}\/[a-zA-Z0-9._-]+/g)) {
      if(pathBoundary(content,match.index,match[0].length)&&candidates.has(match[0])) { const sources=observed.get(match[0])??new Set();sources.add(source);observed.set(match[0],sources); }
    }
  }}):[];
  for(const group of duplicates)group.references=group.paths.map(path=>({path,status:observed.has(path)?'observed':'unknown',sources:[...(observed.get(path)??[])].sort()}));
  return {scope:'run evidence archive only',complete:errors.length===0,deletion_safe:false,limitations:['Reference scan is limited to literal archive URIs in selected text files inside this run; other runs, dynamic references and large or unreadable files are not covered. Unknown never means unreferenced. Duplicate logical bytes do not measure allocated disk space.'],duplicates,hash_mismatches,errors,reference_scan_errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.length!==3) { process.stderr.write('Usage: node scripts/restore/archive-audit.mjs RUN\n');process.exitCode=2; }
  else { const result=await auditArchive(process.argv[2]);process.stdout.write(JSON.stringify(result,null,2)+'\n');if(!result.complete||result.hash_mismatches.length)process.exitCode=1; }
}
