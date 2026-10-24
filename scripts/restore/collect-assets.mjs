#!/usr/bin/env node
// Download only explicitly selected public assets observed in reference network capture.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { sha, readJSON, writeJSON, local, assert, budget, verifyEvidence } from './core.mjs';

const [directory,captureFile,selectionFile]=process.argv.slice(2);
try {
  assert(directory&&captureFile&&selectionFile,'Usage: node scripts/restore/collect-assets.mjs RUN reference-capture.json selection.json');
  const root=resolve(directory),run=await readJSON(join(root,'run.json'));
  const capture=await readJSON(resolve(captureFile)),selected=await readJSON(resolve(selectionFile));
  assert(Array.isArray(selected),'Selection must be a JSON array');
  let observed;
  if(capture.side==='reference'&&Array.isArray(capture.states)) {
    const records=[...capture.states];
    for(const failure of capture.failures??[]) if(failure.diagnostic_uri) {
      const evidence=capture.evidence?.find(e=>e.uri===failure.diagnostic_uri);
      assert(evidence,'Failed-state resource discovery needs diagnostic evidence');await verifyEvidence(root,[evidence]);
      records.push(await readJSON(local(root,failure.diagnostic_uri)));
    }
    observed=new Set(records.flatMap(s=>(s.resources??[]).filter(r=>r.status>=200&&r.status<300).map(r=>r.url)));
  }
  else {
    assert(/^https?:\/\//.test(capture.pageUrl??'')&&Array.isArray(capture.assets),'Use a reference capture or a browser pageAssets inventory');
    observed=new Set(capture.assets.filter(a=>a.sources?.some(s=>['resource','attribute','computedStyle'].includes(s.kind))).map(a=>a.url));
  }
  assert(selected.every(x=>observed.has(x.url)&&typeof x.region==='string'&&x.region&&typeof x.role==='string'&&x.role),'Each selected asset needs an observed URL, target region, and visual role');
  await mkdir(local(root,'assets-cached'),{recursive:true});
  const output=[];let cursor=0;
  async function worker() {
    while(cursor<selected.length) {
      const item=selected[cursor++];
      try {
        const maxBytes=item.max_bytes??20*1024*1024;
        assert(Number.isInteger(maxBytes)&&maxBytes>0&&maxBytes<=200*1024*1024,'Selected max_bytes must be 1 byte–200 MiB');
        const remaining=Math.min(10000,budget(run).remaining_ms);assert(remaining>0,'Run budget exhausted');
        const response=await fetch(item.url,{signal:AbortSignal.timeout(remaining),redirect:'follow',credentials:'omit'});
        assert(response.ok,`HTTP ${response.status}`);
        const size=Number(response.headers.get('content-length')||0);assert(!size||size<=maxBytes,'Asset exceeds selected max_bytes');
        const chunks=[];let total=0;
        for await(const chunk of response.body) {total+=chunk.length;assert(total<=maxBytes,'Asset exceeds selected max_bytes');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks),hash=sha(bytes),ext=extname(new URL(response.url).pathname).toLowerCase();
        const uri=`assets-cached/${hash}${/^\.[a-z0-9]{1,8}$/.test(ext)?ext:''}`;
        await writeFile(local(root,uri),bytes,{flag:'wx'}).catch(async error=>{if(error.code!=='EEXIST')throw error;assert(sha(await readFile(local(root,uri)))===hash,'Cached asset hash mismatch');});
        output.push({...item,status:'available',uri,sha256:hash,content_type:response.headers.get('content-type'),bytes:total});
      } catch(error){output.push({...item,status:'unavailable',reason:error.message});}
    }
  }
  await Promise.all(Array.from({length:Math.min(4,selected.length)},worker));
  const manifest=local(root,'asset-map.json');await writeJSON(manifest,{schema_version:'RestoreAssetMap/v0.2',source_capture:resolve(captureFile),items:output});
  console.log(JSON.stringify({manifest,available:output.filter(x=>x.status==='available').length,unavailable:output.filter(x=>x.status==='unavailable').length}));
} catch(error){console.error(error.message);process.exitCode=1;}
