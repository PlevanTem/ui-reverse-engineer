import test from 'node:test';import assert from 'node:assert/strict';
const mod=await import('../geometry.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('region geometry measures element-relative change and never passes missing elements',()=>{
 assert.equal(typeof mod.compareRegionGeometry,'function');const ref={x:100,y:80,width:200,height:100};
 const ok=mod.compareRegionGeometry(ref,{x:104,y:82,width:204,height:100},{position_ratio:0.05,size_ratio:0.05,min_px:2});assert.equal(ok.status,'pass');
 assert.equal(mod.compareRegionGeometry(ref,null).status,'fail');
 assert.equal(mod.compareRegionGeometry(ref,{x:140,y:80,width:200,height:100}).status,'fail');
});
test('different coordinate systems and unknown reference geometry are not comparable',()=>{
 assert.equal(typeof mod.compareRegionGeometry,'function');assert.equal(mod.compareRegionGeometry(null,{x:0,y:0,width:10,height:10}).status,'unknown');
 assert.equal(mod.compareRegionGeometry({x:0,y:0,width:10,height:10},{x:0,y:0,width:10,height:10},{reference_space:'document',candidate_space:'viewport'}).status,'unknown');
 assert.throws(()=>mod.compareRegionGeometry({x:0,y:0,width:0,height:10},{x:0,y:0,width:10,height:10}),/positive|geometry/i);
});
test('capture geometry diagnoses missing/hidden elements and refuses undeclared tolerances or viewport drift',()=>{
 assert.equal(typeof mod.diagnoseCaptureGeometry,'function');
 const c={states:[{id:'home',viewport:{width:800,height:600}}],optimization:{design:{regions:[{id:'hero',state_id:'home',selector:'#hero',coordinate_space:'viewport',reference_box:{x:10,y:10,width:200,height:100},tolerances:{position_ratio:.05,size_ratio:.05,min_px:2}}]}}};
 const cap={states:[{id:'home',facts:{viewport:{width:800,height:600},regions:[{selector:'#hero',missing:false,visible:true,rect:{x:11,y:10,width:200,height:100}}]}}]};
 assert.equal(mod.diagnoseCaptureGeometry(c,cap)[0].status,'pass');cap.states[0].facts.regions[0].visible=false;assert.equal(mod.diagnoseCaptureGeometry(c,cap)[0].status,'fail');
 cap.states[0].facts.viewport.width=400;assert.equal(mod.diagnoseCaptureGeometry(c,cap)[0].status,'unknown');cap.states[0].facts.viewport.width=800;delete c.optimization.design.regions[0].tolerances;assert.equal(mod.diagnoseCaptureGeometry(c,cap)[0].status,'unknown');
});
