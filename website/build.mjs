import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
// Reuse the repository's existing YAML parser; no additional dependency tree.
const require = createRequire(new URL('../evals/case-manager/package.json', import.meta.url));
const { parse } = require('yaml');
const raw = await readFile(new URL('evals/cases.yaml', root), 'utf8');
const source = parse(raw);
if (source.schema_version !== '1.2' || !Array.isArray(source.cases)) throw new Error('Unsupported case dataset');
const ids = new Set();
for (const c of source.cases) {
  if (ids.has(c.id) || !['draft','ready','retired'].includes(c.status)) throw new Error(`Invalid case: ${c.id}`);
  ids.add(c.id);
  if(c.url && !/^https?:\/\//.test(c.url)) throw new Error(`Unsafe URL: ${c.id}`);
}
const fields = ['id','title','ui_type_id','task_type_id','description','keywords','url','technology_stack','technology_stack_evidence','difficulty','input_kinds','status','notes','updated_at'];
// Publish only the explicitly reviewed cover frames, never runnable outputs or reports.
const hasFirewoodPreview = true;
const mosbyPreviewSource = new URL('assets/mosby-files-preview.png', import.meta.url);
const mosbyPreviewTarget = new URL('dist/assets/mosby-files-preview.png', import.meta.url);
const mosbyPreview = await readFile(mosbyPreviewSource);
if (createHash('sha256').update(mosbyPreview).digest('hex') !== '6b326f79dcddaf6a40e484e535100542775fc60ba1b85e93daa881a6a47ac0fe') throw new Error('Mosby preview evidence does not match the recorded image');
const previewSource = new URL('assets/firewood-preview.png', import.meta.url);
const previewTarget = new URL('dist/firewood-local-preview.png', import.meta.url);
const preview = await readFile(previewSource);
if (createHash('sha256').update(preview).digest('hex') !== '49149e805a76a8f5a46f386ad344a9f3a16547756bb64ca6735492feef88de0e') throw new Error('Firewood preview evidence does not match the recorded image');
const data = {schema_version:source.schema_version,source:'evals/cases.yaml',source_sha256:createHash('sha256').update(raw).digest('hex'),local_firewood_preview:hasFirewoodPreview,ui_types:source.ui_types,task_types:source.task_types,cases:source.cases.map(c=>Object.fromEntries(fields.filter(k=>k in c).map(k=>[k,c[k]])))};
await mkdir(new URL('dist/', import.meta.url), {recursive:true});
await mkdir(new URL('dist/assets/', import.meta.url), {recursive:true});
await copyFile(previewSource, previewTarget);
await copyFile(mosbyPreviewSource, mosbyPreviewTarget);
await writeFile(new URL('dist/cases-data.js', import.meta.url),`export default ${JSON.stringify(data,null,2)};\n`);
for(const name of ['index.html','cases.html','case.html','guide.html','design-system.html','tokens.css','styles.css','content.js','comparison.js','app.js']) await copyFile(new URL(name,import.meta.url),new URL(`dist/${name}`,import.meta.url));
await copyFile(new URL('favicon.svg',import.meta.url),new URL('dist/favicon.svg',import.meta.url));
await copyFile(new URL('assets/general-intuition-cover.png',import.meta.url),new URL('dist/assets/general-intuition-cover.png',import.meta.url));
await copyFile(new URL('../DESIGN.md',import.meta.url),new URL('dist/DESIGN.md',import.meta.url));
console.log(`Built ${data.cases.length} reference cases; ${data.cases.filter(c=>c.status==='ready').length} ready. Output: ${fileURLToPath(new URL('dist/',import.meta.url))}`);
