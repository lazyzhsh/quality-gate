import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),source=fs.readFileSync('domain.mjs','utf8');
const mappings=[...source.matchAll(/^\/\/ @ontology (\S+) (\S+)$/gm)].map(m=>({symbol:m[1],iri:m[2],location:`domain.mjs:${source.slice(0,m.index).split('\n').length}`}));
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'domain.mjs @ontology annotations',mappings}));
