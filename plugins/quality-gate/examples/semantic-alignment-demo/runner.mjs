import fs from 'node:fs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),source=fs.readFileSync('domain.mjs','utf8');
// 静态来源（现状）：读取 @ontology 注解，origin:"annotation"
const mappings=[...source.matchAll(/^\/\/ @ontology (\S+) (\S+)$/gm)].map(m=>({symbol:m[1],iri:m[2],location:`domain.mjs:${source.slice(0,m.index).split('\n').length}`,origin:'annotation'}));
// 运行时来源（v1.9 W5）：执行符号所在用例，回报实例在运行时自报的绑定，origin:"runtime"
const domain=await import('./domain.mjs');
for(const symbol of [...new Set(mappings.map(m=>m.symbol))]){
 const record=new domain[symbol](`demo-${symbol}`);
 const runtimeIri=typeof record.ontologyBinding==='function'?record.ontologyBinding():null;
 if(runtimeIri)mappings.push({symbol,iri:runtimeIri,location:`runtime:use case constructing ${symbol}`,origin:'runtime'});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'domain.mjs annotations + runtime binding use case',mappings}));
