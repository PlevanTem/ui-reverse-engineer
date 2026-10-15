import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, lstat, cp, open, unlink } from 'node:fs/promises';
import { resolve, relative, sep, join, isAbsolute } from 'node:path';

export const VERSION = 'restore/v0.2';
export const TIERS = Object.freeze({ ordinary: { minutes:30, rounds:2, reserve:3 }, refined: { minutes:60, rounds:3, reserve:6 }, complex: { minutes:120, rounds:4, reserve:12 } });
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
export async function treeHash(root) {
  const files=[];
  async function walk(dir) {
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (['node_modules','.git'].includes(entry.name)) continue;
      const path=join(dir,entry.name); assert(!entry.isSymbolicLink(),`Symlink in artifact: ${path}`);
      if(entry.isDirectory()) await walk(path); else if(entry.isFile()) files.push([relative(root,path).replaceAll('\\','/'),sha(await readFile(path))]);
    }
  }
  await walk(root); assert(files.length,'Artifact is empty'); return digest(files);
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
export async function verifyEvidence(root,items) {
  assert(Array.isArray(items) && items.length>0,'Evidence is required');
  const ids=new Set();
  for(const e of items) {
    assert(text(e.id)&&!ids.has(e.id),'Evidence IDs must be unique'); ids.add(e.id);
    assert(['screenshot','sequence','video','checks','source'].includes(e.kind),'Invalid evidence kind');
    assert(sha(await readFile(await safeFile(root,e.uri)))===e.sha256,`Evidence changed: ${e.id}`);
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
  unique(c.states,'id','states'); unique(c.obligations,'id','obligations'); unique(c.runtime_gates,'id','runtime gates');
  const evidence=await verifyEvidence(root,c.reference_evidence);
  assert(c.obligations.filter(o=>o.required&&o.applicability==='applicable').length>0,'At least one observable required visual obligation is needed');
  for(const s of c.states) {
    assert(text(s.id)&&text(s.page_id)&&text(s.viewport_id)&&text(s.path)&&Array.isArray(s.regions)&&s.regions.length,'State identity/regions missing');
    assert(s.viewport?.width>0&&s.viewport?.height>0&&text(s.ready_selector),'State viewport/readiness required');
    assert(Array.isArray(s.steps)&&typeof s.sentinel==='boolean','State steps/sentinel required');
  }
  assert(c.states.some(s=>s.sentinel),'At least one sentinel state required');
  for(const o of c.obligations) {
    const s=c.states.find(x=>x.id===o.state_id);
    assert(s&&s.regions.includes(o.region_id)&&criteria.includes(o.criterion_id),`Invalid obligation: ${o.id}`);
    assert(text(o.id)&&text(o.expected)&&text(o.method)&&typeof o.required==='boolean'&&o.target===3,'Obligation QA/target required');
    assert(['blocking','obvious','minor'].includes(o.importance),'Obligation importance required');
    assert(['applicable','not_applicable','unknown'].includes(o.applicability),'Invalid applicability');
    if(o.applicability!=='applicable') assert(text(o.reason),'Applicability reason required');
    references(evidence,o.reference_evidence,o.id);
  }
  for(const id of criteria) assert(c.obligations.some(o=>o.criterion_id===id&&o.required),`Declare required ${id}, including explicit N/A`);
  for(const g of c.runtime_gates) assert(text(g.id)&&text(g.description),'Gate description required');
}
export async function init(root,url,tier='ordinary') {
  assert(TIERS[tier] && /^https?:\/\//.test(url),'Valid URL/tier required');
  await mkdir(root,{recursive:true}); const guard=await open(join(root,'run.json'),'wx'); await guard.close();
  for(const path of ['restored','snapshots','discarded','observations','evidence','docs']) await mkdir(local(root,path),{recursive:true});
  const run={schema_version:VERSION,run_id:randomUUID(),started_at:new Date().toISOString(),tier,phase:'prepare',rounds:[],best:null,baseline:null,pending:null,stop:null,e2e:null,approval:null,enforcement:'cooperative',profile_changes:0};
  await writeJSON(join(root,'run.json'),run);
  await writeJSON(join(root,'contract.json'),{schema_version:VERSION,requested_url:url,observed_url:null,start_command:null,environment:{browser:null,os:null,dpr:1,locale:'en-US'},e2e_profile:{rubric_version:'site-restore-v1.0-draft',scorer_version:'e2e/v0.2'},states:[],obligations:[],runtime_gates:[{id:'runnable',description:'主页面可加载、主体可见'},{id:'reachable',description:'关键视觉状态可到达'},{id:'unobstructed',description:'无严重遮挡或溢出'}],reference_evidence:[],resources:[],unknowns:[]});
  await writeFile(join(root,'events.jsonl'),JSON.stringify({at:run.started_at,type:'init',tier})+'\n'); return run;
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
export async function freeze(root,run) {
  assert(run.phase==='prepare'&&budget(run).remaining_ms>0,'Run deadline exhausted or already frozen'); const c=await readJSON(join(root,'contract.json')); await validateContract(root,c); run.contract_sha256=digest(c); run.phase='baseline'; return {contract_sha256:run.contract_sha256,budget:budget(run)};
}
export async function baseline(root,run,a) {
  assert(run.phase==='baseline'&&budget(run).remaining_ms>0,'Baseline deadline exhausted or wrong phase'); const c=await contract(root,run), hash=await snapshot(root);
  await assess(root,run,c,a,hash); assert(a.stability && ['stable','variable'].includes(a.stability.status)&&text(a.stability.reason),'Baseline stability observation required');
  references(new Set(a.evidence.map(e=>e.id)),a.stability.evidence,'stability');
  run.baseline=run.best=hash; run.baseline_assessment=run.best_assessment=await observation(root,a); run.phase='loop'; return advance(root,run);
}
export async function end(root,run,reason,detail='') {
  assert(!run.pending,'Resolve pending candidate first'); assert(!run.stop,'Run already stopped');
  assert(['target_reached','plateau','cycle_detected','budget_exhausted','blocked','failed'].includes(reason),'Invalid stop reason');
  if(run.best) await restore(root,run.best);
  run.stop={reason,detail,at:new Date().toISOString(),budget:budget(run),artifact_sha256:run.best}; run.phase='final';
  return {action:'final_e2e',stop:run.stop};
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
  const before=await readJSON(local(root,run.best_assessment));
  const regressions=a.units.filter(u=>{const old=before.units.find(x=>x.obligation_id===u.obligation_id),o=c.obligations.find(x=>x.id===u.obligation_id);return old?.status==='scored'&&o?.required&&o.importance!=='minor'&&(u.status!=='scored'||u.score<old.score);});
  const rank={minor:0,obvious:1,blocking:2};
  const newMajor=a.findings.some(f=>f.severity!=='minor'&&!before.findings.some(old=>old.obligation_id===f.obligation_id&&rank[old.severity]>=rank[f.severity]));
  let decision='inconclusive';
  if(a.gates.some(g=>g.status==='fail')||regressions.length||newMajor||v.forward==='best'||v.reverse==='best') decision='revert';
  else if(a.gates.every(g=>g.status==='pass')&&a.assessor.role==='independent'&&v.forward==='candidate'&&v.reverse==='candidate'&&v.visible_improvement&&hash!==run.best&&budget(run).repair_remaining_ms>0) decision='keep';
  const cycle=run.rounds.some(r=>r.candidate===hash)&&hash!==run.best;
  if(cycle) decision='revert';
  const path=await observation(root,a); const verifyPath=await observation(root,v);
  run.rounds.push({...p,candidate:hash,assessment:path,verification:verifyPath,decision,at:new Date().toISOString(),regressions:regressions.map(x=>x.obligation_id)}); run.pending=null;
  if(decision==='keep') {
    // Carry forward untouched states explicitly; final E2E recaptures the complete scope.
    const covered=new Set(a.covered_states);
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
  return {schema_version:'LoopAssessmentRequest/v0.2',binding:binding(run,c,hash),states:c.states.filter(s=>!run.pending||run.pending.required_states.includes(s.id)),obligations:c.obligations,reference_evidence:c.reference_evidence,runtime_gates:c.runtime_gates,rubric:'references/restore/criteria.md',assessor:{role:'independent',id:null},required_output:'LoopAssessment/v0.2'};
}
export async function finalInput(root,run) {
  assert(run.stop,'Loop must end before E2E'); const c=await contract(root,run);
  if(!run.best) return {schema_version:'FinalEvalRequest/v0.2',status:'incomplete',reason:'No runnable artifact'};
  assert(await treeHash(local(root,'restored'))===run.best,'Final artifact changed');
  const effectiveDeadline=Date.parse(run.started_at)+TIERS[run.tier].minutes*60000+(run.time_exclusions??[]).reduce((sum,x)=>sum+Date.parse(x.end_at)-Date.parse(x.start_at),0);
  return {schema_version:'FinalEvalRequest/v0.2',binding:binding(run,c,run.best),reference_evidence:c.reference_evidence,states:c.states,resources:c.resources??[],obligations:c.obligations.map(({id,state_id,region_id,expected,reference_evidence})=>({id,state_id,region_id,expected,reference_evidence})),start_command:c.start_command,project_path:'restored/',deadline:new Date(effectiveDeadline).toISOString()};
}
export async function recordE2E(root,run,result) {
  assert(run.phase==='final'&&!run.e2e,'Final E2E can be recorded once after loop stop');
  const request=await finalInput(root,run);
  assert(result.schema_version==='E2EResultRef/v0.2'&&canonical(result.binding)===canonical(request.binding??null),'Final result binding mismatch');
  assert(['pass','fail','incomplete'].includes(result.status),'Invalid E2E result');
  if(result.status!=='incomplete') {
    assert(result.scoring_provenance==='independent_evaluator/e2e-v0.2','Independent scorer provenance required');
    assert(result.assessor?.role==='independent'&&result.dimensions?.length===6&&result.redlines?.length===6,'Independent six-dimension result required');
    await verifyEvidence(root,result.evidence);
    assert(result.covered_states?.length>=request.states.length&&request.states.every(s=>result.covered_states.includes(s.id)),'Incomplete E2E coverage');
  }
  if(budget(run).remaining_ms===0) result={...result,status:'incomplete',reason:'E2E result received after deadline'};
  const path=`observations/e2e-${digest(result)}.json`;await writeJSON(local(root,path),result);
  run.e2e={uri:path,sha256:digest(result),status:result.status};run.phase='complete';return run.e2e;
}
