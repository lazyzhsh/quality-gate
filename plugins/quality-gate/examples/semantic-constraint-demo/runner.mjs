let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const {PaymentObligation}=(await import('./domain.mjs'));
const cases=[];
for(let i=1;i<=Math.max(request.minCases,5);i++){
 const authorized=100+i, instance=new PaymentObligation(`p${i}`,authorized);
 instance.capture(authorized-(i%3));
 cases.push({id:`case-${i}`,values:{authorizedAmount:instance.authorized,capturedAmount:instance.captured}});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'domain.mjs PaymentObligation instances',cases}));
