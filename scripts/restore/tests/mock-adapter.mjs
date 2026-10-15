export async function evaluate(input) {
  if(input.schema_version==='PairwiseRequest/v0.2')return {schema_version:'PairwiseVerdict/v0.2',binding:input.binding,issue_id:input.issue.id,assessor:{role:'independent',id:'synthetic-pairwise'},choice:input.order[0]==='candidate'?'A':'B',reason:'Candidate visibly closer in the synthetic fixture',visible_improvement:true};
  return {received:input.kind,mode:'in-process-or-child'};
}
if(process.argv[1]?.endsWith('mock-adapter.mjs')) {
  let source='';for await(const chunk of process.stdin)source+=chunk;
  process.stdout.write(JSON.stringify(await evaluate(JSON.parse(source))));
}
