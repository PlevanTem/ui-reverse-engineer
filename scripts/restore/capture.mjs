#!/usr/bin/env node
// Optional Playwright adapter. No browser/package installation is performed here.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assert, writeJSON, local, sha, digest } from './core.mjs';
import { capturePlan } from './capture-plan.mjs';
import { executeCaptureStep } from './capture-actions.mjs';
import { CaptureClockIsolation, CAPTURE_CLOCK_MODE } from './capture-clock.mjs';
import { closeCaptureResources } from './capture-context.mjs';

const [directory,side,baseURL,output]=process.argv.slice(2);
const factsExpression=await readFile(new URL('./capture-page-facts.js',import.meta.url),'utf8');
let browser;
try {
  assert(directory&&['reference','candidate'].includes(side)&&/^https?:\/\//.test(baseURL??'')&&output,'Usage: node scripts/restore/capture.mjs RUN reference|candidate BASE_URL output.json');
  const plan=await capturePlan(directory,side),root=plan.root,c=plan.contract;
  const mod=process.env.RESTORE_PLAYWRIGHT_MODULE;
  const {chromium}=await import(mod?pathToFileURL(resolve(mod)).href:'playwright').catch(()=>{throw new Error('Install Playwright in the host tooling environment or set RESTORE_PLAYWRIGHT_MODULE to its entry module; browser capture remains unavailable until configured');});
  const limit=plan.deadline_ms;
  const remaining=()=>{const n=limit-Date.now();assert(n>0,'Capture deadline exhausted');return Math.min(n,30000);};
  browser=await chromium.launch({headless:true,timeout:remaining()});
  const environment={browser:browser.version(),os:plan.os,dpr:c.environment.dpr,locale:c.environment.locale};
  if(plan.frozen)assert(digest(environment)===digest(c.environment),'Capture environment differs from frozen environment');
  const b=plan.binding,states=plan.states;
  const result={schema_version:'Capture/v0.2',side,binding:b,environment,evidence:[],states:[],coverage:[],failures:[]},sharedContexts=new Map(),invalidSessions=new Map();
  for(const state of states) {
    remaining(); const options={viewport:state.viewport,deviceScaleFactor:environment.dpr,locale:environment.locale,colorScheme:state.color_scheme??'light',reducedMotion:'no-preference',storageState:state.storage_state?local(root,state.storage_state):undefined};
    const ownsContext=!state.session_id,errors=[],resources=[],frames=[],actions=[],request_failures=[];
    let context=null,page=null,captureClock=null,stateFailed=false;
    const id=`${side}-${state.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-${randomUUID()}`;
    if(state.session_id&&invalidSessions.has(state.session_id)) {
      const uri=`evidence/${id}-prerequisite-failure.json`,reason=`Shared session prerequisite failed: ${invalidSessions.get(state.session_id)}`;
      await writeJSON(local(root,uri),{state_id:state.id,session_id:state.session_id,url:null,phase:'prerequisite',reason});
      result.evidence.push({id:id+'-prerequisite-failure',uri,sha256:sha(await readFile(local(root,uri))),kind:'checks',state_id:state.id});
      result.failures.push({state_id:state.id,reason,diagnostic_uri:uri});continue;
    }
    async function capture(label,timing=null) {
      const capture_started_at=new Date().toISOString();
      const uri=`evidence/${id}-${label}.png`;
      const isolated=await captureClock.run(()=>page.screenshot({fullPage:false,animations:'allow',timeout:remaining()}));
      const bytes=isolated.value;
      await mkdir(local(root,'evidence'),{recursive:true});
      const {writeFile}=await import('node:fs/promises');await writeFile(local(root,uri),bytes);
      const item={id:id+'-'+label,uri,sha256:sha(bytes),kind:'screenshot',state_id:state.id,captured_at:new Date().toISOString(),artifact_sha256:b?.artifact_sha256??null};result.evidence.push(item);frames.push({id:item.id,at:Date.now(),uri,capture_started_at,timing,clock_isolation:isolated.isolation});return isolated.isolation;
    }
    try {
      context=state.session_id?(sharedContexts.get(state.session_id)??await browser.newContext(options)):await browser.newContext(options);
      if(state.session_id&&!sharedContexts.has(state.session_id))sharedContexts.set(state.session_id,context);
      page=await context.newPage();captureClock=new CaptureClockIsolation(page,context);await captureClock.install();
      await page.addInitScript(`globalThis.__restoreCaptureFacts=(${factsExpression});`);
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>resources.push({url:r.url(),status:r.status(),type:r.request().resourceType()}));
      page.on('requestfailed',r=>request_failures.push({url:r.url(),reason:r.failure()?.errorText,type:r.resourceType()}));
      const readyDeadline=Math.min(limit,Date.now()+(state.ready_timeout_ms??30000));
      const readyTimeout=()=>{const n=readyDeadline-Date.now();assert(n>0,'State readiness deadline exhausted');return n;};
      const response=await page.goto(new URL(state.path,baseURL).href,{waitUntil:'domcontentloaded',timeout:readyTimeout()});
      await page.locator(state.ready_selector).waitFor({state:'visible',timeout:readyTimeout()});
      for(const check of state.ready_checks??[]) await page.locator(check.selector).waitFor({state:check.state,timeout:readyTimeout()});
      await page.waitForFunction(()=>document.fonts.status==='loaded',{},{timeout:readyTimeout()});
      await page.mouse.move(0,0);await capture('initial');
      for(const [index,step] of state.steps.entries()) {
        actions.push(await executeCaptureStep(page,step,{timeout:remaining,capture:(label,timing)=>capture(`step-${index}-${label}`,timing)}));
      }
      if(!state.steps.length){await page.waitForTimeout(Math.min(150,remaining()));await capture('repeat');}
      const facts=await page.evaluate(selectors=>globalThis.__restoreCaptureFacts(selectors),state.selectors??[]);
      assert(facts.viewport.width===state.viewport.width&&facts.viewport.height===state.viewport.height&&facts.viewport.dpr===environment.dpr,'Actual viewport mismatch');
      const record={state_id:state.id,session_id:state.session_id??null,status:response?.status(),facts,errors,resources,request_failures,actions,frames,clock_isolation:{mode:CAPTURE_CLOCK_MODE,excluded_capture_ms:frames.reduce((sum,frame)=>sum+(frame.clock_isolation?.excluded_wall_ms??0),0)},stability:frames.length===2&&!state.steps.length?result.evidence.at(-1).sha256===result.evidence.at(-2).sha256?'stable':'variable':'dynamic'};
      const uri=`evidence/${id}.json`;await writeJSON(local(root,uri),record);
      result.evidence.push({id:id+'-checks',uri,sha256:sha(await readFile(local(root,uri))),kind:'checks',state_id:state.id});
      if(state.steps.length>0) result.evidence.push({id:id+'-sequence',uri,sha256:sha(await readFile(local(root,uri))),kind:'sequence',state_id:state.id});
      result.states.push(record);result.coverage.push(state.id);
    } catch(error) {
      stateFailed=true;
      if(state.session_id)invalidSessions.set(state.session_id,`${state.id}: ${error.message}`);
      const uri=`evidence/${id}-failure.json`;
      await writeJSON(local(root,uri),{state_id:state.id,session_id:state.session_id??null,url:page?.url?.()??null,phase:page?'capture':'setup',reason:error.message,errors,resources,request_failures,actions,frames});
      result.evidence.push({id:id+'-failure',uri,sha256:sha(await readFile(local(root,uri))),kind:'checks',state_id:state.id});
      result.failures.push({state_id:state.id,reason:error.message,diagnostic_uri:uri});
    }
    finally {
      const closeContext=ownsContext||stateFailed,cleanupErrors=await closeCaptureResources(page,context,closeContext);
      if(state.session_id&&closeContext)sharedContexts.delete(state.session_id);
      if(cleanupErrors.length) {
        errors.push(...cleanupErrors);
        if(state.session_id&&!invalidSessions.has(state.session_id))invalidSessions.set(state.session_id,`${state.id}: ${cleanupErrors.join('; ')}`);
        if(stateFailed) {
          const failure=result.failures.findLast(item=>item.state_id===state.id),reason=`${failure.reason}; cleanup: ${cleanupErrors.join('; ')}`,uri=failure.diagnostic_uri;
          await writeJSON(local(root,uri),{state_id:state.id,session_id:state.session_id??null,url:page?.url?.()??null,phase:page?'capture':'setup',reason,cleanup_errors:cleanupErrors,errors,resources,request_failures,actions,frames});
          const evidence=result.evidence.find(item=>item.uri===uri);evidence.sha256=sha(await readFile(local(root,uri)));failure.reason=reason;
        } else {
          result.states=result.states.filter(item=>item.state_id!==state.id);result.coverage=result.coverage.filter(item=>item!==state.id);
          result.evidence=result.evidence.filter(item=>item.state_id!==state.id||(!item.id.endsWith('-checks')&&!item.id.endsWith('-sequence')));
          const uri=`evidence/${id}-cleanup-failure.json`,reason=cleanupErrors.join('; ');
          await writeJSON(local(root,uri),{state_id:state.id,session_id:state.session_id??null,url:null,phase:'cleanup',reason,errors,resources,request_failures,actions,frames});
          result.evidence.push({id:id+'-cleanup-failure',uri,sha256:sha(await readFile(local(root,uri))),kind:'checks',state_id:state.id});
          result.failures.push({state_id:state.id,reason,diagnostic_uri:uri});
        }
      }
    }
  }
  for(const [sessionId,context] of sharedContexts) {
    const cleanupErrors=await closeCaptureResources(null,context,true);if(!cleanupErrors.length)continue;
    const id=`${side}-session-${sessionId}-${randomUUID()}`,uri=`evidence/${id}-cleanup-failure.json`,reason=cleanupErrors.join('; ');
    await writeJSON(local(root,uri),{state_id:`session:${sessionId}`,session_id:sessionId,url:null,phase:'session_cleanup',reason});
    result.evidence.push({id:id+'-cleanup-failure',uri,sha256:sha(await readFile(local(root,uri))),kind:'checks',state_id:`session:${sessionId}`});
    result.failures.push({state_id:`session:${sessionId}`,reason,diagnostic_uri:uri});
  }
  await writeJSON(resolve(output),result);console.log(JSON.stringify({output:resolve(output),coverage:result.coverage,failures:result.failures,environment}));
  if(result.failures.length)process.exitCode=1;
} catch(error){console.error(error.message);process.exitCode=1;}finally{await browser?.close();}
