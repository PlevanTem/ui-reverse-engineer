import test from 'node:test';
import assert from 'node:assert/strict';
const opt=await import('../optimization.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
function fixture(){
 const c={states:[{id:'ready',regions:['scene']}],resources:[{id:'wood',kind:'model',uri:'assets-cached/wood.glb',sha256:'a'.repeat(64)}],obligations:[{id:'layout',state_id:'ready',region_id:'scene',required:true,applicability:'applicable'}],reference_evidence:[{id:'frame',kind:'screenshot'},{id:'motion',kind:'sequence'},{id:'source',kind:'source'}],generation_policy:{mode:'source_assisted'}};
 c.optimization={schema_version:'RestoreOptimization/v1',preparation:{coverage:[{id:'scope-ready',kind:'state',state_id:'ready',required:true,status:'observed',evidence:['frame']}],unknowns:[],resource_layout:{profile:'game_3d',asset_root:'asset/',category_paths:{font:'font/',model:'model/'}}},design:{tokens:[{id:'bg',type:'color',value:'#444444',status:'observed',evidence:['frame']}],regions:[{id:'scene',state_id:'ready',coordinate_space:'viewport',reference_box:{x:0,y:0,width:800,height:600},status:'observed',evidence:['frame']}]},plan:[{id:'scene-build',summary:'Load observed scene',state_ids:['ready'],region_ids:['scene'],resource_ids:['wood'],depends_on:[],priority:'P0',acceptance_refs:['layout']}],behavior:{variables:[{id:'progress',initial:0,min:0,max:1}],transitions:[{id:'split',state_id:'ready',from:'ready',to:'ready',event:'split.requested',guard:{op:'lt',variable_id:'progress',value:1},updates:[{variable_id:'progress',op:'add',value:1}],status:'observed',evidence:['motion']}],tracks:[],invariants:[]},audio:{required:false,cues:[]},verification:{protocol:'blind/v1'}};
 return c;
}
test('optimization validates linked specifications and flexible engine resource roots',()=>{
 assert.equal(typeof opt.validateOptimization,'function');const c=fixture();assert.doesNotThrow(()=>opt.validateOptimization(c));
 c.optimization.preparation.resource_layout={profile:'game_2d',asset_root:'res/',category_paths:{font:'fonts/',map:'levels/'}};assert.doesNotThrow(()=>opt.validateOptimization(c));
 c.optimization.preparation.resource_layout={profile:'existing_game',asset_root:'.',category_paths:{font:'fonts/',model:'assets/',decoder:'vendor/three/libs/'}};assert.doesNotThrow(()=>opt.validateOptimization(c));
 c.optimization.preparation.resource_layout.asset_root='../outside';assert.throws(()=>opt.validateOptimization(c),/relative|outside|path/i);
});
test('required resource coverage is checked and inherited even when no plan or cue lists it',async t=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');const root=await mkdtemp(join(tmpdir(),'opt-required-')),dest=await mkdtemp(join(tmpdir(),'opt-inherit-'));t.after(async()=>{await rm(root,{recursive:true,force:true});await rm(dest,{recursive:true,force:true});});
 const c=fixture(),hash=s=>createHash('sha256').update(s).digest('hex');await mkdir(join(root,'assets-cached'));await writeFile(join(root,'assets-cached/wood.glb'),'wood');c.resources[0].sha256=hash('wood');
 c.resources.push({id:'extra',kind:'model',uri:'assets-cached/extra.glb',sha256:hash('extra')});c.optimization.preparation.coverage.push({id:'required-extra',kind:'resource',resource_id:'extra',required:true,status:'observed',evidence:['frame']});
 assert.equal((await opt.checkPreparation(root,c)).status,'blocked');await writeFile(join(root,'assets-cached/extra.glb'),'extra');assert.equal((await opt.checkPreparation(root,c)).status,'ready');await opt.copyOptimizationResources(root,dest,c);assert.equal(await readFile(join(dest,'assets-cached/extra.glb'),'utf8'),'extra');
});
test('managed controller and mutable artifact paths are rejected during initial preparation',async t=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname}=await import('node:path'),{createHash}=await import('node:crypto');const root=await mkdtemp(join(tmpdir(),'opt-managed-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const uri of ['run.json','restored/model.glb','snapshots/model.glb','observations/model.glb']){const c=fixture();c.resources[0].uri=uri;c.resources[0].sha256=createHash('sha256').update('fixture').digest('hex');await mkdir(dirname(join(root,uri)),{recursive:true});await writeFile(join(root,uri),'fixture');const summary=await opt.checkPreparation(root,c);assert.equal(summary.status,'blocked',uri);assert.match(summary.issues[0].reason,/managed|cache|reserved/i);}
});
test('acceptance references must belong to the task state and region scope',()=>{
 const c=fixture();c.states.push({id:'split',regions:['scene']});c.optimization.design.regions.push({...c.optimization.design.regions[0],state_id:'split'});c.optimization.preparation.coverage.push({id:'split',kind:'state',state_id:'split',required:true,status:'observed',evidence:['motion']});c.obligations.push({id:'split-layout',state_id:'split',region_id:'scene',required:true,applicability:'applicable'});c.optimization.plan[0].acceptance_refs.push('split-layout');assert.throws(()=>opt.validateOptimization(c),/scope|state|region/i);
});
test('resource identity and generation eligibility remain closed across the plan projection',()=>{
 let c=fixture();c.resources.push({...c.resources[0]});assert.throws(()=>opt.validateOptimization(c),/unique|resource/i);
 c=fixture();c.resources[0].evaluation_only=true;assert.throws(()=>opt.validateOptimization(c),/resource|generation/i);
 c=fixture();c.resources[0].kind='source_code';assert.throws(()=>opt.validateOptimization(c),/resource|generation/i);
});
test('plan coverage and bounded typed behavior cannot silently omit required work',()=>{
 let c=fixture();c.obligations.push({id:'required-motion',required:true});assert.throws(()=>opt.validateOptimization(c),/scope|obligation/i);
 c=fixture();c.optimization.design.regions=[];assert.throws(()=>opt.validateOptimization(c),/region|scope/i);
 for(const logical of ['ready',['ready','ready']]){c=fixture();c.optimization.behavior.logical_states=logical;assert.throws(()=>opt.validateOptimization(c),/logical/i);}
 c=fixture();c.optimization.behavior.transitions[0].updates[0]={variable_id:'progress',op:'set',value:'wrong-type'};assert.throws(()=>opt.validateOptimization(c),/type|update/i);
});
test('required scope and critical unknowns cannot silently freeze as ready',()=>{
 assert.equal(typeof opt.preparationSummary,'function');const c=fixture();assert.equal(opt.preparationSummary(c).status,'ready');
 c.optimization.preparation.coverage[0].status='unknown';assert.equal(opt.preparationSummary(c).status,'blocked');
 c.optimization.preparation.coverage[0].status='observed';c.optimization.preparation.unknowns=[{id:'reset',blocking:true,reason:'Reset not observed'}];assert.equal(opt.preparationSummary(c).status,'blocked');
 c.optimization.preparation.unknowns[0].blocking=false;assert.equal(opt.preparationSummary(c).status,'limited');
 c.optimization.preparation.coverage=[];assert.throws(()=>opt.validateOptimization(c),/coverage|state/i);
});
test('invalid dependency graphs, references and unbounded expressions are rejected',()=>{
 assert.equal(typeof opt.validateOptimization,'function');let c=fixture();c.optimization.plan[0].depends_on=['scene-build'];assert.throws(()=>opt.validateOptimization(c),/cycle/i);
 c=fixture();c.optimization.behavior.transitions[0].guard={op:'eval',code:'arbitrary()'};assert.throws(()=>opt.validateOptimization(c),/guard|operator|expression/i);
 c=fixture();c.optimization.audio={required:true,cues:[{id:'hit',state_id:'ready',resource_id:'missing',trigger:'split.completed',loop:false,overlap:'ignore',reset:'stop',status:'observed',evidence:['motion']}]};assert.throws(()=>opt.validateOptimization(c),/resource/i);
});
test('projection recursively allowlists fields and applies fixture-only evidence boundaries',()=>{
 assert.equal(typeof opt.projectOptimization,'function');const c=fixture();c.optimization.design.regions[0].source_code='PRIVATE SOURCE';c.optimization.design.tokens[0].judge_score=4;
 let p=opt.projectOptimization(c);assert.ok(!JSON.stringify(p).includes('PRIVATE SOURCE'));assert.equal(p.design.tokens[0].judge_score,undefined);
 delete c.optimization.design.regions[0].source_code;delete c.optimization.design.tokens[0].judge_score;
 c.optimization.design.tokens[0].evidence=['source'];c.generation_policy.mode='fixture_only';assert.throws(()=>opt.validateOptimization(c),/source|fixture/i);
 p=opt.projectOptimization(c);assert.deepEqual(p.design.tokens[0].evidence,[]);assert.equal(p.design.tokens[0].status,'unknown');
 const nested=fixture();nested.optimization.behavior.transitions[0].guard={op:'and',args:[{op:'lt',variable_id:'progress',value:1}],value:{source_code:'PRIVATE'}};
 assert.ok(!JSON.stringify(opt.projectOptimization(nested)).includes('PRIVATE'));assert.throws(()=>opt.validateOptimization(nested),/guard|expression/i);
});
test('region identity is state × region, allowing the same component across states',()=>{
 const c=fixture();c.states.push({id:'split',regions:['scene']});c.optimization.preparation.coverage.push({id:'split-scope',kind:'state',state_id:'split',required:true,status:'observed',evidence:['motion']});
 c.optimization.design.regions.push({...c.optimization.design.regions[0],state_id:'split'});assert.doesNotThrow(()=>opt.validateOptimization(c));
 c.optimization.design.regions.push({...c.optimization.design.regions[0]});assert.throws(()=>opt.validateOptimization(c),/region|unique/i);
});
test('core freeze enforces preparation and projects the versioned extension',async t=>{
 const core=await import('../core.mjs');const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'restore-opt-'));t.after(()=>rm(root,{recursive:true,force:true}));await core.init(root,'https://example.com');
 const c={...await core.readJSON(join(root,'contract.json')),...fixture(),schema_version:'restore/v0.2',requested_url:'https://example.com',observed_url:'https://example.com',start_command:'open index.html',environment:{browser:'test',os:'test',dpr:1,locale:'en-US'},generation_policy:{mode:'source_assisted',source_reuse:'allowed',case_metadata_visibility:'id_only'}};
 c.task_description={title:'Observed optimized task',scenario:'Interactive scene',user_intent:null,description:'Restore the observed scene within the frozen state scope.',evidence_refs:['frame']};
 c.states[0]={...c.states[0],page_id:'home',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_selector:'body',steps:[],sentinel:true};
 c.obligations=['C1','C2','C3'].map((criterion_id,i)=>({id:i===0?'layout':criterion_id,criterion_id,state_id:'ready',region_id:'scene',expected:'Synthetic fixture',method:'synthetic',importance:'obvious',required:true,target:3,applicability:'applicable',reference_evidence:[i===2?'motion':'frame']}));
 c.optimization.plan[0].acceptance_refs=c.obligations.map(o=>o.id);
 await mkdir(join(root,'assets-cached'));await writeFile(join(root,'assets-cached','wood.glb'),'fixture');c.resources[0].sha256=core.sha('fixture');
 for(const e of c.reference_evidence){e.uri='evidence/'+e.id+'.json';e.sha256=core.sha('{}');await writeFile(join(root,e.uri),'{}');}
 c.optimization.preparation.coverage[0].status='unknown';await assert.rejects(()=>core.validateContract(root,c),/preparation|scope|ready/i);
 c.optimization.preparation.coverage[0].status='observed';await core.writeJSON(join(root,'contract.json'),c);await core.locked(root,'freeze',r=>core.freeze(root,r));
 const input=await core.generationInput(root,await core.readJSON(join(root,'run.json')));assert.equal(input.schema_version,'RestoreGenerationInput/v2');assert.equal(input.optimization.plan[0].id,'scene-build');assert.deepEqual(input.task_description,c.task_description);
 await writeFile(join(root,'assets-cached','wood.glb'),'changed');await assert.rejects(async()=>core.generationInput(root,await core.readJSON(join(root,'run.json'))),/resource|hash|preparation/i);
});
