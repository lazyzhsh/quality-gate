import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);
const artifacts=Object.entries({code:'routes.mjs',api:'API.md',user:'USER.md',operator:'OPERATIONS.md'}).map(([role,path])=>{
 const content=fs.readFileSync(path,'utf8'),version=content.match(/release:\s*(\S+)/)?.[1]??'unknown',topics=[...content.matchAll(/topic:\s*(\S+)/g)].map(m=>m[1]);return {role,path,version,topics};
});
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'release and topic markers in project artifacts',artifacts}));
