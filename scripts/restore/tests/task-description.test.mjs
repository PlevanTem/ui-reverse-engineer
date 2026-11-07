import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTaskDescription,taskDescriptionMarkdown} from '../task-description.mjs';
const contract=()=>({reference_evidence:[{id:'hero',kind:'screenshot'},{id:'motion',kind:'sequence'},{id:'source',kind:'source',evaluation_only:true}],task_description:{title:'还原滚动故事页',scenario:'插画与文案随滚动变化的品牌专题',user_intent:{text:'浏览品牌故事',basis:'inferred'},description:'复现已观察的桌面与移动端滚动叙事，范围以 states 和 obligations 为准。',evidence_refs:['hero','motion']}});
test('task narrative has one authority and preserves inferred intent in the brief',()=>{
 const c=contract();assert.equal(validateTaskDescription(c),c.task_description);
 assert.match(taskDescriptionMarkdown(c),/inferred/);assert.match(taskDescriptionMarkdown(c),/还原滚动故事页/);
 assert.equal(validateTaskDescription({}),null);assert.throws(()=>validateTaskDescription({},{required:true}),/required/);
});
test('task narrative rejects source-only grounding, unmarked intent and parallel scope fields',()=>{
 const a=contract();a.task_description.evidence_refs=['source'];assert.throws(()=>validateTaskDescription(a),/visual evidence/);
 const b=contract();delete b.task_description.user_intent.basis;assert.throws(()=>validateTaskDescription(b));
 const c=contract();c.task_description.states=[];assert.throws(()=>validateTaskDescription(c),/Unexpected/);
});
