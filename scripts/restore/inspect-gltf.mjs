import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, sha, writeJSON } from './core.mjs';

// Inspect only the selected asset. Never crawl or fetch dependency URLs.
export function inspectGltf(bytes,sourceUrl=null) {
  let json;
  if(bytes.length>=4&&bytes.toString('ascii',0,4)==='glTF') {
    assert(bytes.length>=20&&bytes.readUInt32LE(4)===2,'Expected a GLB v2 header');
    assert(bytes.readUInt32LE(8)===bytes.length,'GLB declared length differs from file');
    let offset=12;
    while(offset<bytes.length) {
      assert(offset+8<=bytes.length,'Truncated GLB chunk header');
      const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
      assert(length%4===0&&offset+length<=bytes.length,'Invalid GLB chunk length');
      if(type===0x4e4f534a){assert(!json,'Duplicate GLB JSON chunk');json=JSON.parse(bytes.toString('utf8',offset,offset+length).trim());}
      offset+=length;
    }
    assert(json,'GLB JSON chunk missing');
  } else json=JSON.parse(bytes.toString('utf8'));
  assert(String(json.asset?.version)==='2.0','Expected glTF 2.0');
  const dependencies=[...(json.buffers??[]).map(x=>({kind:'buffer',uri:x.uri})),...(json.images??[]).map(x=>({kind:'image',uri:x.uri}))]
    .filter(x=>typeof x.uri==='string'&&!x.uri.startsWith('data:'))
    .map(x=>({...x,url:sourceUrl?new URL(x.uri,sourceUrl).href:null}));
  const extensions=[...new Set([...(json.extensionsUsed??[]),...(json.extensionsRequired??[])])];
  return {schema_version:'GltfInspection/v1',sha256:sha(bytes),bytes:bytes.length,
    source_url:sourceUrl,asset:json.asset,extensions_used:json.extensionsUsed??[],extensions_required:json.extensionsRequired??[],
    counts:Object.fromEntries(['scenes','nodes','meshes','materials','textures','images','skins','cameras'].map(k=>[k,json[k]?.length??0])),
    animation_clips:(json.animations??[]).map((a,i)=>({index:i,name:a.name??null,
      targets:[...new Set(a.channels?.map(c=>c.target?.path)??[])],
      time_ranges:(a.samplers??[]).map(s=>({min:json.accessors?.[s.input]?.min??null,max:json.accessors?.[s.input]?.max??null}))})),
    decoder_dependencies:extensions.filter(x=>['KHR_draco_mesh_compression','KHR_texture_basisu','EXT_meshopt_compression'].includes(x)),
    external_dependencies:dependencies,
    limitations:['Asset inspection does not prove visible scene usage, camera settings, gameplay rules, or animation triggering. Confirm these against browser states.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [input,output,sourceUrl]=process.argv.slice(2);
    assert(input&&output,'Usage: node scripts/restore/inspect-gltf.mjs MODEL output.json [observed-source-url]');
    const result=inspectGltf(await readFile(resolve(input)),sourceUrl);
    await writeJSON(resolve(output),result);console.log(JSON.stringify({output:resolve(output),counts:result.counts,clips:result.animation_clips.length,decoders:result.decoder_dependencies}));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
