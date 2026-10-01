import fs from 'node:fs';
// api-authz 扫描演示:逐 operation 校验显式鉴权声明(complete mediation)。
// 生产项目应替换为对完整 OpenAPI 规范的正式分析器;协议与判定链路不变。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const spec=JSON.parse(fs.readFileSync('openapi.json','utf8'));
const findings=[];
for(const [path,item] of Object.entries(spec.paths??{}))for(const [method,operation] of Object.entries(item)){
 const security=operation.security;
 const hasDeclaration=Array.isArray(security)&&security.length>0&&security.every(entry=>Object.keys(entry).length>0&&Object.keys(entry).every(scheme=>['anonymous','authenticated','service-role'].includes(scheme)));
 if(!Array.isArray(security))findings.push({id:`${method} ${path}`,rule:'missing-security-declaration',severity:'high',location:`${method} ${path}`,description:'operation 未显式声明鉴权策略(anonymous 合法但必须显式)'});
 else if(!hasDeclaration)findings.push({id:`${method} ${path}`,rule:'unknown-security-scheme',severity:'high',location:`${method} ${path}`,description:'security 声明含未知 scheme,必须为 anonymous/authenticated/service-role'});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,tool:'demo-openapi-authz-analyzer',version:'0.1',category:'api-authz',target:'openapi.json',findings}));
