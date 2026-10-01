import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),source=fs.readFileSync('domain.mjs','utf8');
const relations=[...source.matchAll(/^\/\/ @ontology-relation (\S+) (\S+) (\S+)$/gm)].map(m=>({from:m[1],predicate:m[2],to:m[3],location:`domain.mjs:${source.slice(0,m.index).split('\n').length}`}));
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'domain.mjs @ontology-relation annotations',relations}));
