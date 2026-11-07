import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,runChecks} from './check.mjs';

test('full plan cannot silently omit browser and schema prerequisites',()=>{
 const p=buildPlan('full',{env:{}});
 assert.equal(p.profile,'full');assert.ok(p.blockers.some(x=>x.includes('RESTORE_CAPTURE_PYTHON')));assert.ok(p.blockers.some(x=>x.includes('RESTORE_PLAYWRIGHT_MODULE')));assert.ok(p.blockers.some(x=>x.includes('RESTORE_SCHEMA_PYTHON')));
 assert.ok(p.steps.some(x=>x.id==='case-manager-build'));
});

test('local plan does not install packages, upload traces or invoke a model',()=>{
 const p=buildPlan('local',{env:{}});assert.deepEqual(p.blockers,[]);
 assert.ok(p.steps.some(x=>x.id==='regression'));assert.equal(p.steps.find(x=>x.id==='schemas').unavailable,'RESTORE_SCHEMA_PYTHON not set');
 assert.ok(p.steps.every(x=>!(x.args??[]).some(a=>/\b(?:npm install|judge|sendPilot|worker)\b/.test(a))));
});

test('harbor plan is pinned, local-only and keeps runtime acceptance out of static checks',()=>{
 const p=buildPlan('harbor',{env:{}});assert.equal(p.profile,'harbor');
 assert.ok(p.steps.some(x=>x.id==='harbor-static'));assert.ok(p.steps.some(x=>x.id==='legacy-scan'));assert.match(p.scope,/no model calls.*Docker.*real Harbor trial/i);assert.match(p.additional_acceptance,/static receipts do not establish runtime acceptance/i);
 for(const step of p.steps)assert.ok(!(step.args??[]).includes('run'),'static Harbor profile must not execute a trial');
});

test('blocked full checks execute nothing and failures remain failures',async()=>{
 let calls=0;const execute=async()=>{calls++;return {exit_code:0,stdout:'',stderr:''};};
 const blocked=await runChecks(buildPlan('full',{env:{}}),{execute});assert.equal(blocked.status,'blocked');assert.equal(calls,0);
 const failed=await runChecks({profile:'fixture',blockers:[],steps:[{id:'fail',command:'fixture',args:[]}]},{execute:async()=>({exit_code:1,stdout:'',stderr:'failed'})});assert.equal(failed.status,'failed');
});

test('skipped test coverage and unavailable validators never become a complete pass',async()=>{
 const p={profile:'fixture',blockers:[],steps:[{id:'regression',command:'fixture',args:[]},{id:'schemas',unavailable:'missing validator'}]};
 const r=await runChecks(p,{execute:async()=>({exit_code:0,stdout:'ℹ tests 4\nℹ pass 3\nℹ fail 0\nℹ skipped 1\n',stderr:''})});
 assert.equal(r.status,'incomplete');assert.equal(r.checks[0].skipped_tests,1);assert.equal(r.checks[1].status,'unavailable');
});
