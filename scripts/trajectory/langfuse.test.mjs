import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from './langfuse.mjs';
import * as legacy from './langfuse-pilot.mjs';
import {normalizeSession,projectTraces} from './collector.mjs';

test('pilot compatibility exports use the shared transport implementations',()=>{
 for(const name of ['configFrom','request','postJSON','getAll','toUnixNano','otlp','reconcile','reconcileScores','validatePayload'])assert.equal(legacy[name],shared[name],name);
});

test('shared payload validation accepts actual host agent envelopes, not just pilot traces',()=>{
 const timestamp='2026-11-02T01:00:00Z';
 const session=normalizeSession([
  {timestamp,type:'session_meta',payload:{id:'fixture-root',source:'vscode'}},
  {timestamp,type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'Build a fixture'}]}}
 ].map(JSON.stringify).join('\n'),{source_id:'fixture'});
 const p=projectTraces([session],{task_id:'fixture-task',capture_id:'fixture-capture'});
 assert.equal(shared.validatePayload(p.traces).spans,p.coverage.spans);
 const bad=structuredClone(p.traces);bad[0].spans[1].attributes.find(a=>a.key==='langfuse.observation.type').value.stringValue='unknown-kind';
 assert.throws(()=>shared.validatePayload(bad));
});

test('shared pagination preserves explicit filters and rejects repeated cursors',async()=>{
 const seen=[],config={baseUrl:'https://fixture.invalid',publicKey:'public',secretKey:'secret',fetchImpl:async url=>{
  const parsed=new URL(url);seen.push(parsed);return new Response(JSON.stringify({data:[{id:seen.length}],meta:{cursor:'same'}}));
 }};
 await assert.rejects(shared.getAll(config,'/api/public/v2/observations',{traceId:'fixture',limit:'10'}),/Repeated Langfuse cursor/);
 assert.equal(seen.length,2);assert.ok(seen.every(u=>u.searchParams.get('traceId')==='fixture'));assert.equal(seen[1].searchParams.get('cursor'),'same');
});
