import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),source=fs.readFileSync('domain.mjs','utf8');
const lineOf=m=>`domain.mjs:${source.slice(0,m.index).split('\n').length}`;
// 模式由 argv 决定：relations（默认）＝关系观察；mappings＝符号→概念候选观察。
// 推理（子属性/逆属性/传递链/等价/并类）全部由内核做——runner 只如实回报注解原文。
const mode=process.argv[2]==='mappings'?'mappings':'relations';
const relations=[...source.matchAll(/^\/\/ @ontology-relation (\S+) (\S+) (\S+)$/gm)].map(m=>({from:m[1],predicate:m[2],to:m[3],location:lineOf(m)}));
const mappings=[...source.matchAll(/^\/\/ @ontology (\S+) (\S+)$/gm)].map(m=>({symbol:m[1],iri:m[2],origin:'annotation',location:lineOf(m)}));
const response={schemaVersion:'0.1',runId:request.runId,source:'domain.mjs @ontology annotations'};
if(mode==='relations')Object.assign(response,{relations});
else Object.assign(response,{mappings});
console.log(JSON.stringify(response));
