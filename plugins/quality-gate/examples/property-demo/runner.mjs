let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),cases=[];
let state=request.seed>>>0;
const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
for(let i=0;i<request.minCases;i++){
 const authorized=1+next()%100000;
 const captured=next()%(authorized+1);
 const refunded=next()%(captured+1);
 cases.push({id:`case-${i+1}`,input:{authorized},values:{authorized,captured,refunded},transitions:[{from:'CREATED',to:'AUTHORIZED'},{from:'AUTHORIZED',to:'CAPTURED'},{from:'CAPTURED',to:'SETTLED'}]});
}
if(process.argv[2]==='wrong-refund')cases[7].values.refunded=cases[7].values.captured+1;
if(process.argv[2]==='wrong-transition')cases[9].transitions[1]={from:'AUTHORIZED',to:'SETTLED'};
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,seed:request.seed,source:'property-demo/runner.mjs',cases}));
