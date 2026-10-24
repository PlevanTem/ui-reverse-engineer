import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assert, contract, readJSON, local, writeJSON, sha, canonical, text, budget, assess, treeHash } from './core.mjs';
import { invoke } from './adapter.mjs';

export function normalizeChoice(choice,order) {
  assert(['A','B','same','uncertain'].includes(choice),'Pairwise choice must be A/B/same/uncertain');
  if(choice==='same'||choice==='uncertain')return choice;
  return order[choice==='A'?0:1];
}
export async function compare(root,run,assessmentPath,adapter) {
  assert(run.pending&&budget(run).repair_remaining_ms>0,'No active repair or repair deadline exhausted');
  const c=await contract(root,run),a=await readJSON(assessmentPath),before=await readJSON(local(root,run.best_assessment));
  assert(a.schema_version==='LoopAssessment/v0.2'&&a.assessor?.role==='independent','Independent candidate assessment required');
  await assess(root,run,c,a,await treeHash(local(root,'restored')),run.pending.required_states);
  const issue=before.findings.find(f=>f.id===run.pending.issue_id);assert(issue,'Frozen issue missing');
  async function observedEvidence(items) {
    const output=[];
    for(const item of items) {
      if(item.kind==='checks') {
        let data;try {data=await readJSON(local(root,item.uri));} catch { /* Some checks are plain diagnostics. */ }
        if(data?.schema_version==='PairwiseVerdict/v0.2')continue;
      }
      output.push(item);
    }
    return output;
  }
  const [bestEvidence,candidateEvidence]=await Promise.all([observedEvidence(before.evidence),observedEvidence(a.evidence)]);
  const outputs=[];
  for(const order of [['best','candidate'],['candidate','best']]) {
    const request={schema_version:'PairwiseRequest/v0.2',binding:a.binding,issue,order,reference_evidence:c.reference_evidence,best_evidence:bestEvidence,candidate_evidence:candidateEvidence,states:c.states.filter(s=>run.pending.required_states.includes(s.id)),obligations:c.obligations.filter(o=>run.pending.required_states.includes(o.state_id)),interactive_scene:c.interactive_scene??null,run_dir:root,expected_output:'PairwiseVerdict/v0.2'};
    const raw=await invoke(adapter,request,budget(run).repair_remaining_ms);
    assert(raw.schema_version==='PairwiseVerdict/v0.2'&&canonical(raw.binding)===canonical(a.binding)&&raw.issue_id===issue.id&&raw.assessor?.role==='independent'&&text(raw.assessor.id)&&text(raw.reason),'Invalid independent pairwise verdict');
    const choice=normalizeChoice(raw.choice,order),uri=`evidence/pairwise-${run.pending.round}-${randomUUID()}.json`;
    await writeJSON(local(root,uri),{...raw,order});
    a.evidence.push({id:`pairwise-${randomUUID()}`,kind:'checks',uri,sha256:sha(await readFile(local(root,uri)))});
    outputs.push({choice,raw,evidence:a.evidence.at(-1).id});
  }
  const v={schema_version:'IterationDecision/v0.2',issue_id:issue.id,binding:a.binding,verifier:{role:'independent',id:outputs.map(x=>x.raw.assessor.id).join(',')},forward:outputs[0].choice,reverse:outputs[1].choice,visible_improvement:outputs.every(x=>x.choice==='candidate'&&x.raw.visible_improvement===true),reason:outputs.map(x=>x.raw.reason).join(' | '),evidence:outputs.map(x=>x.evidence)};
  const assessmentUri=`observations/candidate-${run.pending.round}-${randomUUID()}.json`,verificationUri=`observations/verification-${run.pending.round}-${randomUUID()}.json`;
  await writeJSON(local(root,assessmentUri),a);await writeJSON(local(root,verificationUri),v);
  return {assessment:local(root,assessmentUri),verification:local(root,verificationUri),forward:v.forward,reverse:v.reverse};
}
