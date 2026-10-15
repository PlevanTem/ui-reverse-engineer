#!/usr/bin/env node
// Optional Playwright adapter. No browser/package installation is performed here.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { randomUUID } from 'node:crypto';
import { assert, readJSON, writeJSON, local, sha, digest, treeHash, binding, contract, budget } from './core.mjs';

const [directory,side,baseURL,output]=process.argv.slice(2);
let browser;
try {
  assert(directory&&['reference','candidate'].includes(side)&&/^https?:\/\//.test(baseURL??'')&&output,'Usage: node scripts/restore/capture.mjs RUN reference|candidate BASE_URL output.json');
  const root=resolve(directory),run=await readJSON(join(root,'run.json'));
  const c=run.contract_sha256?await contract(root,run):await readJSON(join(root,'contract.json'));
  const mod=process.env.RESTORE_PLAYWRIGHT_MODULE;
  const {chromium}=await import(mod?pathToFileURL(resolve(mod)).href:'playwright').catch(()=>{throw new Error('Install Playwright in the host tooling environment or set RESTORE_PLAYWRIGHT_MODULE to its entry module; browser capture remains unavailable until configured');});
  const time=budget(run); assert(time.remaining_ms>0,'Run deadline exhausted');
  const limit=Date.now()+(run.stop?time.remaining_ms:Math.min(time.remaining_ms,time.repair_remaining_ms));
  const remaining=()=>{const n=limit-Date.now();assert(n>0,'Capture deadline exhausted');return Math.min(n,30000);};
  browser=await chromium.launch({headless:true,timeout:remaining()});
  const environment={browser:browser.version(),os:platform()+' '+release(),dpr:c.environment.dpr,locale:c.environment.locale};
  if(run.contract_sha256)assert(digest(environment)===digest(c.environment),'Capture environment differs from frozen environment');
  const b=side==='candidate'?binding(run,c,await treeHash(local(root,'restored'))):null;
  const states=c.states.filter(s=>!run.pending||side==='reference'||run.pending.required_states.includes(s.id));
  const result={schema_version:'Capture/v0.2',side,binding:b,environment,evidence:[],states:[],coverage:[],failures:[]};
  for(const state of states) {
    remaining(); const context=await browser.newContext({viewport:state.viewport,deviceScaleFactor:environment.dpr,locale:environment.locale,colorScheme:state.color_scheme??'light',reducedMotion:'no-preference',storageState:state.storage_state?local(root,state.storage_state):undefined});
    const page=await context.newPage(), errors=[],resources=[],frames=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>resources.push({url:r.url(),status:r.status(),type:r.request().resourceType()}));
    const id=`${side}-${state.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-${randomUUID()}`;
    async function capture(label) {
      const uri=`evidence/${id}-${label}.png`,bytes=await page.screenshot({fullPage:false,animations:'allow',timeout:remaining()});
      await mkdir(local(root,'evidence'),{recursive:true});
      const {writeFile}=await import('node:fs/promises');await writeFile(local(root,uri),bytes);
      const item={id:id+'-'+label,uri,sha256:sha(bytes),kind:'screenshot',state_id:state.id,captured_at:new Date().toISOString(),artifact_sha256:b?.artifact_sha256??null};result.evidence.push(item);frames.push({id:item.id,at:Date.now(),uri});return bytes;
    }
    try {
      const response=await page.goto(new URL(state.path,baseURL).href,{waitUntil:'domcontentloaded',timeout:remaining()});
      await page.locator(state.ready_selector).waitFor({state:'visible',timeout:remaining()});
      await page.waitForFunction(()=>document.fonts.status==='loaded',{},{timeout:remaining()});
      await page.mouse.move(0,0);await capture('initial');
      for(const [index,step] of state.steps.entries()) {
        const options={timeout:remaining()};
        if(step.action==='click')await page.locator(step.selector).click(options);
        else if(step.action==='hover')await page.locator(step.selector).hover(options);
        else if(step.action==='key')await page.keyboard.press(step.key);
        else if(step.action==='scroll')await page.evaluate(({x,y})=>window.scrollTo(x,y),{x:step.x??0,y:step.y});
        else if(step.action==='wait'){assert(Number.isFinite(step.ms)&&step.ms>=0&&step.ms<=5000,'Wait must be 0–5000 ms');await page.waitForTimeout(Math.min(step.ms,remaining()));}
        else throw new Error('Unsupported capture action: '+step.action);
        if(step.ready_selector)await page.locator(step.ready_selector).waitFor({state:'visible',timeout:remaining()});
        await capture('step-'+index);
      }
      if(!state.steps.length){await page.waitForTimeout(Math.min(150,remaining()));await capture('repeat');}
      const facts=await page.evaluate(regions=>({viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},url:location.href,title:document.title,overflow:document.documentElement.scrollWidth>innerWidth,fonts:document.fonts.status,broken_images:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.currentSrc),regions:regions.map(selector=>{const el=document.querySelector(selector);if(!el)return {selector,missing:true};const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {selector,rect:{x:b.x,y:b.y,width:b.width,height:b.height},style:{fontFamily:s.fontFamily,fontSize:s.fontSize,color:s.color,backgroundColor:s.backgroundColor},text:el.textContent.slice(0,500)};})}),state.selectors??[]);
      assert(facts.viewport.width===state.viewport.width&&facts.viewport.height===state.viewport.height&&facts.viewport.dpr===environment.dpr,'Actual viewport mismatch');
      const record={state_id:state.id,status:response?.status(),facts,errors,resources,frames,stability:frames.length===2&&!state.steps.length?result.evidence.at(-1).sha256===result.evidence.at(-2).sha256?'stable':'variable':'dynamic'};
      const uri=`evidence/${id}.json`;await writeJSON(local(root,uri),record);
      result.evidence.push({id:id+'-checks',uri,sha256:sha(await readFile(local(root,uri))),kind:'checks',state_id:state.id});
      if(state.steps.length>0) result.evidence.push({id:id+'-sequence',uri,sha256:sha(await readFile(local(root,uri))),kind:'sequence',state_id:state.id});
      result.states.push(record);result.coverage.push(state.id);
    } catch(error) {result.failures.push({state_id:state.id,reason:error.message});}
    finally {await context.close();}
  }
  await writeJSON(resolve(output),result);console.log(JSON.stringify({output:resolve(output),coverage:result.coverage,failures:result.failures,environment}));
  if(result.failures.length)process.exitCode=1;
} catch(error){console.error(error.message);process.exitCode=1;}finally{await browser?.close();}
