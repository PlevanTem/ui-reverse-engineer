// Shared local HTTP/OTLP adapter. Importing does not read config, start workers or send data.
// Delivery receipts and uncertain-write recovery belong to transport.mjs, not request().
import assert from 'node:assert/strict';
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const parseIO=v=>{if(typeof v!=='string')return v;try{return JSON.parse(v);}catch{return v;}};
const attr=(key,value)=>({key,value:{stringValue:typeof value==='string'?value:JSON.stringify(value)}});
const attrs=s=>Object.fromEntries(s.attributes.map(a=>[a.key,a.value.stringValue]));
const prefix='langfuse.observation.metadata.';

export function toUnixNano(value){
 assert.equal(typeof value,'string','Recorded timestamp required');assert.match(value,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/,'Recorded ISO timestamp required');
 const ms=Date.parse(value);assert.ok(Number.isFinite(ms),'Invalid timestamp');
 if(value.endsWith('Z'))assert.equal(new Date(ms).toISOString().slice(0,19),value.slice(0,19),'Invalid calendar date');
 return (BigInt(ms)*1000000n).toString();
}
export function validatePayload(traces){
 let count=0;for(const t of traces){const ids=new Set();assert.match(t.traceId,/^[a-f0-9]{32}$/);assert.ok(!/^0+$/.test(t.traceId));
  for(const s of t.spans){assert.equal(s.traceId,t.traceId);assert.match(s.spanId,/^[a-f0-9]{16}$/);assert.ok(!/^0+$/.test(s.spanId),'All-zero span ID');assert.ok(!ids.has(s.spanId),'Duplicate span ID');ids.add(s.spanId);assert.ok(BigInt(s.endTimeUnixNano)>=BigInt(s.startTimeUnixNano));const a=attrs(s);assert.ok(a['langfuse.session.id']);assert.ok(['chain','event','evaluator','tool','agent'].includes(a['langfuse.observation.type']));assert.ok(a['langfuse.observation.input']&&a['langfuse.observation.output']);count++;}
  for(const s of t.spans)if(s.parentSpanId){const p=t.spans.find(p=>p.spanId===s.parentSpanId);assert.ok(p,'Unknown parent span');assert.ok(BigInt(p.startTimeUnixNano)<=BigInt(s.startTimeUnixNano)&&BigInt(p.endTimeUnixNano)>=BigInt(s.endTimeUnixNano),'Parent time does not contain child');}
 }return {traces:traces.length,spans:count};
}
export function configFrom(text='',env=process.env){
 const parsed={};for(const raw of text.split(/\r?\n/)){const m=raw.match(/^\s*(?:export\s+)?(LANGFUSE_(?:BASE_URL|HOST|PUBLIC_KEY|SECRET_KEY))\s*=\s*(.*?)\s*$/);if(m){let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);parsed[m[1]]=v;}}
 const values={...parsed,...Object.fromEntries(Object.entries(env).filter(([k,v])=>k.startsWith('LANGFUSE_')&&v))};
 const base=values.LANGFUSE_BASE_URL||values.LANGFUSE_HOST;assert.ok(base&&values.LANGFUSE_PUBLIC_KEY&&values.LANGFUSE_SECRET_KEY,'LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY required');
 const u=new URL(base);assert.ok(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash,'Invalid Langfuse base URL');
 return {baseUrl:base.replace(/\/+$/,''),publicKey:values.LANGFUSE_PUBLIC_KEY,secretKey:values.LANGFUSE_SECRET_KEY};
}
function redact(message,c){let s=String(message);for(const secret of [c.secretKey,c.publicKey,Buffer.from(`${c.publicKey}:${c.secretKey}`).toString('base64')])s=s.split(secret).join('[redacted]');return s;}
export async function request(c,path,{body,fetchImpl=c.fetchImpl??fetch}={}){
 const response=await fetchImpl(c.baseUrl+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Basic '+Buffer.from(`${c.publicKey}:${c.secretKey}`).toString('base64'),'Content-Type':'application/json','x-langfuse-ingestion-version':'4'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const text=await response.text();if(!response.ok)throw new Error(redact(`Langfuse HTTP ${response.status}: ${text.slice(0,1500)}`,c));let result;try{result=text?JSON.parse(text):{};}catch{throw new Error('Langfuse returned non-JSON success response');}
 if(result.partialSuccess||result.partial_success)throw new Error('OTLP partial success requires reconciliation; batch will not be automatically retried');return result;
}
export const postJSON=(c,path,body,fetchImpl=c.fetchImpl??fetch)=>request(c,path,{body,fetchImpl});
export function reconcile(traces,rows){
 const issues=[];for(const t of traces)for(const s of t.spans){const r=rows.find(r=>r.traceId===s.traceId&&r.id===s.spanId);if(!r){issues.push({span:s.spanId,field:'missing'});continue;}const a=attrs(s);
  for(const [field,expected] of [['parentObservationId',s.parentSpanId??null],['name',s.name],['type',a['langfuse.observation.type'].toUpperCase()],['sessionId',a['langfuse.session.id']]])if((r[field]??null)!==expected)issues.push({span:s.spanId,field});
  for(const field of ['input','output'])if(canonical(parseIO(r[field]))!==canonical(parseIO(a[`langfuse.observation.${field}`])))issues.push({span:s.spanId,field});
  for(const [field,expected] of [['startTime',s.startTimeUnixNano],['endTime',s.endTimeUnixNano]])if(!r[field]||Date.parse(r[field])!==Number(BigInt(expected)/1000000n))issues.push({span:s.spanId,field});
  for(const [k,v] of Object.entries(a).filter(([k])=>k.startsWith(prefix)))if(canonical(parseIO(r.metadata?.[k.slice(prefix.length)]))!==canonical(parseIO(v)))issues.push({span:s.spanId,field:k});
 }return {status:issues.length?'incomplete':'pass',expected:traces.reduce((n,t)=>n+t.spans.length,0),observed:rows.length,issues};
}
export function reconcileScores(expected,rows){const issues=[];for(const s of expected){const r=rows.find(r=>r.id===s.id);if(!r){issues.push({score:s.id,field:'missing'});continue;}if(r.name!==s.name||r.dataType?.toUpperCase()!==s.dataType||canonical(r.value)!==canonical(s.dataType==='BOOLEAN'?Boolean(s.value):s.value))issues.push({score:s.id,field:'value_or_type'});const sub=r.subject;if(!sub||sub.kind!=='observation'||sub.id!==s.observationId||sub.traceId!==s.traceId)issues.push({score:s.id,field:'subject'});}return {status:issues.length?'incomplete':'pass',expected:expected.length,issues};}
// Defaults preserve legacy pilot payload hashes; generic transport supplies its own scope/version.
export function otlp(traces,{serviceVersion='firewood-langfuse-pilot/v1',scopeName='restore-firewood-pilot'}={}){return {resourceSpans:[{resource:{attributes:[attr('service.name','ui-reverse-engineer-restore'),attr('service.version',serviceVersion)]},scopeSpans:[{scope:{name:scopeName,version:'1'},spans:traces.flatMap(t=>t.spans)}]}]};}
export async function getAll(c,path,params){const rows=[];let cursor=null;const seen=new Set();do{const q=new URLSearchParams(params);if(cursor)q.set('cursor',cursor);const page=await request(c,path+'?'+q);assert.ok(Array.isArray(page.data),'Unexpected Langfuse page shape');rows.push(...page.data);cursor=page.meta?.cursor??null;if(cursor){assert.ok(!seen.has(cursor),'Repeated Langfuse cursor');seen.add(cursor);}assert.ok(rows.length<=10000,'Readback pagination limit');}while(cursor);return rows;}
