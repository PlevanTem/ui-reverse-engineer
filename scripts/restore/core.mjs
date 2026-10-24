import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, lstat, cp, open, unlink } from 'node:fs/promises';
import { resolve, relative, sep, join, isAbsolute, dirname } from 'node:path';
import { validateRedlineProfile, validateRedlineAssessments } from '../../evals/pipeline/redline-contract.mjs';
import { validateCaptureStep, validateCaptureReadiness } from './capture-actions.mjs';

export const VERSION = 'restore/v0.2';
export const TIERS = Object.freeze({ ordinary: { minutes:30, rounds:3, reserve:3 }, refined: { minutes:60, rounds:6, reserve:6 }, complex: { minutes:120, rounds:9, reserve:12 } });
export const criteria = ['C1','C2','C3'];
export const sha = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) { return JSON.stringify(value, (_,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v); }
export const digest = value => sha(canonical(value));
export const readJSON = async file => JSON.parse(await readFile(file,'utf8'));
export function assert(ok, message) { if (!ok) throw new Error(message); }
export const text = value => typeof value === 'string' && value.trim().length > 0;
export function local(root, path) {
  assert(text(path) && !isAbsolute(path) && !/^[a-z][a-z\d+.-]*:/i.test(path), 'Expected relative local path');
  const p = resolve(root,path), base = resolve(root);
  assert(p.startsWith(base+sep), `Path outside run: ${path}`); return p;
}
export async function safeFile(root,path) {
  const p=local(root,path); let current=resolve(root);
  for (const part of relative(root,p).split(sep)) { current=join(current,part); assert(!(await lstat(current)).isSymbolicLink(),'Symlinks are not supported in run artifacts'); }
  return p;
}
export async function writeJSON(file,data) {
  const temp=file+'.'+randomUUID()+'.tmp'; await writeFile(temp,JSON.stringify(data,null,2)+'\n'); await rename(temp,file);
}
export async function treeManifest(root) {
  const files=[];
  async function walk(dir) {
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (['node_modules','.git'].includes(entry.name)) continue;
      const path=join(dir,entry.name); assert(!entry.isSymbolicLink(),`Symlink in artifact: ${path}`);
      if(entry.isDirectory()) await walk(path); else if(entry.isFile()) files.push([relative(root,path).replaceAll('\\','/'),sha(await readFile(path))]);
    }
  }
  await walk(root); assert(files.length,'Artifact is empty'); return files;
}
export async function treeHash(root) { return digest(await treeManifest(root)); }
export async function artifactDiff(root,before,after) {
  const from=new Map(await treeManifest(local(root,`snapshots/${before}`))),to=new Map(await treeManifest(local(root,`snapshots/${after}`)));
  const added=[],removed=[],modified=[];
  for(const [path,hash] of to) if(!from.has(path)) added.push(path); else if(from.get(path)!==hash) modified.push(path);
  for(const path of from.keys()) if(!to.has(path)) removed.push(path);
  return {schema_version:'ArtifactDiff/v1',from_artifact_sha256:before,to_artifact_sha256:after,files:{added,modified,removed,unchanged_count:[...to.keys()].filter(path=>from.get(path)===to.get(path)).length}};
}
async function snapshot(root) {
  const source=local(root,'restored'), hash=await treeHash(source), target=local(root,`snapshots/${hash}`);
  try { await lstat(target); assert(await treeHash(target)===hash,'Snapshot was modified'); }
  catch(e) { if(e.code!=='ENOENT') throw e; await cp(source,target,{recursive:true,filter:p=>!relative(source,p).split(sep).some(x=>['node_modules','.git'].includes(x))}); }
  assert(await treeHash(target)===hash,'Artifact changed during snapshot'); return hash;
}
async function restore(root,hash) {
  assert(/^[a-f0-9]{64}$/.test(hash),'Invalid snapshot');
  const source=local(root,`snapshots/${hash}`); assert(await treeHash(source)===hash,'Snapshot was modified');
  const dest=local(root,'restored'), backup=local(root,`discarded/${randomUUID()}`);
  await rename(dest,backup); // Preserve rejected work; never recursively delete user files.
  try { await cp(source,dest,{recursive:true}); } catch(e) { await rename(backup,dest); throw e; }
}
export async function verifyEvidence(root,items,{artifact_sha256=null}={}) {
  assert(Array.isArray(items) && items.length>0,'Evidence is required');
  let artifactRoot=null;
  if(artifact_sha256) {
    assert(/^[a-f0-9]{64}$/.test(artifact_sha256),'Invalid evidence artifact binding');
    artifactRoot=local(root,`snapshots/${artifact_sha256}`);
    let actual;
    try { actual=await treeHash(artifactRoot); }
    catch(error) { if(error.code==='ENOENT')throw new Error(`Bound evidence snapshot missing: ${artifact_sha256}`); throw error; }
    assert(actual===artifact_sha256,`Bound evidence snapshot changed: ${artifact_sha256}`);
  }
  const ids=new Set();
  for(const e of items) {
    assert(text(e.id)&&!ids.has(e.id),'Evidence IDs must be unique'); ids.add(e.id);
    assert(['screenshot','sequence','video','checks','source'].includes(e.kind),'Invalid evidence kind');
    const normalized=e.uri.replaceAll('\\','/');
    const path=artifactRoot&&normalized.startsWith('restored/')?await safeFile(artifactRoot,normalized.slice('restored/'.length)):await safeFile(root,e.uri);
    assert(sha(await readFile(path))===e.sha256,`Evidence changed: ${e.id}`);
  }
  return ids;
}
export function references(ids,list,label) { assert(Array.isArray(list)&&list.length>0&&list.every(x=>ids.has(x)),`Missing/unknown evidence: ${label}`); }
function unique(items,key,label) { assert(Array.isArray(items)&&items.length>0,`${label} required`); assert(new Set(items.map(x=>x[key])).size===items.length,`Duplicate ${label}`); }
export async function validateContract(root,c) {
  assert(c.schema_version===VERSION,'Contract version must be restore/v0.2');
  assert(text(c.requested_url)&&text(c.observed_url)&&text(c.start_command),'URLs and start command required');
  assert(c.environment && ['browser','os','dpr','locale'].every(k=>c.environment[k]!=null),'Capture environment required');
  assert(c.e2e_profile?.rubric_version && c.e2e_profile?.scorer_version,'E2E versions must be frozen');
  assert(c.generation_policy&&['fixture_only','source_assisted'].includes(c.generation_policy.mode)&&c.generation_policy.case_metadata_visibility==='id_only'&&['forbidden','allowed'].includes(c.generation_policy.source_reuse),'Generation policy must isolate evaluation metadata');
  assert((c.generation_policy.mode==='source_assisted')===(c.generation_policy.source_reuse==='allowed'),'Generation mode/source reuse mismatch');
  const forbiddenCaseFields=['technology_stack','technology_stack_source','technology_stack_evidence','source_code_evidence','source_repository'];
  assert(forbiddenCaseFields.every(key=>!(key in c)),'Contract contains evaluation-only case metadata');
  if(c.case_source) {
    assert(text(c.case_source.case_id),'case_source.case_id required');
    assert(Object.keys(c.case_source).every(key=>['case_id','dataset_sha256'].includes(key)),'Contract contains evaluation-only case metadata');
    if(c.case_source.dataset_sha256!=null) assert(/^[a-f0-9]{64}$/.test(c.case_source.dataset_sha256),'Invalid case dataset hash');
  }
  unique(c.states,'id','states'); unique(c.obligations,'id','obligations'); unique(c.runtime_gates,'id','runtime gates');
  const evidence=await verifyEvidence(root,c.reference_evidence);
  assert(c.obligations.filter(o=>o.required&&o.applicability==='applicable').length>0,'At least one observable required visual obligation is needed');
  for(const s of c.states) {
    assert(text(s.id)&&text(s.page_id)&&text(s.viewport_id)&&text(s.path)&&Array.isArray(s.regions)&&s.regions.length,'State identity/regions missing');
    assert(s.viewport?.width>0&&s.viewport?.height>0&&text(s.ready_selector),'State viewport/readiness required');
    assert(Array.isArray(s.steps)&&typeof s.sentinel==='boolean','State steps/sentinel required');
    s.steps.forEach(validateCaptureStep);
    validateCaptureReadiness(s);
  }
  assert(c.states.some(s=>s.sentinel),'At least one sentinel state required');
  if(c.interactive_scene) {
    const scene=c.interactive_scene;
    assert(scene.schema_version==='InteractiveScene/v1','InteractiveScene/v1 required');
    unique(scene.transitions,'id','scene transitions');
    for(const t of scene.transitions) {
      assert(c.states.some(s=>s.id===t.state_id)&&['input','precondition','feedback','timing','terminal_state','repeat_reset'].every(k=>text(t[k])),'Scene transition fields/state missing');
    }
    assert(Array.isArray(scene.rendering),'Scene rendering observations required');
    for(const r of scene.rendering) assert(text(r.aspect)&&text(r.description),'Rendering observation missing');
    for(const item of [...scene.transitions,...scene.rendering]) {
      assert(['observed','inferred','unknown'].includes(item.status),'Explicit scene evidence status required');
      references(evidence,item.evidence,'interactive scene');
      if(c.generation_policy.mode==='fixture_only') assert(item.evidence.every(id=>c.reference_evidence.find(e=>e.id===id)?.kind!=='source'),'Fixture-only generation cannot consume source evidence');
    }
  }
  for(const o of c.obligations) {
    const s=c.states.find(x=>x.id===o.state_id);
    assert(s&&s.regions.includes(o.region_id)&&criteria.includes(o.criterion_id),`Invalid obligation: ${o.id}`);
    assert(text(o.id)&&text(o.expected)&&text(o.method)&&typeof o.required==='boolean'&&o.target===3,'Obligation QA/target required');
    assert(['blocking','obvious','minor'].includes(o.importance),'Obligation importance required');
    assert(['applicable','not_applicable','unknown'].includes(o.applicability),'Invalid applicability');
    if(o.applicability!=='applicable') assert(text(o.reason),'Applicability reason required');
    references(evidence,o.reference_evidence,o.id);
    if(o.applicability==='applicable') {
      const kinds=o.reference_evidence.map(id=>c.reference_evidence.find(e=>e.id===id).kind);
      assert(o.criterion_id==='C3'?kinds.some(k=>['sequence','video'].includes(k)):kinds.includes('screenshot'),
        `Observable ${o.criterion_id} reference requires ${o.criterion_id==='C3'?'sequence/video':'screenshot'} evidence: ${o.id}`);
    }
  }
  for(const id of criteria) assert(c.obligations.some(o=>o.criterion_id===id&&o.required),`Declare required ${id}, including explicit N/A`);
  for(const g of c.runtime_gates) assert(text(g.id)&&text(g.description),'Gate description required');
}
function validateRefreezeEvidencePaths(root,c) {
  assert(Array.isArray(c.reference_evidence),'Refreeze reference evidence is required');
  const allowedRoots=new Set(['evidence','reference-source']);
  for(const evidence of c.reference_evidence) {
    const normalized=relative(root,local(root,evidence.uri)).replaceAll('\\','/');
    const segments=normalized.split('/');
    assert(segments.every(segment=>segment&&!/[ .]$/.test(segment)&&!segment.includes(':')&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)),`Unsupported Windows-equivalent refreeze evidence path: ${evidence.uri}`);
    const topLevel=segments[0].toLowerCase();
    assert(allowedRoots.has(topLevel),`Refreeze evidence path conflicts with managed run content: ${evidence.uri}`);
  }
}
export async function init(root,url,tier='ordinary') {
  assert(TIERS[tier] && /^https?:\/\//.test(url),'Valid URL/tier required');
  await mkdir(root,{recursive:true}); const guard=await open(join(root,'run.json'),'wx'); await guard.close();
  for(const path of ['restored','snapshots','discarded','observations','evidence','docs']) await mkdir(local(root,path),{recursive:true});
  const run={schema_version:VERSION,run_id:randomUUID(),started_at:new Date().toISOString(),tier,phase:'prepare',rounds:[],static_checks:[],best:null,baseline:null,pending:null,stop:null,e2e:null,approval:null,enforcement:'cooperative',profile_changes:0};
  await writeJSON(join(root,'run.json'),run);
  await writeJSON(join(root,'contract.json'),{schema_version:VERSION,requested_url:url,observed_url:null,start_command:null,environment:{browser:null,os:null,dpr:1,locale:'en-US'},generation_policy:{mode:'fixture_only',case_metadata_visibility:'id_only',source_reuse:'forbidden'},e2e_profile:{rubric_version:'site-restore-v1.2-draft',scorer_version:'e2e/v0.4'},states:[],obligations:[],runtime_gates:[{id:'runnable',description:'主页面可加载、主体可见'},{id:'reachable',description:'关键视觉状态可到达'},{id:'unobstructed',description:'无严重遮挡或溢出'}],reference_evidence:[],resources:[],unknowns:[]});
  await writeFile(join(root,'events.jsonl'),JSON.stringify({at:run.started_at,type:'init',tier})+'\n'); return run;
}
function linkedBrief(contract,parentRunId,relationship='continuation') {
  const states=contract.states.map(state=>`- ${state.id}: ${state.path} · ${state.viewport.width}x${state.viewport.height}`).join('\n');
  const unknowns=(contract.unknowns??[]).map(item=>`- ${item}`).join('\n')||'- None recorded';
  const refreeze=relationship==='contract_refreeze';
  return `# Restore ${refreeze?'contract refreeze':'continuation'} brief\n\nParent run: ${parentRunId}\n\nReference: ${contract.requested_url}\n\nObserved page: ${contract.observed_url}\n\nDelivery: restored/; start: ${contract.start_command}\n\nGeneration policy: ${contract.generation_policy.mode}\n\n## ${refreeze?'Proposed':'Frozen'} states\n\n${states}\n\n## Unknowns\n\n${unknowns}\n\nThis writable ${refreeze?'refreeze':'continuation'} brief was projected from the ${refreeze?'explicit contract source':'frozen contract'}${refreeze?'': ' because the parent run had no design_brief.md'}. Update it during implementation; contract.json ${refreeze?'becomes authoritative only after freeze':'remains authoritative for frozen requirements'}.\n`;
}
export async function continueRun(parentRoot,newRoot,tier=null) {
  parentRoot=resolve(parentRoot);newRoot=resolve(newRoot);
  assert(parentRoot!==newRoot,'Continuation run must use a new directory');
  const parentRunPath=join(parentRoot,'run.json'),parentEventsPath=join(parentRoot,'events.jsonl');
  const parentRunBytes=await readFile(parentRunPath),parentEventsBytes=await readFile(parentEventsPath);
  const parentRun=JSON.parse(parentRunBytes.toString('utf8'));
  assert(parentRun.schema_version===VERSION&&parentRun.contract_sha256,'Parent run must have a frozen restore/v0.2 contract');
  assert(parentRun.best&&/^[a-f0-9]{64}$/.test(parentRun.best),'Parent run has no verified best artifact');
  const selectedTier=tier??parentRun.tier;assert(TIERS[selectedTier],'Invalid continuation tier');
  const parentContractBytes=await readFile(join(parentRoot,'contract.json'));
  const parentContract=JSON.parse(parentContractBytes.toString('utf8'));
  assert(digest(parentContract)===parentRun.contract_sha256,'Parent frozen contract changed');
  await validateContract(parentRoot,parentContract);
  const parentSnapshot=local(parentRoot,`snapshots/${parentRun.best}`);
  assert(await treeHash(parentSnapshot)===parentRun.best,'Parent best snapshot changed or is unavailable');
  const parentWorking=local(parentRoot,'restored'),workingHash=await treeHash(parentWorking);
  const inheritedSource=workingHash===parentRun.best?'best_snapshot':'working_tree_unverified';
  const inheritedArtifact=workingHash;
  const parentRelative=relative(newRoot,parentRoot).replaceAll('\\','/');
  assert(parentRelative&&!isAbsolute(parentRelative),'Continuation run must share a filesystem with its parent for relative lineage links');
  const parentBrief={href:`${parentRelative}/design_brief.md`};let parentBriefBytes=null;
  try { parentBriefBytes=await readFile(join(parentRoot,'design_brief.md'));parentBrief.sha256=sha(parentBriefBytes); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  try { await lstat(newRoot); throw new Error('Continuation directory already exists'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }

  await mkdir(dirname(newRoot),{recursive:true});await mkdir(newRoot);
  for(const path of ['restored','snapshots','discarded','observations','evidence','docs']) await mkdir(local(newRoot,path),{recursive:true});
  await writeFile(join(newRoot,'contract.json'),parentContractBytes);
  const copiedEvidence=new Set();
  for(const evidence of parentContract.reference_evidence) {
    if(copiedEvidence.has(evidence.uri))continue;copiedEvidence.add(evidence.uri);
    const source=await safeFile(parentRoot,evidence.uri),destination=local(newRoot,evidence.uri);
    assert(sha(await readFile(source))===evidence.sha256,`Evidence changed: ${evidence.id}`);
    await mkdir(dirname(destination),{recursive:true});await cp(source,destination);
  }
  const briefBytes=parentBriefBytes??Buffer.from(linkedBrief(parentContract,parentRun.run_id));
  await writeFile(join(newRoot,'design_brief.md'),briefBytes);
  const briefSource=parentBriefBytes?'parent_copy':'contract_projection';
  await cp(parentWorking,local(newRoot,'restored'),{recursive:true,force:true});
  await cp(parentWorking,local(newRoot,`snapshots/${inheritedArtifact}`),{recursive:true});
  assert(await treeHash(local(newRoot,'restored'))===inheritedArtifact,'Inherited artifact copy changed');

  const createdAt=new Date().toISOString(),runId=randomUUID();
  const report={href:`${parentRelative}/report.html`};
  try {
    const bytes=await readFile(join(parentRoot,'report.html'));
    report.sha256=sha(bytes);
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  const lineage={schema_version:'RestoreLineage/v1',relationship:'continuation',created_at:createdAt,child_run_id:runId,parent:{run_id:parentRun.run_id,started_at:parentRun.started_at,run_json_sha256:sha(parentRunBytes),events_jsonl_sha256:sha(parentEventsBytes),contract_sha256:parentRun.contract_sha256,best_artifact_sha256:parentRun.best,report,design_brief:parentBrief},inherited:{contract_sha256:parentRun.contract_sha256,reference_evidence_sha256:digest(parentContract.reference_evidence),artifact_sha256:inheritedArtifact,artifact_source:inheritedSource,generation_policy:parentContract.generation_policy,design_brief:{uri:'design_brief.md',source:briefSource,initial_sha256:sha(briefBytes)}}};
  const lineageHash=digest(lineage);await writeJSON(join(newRoot,'lineage.json'),lineage);
  const run={schema_version:VERSION,run_id:runId,started_at:createdAt,tier:selectedTier,phase:'baseline',rounds:[],static_checks:[],best:null,baseline:null,pending:null,stop:null,e2e:null,approval:null,enforcement:'cooperative',profile_changes:0,contract_sha256:parentRun.contract_sha256,lineage:{uri:'lineage.json',sha256:lineageHash,parent_run_id:parentRun.run_id,inherited_artifact_sha256:inheritedArtifact,artifact_source:inheritedSource}};
  await writeJSON(join(newRoot,'run.json'),run);
  await writeFile(join(newRoot,'events.jsonl'),JSON.stringify({at:createdAt,type:'continue',tier:selectedTier,parent_run_id:parentRun.run_id,parent_run_json_sha256:lineage.parent.run_json_sha256,parent_events_jsonl_sha256:lineage.parent.events_jsonl_sha256,contract_sha256:parentRun.contract_sha256,inherited_artifact_sha256:inheritedArtifact,artifact_source:inheritedSource,lineage_sha256:lineageHash})+'\n');
  return {run_id:runId,phase:run.phase,tier:selectedTier,lineage:run.lineage,next:'assessment-input then initial-record'};
}
export async function refreezeRun(parentRoot,newRoot,contractSource,tier=null) {
  parentRoot=resolve(parentRoot);newRoot=resolve(newRoot);contractSource=resolve(contractSource);
  assert(parentRoot!==newRoot,'Refreeze run must use a new directory');
  const parentRunPath=join(parentRoot,'run.json'),parentEventsPath=join(parentRoot,'events.jsonl');
  const parentRunBytes=await readFile(parentRunPath),parentEventsBytes=await readFile(parentEventsPath);
  const parentRun=JSON.parse(parentRunBytes.toString('utf8'));
  assert(parentRun.schema_version===VERSION&&parentRun.contract_sha256,'Parent run must have a frozen restore/v0.2 contract');
  assert(parentRun.best&&/^[a-f0-9]{64}$/.test(parentRun.best),'Parent run has no verified best artifact');
  const selectedTier=tier??parentRun.tier;assert(TIERS[selectedTier],'Invalid refreeze tier');
  const parentContract=await readJSON(join(parentRoot,'contract.json'));
  assert(digest(parentContract)===parentRun.contract_sha256,'Parent frozen contract changed');
  await validateContract(parentRoot,parentContract);
  const parentSnapshot=local(parentRoot,`snapshots/${parentRun.best}`);
  assert(await treeHash(parentSnapshot)===parentRun.best,'Parent best snapshot changed or is unavailable');

  const sourceStat=await lstat(contractSource);
  const sourceKind=sourceStat.isDirectory()?'directory':'json_file';
  assert(sourceStat.isDirectory()||sourceStat.isFile(),'Contract source must be a directory or JSON file');
  const sourceRoot=sourceStat.isDirectory()?contractSource:dirname(contractSource);
  const sourcePath=sourceStat.isDirectory()?join(contractSource,'contract.json'):contractSource;
  const sourceBytes=await readFile(sourcePath),sourceContract=JSON.parse(sourceBytes.toString('utf8'));
  validateRefreezeEvidencePaths(sourceRoot,sourceContract);
  await validateContract(sourceRoot,sourceContract);
  assert(digest(sourceContract)!==parentRun.contract_sha256,'Refreeze contract source must differ from the parent frozen contract');
  const parentRelative=relative(newRoot,parentRoot).replaceAll('\\','/');
  assert(parentRelative&&!isAbsolute(parentRelative),'Refreeze run must share a filesystem with its parent for relative lineage links');
  try { await lstat(newRoot); throw new Error('Refreeze directory already exists'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }

  await mkdir(dirname(newRoot),{recursive:true});await mkdir(newRoot);
  for(const path of ['restored','snapshots','discarded','observations','evidence','docs']) await mkdir(local(newRoot,path),{recursive:true});
  await writeFile(join(newRoot,'contract.json'),sourceBytes);
  const copiedEvidence=new Set();
  for(const evidence of sourceContract.reference_evidence) {
    if(copiedEvidence.has(evidence.uri))continue;copiedEvidence.add(evidence.uri);
    const source=await safeFile(sourceRoot,evidence.uri),destination=local(newRoot,evidence.uri);
    assert(sha(await readFile(source))===evidence.sha256,`Evidence changed: ${evidence.id}`);
    await mkdir(dirname(destination),{recursive:true});await cp(source,destination);
  }
  await validateContract(newRoot,sourceContract);
  const sourceArchiveUri='refreeze-contract-source.json';
  await writeFile(local(newRoot,sourceArchiveUri),sourceBytes);
  const sourceArchiveBytes=await readFile(local(newRoot,sourceArchiveUri));
  const briefBytes=Buffer.from(linkedBrief(sourceContract,parentRun.run_id,'contract_refreeze'));
  await writeFile(join(newRoot,'design_brief.md'),briefBytes);
  await cp(parentSnapshot,local(newRoot,'restored'),{recursive:true});
  await cp(parentSnapshot,local(newRoot,`snapshots/${parentRun.best}`),{recursive:true});
  assert(await treeHash(local(newRoot,'restored'))===parentRun.best,'Inherited best artifact copy changed');

  const createdAt=new Date().toISOString(),runId=randomUUID();
  const report={href:`${parentRelative}/report.html`};
  try { report.sha256=sha(await readFile(join(parentRoot,'report.html'))); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const parentBrief={href:`${parentRelative}/design_brief.md`};
  try { parentBrief.sha256=sha(await readFile(join(parentRoot,'design_brief.md'))); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const lineage={schema_version:'RestoreLineage/v1',relationship:'contract_refreeze',created_at:createdAt,child_run_id:runId,parent:{run_id:parentRun.run_id,started_at:parentRun.started_at,run_json_sha256:sha(parentRunBytes),events_jsonl_sha256:sha(parentEventsBytes),contract_sha256:parentRun.contract_sha256,best_artifact_sha256:parentRun.best,report,design_brief:parentBrief},inherited:{artifact_sha256:parentRun.best,artifact_source:'best_snapshot',design_brief:{uri:'design_brief.md',source:'contract_refreeze_projection',initial_sha256:sha(briefBytes)}},contract_refreeze:{source:{uri:sourceArchiveUri,kind:sourceKind,canonical_sha256:digest(sourceContract),input_file_sha256:sha(sourceBytes),archived_file_sha256:sha(sourceArchiveBytes),reference_evidence_sha256:digest(sourceContract.reference_evidence)},generation_policy:sourceContract.generation_policy}};
  const lineageHash=digest(lineage);await writeJSON(join(newRoot,'lineage.json'),lineage);
  const run={schema_version:VERSION,run_id:runId,started_at:createdAt,tier:selectedTier,phase:'prepare',rounds:[],static_checks:[],best:null,baseline:null,pending:null,stop:null,e2e:null,approval:null,enforcement:'cooperative',profile_changes:0,lineage:{uri:'lineage.json',sha256:lineageHash,relationship:'contract_refreeze',parent_run_id:parentRun.run_id,inherited_artifact_sha256:parentRun.best,artifact_source:'best_snapshot',source_contract_sha256:digest(sourceContract)}};
  await writeJSON(join(newRoot,'run.json'),run);
  await writeFile(join(newRoot,'events.jsonl'),JSON.stringify({at:createdAt,type:'refreeze',tier:selectedTier,parent_run_id:parentRun.run_id,parent_run_json_sha256:lineage.parent.run_json_sha256,parent_events_jsonl_sha256:lineage.parent.events_jsonl_sha256,parent_contract_sha256:parentRun.contract_sha256,source_contract_sha256:lineage.contract_refreeze.source.canonical_sha256,source_reference_evidence_sha256:lineage.contract_refreeze.source.reference_evidence_sha256,inherited_artifact_sha256:parentRun.best,artifact_source:'best_snapshot',lineage_sha256:lineageHash})+'\n');
  return {run_id:runId,phase:run.phase,tier:selectedTier,lineage:run.lineage,next:'review contract.json, then freeze'};
}
export async function locked(root,action,fn) {
  root=resolve(root); const lock=join(root,'.lock'); const handle=await open(lock,'wx').catch(()=>{throw new Error('Run is locked; inspect the owner before removing a stale .lock');});
  try {
    const run=await readJSON(join(root,'run.json')), result=await fn(run);
    await writeJSON(join(root,'run.json'),run);
    await writeFile(join(root,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),type:action,phase:run.phase,rounds:run.rounds.length,best:run.best,stop:run.stop,result})+'\n',{flag:'a'});
    return result;
  } finally { await handle.close(); await unlink(lock); }
}
export function budget(run,now=Date.now()) {
  const t=TIERS[run.tier], start=Date.parse(run.started_at), wall=Math.max(0,now-start);
  const excluded=(run.time_exclusions??[]).reduce((sum,x)=>sum+Math.max(0,Math.min(now,Date.parse(x.end_at))-Math.max(start,Date.parse(x.start_at))),0);
  const elapsed=Math.max(0,wall-excluded);
  return {elapsed_ms:elapsed,wall_elapsed_ms:wall,excluded_ms:excluded,remaining_ms:Math.max(0,t.minutes*60000-elapsed),repair_remaining_ms:Math.max(0,(t.minutes-t.reserve)*60000-elapsed),rounds_remaining:t.rounds-run.rounds.length-(run.pending?1:0),discovery_limit_ms:t.minutes*10000,baseline_target_ms:t.minutes*30000};
}
export async function excludeTime(root,run,entry) {
  assert(entry?.schema_version==='TimeExclusion/v0.2','Expected TimeExclusion/v0.2');
  assert(['quota_limit','user_wait','external_block'].includes(entry.reason)&&text(entry.source),'External pause reason and source required');
  const start=Date.parse(entry.start_at),end=Date.parse(entry.end_at),runStart=Date.parse(run.started_at);
  assert(Number.isFinite(start)&&Number.isFinite(end)&&start>=runStart&&end>start&&end<=Date.now(),'Invalid pause interval');
  for(const prior of run.time_exclusions??[]) assert(end<=Date.parse(prior.start_at)||start>=Date.parse(prior.end_at),'Pause intervals overlap');
  const events=(await readFile(join(root,'events.jsonl'),'utf8')).trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert(events.every(event=>{const at=Date.parse(event.at);return at<=start||at>=end;}),'Pause interval overlaps recorded run activity');
  const accepted={schema_version:entry.schema_version,start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString(),reason:entry.reason,source:entry.source,note:entry.note??''};
  run.time_exclusions??=[];run.time_exclusions.push(accepted);
  return {excluded:accepted,budget_at_stop:run.stop?budget(run,Date.parse(run.stop.at)):null};
}
export function validateTokenUsage(data) {
  assert(data?.schema_version==='TokenUsage/v0.2'&&['partial','complete'].includes(data.coverage),'Expected TokenUsage/v0.2 with coverage');
  assert(Array.isArray(data.records)&&data.records.length>0,'Token usage records required');
  const ids=new Set();
  for(const record of data.records) {
    assert(text(record.id)&&!ids.has(record.id),'Token usage record IDs must be unique'); ids.add(record.id);
    assert(['restore_loop','finalization','supplemental_audit','other'].includes(record.stage),'Invalid token usage stage');
    assert(text(record.agent)&&['codex_session','model_api','manual'].includes(record.source_type)&&text(record.source_ref),'Token usage provenance required');
    assert(Number.isFinite(Date.parse(record.window?.start_at))&&Number.isFinite(Date.parse(record.window?.end_at))&&Date.parse(record.window.end_at)>=Date.parse(record.window.start_at),'Invalid token usage window');
    assert(Number.isInteger(record.response_count)&&record.response_count>0,'Response count required');
    const u=record.usage;
    for(const key of ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']) assert(Number.isSafeInteger(u?.[key])&&u[key]>=0,`Invalid ${key}`);
    assert(u.cached_input_tokens<=u.input_tokens&&u.reasoning_output_tokens<=u.output_tokens&&u.total_tokens===u.input_tokens+u.output_tokens,'Inconsistent token usage totals');
    if(u.cache_write_input_tokens!=null)assert(Number.isSafeInteger(u.cache_write_input_tokens)&&u.cache_write_input_tokens>=0&&u.cache_write_input_tokens<=u.input_tokens,'Invalid cache write input tokens');
  }
  assert(text(data.coverage_note),'Token usage coverage note required');
  return data;
}
export async function recordTokenUsage(root,run,data) {
  validateTokenUsage(data);
  const hash=digest(data),uri=`observations/token-usage-${hash}.json`;
  await writeJSON(local(root,uri),data);
  run.token_usage={uri,sha256:hash};
  return {uri,sha256:hash,coverage:data.coverage,records:data.records.length};
}
export async function contract(root,run) {
  const c=await readJSON(join(root,'contract.json')); assert(digest(c)===run.contract_sha256,'Frozen contract changed; start an explicitly linked new run with remaining budget');
  await verifyEvidence(root,c.reference_evidence); return c;
}
export async function generationInput(root,run) {
  const c=await contract(root,run),fixtureOnly=c.generation_policy.mode==='fixture_only';
  const referenceEvidence=c.reference_evidence.filter(e=>!fixtureOnly||e.kind!=='source');
  const allowedIds=new Set(referenceEvidence.map(e=>e.id));
  const obligations=c.obligations.map(item=>({...item,reference_evidence:(item.reference_evidence??[]).filter(id=>allowedIds.has(id))}));
  const scene=c.interactive_scene?{
    ...c.interactive_scene,
    transitions:c.interactive_scene.transitions.map(item=>({...item,evidence:item.evidence.filter(id=>allowedIds.has(id))})),
    rendering:c.interactive_scene.rendering.map(item=>({...item,evidence:item.evidence.filter(id=>allowedIds.has(id))}))
  }:null;
  const resources=(c.resources??[]).filter(item=>item.evaluation_only!==true&&!['source','source_code','repository'].includes(item.kind??item.type));
  return {schema_version:'RestoreGenerationInput/v1',run_id:run.run_id,case_id:c.case_source?.case_id??null,generation_policy:c.generation_policy,binding:{contract_sha256:run.contract_sha256,reference_sha256:digest(referenceEvidence)},requested_url:c.requested_url,observed_url:c.observed_url,states:c.states,obligations,interactive_scene:scene,reference_evidence:referenceEvidence,resources,unknowns:c.unknowns??[],output:{project_path:'restored/',start_command:c.start_command}};
}
export function summarizeStaticChecks(checks) {
  const count=status=>checks.filter(check=>check.status===status).length,total=checks.length,skipped=count('skipped'),applicable=total-skipped,assessed=count('pass')+count('fail');
  const summary={total,pass:count('pass'),fail:count('fail'),unknown:count('unknown'),skipped,blocking_failures:checks.filter(check=>check.status==='fail'&&check.severity==='blocking').length,coverage_percent:applicable?Math.round(10000*assessed/applicable)/100:0,overall_status:'pass'};
  if(summary.fail>0) summary.overall_status='fail'; else if(summary.unknown>0||applicable===0) summary.overall_status='incomplete';
  return summary;
}
export function normalizeStaticCheckSuite(data) {
  assert(data?.schema_version==='StaticCheckSuite/v1'&&text(data.suite_id)&&text(data.label),'Expected StaticCheckSuite/v1');
  assert(['initial','candidate','final','supplemental'].includes(data.stage),'Invalid static check stage');
  assert(data.binding&&text(data.binding.run_id)&&/^[a-f0-9]{64}$/.test(data.binding.artifact_sha256)&&/^[a-f0-9]{64}$/.test(data.binding.contract_sha256),'Static check binding required');
  assert(data.executor&&['tool','implementer','independent'].includes(data.executor.role)&&text(data.executor.id),'Static check executor required');
  assert(Number.isFinite(Date.parse(data.started_at))&&Number.isFinite(Date.parse(data.completed_at))&&Date.parse(data.completed_at)>=Date.parse(data.started_at),'Invalid static check interval');
  unique(data.checks,'id','static checks');
  const categories=['syntax','http','content','runtime','browser','resources','accessibility','security','performance','quality','custom'];
  for(const check of data.checks) {
    assert(categories.includes(check.category)&&['pass','fail','unknown','skipped'].includes(check.status)&&['blocking','obvious','minor','informational'].includes(check.severity),'Invalid static check category/status/severity');
    assert(text(check.description)&&text(check.expected)&&text(check.actual)&&Array.isArray(check.evidence),'Static check result fields required');
    if(check.duration_ms!=null) assert(Number.isFinite(check.duration_ms)&&check.duration_ms>=0,'Invalid static check duration');
  }
  assert(Array.isArray(data.evidence),'Static check evidence required');
  return {...data,summary:summarizeStaticChecks(data.checks)};
}
export async function recordStaticChecks(root,run,data) {
  assert(run.contract_sha256,'Freeze the contract before recording checks');
  const suite=normalizeStaticCheckSuite(data);
  assert(suite.binding.run_id===run.run_id&&suite.binding.contract_sha256===run.contract_sha256,'Static check run/contract binding mismatch');
  const current=await treeHash(local(root,'restored'));
  let snapshotMatches=false;
  try { snapshotMatches=await treeHash(local(root,`snapshots/${suite.binding.artifact_sha256}`))===suite.binding.artifact_sha256; } catch(error) { if(error.code!=='ENOENT') throw error; }
  assert(current===suite.binding.artifact_sha256||snapshotMatches,'Static check artifact binding mismatch');
  const ids=await verifyEvidence(root,suite.evidence,snapshotMatches&&current!==suite.binding.artifact_sha256?{artifact_sha256:suite.binding.artifact_sha256}:{});
  for(const check of suite.checks) {
    if(check.status!=='skipped') references(ids,check.evidence,check.id);
    else assert(check.evidence.every(id=>ids.has(id)),'Unknown evidence in skipped check');
  }
  run.static_checks??=[];
  assert(!run.static_checks.some(item=>item.suite_id===suite.suite_id&&item.artifact_sha256===suite.binding.artifact_sha256),'Duplicate static check suite for artifact');
  const hash=digest(suite),uri=`observations/static-check-${hash}.json`;await writeJSON(local(root,uri),suite);
  const pointer={suite_id:suite.suite_id,label:suite.label,stage:suite.stage,artifact_sha256:suite.binding.artifact_sha256,uri,sha256:hash,summary:suite.summary};run.static_checks.push(pointer);return pointer;
}
export function binding(run,c,artifact) { return {artifact_sha256:artifact,reference_sha256:digest(c.reference_evidence),contract_sha256:run.contract_sha256,environment_sha256:digest(c.environment),rubric_version:c.e2e_profile.rubric_version,scorer_version:c.e2e_profile.scorer_version}; }
export async function assess(root,run,c,a,artifact,requiredStates=c.states.map(s=>s.id)) {
  assert(a.schema_version==='LoopAssessment/v0.2','Expected LoopAssessment/v0.2');
  assert(canonical(a.binding)===canonical(binding(run,c,artifact)),'Assessment binding mismatch');
  assert(a.assessor && ['independent','implementer'].includes(a.assessor.role)&&text(a.assessor.id),'Assessor identity/role required');
  const ids=await verifyEvidence(root,a.evidence);
  assert(Array.isArray(a.covered_states)&&requiredStates.every(id=>a.covered_states.includes(id))&&a.covered_states.every(id=>c.states.some(s=>s.id===id)),'Required capture states missing');
  unique(a.units,'obligation_id','units');
  assert(a.units.length===c.obligations.filter(o=>a.covered_states.includes(o.state_id)).length,'Unit coverage mismatch');
  for(const o of c.obligations.filter(o=>a.covered_states.includes(o.state_id))) {
    const u=a.units.find(x=>x.obligation_id===o.id); assert(u&&text(u.reason),'Obligation result missing');
    assert(['scored','unknown','not_applicable'].includes(u.status),'Invalid unit status');
    if(u.status==='scored') assert(o.applicability==='applicable'&&Number.isInteger(u.score)&&u.score>=0&&u.score<=4,'Invalid 0–4 score');
    else assert(u.score===null,'Unknown/N/A cannot have score');
    if(u.status==='not_applicable') assert(o.applicability==='not_applicable','Cannot change applicability');
    references(ids,u.evidence,o.id);
    if(u.status==='scored') {
      const kinds=u.evidence.map(id=>a.evidence.find(e=>e.id===id)?.kind);
      if(o.criterion_id==='C3')assert(kinds.some(x=>['sequence','video'].includes(x)),'Dynamic score requires sequence/video evidence');
      else assert(kinds.includes('screenshot'),'Static visual score requires screenshot evidence');
    }
  }
  unique(a.gates,'id','gates'); assert(a.gates.length===c.runtime_gates.length,'Gate coverage mismatch');
  for(const g of c.runtime_gates) { const v=a.gates.find(x=>x.id===g.id); assert(v&&['pass','fail','unknown'].includes(v.status),'Gate missing/status invalid'); references(ids,v.evidence,g.id); }
  assert(Array.isArray(a.findings),'Findings required');
  for(const f of a.findings) { assert(text(f.id)&&text(f.description)&&c.obligations.some(o=>o.id===f.obligation_id&&a.covered_states.includes(o.state_id))&&['blocking','obvious','minor'].includes(f.severity),'Invalid finding'); references(ids,f.evidence,f.id); }
  return a;
}
function target(c,a) {
  return a.assessor.role==='independent' && a.gates.every(g=>g.status==='pass') && !a.findings.some(f=>f.severity!=='minor') && c.obligations.filter(o=>o.required).every(o=>{const u=a.units.find(x=>x.obligation_id===o.id); return u && (o.applicability==='not_applicable'?u.status==='not_applicable':u.status==='scored'&&u.score>=o.target);});
}
async function observation(root,a) { const name=`observations/${digest(a)}.json`; await writeJSON(local(root,name),a); return name; }
async function archiveAssessmentEvidence(root,a) {
  const evidence=[];
  for(const item of a.evidence) {
    const bytes=await readFile(await safeFile(root,item.uri));
    const actual=sha(bytes);assert(actual===item.sha256,`Evidence changed: ${item.id}`);
    const originalName=item.uri.replaceAll('\\','/').split('/').at(-1).replace(/[^a-zA-Z0-9._-]/g,'_')||'evidence';
    const evidenceId=item.id.replace(/[^a-zA-Z0-9._-]/g,'_')||'evidence';
    const uri=`observations/evidence-archive/${item.sha256}/${evidenceId}-${originalName}`;
    const destination=local(root,uri);await mkdir(dirname(destination),{recursive:true});
    try { await writeFile(destination,bytes,{flag:'wx'}); }
    catch(error) { if(error.code!=='EEXIST')throw error;assert(sha(await readFile(destination))===item.sha256,`Archived evidence changed: ${item.id}`); }
    evidence.push({...item,uri});
  }
  return {...a,evidence};
}
export async function freeze(root,run) {
  assert(run.phase==='prepare'&&budget(run).remaining_ms>0,'Run deadline exhausted or already frozen'); const c=await readJSON(join(root,'contract.json')); await validateContract(root,c);
  const contractHash=digest(c);
  if(run.lineage?.relationship==='contract_refreeze') {
    const lineage=await readJSON(await safeFile(root,run.lineage.uri));
    assert(digest(lineage)===run.lineage.sha256&&lineage.relationship==='contract_refreeze','Contract refreeze lineage changed or is invalid');
    assert(contractHash!==lineage.parent.contract_sha256,'Contract refreeze final contract must differ from the parent frozen contract');
    validateRefreezeEvidencePaths(root,c);
  }
  run.contract_sha256=contractHash; run.phase='baseline'; return {contract_sha256:run.contract_sha256,budget:budget(run)};
}
export async function baseline(root,run,a) {
  assert(run.phase==='baseline'&&budget(run).remaining_ms>0,'Baseline deadline exhausted or wrong phase'); const c=await contract(root,run), hash=await snapshot(root);
  await assess(root,run,c,a,hash); assert(a.stability && ['stable','variable'].includes(a.stability.status)&&text(a.stability.reason),'Baseline stability observation required');
  references(new Set(a.evidence.map(e=>e.id)),a.stability.evidence,'stability');
  a=await archiveAssessmentEvidence(root,a);
  run.baseline=run.best=hash; run.baseline_assessment=run.best_assessment=await observation(root,a); run.phase='loop'; return advance(root,run);
}
export async function end(root,run,reason,detail='',blocker=null) {
  assert(!run.pending,'Resolve pending candidate first'); assert(!run.stop,'Run already stopped');
  assert(['target_reached','plateau','cycle_detected','budget_exhausted','blocked','failed'].includes(reason),'Invalid stop reason');
  let blockerRef=null;
  if(reason==='blocked') {
    assert(blocker?.schema_version==='RestoreBlocker/v1','Blocked stop requires a RestoreBlocker/v1 evidence record');
    assert(['reference_capture','assets','runtime','loop_measure','loop_verify'].includes(blocker.scope),'Final E2E/Judge unavailability is not a Restore Loop blocker');
    assert(text(blocker.reason),'Blocker reason required');
    const ids=await verifyEvidence(root,blocker.evidence);
    assert(Array.isArray(blocker.attempts)&&blocker.attempts.length>0,'Record available alternatives and their outcomes');
    for(const a of blocker.attempts) {
      assert(text(a.capability)&&['failed','unavailable'].includes(a.status)&&text(a.reason),'Blocker attempt requires capability/status/reason');
      references(ids,a.evidence,'blocker attempt');
    }
    assert(Array.isArray(blocker.remaining_work)&&blocker.remaining_work.length>0,'Remaining work disposition required');
    for(const w of blocker.remaining_work) {
      assert(text(w.task)&&['done','blocked','not_applicable'].includes(w.status)&&text(w.reason),'Finish unaffected work before stopping');
      references(ids,w.evidence,'remaining work');
    }
    const hash=digest(blocker),uri=`observations/blocker-${hash}.json`;
    await writeJSON(local(root,uri),blocker);blockerRef={uri,sha256:hash,scope:blocker.scope};
  }
  if(run.best) await restore(root,run.best);
  run.stop={reason,detail,at:new Date().toISOString(),budget:budget(run),artifact_sha256:run.best,...(blockerRef?{blocker:blockerRef}:{})}; run.phase='final';
  return {action:'final_e2e',stop:run.stop};
}
export async function progress(root,run) {
  const a=run.best_assessment?await readJSON(local(root,run.best_assessment)):null;
  const result=run.post_run_e2e_review??run.e2e;
  const staticChecks=run.static_checks??[];
  return {run_id:run.run_id,phase:run.phase,
    stage:run.stop?(run.phase==='complete'?'report':'final_e2e'):run.pending?'measure_verify':run.phase==='prepare'?'discovery':run.phase==='baseline'?'initial_measure':'iterate',
    budget:budget(run,run.stop?Date.parse(run.stop.at):Date.now()),budget_basis:run.stop?'loop_stop':'live',
    finalization_budget:run.phase==='final'?budget(run):null,completed_rounds:run.rounds.length,pending_round:run.pending?.round??null,
    version_count:(run.baseline?1:0)+run.rounds.length,round_limit:TIERS[run.tier].rounds,
    best_artifact_sha256:run.best,last_decision:run.rounds.at(-1)?.decision??null,
    static_checks:{suite_count:staticChecks.length,latest:staticChecks.at(-1)?.summary??null},
    units:a?.units.map(({obligation_id,status,score})=>({obligation_id,status,score}))??[],
    gates:a?.gates??[],findings:a?.findings??[],stop:run.stop,final_e2e:result?.status??'not_run'};
}
export async function advance(root,run) {
  if(run.stop) return {action:run.phase==='complete'?'report':'final_e2e',stop:run.stop};
  if(run.pending) return {action:budget(run).repair_remaining_ms===0?'abort':'verify',pending:run.pending,budget:budget(run)};
  const c=await contract(root,run), b=budget(run);
  if(run.best) { const a=await readJSON(local(root,run.best_assessment)); if(target(c,a)) return end(root,run,'target_reached'); }
  if(b.repair_remaining_ms===0||b.rounds_remaining<=0) return end(root,run,'budget_exhausted');
  if(run.rounds.slice(-2).length===2&&run.rounds.slice(-2).every(r=>r.decision!=='keep')) return end(root,run,'plateau');
  return {action:run.phase==='baseline'?'baseline':'repair',budget:b};
}
export async function begin(root,run,p) {
  assert(run.phase==='loop'&&!run.pending,'Loop is not ready for a new repair');
  const next=await advance(root,run); if(run.stop) return next;
  const c=await contract(root,run), a=await readJSON(local(root,run.best_assessment));
  assert(text(p.hypothesis)&&text(p.strategy)&&text(p.issue_id)&&['local','global'].includes(p.scope),'Hypothesis/strategy/issue/scope required');
  const issue=a.findings.find(f=>f.id===p.issue_id); assert(issue,'Target must be an observed finding');
  assert(Array.isArray(p.affected_states)&&p.affected_states.includes(c.obligations.find(o=>o.id===issue.obligation_id).state_id)&&p.affected_states.every(id=>c.states.some(s=>s.id===id)),'Invalid affected states');
  assert(text(p.expected_change)&&text(p.preserve),'Expected change and preservation obligation required');
  const key=digest({issue:p.issue_id,strategy:p.strategy,hypothesis:p.hypothesis});
  const last=run.rounds.at(-1);
  if(last?.decision!=='keep'&&last?.issue_id===p.issue_id&&last?.strategy===p.strategy) return end(root,run,'cycle_detected','Repeated failed strategy for the same issue');
  if(run.rounds.some(r=>r.key===key&&r.decision!=='keep')) return end(root,run,'cycle_detected','Repeated failed hypothesis');
  assert(await treeHash(local(root,'restored'))===run.best,'Restore best snapshot before beginning');
  const states=p.scope==='global'?c.states.map(s=>s.id):[...new Set([...p.affected_states,...c.states.filter(s=>s.sentinel).map(s=>s.id)])];
  run.pending={...p,key,round:run.rounds.length+1,started_at:new Date().toISOString(),before:run.best,required_states:states}; return run.pending;
}
export async function record(root,run,a,v) {
  assert(run.pending&&budget(run).repair_remaining_ms>0,'No candidate pending or repair deadline exhausted; abort to restore best'); const c=await contract(root,run), p=run.pending, hash=await snapshot(root);
  await assess(root,run,c,a,hash,p.required_states);
  assert(v.schema_version==='IterationDecision/v0.2'&&v.issue_id===p.issue_id&&canonical(v.binding)===canonical(a.binding),'Verification binding/target mismatch');
  assert(v.verifier?.role==='independent'&&text(v.verifier.id),'Independent pairwise verifier required');
  const ids=new Set(a.evidence.map(e=>e.id)); references(ids,v.evidence,'verification');
  assert(v.evidence.length===2&&v.evidence[0]!==v.evidence[1],'Two distinct pairwise records required');
  for(let i=0;i<2;i++) {
    const entry=a.evidence.find(e=>e.id===v.evidence[i]); assert(entry.kind==='checks','Pairwise raw record must be checks evidence');
    const raw=await readJSON(await safeFile(root,entry.uri)),order=i===0?['best','candidate']:['candidate','best'];
    assert(raw.schema_version==='PairwiseVerdict/v0.2'&&canonical(raw.binding)===canonical(a.binding)&&raw.issue_id===p.issue_id&&canonical(raw.order)===canonical(order),'Pairwise raw record/order mismatch');
    const choice=raw.choice==='A'?order[0]:raw.choice==='B'?order[1]:raw.choice;
    assert(['candidate','best','same','uncertain'].includes(choice)&&choice===(i===0?v.forward:v.reverse),'Pairwise verdict mismatch');
  }
  assert(['candidate','best','same','uncertain'].includes(v.forward)&&['candidate','best','same','uncertain'].includes(v.reverse),'Pairwise verdicts required (normalized to candidate/best)');
  assert(typeof v.visible_improvement==='boolean'&&text(v.reason),'Visible improvement and reason required');
  a=await archiveAssessmentEvidence(root,a);
  const before=await readJSON(local(root,run.best_assessment));
  const regressions=a.units.filter(u=>{const old=before.units.find(x=>x.obligation_id===u.obligation_id),o=c.obligations.find(x=>x.id===u.obligation_id);return old?.status==='scored'&&o?.required&&(u.status!=='scored'||u.score<old.score);});
  const rank={minor:0,obvious:1,blocking:2};
  const newMajor=a.findings.some(f=>f.severity!=='minor'&&!before.findings.some(old=>old.obligation_id===f.obligation_id&&rank[old.severity]>=rank[f.severity]));
  const unit_changes=a.units.map(unit=>{const prior=before.units.find(x=>x.obligation_id===unit.obligation_id),beforeStatus=prior?.status??'missing',status_change=beforeStatus===unit.status?'unchanged':beforeStatus==='unknown'&&unit.status==='scored'?'newly_scored':beforeStatus==='scored'&&unit.status==='unknown'?'lost_score':'changed';return {obligation_id:unit.obligation_id,before_status:beforeStatus,before_score:prior?.score??null,candidate_status:unit.status,candidate_score:unit.score,status_change,delta:prior?.status==='scored'&&unit.status==='scored'?unit.score-prior.score:null};});
  const gateRank={fail:0,unknown:1,pass:2};
  const gate_changes=a.gates.map(gate=>{const prior=before.gates.find(x=>x.id===gate.id),delta=prior?gateRank[gate.status]-gateRank[prior.status]:null;return {gate_id:gate.id,before_status:prior?.status??'missing',candidate_status:gate.status,change:delta==null?'unknown':delta>0?'improved':delta<0?'regressed':'unchanged'};});
  const gateRegressions=gate_changes.filter(change=>change.change==='regressed'),gateImprovements=gate_changes.filter(change=>change.change==='improved');
  const covered=new Set(a.covered_states),findingInScope=finding=>covered.has(c.obligations.find(o=>o.id===finding.obligation_id)?.state_id);
  const resolvedFindings=before.findings.filter(old=>findingInScope(old)&&!a.findings.some(n=>n.id===old.id));
  const introducedFindings=a.findings.filter(item=>!before.findings.some(old=>old.id===item.id));
  const auditableResolvedFindings=resolvedFindings.filter(old=>!a.findings.some(item=>item.obligation_id===old.obligation_id&&(old.severity==='minor'||item.severity!=='minor')));
  const improvements={unit_scores:unit_changes.filter(change=>change.delta>0||change.status_change==='newly_scored').map(change=>change.obligation_id),gates:gateImprovements.map(change=>change.gate_id),resolved_findings:auditableResolvedFindings.map(finding=>finding.id)};
  const hasAuditableImprovement=Object.values(improvements).some(items=>items.length>0);
  let decision='inconclusive';
  if(gateRegressions.length||regressions.length||newMajor||v.forward==='best'||v.reverse==='best') decision='revert';
  else if(a.assessor.role==='independent'&&v.forward==='candidate'&&v.reverse==='candidate'&&v.visible_improvement&&hasAuditableImprovement&&hash!==run.best&&budget(run).repair_remaining_ms>0) decision='keep';
  const cycle=run.rounds.some(r=>r.candidate===hash)&&hash!==run.best;
  if(cycle) decision='revert';
  const artifact_diff={...await artifactDiff(root,p.before,hash),units:unit_changes,gates:gate_changes,findings:{before:before.findings.map(x=>x.id),candidate:a.findings.map(x=>x.id),resolved:resolvedFindings.map(x=>x.id),introduced:introducedFindings.map(x=>x.id)}};
  const diffHash=digest(artifact_diff),diffUri=`observations/artifact-diff-${diffHash}.json`;await writeJSON(local(root,diffUri),artifact_diff);
  const path=await observation(root,a); const verifyPath=await observation(root,v);
  run.rounds.push({...p,version_id:`v${p.round}`,candidate:hash,assessment:path,verification:verifyPath,diff:{uri:diffUri,sha256:diffHash},decision,at:new Date().toISOString(),regressions:regressions.map(x=>x.obligation_id),gate_regressions:gateRegressions.map(x=>x.gate_id),improvements}); run.pending=null;
  if(decision==='keep') {
    // Carry forward untouched states explicitly; final E2E recaptures the complete scope.
    const merged={...a,covered_states:[...new Set([...a.covered_states,...before.covered_states])],evidence:[...a.evidence,...before.evidence.filter(e=>!a.evidence.some(n=>n.id===e.id))],units:[...a.units,...before.units.filter(u=>!covered.has(c.obligations.find(o=>o.id===u.obligation_id).state_id))],findings:[...a.findings,...before.findings.filter(f=>!covered.has(c.obligations.find(o=>o.id===f.obligation_id).state_id))],inherited_from:run.best_assessment};
    run.best=hash; run.best_assessment=await observation(root,merged);
  } else await restore(root,run.best);
  if(cycle) return {decision,...await end(root,run,'cycle_detected','Repeated candidate artifact')};
  return {decision,...await advance(root,run)};
}
export async function abort(root,run,detail) {
  assert(run.pending&&text(detail),'Pending round and reason required');
  run.rounds.push({...run.pending,decision:'inconclusive',candidate:null,reason:detail,at:new Date().toISOString()}); run.pending=null;
  await restore(root,run.best); return advance(root,run);
}
export async function assessmentInput(root,run) {
  const c=await contract(root,run), hash=await treeHash(local(root,'restored'));
  return {schema_version:'LoopAssessmentRequest/v0.2',binding:binding(run,c,hash),states:c.states.filter(s=>!run.pending||run.pending.required_states.includes(s.id)),obligations:c.obligations,interactive_scene:c.interactive_scene??null,reference_evidence:c.reference_evidence,runtime_gates:c.runtime_gates,rubric:'references/restore/criteria.md',assessor:{role:'independent',id:null},required_output:'LoopAssessment/v0.2'};
}
export async function finalInput(root,run) {
  assert(run.stop,'Loop must end before E2E'); const c=await contract(root,run);
  if(!run.best) return {schema_version:'FinalEvalRequest/v0.2',status:'incomplete',reason:'No runnable artifact'};
  assert(await treeHash(local(root,'restored'))===run.best,'Final artifact changed');
  const effectiveDeadline=Date.parse(run.started_at)+TIERS[run.tier].minutes*60000+(run.time_exclusions??[]).reduce((sum,x)=>sum+Date.parse(x.end_at)-Date.parse(x.start_at),0);
  return {schema_version:'FinalEvalRequest/v0.2',case_id:c.case_source?.case_id??run.run_id,binding:binding(run,c,run.best),reference_evidence:c.reference_evidence,states:c.states,resources:c.resources??[],interactive_scene:c.interactive_scene??null,obligations:c.obligations.map(({id,state_id,region_id,expected,reference_evidence})=>({id,state_id,region_id,expected,reference_evidence})),redline_profile:c.redline_profile??null,start_command:c.start_command,project_path:'restored/',deadline:new Date(effectiveDeadline).toISOString()};
}
export async function recordE2E(root,run,result) {
  assert(run.phase==='final'&&!run.e2e,'Final E2E can be recorded once after loop stop');
  const request=await finalInput(root,run);
  assert(result.schema_version==='E2EResultRef/v0.2'&&canonical(result.binding)===canonical(request.binding??null),'Final result binding mismatch');
  assert(['pass','fail','incomplete'].includes(result.status),'Invalid E2E result');
  if(result.status!=='incomplete') {
    assert(result.scoring_provenance===`independent_evaluator/${request.binding.scorer_version}`,'Independent grader provenance required');
    assert(result.assessor?.role==='independent'&&result.dimensions?.length===5&&result.redlines?.length===6,'Independent five-dimension result required');
    await verifyEvidence(root,result.evidence);
    assert(result.covered_states?.length>=request.states.length&&request.states.every(s=>result.covered_states.includes(s.id)),'Incomplete E2E coverage');
    if(['e2e/v0.3','e2e/v0.4'].includes(request.binding.scorer_version))validateRedlineAssessments(result.redlines,{evidenceIds:new Set(result.evidence.map(e=>e.id)),coveredStates:result.covered_states,profile:validateRedlineProfile(request)});
  }
  if(budget(run).remaining_ms===0) result={...result,status:'incomplete',reason:'E2E result received after deadline'};
  const path=`observations/e2e-${digest(result)}.json`;await writeJSON(local(root,path),result);
  run.e2e={uri:path,sha256:digest(result),status:result.status};run.phase='complete';return run.e2e;
}
export async function recordPostRunE2EReview(root,run,review) {
  assert(run.stop&&run.phase==='complete','Post-run review requires a completed Restore run');
  assert(review.schema_version==='PostRunE2EReview/v1'&&review.mode==='post_run'&&review.run_id===run.run_id,'Invalid post-run review identity');
  const request=await finalInput(root,run),expected=request.binding;
  assert(run.best&&review.binding?.artifact_sha256===run.best&&review.binding?.contract_sha256===run.contract_sha256,'Post-run review artifact/contract binding mismatch');
  assert(review.binding?.rubric_version===request.binding.rubric_version&&review.binding?.scorer_version===request.binding.scorer_version,'Post-run review rubric/scorer mismatch');
  assert(review.evaluation.request_schema_version==='FinalEvalRequest/v0.2','Post-run request schema version required');
  assert(['verified','not_exposed','not_recorded'].includes(review.evaluation.judge_model_status),'Judge model availability status required');
  if(review.evaluation.judge_model_status==='verified')assert(text(review.evaluation.judge_model),'Verified judge model ID required');
  assert(Number.isFinite(Date.parse(review.evaluation?.evaluated_at)),'Post-run evaluation timestamp required');
  if(review.evaluation.started_at)assert(Number.isFinite(Date.parse(review.evaluation.completed_at))&&Date.parse(review.evaluation.completed_at)>=Date.parse(review.evaluation.started_at),'Invalid post-run evaluation interval');
  const result=review.result;
  assert(result?.schema_version==='E2EResultRef/v0.2'&&canonical(result.binding)===canonical(expected),'Final E2E result binding mismatch');
  assert(['pass','fail','incomplete'].includes(result.status)&&result.dimensions?.length===5&&result.redlines?.length===6&&Array.isArray(review.limitations),'Post-run five-dimension result/limitations required');
  assert(result.scoring_provenance===`independent_evaluator/${review.binding.scorer_version}`,'Post-run grader provenance required');
  if(result.evidence?.length)await verifyEvidence(root,result.evidence);
  if(['e2e/v0.3','e2e/v0.4'].includes(review.binding.scorer_version))validateRedlineAssessments(result.redlines,{evidenceIds:new Set((result.evidence??[]).map(e=>e.id)),coveredStates:result.covered_states??[],profile:validateRedlineProfile(request)});
  const hash=digest(review),uri=`observations/post-run-e2e-review-${hash}.json`;
  await writeJSON(local(root,uri),review);
  const previous=run.post_run_e2e_review??null;
  const history=run.post_run_e2e_reviews??(previous?[previous]:[]);
  const pointer={uri,sha256:hash,status:result.status,evaluated_at:review.evaluation.evaluated_at,revision:history.length+1,...(previous?{supersedes:previous.uri}:{})};
  run.post_run_e2e_reviews=[...history,pointer];
  run.post_run_e2e_review=pointer;
  return run.post_run_e2e_review;
}
