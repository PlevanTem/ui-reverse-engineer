import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const text=v=>typeof v==='string'&&v.trim().length>0;
export function validateTaskDescription(contract,{required=false}={}){
  const value=contract.task_description;
  if(value==null){assert.ok(!required,'contract.task_description is required for a URL task');return null;}
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Invalid task_description');
  assert.deepEqual(Object.keys(value).sort(),['title','scenario','user_intent','description','evidence_refs'].sort(),'Unexpected task_description fields');
  for(const key of ['title','scenario','description'])assert.ok(text(value[key]),`task_description.${key} required`);
  if(value.user_intent!==null){assert.deepEqual(Object.keys(value.user_intent).sort(),['basis','text']);assert.ok(text(value.user_intent.text)&&['observed','inferred'].includes(value.user_intent.basis),'Invalid intent evidence basis');}
  assert.ok(Array.isArray(value.evidence_refs)&&value.evidence_refs.length&&new Set(value.evidence_refs).size===value.evidence_refs.length,'Task evidence required and unique');
  const allowed=new Set((contract.reference_evidence??[]).filter(e=>e.evaluation_only!==true&&['screenshot','sequence','video'].includes(e.kind)).map(e=>e.id));
  assert.ok(value.evidence_refs.every(id=>allowed.has(id)),'Task description must cite frozen visual evidence, not source/evaluator metadata');
  return value;
}
export function taskDescriptionMarkdown(contract){
  const t=validateTaskDescription(contract);if(!t)return '';
  return `## ${t.title}\n\n场景：${t.scenario}\n\n用户目标：${t.user_intent?`${t.user_intent.text}（${t.user_intent.basis}）`:'未确认'}\n\n${t.description}\n\n证据：${t.evidence_refs.join(', ')}\n\n`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=process.argv[2];if(!root)throw Error('Usage: node task-description.mjs RUN_DIR');
  const contract=JSON.parse(await readFile(join(root,'contract.json'),'utf8'));validateTaskDescription(contract,{required:true});
  await writeFile(join(root,'design_brief.md'),`# Restore brief\n\n${taskDescriptionMarkdown(contract)}参考：${contract.requested_url}\n\n状态、验收要求、资源及未知项见唯一事实源 [contract.json](contract.json)。\n\n此文档自动生成；后续 report 从同一合同和评测记录补充实现结果。\n`);
}
