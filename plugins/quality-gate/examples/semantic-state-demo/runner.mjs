let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const {Contract}=(await import('./domain.mjs'));
const cases=[];
for(let i=1;i<=Math.max(request.minCases,3);i++){
 const contract=new Contract(`c${i}`);
 contract.transition('active');
 contract.transition(i%2?'suspended':'terminated');
 if(i%2)contract.transition('active');
 cases.push({id:`case-${i}`,transitions:contract.history});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'domain.mjs Contract instances',cases}));
