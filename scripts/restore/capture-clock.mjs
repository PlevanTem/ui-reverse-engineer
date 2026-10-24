import assert from 'node:assert/strict';

export const CAPTURE_CLOCK_MODE = 'playwright_clock+chromium_lifecycle';
const pauseAtCurrentPageTime=async()=>{
  const controller=globalThis.__pwClock?.controller;
  if(!controller) throw new Error('Playwright clock controller unavailable');
  const current=Date.now();
  await controller.pauseAt(current);
  return current;
};

// Playwright's clock excludes screenshot wall time from Date/performance/timers;
// the Chromium lifecycle freeze closes the small race before that clock pauses.
export class CaptureClockIsolation {
  constructor(page,context,{now=Date.now}={}) {
    this.page=page;this.context=context;this.now=now;this.cdp=null;
  }
  async install() {
    assert(this.page?.clock?.install&&this.page.clock.resume,
      'Capture requires Playwright clock support');
    assert(this.context?.newCDPSession,'Capture requires Chromium CDP lifecycle support');
    await this.page.clock.install();
    this.cdp=await this.context.newCDPSession(this.page);
  }
  async run(operation) {
    assert(this.cdp,'Capture clock isolation is not installed');
    const hostStarted=this.now();let pauseAttempted=false,pageTimeMs=null,value,excluded_wall_ms=0;
    await this.cdp.send('Page.setWebLifecycleState',{state:'frozen'});
    try {
      pauseAttempted=true;
      // Reading Date.now() and calling pauseAt() in separate protocol commands
      // races the clock's real-time synchronizer after long navigations. Keep
      // both operations in one page task so the target cannot become "past".
      pageTimeMs=await this.page.evaluate(pauseAtCurrentPageTime);
      value=await operation();
    } finally {
      try {await this.cdp.send('Page.setWebLifecycleState',{state:'active'});}
      finally {
        excluded_wall_ms=Math.max(0,this.now()-hostStarted);
        if(pauseAttempted) await this.page.clock.resume();
      }
    }
    return {value,isolation:{mode:CAPTURE_CLOCK_MODE,page_time_ms:pageTimeMs,excluded_wall_ms}};
  }
}
