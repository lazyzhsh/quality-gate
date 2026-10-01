import {quote} from './business.mjs';
let input='';
for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,cases:request.cases.map(c=>({id:c.id,actual:quote(c.input)}))}));
