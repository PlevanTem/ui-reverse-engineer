#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { assert, readJSON, validateTokenUsage, writeJSON } from './core.mjs';

const [manifestPath, outputPath]=process.argv.slice(2);
assert(manifestPath&&outputPath,'Usage: node scripts/restore/extract-codex-usage.mjs manifest.json output.json');
const manifest=await readJSON(resolve(manifestPath));
assert(manifest.schema_version==='CodexUsageExtraction/v0.2'&&Array.isArray(manifest.sources)&&manifest.sources.length,'Invalid usage extraction manifest');
const records=[], globallySeen=new Set();
for(const source of manifest.sources){
  const start=Date.parse(source.start_at),end=Date.parse(source.end_at);
  assert(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&source.file&&source.id&&source.agent&&source.stage&&source.source_ref,'Invalid usage source');
  const usage={input_tokens:0,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:0,reasoning_output_tokens:0,total_tokens:0};
  const seen=new Set(), roots=new Set();let first=null,last=null;
  for await(const line of createInterface({input:createReadStream(resolve(source.file),{encoding:'utf8'}),crlfDelay:Infinity})){
    let event;try{event=JSON.parse(line);}catch{continue;}
    if(event.type!=='token_usage_record')continue;
    const at=Date.parse(event.timestamp),p=event.payload??{};
    if(at<start||at>end||!p.response_id||seen.has(p.response_id))continue;
    if(source.root_turn_ids?.length&&!source.root_turn_ids.includes(p.root_turn_id))continue;
    assert(!globallySeen.has(p.response_id),`Response counted twice: ${p.response_id}`);
    seen.add(p.response_id);globallySeen.add(p.response_id);roots.add(p.root_turn_id);first??=event.timestamp;last=event.timestamp;
    for(const key of Object.keys(usage))usage[key]+=p.usage?.[key]??0;
  }
  assert(seen.size,`No attributable usage records: ${source.id}`);
  records.push({id:source.id,stage:source.stage,agent:source.agent,source_type:'codex_session',source_ref:source.source_ref,root_turn_ids:[...roots],window:{start_at:first,end_at:last},response_count:seen.size,usage});
}
const result=validateTokenUsage({schema_version:'TokenUsage/v0.2',coverage:manifest.coverage,coverage_note:manifest.coverage_note,records});
await writeJSON(resolve(outputPath),result);
console.log(JSON.stringify({output:resolve(outputPath),records:records.length,observed_total_tokens:records.reduce((sum,r)=>sum+r.usage.total_tokens,0)},null,2));
