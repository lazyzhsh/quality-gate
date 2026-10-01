import fs from 'node:fs';
// credential 扫描演示:凭据登记 issuedAt 轮换上限 + vault 来源 + CI 无长期静态凭据。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const maxAgeDays=90;
const registry=JSON.parse(fs.readFileSync('credentials.json','utf8'));
const findings=[];
for(const credential of registry.credentials??[]){
 const ageDays=(Date.now()-Date.parse(credential.issuedAt))/86400000;
 if(Number.isNaN(ageDays))findings.push({id:credential.id,rule:'invalid-issuedAt',severity:'medium',location:'credentials.json',description:`凭据 ${credential.id} 的 issuedAt 不可解析`});
 else if(ageDays>maxAgeDays)findings.push({id:credential.id,rule:'stale-credential',severity:'high',location:'credentials.json',description:`凭据 ${credential.id} 已 ${Math.floor(ageDays)} 天未轮换（上限 ${maxAgeDays}）`});
 if(!credential.vaultPath?.startsWith('vault://'))findings.push({id:credential.id,rule:'not-vault-sourced',severity:'high',location:'credentials.json',description:`凭据 ${credential.id} 未解析到 vault 路径`});
}
for(const workflowFile of ['.github/workflows','.gitlab-ci.yml'])if(fs.existsSync(workflowFile))findings.push({id:workflowFile,rule:'ci-static-credential',severity:'high',location:workflowFile,description:'CI 配置目录存在,须改用 OIDC/keyless 联邦(本 demo 登记制检查)'});
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,tool:'demo-credential-analyzer',version:'0.1',category:'credential',target:'credentials.json',findings}));
