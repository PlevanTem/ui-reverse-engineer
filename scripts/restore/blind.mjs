import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {extname} from 'node:path';
import {safeFile} from './core.mjs';

// Deliberately return only media content and frozen target instructions. Version
// mapping, provenance, paths, hashes, scores and earlier verdicts stay controller-side.
export async function blindRequest(root,{reference,before,after,order,task},{max_total_bytes=24*1024*1024,max_media=100}={}){
 if(!Array.isArray(order)||order.length!==2||new Set(order).size!==2||!order.every(x=>['best','candidate'].includes(x)))throw Error('Two distinct internal sides required');
 const states=task.states??[],aliases=new Map(states.map((s,i)=>[s.id,`state-${i+1}`]));let bytes=0,media=0;
 async function checked(e){const b=await readFile(await safeFile(root,e.uri));if(createHash('sha256').update(b).digest('hex')!==e.sha256)throw Error('Blind evidence hash mismatch');return b;}
 async function inline(e){const b=await checked(e);bytes+=b.length;if(bytes>max_total_bytes||++media>max_media)throw Error('Blind media budget limit exceeded; select a smaller declared evidence scope');const ext=extname(e.uri).toLowerCase();const mime=e.kind==='video'?(ext==='.mp4'?'video/mp4':'video/webm'):(ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':'image/png');return {mime_type:mime,data_base64:b.toString('base64'),...(aliases.has(e.state_id)?{state:aliases.get(e.state_id)}:{})};}
 async function pack(items){const known=new Map(items.map(e=>[e.id,e])),out=[];for(const e of items){if(['screenshot','video'].includes(e.kind))out.push(await inline(e));else if(e.kind==='sequence'){const data=JSON.parse((await checked(e)).toString('utf8')),frames=data.frames??[];if(!frames.length)throw Error('Blind sequence has no captured frames');const t0=frames[0].at;const sequence=[];let excluded=0;for(const [index,f] of frames.entries()){const evidence=known.get(f.id);if(!evidence||evidence.kind!=='screenshot')throw Error('Blind sequence frame lacks hash-bound evidence');if(index)excluded+=f.clock_isolation?.excluded_wall_ms??0;sequence.push({offset_ms:Number.isFinite(f.at)&&Number.isFinite(t0)?Math.max(0,f.at-t0-excluded):null,...(f.timing?{sample_timing:{scheduled_ms:f.timing.scheduled_ms,actual_offset_ms:f.timing.actual_offset_ms}}:{}),media:await inline(evidence)});}out.push({kind:'sequence',frames:sequence});}}
  if(!out.length)throw Error('Blind comparison requires actual visual media on every side');return out;
 }
 const ref=await pack(reference),sides={best:before,candidate:after},A=await pack(sides[order[0]]),B=await pack(sides[order[1]]);
 return {schema_version:'BlindPairwiseRequest/v1',request_id:randomUUID(),task:{scope:'visual_only',states:states.map((s,i)=>({state:`state-${i+1}`,viewport:s.viewport})),expected:(task.expected??[]).map(x=>({criterion_id:x.criterion_id,expected:x.expected,importance:x.importance}))},reference:ref,A,B,expected_output:'BlindPairwiseVerdict/v1',choices:['A','B','same','uncertain']};
}

export function focusVisualEvidence(items,{state_id,criterion_id,allow_unscoped=false}){
 const kinds=criterion_id==='C3'?['screenshot','sequence','video']:['screenshot'];
 return items.filter(e=>(e.state_id===state_id||(allow_unscoped&&!e.state_id))&&kinds.includes(e.kind));
}
