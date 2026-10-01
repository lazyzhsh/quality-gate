import fs from 'node:fs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const spec=JSON.parse(fs.readFileSync('openapi.json','utf8'));
const findings=[];
for(const [route,methods] of Object.entries(spec.paths))for(const [method,operation] of Object.entries(methods)){
  if(!Array.isArray(operation.security)||operation.security.length===0)findings.push({id:`${method} ${route}`,rule:'missing-security-declaration',severity:'high',location:`${method} ${route}`,description:'Explicit authorization declaration required'});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,tool:'fixture-openapi-authz-analyzer',version:'0.1',category:'api-authz',target:'openapi.json',findings}));
