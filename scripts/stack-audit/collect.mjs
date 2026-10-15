#!/usr/bin/env node
// Exploratory evidence collection for public website technology audits.
// Usage: node scripts/stack-audit/collect.mjs URL OUTPUT_DIR [steps.json]
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [inputUrl, outputArg, stepsArg] = process.argv.slice(2);
if (!inputUrl || !outputArg || inputUrl === '--help') {
  console.log('Usage: node scripts/stack-audit/collect.mjs URL OUTPUT_DIR [steps.json]');
  console.log('Optional steps: [{"action":"click","selector":"button"}, {"action":"scroll","y":800}]');
  process.exit(inputUrl === '--help' ? 0 : 2);
}

const target = new URL(inputUrl);
if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only http(s) URLs are supported');
const output = resolve(outputArg);
const screenshotsDir = join(output, 'screenshots');
const sourcesDir = join(output, 'sources');
await Promise.all([mkdir(screenshotsDir, { recursive: true }), mkdir(sourcesDir, { recursive: true })]);
const steps = stepsArg ? JSON.parse(await readFile(resolve(stepsArg), 'utf8')) : [];
if (!Array.isArray(steps)) throw new Error('steps.json must contain an array');

const modulePath = process.env.RESTORE_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright')
  .catch(() => { throw new Error('Playwright is unavailable. Install it in the host tooling environment or set RESTORE_PLAYWRIGHT_MODULE.'); });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function safeUrl(raw) {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) if (/token|secret|auth|session|signature|credential|password|email/i.test(key)) u.searchParams.set(key, '[redacted]');
    return u.href;
  } catch { return raw; }
}
function safeText(value) { return String(value).replace(/([?&](?:token|secret|auth|session|signature|credential|password|email)[^=]*=)[^&\s)]+/gi, '$1[redacted]'); }
const firstPartyHosts = new Set([target.hostname]);
function sameHost(raw) { try { return firstPartyHosts.has(new URL(raw).hostname); } catch { return false; } }
function sourceExtension(mime) { return /css/i.test(mime) ? '.css' : '.js'; }

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Observe context requests without replacing their behavior.
  await context.addInitScript(() => {
    const records = [];
    Object.defineProperty(window, '__stackAuditContexts', { value: records, configurable: false });
    const patch = proto => {
      if (!proto?.getContext) return;
      const original = proto.getContext;
      proto.getContext = function(type, ...args) {
        try { records.push({ element: this.id || this.tagName || 'offscreen', type: String(type), stack: String(new Error().stack || '').split('\n').slice(2, 6) }); } catch {}
        return Reflect.apply(original, this, [type, ...args]);
      };
    };
    patch(HTMLCanvasElement.prototype);
    if (typeof OffscreenCanvas !== 'undefined') patch(OffscreenCanvas.prototype);
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const initiators = new Map();
  cdp.on('Network.requestWillBeSent', event => {
    const key = event.request.url;
    const entries = initiators.get(key) || [];
    entries.push({ request_id: event.requestId, type: event.type, initiator: event.initiator });
    initiators.set(key, entries);
  });
  const responses = [];
  const responseJobs = [];
  const sourceRecords = [];
  const requests = [];
  let currentState = 'initial';
  page.on('response', response => {
    const request = response.request();
    const url = response.url();
    if (request.resourceType() === 'document') { try { firstPartyHosts.add(new URL(url).hostname); } catch {} }
    const initiated = initiators.get(url)?.shift();
    const reqInfo = { id: `request:${requests.length}`, url: safeUrl(url), status: response.status(), resource_type: request.resourceType(), first_party: sameHost(url), state: currentState };
    requests.push(reqInfo);
    responseJobs.push((async () => {
      let headers = {};
      try { headers = await response.allHeaders(); } catch {}
      const mime = headers['content-type'] || '';
      reqInfo.content_type = mime;
      const init = initiated?.initiator;
      reqInfo.initiator = init ? {
        type: init.type ?? null,
        url: init.url ? safeUrl(init.url) : null,
        stack: (init.stack?.callFrames || []).slice(0, 5).map(frame => ({ function_name: frame.functionName, url: safeUrl(frame.url), line: frame.lineNumber + 1, column: frame.columnNumber + 1 })),
      } : null;
      reqInfo.cdp_request_id = initiated?.request_id ?? null;
      const item = { ...reqInfo, evidence_id: reqInfo.id };
      responses.push(item);
      evidence.push({ id: reqInfo.id, kind: 'request', details: item });
      const length = Number(headers['content-length'] || 0);
      if (!sameHost(url) || !['script', 'stylesheet'].includes(request.resourceType()) || (length && length > 8 * 1024 * 1024)) return;
      if (!/(javascript|ecmascript|text\/css)/i.test(mime)) return;
      try {
        const body = await response.body();
        if (body.length > 8 * 1024 * 1024) return;
        const digest = hash(body);
        const ext = sourceExtension(mime);
        const uri = `sources/${digest}${ext}`;
        await writeFile(join(output, uri), body);
        const sourceRecord = { id: `source:${sourceRecords.length}`, uri, url: safeUrl(url), resource_type: request.resourceType(), content_type: mime, bytes: body.length, sha256: digest, evidence_id: reqInfo.id };
        sourceRecords.push(sourceRecord);
        evidence.push({ id: sourceRecord.id, kind: 'source', uri, sha256: digest, details: { url: sourceRecord.url, evidence_id: reqInfo.id } });
      } catch (error) { item.body_capture_error = error.message; }
    })());
  });

  const evidence = [];
  const states = [];
  let contextCursor = 0;
  async function inspect(label) {
    const stateId = `state:${states.length}`;
    const snapshot = await page.evaluate(() => {
      const describe = el => ({ tag: el.tagName.toLowerCase(), id: el.id || null, class_name: typeof el.className === 'string' ? el.className.slice(0, 240) : null, width: el.width ?? null, height: el.height ?? null, rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })() });
      return {
        url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        canvas: [...document.querySelectorAll('canvas')].map(describe),
        videos: [...document.querySelectorAll('video')].map(describe),
        frames: [...document.querySelectorAll('iframe')].map(el => ({ ...describe(el), src: el.src })),
        scripts: [...document.scripts].map(el => el.src).filter(Boolean),
        stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => el.href),
        contexts: window.__stackAuditContexts || [],
      };
    });
    snapshot.scripts = snapshot.scripts.map(safeUrl);
    snapshot.stylesheets = snapshot.stylesheets.map(safeUrl);
    snapshot.frames = snapshot.frames.map(frame => ({ ...frame, src: safeUrl(frame.src) }));
    snapshot.canvas = snapshot.canvas.map((canvas, index) => ({ ...canvas, evidence_id: `canvas:${states.length}:${index}` }));
    snapshot.contexts = snapshot.contexts.slice(contextCursor);
    contextCursor += snapshot.contexts.length;
    snapshot.contexts = snapshot.contexts.map(contextRecord => ({ ...contextRecord, stack: contextRecord.stack.map(safeText) }));
    const screenshotPath = `screenshots/${String(states.length).padStart(2, '0')}-${label.replace(/[^a-z0-9_-]/gi, '_')}.png`;
    const screenshot = await page.screenshot({ path: join(output, screenshotPath), fullPage: false, animations: 'allow' });
    const shotId = `screenshot:${states.length}`;
    evidence.push({ id: shotId, kind: 'screenshot', uri: screenshotPath, sha256: hash(screenshot), state_id: stateId });
    for (const canvas of snapshot.canvas) evidence.push({ id: canvas.evidence_id, kind: 'canvas', state_id: stateId, details: canvas });
    snapshot.contexts = snapshot.contexts.map(contextRecord => {
      const evidenceId = `context:${evidence.filter(e => e.kind === 'context').length}`;
      evidence.push({ id: evidenceId, kind: 'context', state_id: stateId, details: contextRecord });
      return { ...contextRecord, evidence_id: evidenceId };
    });
    states.push({ id: stateId, label, ...snapshot, screenshot_evidence_id: shotId });
  }

  const firstResponse = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  await inspect('initial');
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    currentState = `step:${i}`;
    const timeout = Math.min(10000, Number(step.timeout_ms) || 5000);
    if (step.action === 'click') await page.locator(step.selector).click({ timeout });
    else if (step.action === 'hover') await page.locator(step.selector).hover({ timeout });
    else if (step.action === 'key') await page.keyboard.press(step.key);
    else if (step.action === 'scroll') await page.evaluate(y => window.scrollTo(0, y), Number(step.y) || 0);
    else if (step.action === 'wait') await page.waitForTimeout(Math.max(0, Math.min(5000, Number(step.ms) || 0)));
    else throw new Error(`Unsupported step action: ${step.action}`);
    await page.waitForTimeout(Math.max(250, Math.min(1500, Number(step.settle_ms) || 500)));
    await inspect(`step-${i}`);
  }
  await page.waitForTimeout(500);
  await Promise.allSettled(responseJobs);
  const finalUrl = page.url();
  const audit = {
    schema_version: 'StackAudit/v0.1', collected_at: new Date().toISOString(),
    target_url: safeUrl(target.href), final_url: safeUrl(finalUrl), initial_status: firstResponse?.status() ?? null,
    browser: { name: 'Chromium', version: browser.version() }, host_scope: [...firstPartyHosts],
    states, requests: responses, sources: sourceRecords, evidence,
    signals: [
      ...states.flatMap(state => state.canvas.map(canvas => ({ id: canvas.evidence_id, type: 'canvas', label: `${canvas.width}x${canvas.height} canvas`, evidence_ids: [canvas.evidence_id, state.screenshot_evidence_id] }))),
      ...states.flatMap(state => state.contexts.map(contextRecord => ({ id: contextRecord.evidence_id, type: 'canvas-context', label: `Canvas context requested: ${contextRecord.type}`, evidence_ids: [contextRecord.evidence_id] }))),
      ...responses.filter(r => /\.(glb|gltf|obj|fbx|usdz)(?:$|[?#])/i.test(r.url)).map(r => ({ id: `model:${r.id}`, type: 'model-resource', label: r.url, evidence_ids: [r.evidence_id] })),
    ],
  };
  await writeFile(join(output, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({ output: join(output, 'audit.json'), states: states.length, requests: responses.length, first_party_sources: sourceRecords.length, signals: audit.signals.length }));
  await context.close();
} finally { await browser.close(); }
