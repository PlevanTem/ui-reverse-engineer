import assert from 'node:assert/strict';
const text = value => typeof value === 'string' && value.trim().length > 0;

const actions = new Set(['click','hover','key','key_hold','scroll','wait','drag','wheel','fill','select','reload']);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const duration = x => finite(x) && x >= 0 && x <= 5000;
const point = p => p && finite(p.x) && finite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
export function validateCaptureReadiness(s) {
  if(s.ready_timeout_ms!=null) assert(finite(s.ready_timeout_ms)&&s.ready_timeout_ms>0&&s.ready_timeout_ms<=120000,'State readiness timeout must be 1–120000 ms');
  if(s.ready_checks!=null) {
    assert(Array.isArray(s.ready_checks),'State ready_checks must be an array');
    for(const check of s.ready_checks) assert(text(check.selector)&&['visible','hidden','attached','detached'].includes(check.state),'Readiness check requires selector and visible/hidden/attached/detached state');
  }
}

// Semantic checks supplement capture-step.schema.json. Coordinates are normalized
// to the selected element, so the same gesture can be replayed at both viewports.
export function validateCaptureStep(s) {
  assert(s && actions.has(s.action), 'Unsupported capture action: '+s?.action);
  if (['click','hover','drag','wheel','fill','select'].includes(s.action)) assert(text(s.selector),'Action selector required');
  if (s.position) assert(point(s.position),'Position must be normalized to 0..1');
  if (['key','key_hold'].includes(s.action)) assert(text(s.key),'Key required');
  if (s.action==='key_hold') assert(duration(s.duration_ms),'Key duration must be 0–5000 ms');
  if (s.action==='wait') assert(duration(s.ms),'Wait must be 0–5000 ms');
  if (s.action==='scroll') assert(finite(s.y) && (s.x==null||finite(s.x)),'Scroll coordinates must be finite');
  if (s.action==='wheel') assert(finite(s.delta_x) && finite(s.delta_y),'Wheel deltas must be finite');
  if (['fill','select'].includes(s.action)) assert(typeof s.value==='string','Action value must be a string');
  if (s.action==='drag') {
    assert(Array.isArray(s.path)&&s.path.length>=2&&s.path.length<=100,'Drag requires 2–100 path points');
    let previous=-1;
    for(const p of s.path) {
      assert(point(p)&&duration(p.at_ms)&&p.at_ms>=previous,'Drag path needs normalized points and nondecreasing 0–5000 ms times');
      assert(p.capture==null||typeof p.capture==='boolean','Path capture must be boolean'); previous=p.at_ms;
    }
    assert(s.path[0].at_ms===0,'Drag path must start at 0 ms');
  }
  if(s.capture_at_ms!=null) {
    assert(Array.isArray(s.capture_at_ms)&&s.capture_at_ms.length>0&&s.capture_at_ms.length<=20,'Use 1–20 capture offsets');
    let previous=-1;
    for(const t of s.capture_at_ms) {assert(duration(t)&&t>previous,'Capture offsets must increase within 0–5000 ms');previous=t;}
    if(s.action==='key_hold') assert(s.capture_at_ms.every(t=>t<=s.duration_ms),'Key-hold capture offsets must not exceed duration_ms');
  }
  return s;
}

export async function executeCaptureStep(page,step,{timeout,capture,now=Date.now}={}) {
  validateCaptureStep(step);
  const options=()=>({timeout:timeout()});
  const wallStart=now();let excludedCaptureMs=0;
  const activeNow=()=>now()-excludedCaptureMs;
  const start=activeNow();
  const log={step,started_at:new Date(start).toISOString(),samples:[]};
  async function waitUntil(origin,offset) {
    const ms=offset-(activeNow()-origin);
    if(ms>0) {assert(ms<=timeout(),'Capture deadline exhausted');await page.waitForTimeout(ms);}
    timeout();
  }
  async function sample(label,origin,scheduled_ms) {
    const actual_offset_ms=activeNow()-origin;
    const result=await capture(label,{scheduled_ms,actual_offset_ms,lateness_ms:Math.max(0,actual_offset_ms-scheduled_ms)});
    excludedCaptureMs+=result?.excluded_wall_ms??0;
    log.samples.push({label,scheduled_ms,actual_offset_ms});
  }
  async function box() {
    const locator=page.locator(step.selector);await locator.waitFor({state:'visible',...options()});
    const b=await locator.boundingBox(options());assert(b&&b.width>0&&b.height>0,'Action target has no visible box');return b;
  }
  let capturedWithinInput=false;
  if(step.action==='click') {
    let position;
    if(step.position){const b=await box();position={x:b.width*step.position.x,y:b.height*step.position.y};}
    await page.locator(step.selector).click({...options(),...(position?{position}:{})});
  } else if(step.action==='hover') await page.locator(step.selector).hover(options());
  else if(step.action==='key') await page.keyboard.press(step.key);
  else if(step.action==='key_hold') {
    await page.keyboard.down(step.key);
    const origin=activeNow(),offsets=step.capture_at_ms??[step.duration_ms];
    try {
      for(const offset of offsets) {await waitUntil(origin,offset);await sample('after-'+offset,origin,offset);}
      await waitUntil(origin,step.duration_ms);
    }
    finally {await page.keyboard.up(step.key);}
    capturedWithinInput=true;
  } else if(step.action==='scroll') await page.evaluate(({x,y})=>window.scrollTo(x,y),{x:step.x??0,y:step.y});
  else if(step.action==='wait') {assert(step.ms<=timeout(),'Capture deadline exhausted');await page.waitForTimeout(step.ms);}
  else if(step.action==='reload') await page.reload({waitUntil:'domcontentloaded',...options()});
  else if(step.action==='fill') await page.locator(step.selector).fill(step.value,options());
  else if(step.action==='select') await page.locator(step.selector).selectOption(step.value,options());
  else if(step.action==='wheel') {
    const b=await box();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.wheel(step.delta_x,step.delta_y);
  } else if(step.action==='drag') {
    const b=await box(),path=step.path,toXY=p=>[b.x+p.x*b.width,b.y+p.y*b.height];
    await page.mouse.move(...toXY(path[0]));await page.mouse.down();
    const origin=activeNow();
    try {
      for(const [i,p] of path.entries()) {
        await waitUntil(origin,p.at_ms);if(i)await page.mouse.move(...toXY(p));
        if(p.capture) await sample('drag-'+i,origin,p.at_ms);
      }
    } finally {await page.mouse.up();}
  }
  const completed=activeNow();log.input_completed_at=new Date(completed).toISOString();log.input_duration_ms=completed-start;
  if(step.ready_selector) await page.locator(step.ready_selector).waitFor({state:'visible',...options()});
  if(!capturedWithinInput) for(const offset of step.capture_at_ms??[0]) {
    await waitUntil(completed,offset);await sample('after-'+offset,completed,offset);
  }
  log.completed_at=new Date(activeNow()).toISOString();
  log.elapsed_ms=activeNow()-start;log.wall_elapsed_ms=now()-wallStart;log.excluded_capture_ms=excludedCaptureMs;
  return log;
}
