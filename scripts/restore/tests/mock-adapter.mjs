export async function evaluate(input) {
  if(input.schema_version==='BlindPairwiseRequest/v1'){if(input.order||input.binding||input.best_evidence||input.candidate_evidence)throw Error('Identity leaked');return {schema_version:'BlindPairwiseVerdict/v1',request_id:input.request_id,assessor:{role:'independent',id:'synthetic-blind'},choice:'same',reason:'Synthetic PNG bytes match',visible_improvement:false};}
  if(input.schema_version==='PairwiseRequest/v0.2'&&input.candidate_evidence.some(e=>e.id.startsWith('pairwise-')))throw Error('Earlier pairwise verdict leaked into the next order');
  if(input.schema_version==='PairwiseRequest/v0.2')return {schema_version:'PairwiseVerdict/v0.2',binding:input.binding,issue_id:input.issue.id,assessor:{role:'independent',id:'synthetic-pairwise'},choice:input.order[0]==='candidate'?'A':'B',reason:'Candidate visibly closer in the synthetic fixture',visible_improvement:true,request_context:{interactive_scene:input.interactive_scene,states:input.states,obligations:input.obligations}};
  return {received:input.kind,mode:'in-process-or-child'};
}
if(process.argv[1]?.endsWith('mock-adapter.mjs')) {
  let source='';for await(const chunk of process.stdin)source+=chunk;
  process.stdout.write(JSON.stringify(await evaluate(JSON.parse(source))));
}
