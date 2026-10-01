import fs from 'node:fs';
// 契约兼容协议演示：对基线/当前契约做字段级 diff。生产项目应接入 oasdiff/
// openapi-diff 等工具并以结构化 breaking 结论作为本 runner 的实现。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const scenario=process.env.QGATE_SCENARIO??'healthy';
const baseline=JSON.parse(fs.readFileSync('contracts/baseline-api.json','utf8')).fields;
const currentRaw=JSON.parse(fs.readFileSync(request.file,'utf8'));
const current=JSON.parse(JSON.stringify(currentRaw.fields));
if(scenario==='breaking'){delete current['transfer.reference'];current['transfer.amount'].type='string';}
const breaking=[];
for(const [name,spec] of Object.entries(baseline)){
 if(!(name in current))breaking.push({path:name,rule:'removedField'});
 else if(JSON.stringify(spec)!==JSON.stringify(current[name]))breaking.push({path:name,rule:'incompatibleChange'});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,kind:'contract-diff',source:'ledger-demo/contract-diff.mjs',compatibilityLevel:request.compatibilityLevel,checked:true,breaking}));
