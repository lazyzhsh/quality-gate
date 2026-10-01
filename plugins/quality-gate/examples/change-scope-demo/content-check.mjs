import fs from 'node:fs';
// 内容检查 runner：对本次变更的文件做内容纪律扫描（演示禁止遗留 debugger 语句）。
// 生产项目应替换为真实审查工具，并按 path+category 登记 acceptedFindings 显式豁免。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const findings=[];
for(const entry of request.files??[]){
  if(entry.changeType==='D')continue;
  if(!fs.existsSync(entry.path))continue;
  const content=fs.readFileSync(entry.path,'utf8');
  if(/\bdebugger\s*;/.test(content))findings.push({path:entry.path,category:'debugger-statement',detail:'遗留 debugger 语句，禁止进入交付'});
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'change-scope-demo/content-check.mjs',findings}));
