import {handleRequest} from './app.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,cases:request.cases.map(c=>({id:c.id,actual:handleRequest(c.input)}))}));
