import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import * as core from '../core.mjs';
import { validateCaptureStep, executeCaptureStep, validateCaptureReadiness } from '../capture-actions.mjs';
import { CaptureClockIsolation, CAPTURE_CLOCK_MODE } from '../capture-clock.mjs';
import { inspectGltf } from '../inspect-gltf.mjs';
import { capturePlan, selectCaptureStates } from '../capture-plan.mjs';
import { closeCaptureResources } from '../capture-context.mjs';

const captureFactsExpression=await readFile(fileURLToPath(new URL('../capture-page-facts.js',import.meta.url)),'utf8');
const captureFactsFunction=Function(`return (${captureFactsExpression})`)();

async function workspace(t) {
  const root=resolve(await mkdtemp(join(tmpdir(),'restore-capture-'))),base=resolve(tmpdir())+sep;
  t.after(async()=>{assert.ok(root.startsWith(base));await rm(root,{recursive:true,force:true});});
  await core.init(root,'https://example.com/','ordinary');
  await writeFile(join(root,'restored','index.html'),'<h1>fixture</h1>');return root;
}
function fakePage() {
  let time=0;const calls=[];
  const page={waitForTimeout:async ms=>{time+=ms;},reload:async opt=>calls.push(['reload',opt]),locator:()=>({waitFor:async()=>{},boundingBox:async()=>({x:100,y:50,width:200,height:100}),click:async opt=>calls.push(['click',opt])}),
    mouse:{move:async(...v)=>calls.push(['move',...v]),down:async()=>calls.push(['down']),up:async()=>calls.push(['up'])},
    keyboard:{down:async k=>calls.push(['keydown',k]),up:async k=>calls.push(['keyup',k])}};
  return {page,calls,now:()=>time,advance:ms=>{time+=ms;}};
}
test('region facts reject opacity-zero and aria-hidden boxes despite text and area',()=>{
  let opacity='0',aria='true';
  const element={hidden:false,textContent:'Upgrade aircraft',parentElement:null,hasAttribute:()=>false,
    getAttribute:name=>name==='aria-hidden'?aria:null,
    getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,right:800,bottom:600,width:800,height:600})};
  const style={get opacity(){return opacity;},display:'block',visibility:'visible',fontFamily:'sans-serif',fontSize:'16px',color:'rgb(0, 0, 0)',backgroundColor:'rgba(0, 0, 0, 0)'};
  const sandbox={innerWidth:800,innerHeight:600,devicePixelRatio:1,location:{href:'https://fixture.test/'},
    document:{querySelector:()=>element,documentElement:{scrollWidth:800},fonts:{status:'loaded'},images:[],title:'fixture'},
    getComputedStyle:()=>style};
  const collect=runInNewContext(`(${captureFactsExpression})`,sandbox);
  const hidden=collect(['#overlay']).regions[0];
  assert.equal(hidden.text,'Upgrade aircraft');assert.equal(hidden.client_rect.width,800);assert.equal(hidden.intersection.height,600);
  assert.equal(hidden.opacity,0);assert.equal(hidden.aria_hidden,true);assert.equal(hidden.visible,false);
  assert.deepEqual([...hidden.visibility_reasons].sort(),['aria_hidden','opacity_zero']);
  opacity='1';aria='false';const shown=collect(['#overlay']).regions[0];
  assert.equal(shown.opacity,1);assert.equal(shown.aria_hidden,false);assert.equal(shown.visible,true);assert.deepEqual([...shown.visibility_reasons],[]);
});
test('drag is a held trajectory, with samples and no synthetic click',async()=>{
  const f=fakePage(),samples=[];
  const log=await executeCaptureStep(f.page,{action:'drag',selector:'canvas',path:[{x:.25,y:.5,at_ms:0},{x:.75,y:.5,at_ms:100,capture:true}],capture_at_ms:[0,20]},
    {timeout:()=>1000,now:f.now,capture:async(label,timing)=>{samples.push({label,...timing});f.advance(40);return {excluded_wall_ms:40};}});
  assert.deepEqual(f.calls,[['move',150,100],['down'],['move',250,100],['up']]);
  assert.equal(samples.length,3);assert.equal(samples[2].lateness_ms,0);assert.equal(log.samples.length,3);
  assert.equal(log.excluded_capture_ms,120);assert.equal(log.elapsed_ms,120);assert.equal(log.wall_elapsed_ms,240);
});
test('capture clock freezes lifecycle and resumes after excluding screenshot wall time',async()=>{
  let host=0;const calls=[];
  const page={clock:{install:async()=>calls.push('install'),resume:async()=>calls.push('resume')},
    evaluate:async expression=>{assert.equal(typeof expression,'function');calls.push('atomic-pause');return 1234;}};
  const cdp={send:async(command,value)=>calls.push([command,value.state])};
  const context={newCDPSession:async target=>{assert.equal(target,page);calls.push('cdp');return cdp;}};
  const isolation=new CaptureClockIsolation(page,context,{now:()=>host});await isolation.install();
  const result=await isolation.run(async()=>{calls.push('capture');host+=875;return Buffer.from('png');});
  assert.equal(result.value.toString(),'png');
  assert.deepEqual(result.isolation,{mode:CAPTURE_CLOCK_MODE,page_time_ms:1234,excluded_wall_ms:875});
  assert.deepEqual(calls,['install','cdp',['Page.setWebLifecycleState','frozen'],'atomic-pause','capture',['Page.setWebLifecycleState','active'],'resume']);
});
test('capture clock restores lifecycle and timers after screenshot failure',async()=>{
  const calls=[];const page={clock:{install:async()=>{},resume:async()=>calls.push('resume')},evaluate:async()=>42};
  const context={newCDPSession:async()=>({send:async(_command,value)=>calls.push(value.state)})};
  const isolation=new CaptureClockIsolation(page,context);await isolation.install();
  await assert.rejects(()=>isolation.run(async()=>{throw Error('png failed');}),/png failed/);
  assert.deepEqual(calls,['frozen','active','resume']);
});
test('key_hold samples from keydown while held and does not double its active duration',async()=>{
  const f=fakePage(),held=new Set(),samples=[];
  f.page.keyboard={down:async key=>{held.add(key);f.calls.push(['keydown',key]);},up:async key=>{held.delete(key);f.calls.push(['keyup',key]);}};
  const log=await executeCaptureStep(f.page,{action:'key_hold',key:'w',duration_ms:100,capture_at_ms:[0,40,100]},
    {timeout:()=>1000,now:f.now,capture:async(label,timing)=>{samples.push({label,held:held.has('w'),...timing});f.advance(25);return {excluded_wall_ms:25};}});
  assert.deepEqual(samples.map(sample=>[sample.label,sample.held,sample.actual_offset_ms]),[
    ['after-0',true,0],['after-40',true,40],['after-100',true,100]
  ]);
  assert.deepEqual(f.calls.filter(call=>call[0]?.startsWith?.('key')),[['keydown','w'],['keyup','w']]);
  assert.equal(log.input_duration_ms,100);assert.equal(log.elapsed_ms,100);assert.equal(log.wall_elapsed_ms,175);assert.equal(log.excluded_capture_ms,75);
});
test('input is released on time or capture failure',async()=>{
  const f=fakePage();
  await assert.rejects(()=>executeCaptureStep(f.page,{action:'key_hold',key:'w',duration_ms:100},
    {timeout:()=>50,now:f.now,capture:async()=>{}}),/deadline/);
  assert.deepEqual(f.calls,[['keydown','w'],['keyup','w']]);
  await assert.rejects(()=>executeCaptureStep(f.page,{action:'drag',selector:'canvas',path:[{x:0,y:0,at_ms:0,capture:true},{x:1,y:1,at_ms:10}]},
    {timeout:()=>1000,now:f.now,capture:async()=>{throw Error('capture failed');}}),/capture failed/);
  assert.deepEqual(f.calls.at(-1),['up']);
});
test('reload is a first-class capture action and can wait for a post-navigation landmark',async()=>{
  const f=fakePage(),samples=[];
  const log=await executeCaptureStep(f.page,{action:'reload',ready_selector:'#app',capture_at_ms:[0]},
    {timeout:()=>1000,now:f.now,capture:async(label)=>{samples.push(label);return {excluded_wall_ms:0};}});
  assert.deepEqual(f.calls,[['reload',{timeout:1000,waitUntil:'domcontentloaded'}]]);
  assert.deepEqual(samples,['after-0']);assert.equal(log.input_duration_ms,0);
  assert.doesNotThrow(()=>validateCaptureStep({action:'reload',ready_selector:'#app'}));
});
test('invalid gestures and timing are rejected before browser input',()=>{
  for(const step of [
    {action:'drag',selector:'canvas',path:[{x:0,y:0,at_ms:0},{x:1,y:0,at_ms:-1}]},
    {action:'click',selector:'canvas',position:{x:1.1,y:.5}},
    {action:'click',selector:'canvas',capture_at_ms:[100,0]},
    {action:'key_hold',key:'w',duration_ms:100,capture_at_ms:[0,101]},
    {action:'key_hold',key:'w',duration_ms:6000}, {action:'unknown'}
  ]) assert.throws(()=>validateCaptureStep(step));
  assert.throws(()=>validateCaptureReadiness({ready_timeout_ms:Infinity}));
  assert.throws(()=>validateCaptureReadiness({ready_checks:[{selector:'#loading',state:'complete'}]}));
});
test('glTF inspection exposes clips, external references and decoder requirements',()=>{
  const model={asset:{version:'2.0'},extensionsRequired:['KHR_texture_basisu'],buffers:[{uri:'mesh.bin'}],images:[{uri:'wood.ktx2'}],
    accessors:[{min:[0],max:[1.25]}],animations:[{name:'swing',samplers:[{input:0}],channels:[{target:{path:'rotation'}}]}]};
  const json=Buffer.from(JSON.stringify(model)+' '.repeat((4-Buffer.byteLength(JSON.stringify(model))%4)%4));
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bytes=Buffer.concat([header,json]),data=inspectGltf(bytes,'https://example.com/models/axe.glb');
  assert.equal(data.animation_clips[0].name,'swing');assert.deepEqual(data.animation_clips[0].time_ranges,[{min:[0],max:[1.25]}]);
  assert.deepEqual(data.decoder_dependencies,['KHR_texture_basisu']);assert.equal(data.external_dependencies[1].url,'https://example.com/models/wood.ktx2');
  assert.throws(()=>inspectGltf(bytes.subarray(0,-1)),/length/);
});
test('a missing final Judge cannot terminate the Restore loop without scoped evidence',async t=>{
  const root=await workspace(t),run=await core.readJSON(join(root,'run.json'));
  await assert.rejects(()=>core.end(root,run,'blocked','Missing Judge'),/RestoreBlocker/);
  await assert.rejects(()=>core.end(root,run,'blocked','Missing Judge',{schema_version:'RestoreBlocker/v1',scope:'final_e2e'}),/not a Restore Loop blocker/);
  assert.equal(run.stop,null);
  const uri='evidence/blocker.json';await core.writeJSON(join(root,uri),{observed:'fixture browser failed'});
  const ev={id:'failure',kind:'checks',uri,sha256:core.sha(await readFile(join(root,uri)))};
  const blocker={schema_version:'RestoreBlocker/v1',scope:'runtime',reason:'fixture runtime unavailable',evidence:[ev],attempts:[{capability:'fixture browser',status:'failed',reason:'fixture failure',evidence:['failure']}],remaining_work:[{task:'assets',status:'pending',reason:'still possible',evidence:['failure']}]};
  await assert.rejects(()=>core.end(root,run,'blocked','runtime',blocker),/Finish unaffected work/);
  blocker.remaining_work[0].status='blocked';
  await core.end(root,run,'blocked','runtime',blocker);assert.equal(run.stop.blocker.scope,'runtime');
  assert.equal(core.digest(await core.readJSON(join(root,run.stop.blocker.uri))),run.stop.blocker.sha256);
  const progress=await core.progress(root,run);assert.equal(progress.budget_basis,'loop_stop');
  assert.equal(progress.budget.elapsed_ms,core.budget(run,Date.parse(run.stop.at)).elapsed_ms);
});
test('progress is a read-only snapshot; capture plan honors excluded time',async t=>{
  const root=await workspace(t),run=await core.readJSON(join(root,'run.json'));
  const before=await readFile(join(root,'events.jsonl'),'utf8');
  const status=await core.progress(root,run);assert.equal(status.stage,'discovery');assert.equal(status.version_count,0);assert.equal(status.round_limit,3);assert.deepEqual(status.static_checks,{suite_count:0,latest:null});assert.equal(await readFile(join(root,'events.jsonl'),'utf8'),before);
  run.started_at=new Date(Date.now()-31*60000).toISOString();
  run.time_exclusions=[{start_at:new Date(Date.now()-20*60000).toISOString(),end_at:new Date(Date.now()-10*60000).toISOString()}];
  await core.writeJSON(join(root,'run.json'),run);
  const plan=await capturePlan(root,'candidate');assert.ok(plan.deadline_ms>Date.now()+5*60000);assert.equal(plan.binding.artifact_sha256,await core.treeHash(join(root,'restored')));
});

test('shared capture sessions are explicit, storage-clean and viewport-stable',async t=>{
  const root=await workspace(t),c=await core.readJSON(join(root,'contract.json'));
  const base={page_id:'home',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_selector:'body',regions:['scene'],steps:[]};
  c.states=[{...base,id:'earn',session_id:'full-progression'},{...base,id:'spend',session_id:'full-progression'}];
  await core.writeJSON(join(root,'contract.json'),c);
  let plan=await capturePlan(root,'candidate');assert.deepEqual(plan.states.map(s=>s.session_id),['full-progression','full-progression']);
  c.states[1].storage_state='evidence/injected.json';await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>capturePlan(root,'candidate'),/cannot preload storage_state/);
  delete c.states[1].storage_state;c.states[1].viewport={width:844,height:390};await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>capturePlan(root,'candidate'),/must keep one viewport and color scheme/);
  c.states[1].viewport=base.viewport;c.states[1].color_scheme='dark';await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>capturePlan(root,'candidate'),/must keep one viewport and color scheme/);
  delete c.states[1].color_scheme;c.states[1].session_id='../escape';await core.writeJSON(join(root,'contract.json'),c);
  await assert.rejects(()=>capturePlan(root,'candidate'),/stable 1-64 character identifier/);
});

test('candidate pending capture closes over the ordered shared-session prefix',()=>{
  const states=[
    {id:'intro'},
    {id:'earn-plane',session_id:'progression'},
    {id:'earn-carpet',session_id:'progression'},
    {id:'earn-boat',session_id:'progression'},
    {id:'victory',session_id:'progression'},
    {id:'isolated'}
  ];
  assert.deepEqual(selectCaptureStates(states,{required_states:['earn-boat']},'candidate').map(s=>s.id),
    ['earn-plane','earn-carpet','earn-boat']);
  assert.deepEqual(selectCaptureStates(states,{required_states:['isolated']},'candidate').map(s=>s.id),['isolated']);
  assert.equal(selectCaptureStates(states,{required_states:['victory']},'reference'),states);
});

test('cleanup attempts context close even when page close fails',async()=>{
  const calls=[];
  const page={close:async()=>{calls.push('page');throw Error('page failed');}};
  const context={close:async()=>{calls.push('context');throw Error('context failed');}};
  assert.deepEqual(await closeCaptureResources(page,context,true),['page.close: page failed','context.close: context failed']);
  assert.deepEqual(calls,['page','context']);
});

async function command(exe,args,env={}) {
  return new Promise((done,reject)=>{
    const p=spawn(exe,args,{windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',...env}});let out='',err='';
    const timer=setTimeout(()=>{p.kill();reject(Error('Fixture capture timed out'));},60000);
    p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e);});
    p.on('close',code=>{clearTimeout(timer);code?reject(Error(`capture exit ${code}: ${err}`)):done(out);});
  });
}
async function commandOutcome(exe,args,env={}) {
  return new Promise((done,reject)=>{
    const p=spawn(exe,args,{windowsHide:true,env:{...process.env,...env}});let out='',err='';
    const timer=setTimeout(()=>{p.kill();reject(Error('Fixture capture timed out'));},30000);
    p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e);});
    p.on('close',code=>{clearTimeout(timer);done({code,out,err});});
  });
}

test('node adapter records setup failure and closes acquired resources',async t=>{
  const root=await workspace(t),c=await core.readJSON(join(root,'contract.json'));
  const state={page_id:'home',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_selector:'body',regions:['scene'],steps:[],session_id:'progression'};
  c.states=[{...state,id:'setup-failure'},{...state,id:'dependent'}];
  await core.writeJSON(join(root,'contract.json'),c);
  const marker=join(root,'close-marker.txt'),fake=join(root,'fake-playwright.mjs'),output=join(root,'setup-failure.json');
  await writeFile(fake,`import {appendFile} from 'node:fs/promises';
const mark=value=>appendFile(process.env.CAPTURE_FAKE_MARKER,value+'\\n');
export const chromium={launch:async()=>({version:()=> 'fixture',newContext:async()=>({newPage:async()=>{throw Error('new page failed')},close:async()=>{await mark('context');throw Error('context close failed')}}),close:async()=>mark('browser')})};`);
  const outcome=await commandOutcome(process.execPath,[fileURLToPath(new URL('../capture.mjs',import.meta.url)),root,'candidate','http://fixture.invalid/',output],
    {RESTORE_PLAYWRIGHT_MODULE:fake,CAPTURE_FAKE_MARKER:marker});
  assert.equal(outcome.code,1);
  const captured=await core.readJSON(output);assert.equal(captured.coverage.length,0);assert.equal(captured.failures.length,2);
  const diagnostic=await core.readJSON(join(root,captured.failures[0].diagnostic_uri));
  assert.equal(diagnostic.phase,'setup');assert.match(diagnostic.reason,/new page failed/);assert.match(diagnostic.reason,/context\.close: context close failed/);
  assert.deepEqual(diagnostic.cleanup_errors,['context.close: context close failed']);
  assert.equal(captured.evidence[0].sha256,core.sha(await readFile(join(root,captured.failures[0].diagnostic_uri))));
  const dependent=await core.readJSON(join(root,captured.failures[1].diagnostic_uri));
  assert.equal(dependent.phase,'prerequisite');assert.match(dependent.reason,/setup-failure: new page failed/);
  assert.deepEqual((await readFile(marker,'utf8')).trim().split(/\r?\n/),['context','browser']);
});
test('installed clock survives navigation, readiness wait and repeated frozen screenshots through both adapters',
  {skip:!process.env.RESTORE_CAPTURE_PYTHON},async t=>{
    const root=await workspace(t);
    const html=`<!doctype html><style>body{margin:0}canvas{width:400px;height:250px;touch-action:none}.hidden-overlay{position:fixed;inset:0;opacity:0;pointer-events:none}</style><div id="loading">Loading assets</div><canvas width="400" height="250"></canvas><output>rotation=0 pieces=1 held=0</output><div id="hidden-overlay" class="hidden-overlay" aria-hidden="true">Upgrade aircraft</div><script>
      const c=document.querySelector('canvas'),o=document.querySelector('output'),g=c.getContext('2d');let down=false,moved=false,rotation=0,pieces=1,start=0,held=false;
      function draw(){g.fillStyle=held?'#641':'#164';g.fillRect(0,0,400,250);g.fillStyle='#fc8';g.fillRect(100+rotation,60,120/pieces,100);o.textContent='rotation='+rotation+' pieces='+pieces+' held='+(held?1:0);}
      c.onpointerdown=e=>{down=true;moved=false;start=e.clientX;c.setPointerCapture(e.pointerId)};
      c.onpointermove=e=>{if(down){rotation=Math.round(e.clientX-start);moved=moved||Math.abs(rotation)>5;draw()}};
      c.onpointerup=()=>{down=false;if(!moved){pieces++;draw();setTimeout(()=>{g.fillStyle='#eee';g.fillRect(0,0,20,20)},80)}};
      addEventListener('keydown',e=>{if(e.key.toLowerCase()==='w'){held=true;draw()}});addEventListener('keyup',e=>{if(e.key.toLowerCase()==='w'){held=false;draw()}});
      draw();fetch('/asset.gltf');setTimeout(()=>document.getElementById('loading').remove(),150);</script>`;
    await writeFile(join(root,'restored','index.html'),html);
    const asset=JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[]}]});
    const server=createServer((req,res)=>req.url==='/asset.gltf'?res.writeHead(200,{'content-type':'model/gltf+json'}).end(asset):res.writeHead(200,{'content-type':'text/html'}).end(html));
    await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
    const url=`http://127.0.0.1:${server.address().port}/`;
    const c=await core.readJSON(join(root,'contract.json'));c.observed_url=url;c.start_command='fixture server';
    c.states=[{id:'play',page_id:'play',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_selector:'canvas',ready_timeout_ms:5000,ready_checks:[{selector:'#loading',state:'hidden'}],regions:['scene'],sentinel:true,steps:[
      {action:'drag',selector:'canvas',path:[{x:.25,y:.5,at_ms:0},{x:.75,y:.5,at_ms:100,capture:true}]},
      {action:'key_hold',key:'w',duration_ms:240,capture_at_ms:[0,120,240]},
      {action:'click',selector:'canvas',position:{x:.5,y:.5},capture_at_ms:[0,120,300]}
    ],selectors:['output','#loading','#hidden-overlay']}];await core.writeJSON(join(root,'contract.json'),c);
    const py=fileURLToPath(new URL('../capture.py',import.meta.url)),out=join(root,'reference-capture.json');
    await command(process.env.RESTORE_CAPTURE_PYTHON,[py,root,'reference',url,out]);
    const ref=await core.readJSON(out);assert.equal(ref.failures.length,0);assert.equal(ref.states[0].facts.regions[0].text,'rotation=200 pieces=2 held=0');
    assert.equal(ref.states[0].facts.regions[1].missing,true);assert.equal(ref.states[0].facts.regions[1].visible,false);
    const hiddenOverlay=ref.states[0].facts.regions[2];assert.equal(hiddenOverlay.text,'Upgrade aircraft');assert.ok(hiddenOverlay.client_rect.width>0);assert.equal(hiddenOverlay.opacity,0);assert.equal(hiddenOverlay.aria_hidden,true);assert.equal(hiddenOverlay.visible,false);
    assert.equal(ref.states[0].frames.length,9);assert.equal(ref.states[0].actions.length,3);
    assert.equal(ref.states[0].clock_isolation.mode,CAPTURE_CLOCK_MODE);assert.ok(ref.states[0].clock_isolation.excluded_capture_ms>0);
    assert.ok(ref.states[0].frames.every(frame=>frame.clock_isolation?.mode===CAPTURE_CLOCK_MODE));
    for(const sample of ref.states[0].actions[1].samples) assert.ok(Math.abs(sample.actual_offset_ms-sample.scheduled_ms)<80);
    assert.ok(Math.abs(ref.states[0].actions[1].elapsed_ms-240)<80);assert.ok(ref.states[0].actions[1].wall_elapsed_ms>=ref.states[0].actions[1].elapsed_ms);
    assert.notEqual(ref.evidence[0].sha256,ref.evidence.find(e=>e.id.endsWith('step-2-after-300')).sha256);
    c.environment=ref.environment;c.reference_evidence=ref.evidence;
    c.obligations=['C1','C2','C3'].map((criterion_id,i)=>({id:'o'+i,criterion_id,state_id:'play',region_id:'scene',expected:'fixture visual and action response',method:'fixture capture',importance:'obvious',required:true,target:3,applicability:'applicable',reference_evidence:[ref.evidence.find(e=>e.kind===(i===2?'sequence':'screenshot')).id]}));
    await core.writeJSON(join(root,'contract.json'),c);await core.locked(root,'freeze',r=>core.freeze(root,r));
    const candidate=join(root,'python-candidate.json');await command(process.env.RESTORE_CAPTURE_PYTHON,[py,root,'candidate',url,candidate]);
    const captured=await core.readJSON(candidate);assert.equal(captured.binding.contract_sha256,core.digest(c));assert.equal(captured.binding.artifact_sha256,await core.treeHash(join(root,'restored')));
    if(process.env.RESTORE_PLAYWRIGHT_MODULE) {
      const nodeOut=join(root,'node-candidate.json');await command(process.execPath,[fileURLToPath(new URL('../capture.mjs',import.meta.url)),root,'candidate',url,nodeOut]);
      const node=await core.readJSON(nodeOut);assert.equal(node.failures.length,0);assert.deepEqual(node.binding,captured.binding);assert.equal(node.states[0].facts.regions[0].text,'rotation=200 pieces=2 held=0');assert.equal(node.states[0].frames.length,9);assert.equal(node.states[0].clock_isolation.mode,CAPTURE_CLOCK_MODE);assert.ok(Math.abs(node.states[0].actions[1].elapsed_ms-240)<80);assert.equal(node.states[0].facts.regions[2].visible,false);
    }
    const assetUrl=new URL('asset.gltf',url).href;
    assert.ok(ref.states[0].resources.some(r=>r.url===assetUrl&&r.status===200));
    const selection=join(root,'selection.json');await core.writeJSON(selection,[{url:assetUrl,region:'scene',role:'fixture model',max_bytes:1024}]);
    const collector=fileURLToPath(new URL('../collect-assets.mjs',import.meta.url));
    await command(process.execPath,[collector,root,out,selection]);
    let map=await core.readJSON(join(root,'asset-map.json'));assert.equal(map.items[0].status,'available');assert.equal(map.items[0].sha256,core.sha(Buffer.from(asset)));
    const diagnostic='evidence/fixture-failure.json';await core.writeJSON(join(root,diagnostic),{resources:ref.states[0].resources,reason:'fixture state unavailable'});
    const failedCapture=join(root,'failed-capture.json');await core.writeJSON(failedCapture,{side:'reference',states:[],failures:[{diagnostic_uri:diagnostic}],evidence:[{id:'failure',kind:'checks',uri:diagnostic,sha256:core.sha(await readFile(join(root,diagnostic)))}]});
    await command(process.execPath,[collector,root,failedCapture,selection]);
    assert.equal((await core.readJSON(join(root,'asset-map.json'))).items[0].status,'available');
    const inventory=join(root,'inventory.json');await core.writeJSON(inventory,{pageUrl:url,assets:[{url:assetUrl,sources:[{kind:'resource'}]}]});
    await command(process.execPath,[collector,root,inventory,selection]);
    map=await core.readJSON(join(root,'asset-map.json'));assert.equal(map.items[0].status,'available');
    await core.writeJSON(selection,[{url:assetUrl,region:'scene',role:'fixture model',max_bytes:1}]);
    await command(process.execPath,[collector,root,inventory,selection]);
    assert.equal((await core.readJSON(join(root,'asset-map.json'))).items[0].status,'unavailable');
    await writeFile(join(root,'contract.json'),JSON.stringify({...c,observed_url:'https://tampered.example/'}));
    await assert.rejects(()=>capturePlan(root,'candidate'),/Frozen contract changed/);
  });

test('real browser shared session carries earned storage while the next default state stays clean',
  {skip:!process.env.RESTORE_CAPTURE_PYTHON},async t=>{
    const root=await workspace(t);
    const html=`<!doctype html><button id="set">earn</button><script>
      document.querySelector('#set').onclick=()=>localStorage.setItem('progress','earned');
      document.body.insertAdjacentHTML('beforeend',localStorage.getItem('progress')?'<div id="seen">earned</div>':'<div id="fresh">fresh</div>');
    </script>`;
    const server=createServer((_req,res)=>res.writeHead(200,{'content-type':'text/html'}).end(html));
    await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
    const url=`http://127.0.0.1:${server.address().port}/`,c=await core.readJSON(join(root,'contract.json'));
    const state={page_id:'home',viewport_id:'desktop',path:'/',viewport:{width:800,height:600},ready_timeout_ms:5000,regions:['scene'],selectors:['body'],sentinel:true};
    c.observed_url=url;c.states=[
      {...state,id:'earn',ready_selector:'#set',session_id:'progression',steps:[{action:'click',selector:'#set'},{action:'reload',ready_selector:'#seen'}]},
      {...state,id:'reuse',ready_selector:'#seen',session_id:'progression',steps:[]},
      {...state,id:'isolated',ready_selector:'#fresh',steps:[]}
    ];await core.writeJSON(join(root,'contract.json'),c);
    const py=fileURLToPath(new URL('../capture.py',import.meta.url)),out=join(root,'shared-session.json');
    await command(process.env.RESTORE_CAPTURE_PYTHON,[py,root,'reference',url,out]);
    const capture=await core.readJSON(out);assert.equal(capture.failures.length,0);assert.deepEqual(capture.coverage,['earn','reuse','isolated']);
    assert.equal(capture.states[0].session_id,'progression');assert.equal(capture.states[1].session_id,'progression');assert.equal(capture.states[2].session_id,null);
    assert.match(capture.states[1].facts.regions[0].text,/earned/);assert.match(capture.states[2].facts.regions[0].text,/fresh/);
  });

test('real browser key_hold keeps the key down at mid-sample without doubling active time',
  {skip:!process.env.RESTORE_PLAYWRIGHT_MODULE},async()=>{
    const {chromium}=await import(pathToFileURL(resolve(process.env.RESTORE_PLAYWRIGHT_MODULE)).href);
    const browser=await chromium.launch({headless:true});
    try {
      const context=await browser.newContext(),page=await context.newPage();
      const clock=new CaptureClockIsolation(page,context);await clock.install();
      await page.goto(`data:text/html,<script>window.held=false;addEventListener('keydown',e=>{if(e.key==='w')held=true});addEventListener('keyup',e=>{if(e.key==='w')held=false})</script>`);
      const samples=[];
      const log=await executeCaptureStep(page,{action:'key_hold',key:'w',duration_ms:300,capture_at_ms:[0,150,300]},
        {timeout:()=>5000,capture:async(label,timing)=>{
          const held=await page.evaluate(()=>window.held);
          const result=await clock.run(async()=>{const png=await page.screenshot();await new Promise(done=>setTimeout(done,60));return png;});
          samples.push({label,held,...timing});return result.isolation;
        }});
      assert.deepEqual(samples.map(sample=>sample.held),[true,true,true]);
      assert.equal(await page.evaluate(()=>window.held),false);
      assert.ok(Math.abs(log.elapsed_ms-300)<80,`active elapsed ${log.elapsed_ms}`);
      assert.ok(log.excluded_capture_ms>=180,`excluded ${log.excluded_capture_ms}`);
      assert.ok(log.wall_elapsed_ms>=log.elapsed_ms+150,`wall ${log.wall_elapsed_ms}`);
      await context.close();
    } finally {await browser.close();}
  });

test('real browser region visibility flips only after opacity and aria state become visible',
  {skip:!process.env.RESTORE_PLAYWRIGHT_MODULE},async()=>{
    const {chromium}=await import(pathToFileURL(resolve(process.env.RESTORE_PLAYWRIGHT_MODULE)).href);
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:800,height:600}});
      await page.setContent(`<style>#overlay{position:fixed;inset:0;opacity:0}#overlay.shown{opacity:1}</style><div id="overlay" aria-hidden="true">Upgrade aircraft</div>`);
      const hidden=(await page.evaluate(captureFactsFunction,['#overlay'])).regions[0];
      assert.equal(hidden.text,'Upgrade aircraft');assert.ok(hidden.client_rect.width>0);assert.ok(hidden.intersection.height>0);
      assert.equal(hidden.opacity,0);assert.equal(hidden.aria_hidden,true);assert.equal(hidden.visible,false);
      await page.locator('#overlay').evaluate(element=>{element.classList.add('shown');element.setAttribute('aria-hidden','false');});
      const shown=(await page.evaluate(captureFactsFunction,['#overlay'])).regions[0];
      assert.equal(shown.opacity,1);assert.equal(shown.aria_hidden,false);assert.equal(shown.visible,true);
    } finally {await browser.close();}
  });
