// argv 约定规则示例 runner：统一观察协议（stdin 请求 → stdout 观察 JSON，回显 runId）。
// 项目自配检查逻辑（此处为演示：扫描 TODO/FIXME 标记），内核核验形状并判定。
import fs from 'node:fs';
import path from 'node:path';
let raw='';
for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const findings=[];
const walk=dir=>{
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.name==='node_modules'||entry.name.startsWith('.'))continue;
  const rel=path.join(dir,entry.name);
  if(entry.isDirectory())walk(rel);
  else if(/\.(mjs|md)$/.test(entry.name)&&entry.name!=='check-todo.mjs'){
   const lines=fs.readFileSync(rel,'utf8').split(/\r?\n/);
   lines.forEach((line,index)=>{
    if(line.includes('TODO:'))findings.push({path:path.relative(process.cwd(),rel).replaceAll('\\','/'),line:index+1,detail:'TODO 标记未清理',category:'discipline'});
   });
  }
 }
};
walk(process.cwd());
process.stdout.write(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'check-todo.mjs',findings}));
