// Pre-contract visual reconnaissance; no application source is read or saved.
import playwright from '../../tools/browser/node_modules/playwright-core/index.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {release,platform} from 'node:os';
import {VERSION} from './core.mjs';
const [url,root,side='reference']=process.argv.slice(2);if(!url||!root||!['reference','candidate'].includes(side))throw Error('Usage: node observe-url.mjs URL RUN_DIR [reference|candidate]');
const directory=join(root,'evidence',side);await mkdir(directory,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,args:['--no-sandbox']});
const records=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 for(const [id,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,locale:'ja-JP',deviceScaleFactor:1}),page=await context.newPage(),resources=[],failures=[];context.setDefaultTimeout(15000);
  page.on('response',r=>{const type=r.request().resourceType();if(['image','font','media'].includes(type))resources.push({url:r.url(),status:r.status(),type});});
  page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
  const record={id,viewport,frames:[],resources,failures};records.push(record);
  const targetHost=new URL(url).hostname;
  await context.route('**/*',route=>{const request=route.request();let host;try{host=new URL(request.url()).hostname;}catch{return route.continue();}if(host&&host!==targetHost){failures.push({url:request.url(),error:'observer_target_host_allowlist'});return route.abort('blockedbyclient');}return route.continue();});
  try{
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(8000);
   record.observed_url=page.url();record.title=await page.title();
   await page.mouse.move(viewport.width/2,viewport.height/2);
   record.facts=await page.evaluate(()=>({text:document.body.innerText.slice(0,20000),height:document.documentElement.scrollHeight,scrollable_regions:[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+10&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>({tag:e.tagName,id:e.id,class:e.className,scroll_height:e.scrollHeight,client_height:e.clientHeight,scroll_top:e.scrollTop})),headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent),links:[...document.querySelectorAll('a')].map(e=>({text:e.innerText,url:e.href})).slice(0,60),canvas_count:document.querySelectorAll('canvas').length}));
   const nativeScroll=record.facts.height>viewport.height+10;
   record.scroll_mode=nativeScroll?'document_scroll':'wheel_sampled';record.end_reached='unknown';let wheelCount=0;
   const plans=nativeScroll?[['top',0],['middle',Math.floor(record.facts.height/2)],['footer',record.facts.height]]:[['top',0],['wheel-12',12],['wheel-36',36],['wheel-60',60]];
   for(const [state,y] of plans){
    if(nativeScroll)await page.evaluate(y=>window.scrollTo(0,y),y);
    else while(wheelCount<y){await page.mouse.wheel(0,viewport.height*4);await page.waitForTimeout(200);wheelCount++;}
    await page.waitForTimeout(1200);
    const bytes=await page.screenshot({timeout:15000}),name=`${id}-${state}.png`;await writeFile(join(directory,name),bytes);
    record.frames.push({id:`${id}-${state}`,kind:'screenshot',uri:`evidence/${side}/${name}`,sha256:sha(bytes),scroll_y:await page.evaluate(()=>window.scrollY),wheel_inputs:wheelCount,wheel_delta_y:nativeScroll?null:viewport.height*4,at:new Date().toISOString()});
   }
   if(nativeScroll)await page.evaluate(()=>window.scrollTo(0,0));else{await page.reload({waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(8000);}
   await page.waitForTimeout(600);await page.mouse.wheel(0,viewport.height);
   const sequence=[];let prior=0;
   for(const offset of [0,200,600]){if(offset>prior)await page.waitForTimeout(offset-prior);const bytes=await page.screenshot({timeout:15000}),name=`${id}-scroll-${offset}.png`;await writeFile(join(directory,name),bytes);sequence.push({uri:`evidence/${side}/${name}`,sha256:sha(bytes),requested_offset_ms:offset,at:new Date().toISOString()});prior=offset;}
   const name=`${id}-scroll-sequence.json`,bytes=Buffer.from(JSON.stringify({trigger:{action:'wheel',deltaY:viewport.height},frames:sequence,timing:'wall-clock, screenshot overhead included; not exact replay'},null,2));await writeFile(join(directory,name),bytes);record.frames.push({id:`${id}-scroll`,kind:'sequence',uri:`evidence/${side}/${name}`,sha256:sha(bytes)});
  }catch(error){record.error=error.message;}finally{await context.close();}
 }
}finally{await browser.close();}
const environment={browser:browser.version(),os:`${platform()} ${release()}`,dpr:1,locale:'ja-JP'};
await writeFile(join(directory,'observation.json'),JSON.stringify({url,environment,records},null,2));
if(side==='reference'){
 const evidence=records.flatMap(r=>r.frames.map(({id,kind,uri,sha256})=>({id,kind,uri,sha256})));
 const draft={schema_version:VERSION,requested_url:url,observed_url:records.find(r=>r.observed_url)?.observed_url??url,start_command:'python3 -m http.server 4173 --directory restored',environment,e2e_profile:{rubric_version:'site-restore-v1.2-draft',scorer_version:'e2e/v0.4'},generation_policy:{mode:process.env.RESTORE_SOURCE_POLICY==='source_assisted'?'source_assisted':'fixture_only',case_metadata_visibility:'id_only',source_reuse:process.env.RESTORE_SOURCE_POLICY==='source_assisted'?'allowed':'forbidden'},task_description:null,states:records.filter(r=>r.frames.length).map(r=>({id:`${r.id}-top`,page_id:'target',viewport_id:r.id,path:'.',viewport:r.viewport,ready_selector:'body',regions:['page'],steps:[],sentinel:true})),obligations:[],runtime_gates:[{id:'runnable',description:'Declared entry and states load'},{id:'reachable',description:'Observed journey is reachable by real input'},{id:'unobstructed',description:'Required content and inputs remain usable'}],reference_evidence:evidence,resources:[],unknowns:['Draft scaffold: fill task_description and C1/C2/C3 obligations, and add observed journey states before sealing. Input-sampled scroll checkpoints do not prove the end was reached.',...records.filter(r=>r.error).map(r=>`${r.id}: ${r.error}`)]};
 try{await writeFile(join(root,'contract.json'),JSON.stringify(draft,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
}
console.log(JSON.stringify({observation:join(directory,'observation.json'),states:records.map(r=>({id:r.id,error:r.error??null,evidence:r.frames.map(f=>f.id)}))}));
