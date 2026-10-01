import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),source=fs.readFileSync('api.mjs','utf8');
const lines=source.split('\n');
const exposed=[];
for(let i=0;i<lines.length;i++){
 const match=/^\/\/ @ontology (\S+) (\S+)$/.exec(lines[i]);
 if(match&&(lines[i+1]??'').trim().startsWith('export '))exposed.push({iri:match[2],location:`api.mjs:${i+1}`});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'api.mjs exported symbols with @ontology annotations',exposed}));
