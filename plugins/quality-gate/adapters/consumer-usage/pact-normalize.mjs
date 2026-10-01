#!/usr/bin/env node
// Pact 契约产物归一（v1.13 T5，consumer-matrix 观察层；v1.15 T7 字段级深化）：consumer 侧
// 契约测试产物（Pact JSON，v2/v3 常见形状）→ consumerUsage 条目（usage:'contract-test'，
// 最强来源——使用面由消费者自己的契约测试锚定）。零 npm 依赖纯函数 + CLI。
//
// 边界如实：
// - Pact interaction 记录 consumer 发出的请求（method+path+请求 body）；**请求 body 的
//   字段路径**自 v1.15 起提取为字段级使用面条目（叶子字段，嵌套以点连接，深度 ≤4，数组
//   取元素字段、去重）；**响应侧** consumer 读取了哪些字段仍不记录——响应面字段级使用
//   仍是项目知识，工具不虚构；
// - 请求 body 非对象（纯字符串/数组/缺失）时不产字段条目，只有端点条目（如实降级）；
// - path 仅去掉 query 串后原样保留：具体资源 id 与模板路由（/orders/{id}）不匹配时，
//   由项目自行归一或以 provider state 表达，本工具不做猜测性改写；
// - 同端点多 interaction 去重（字段集合取并集）；malformed 产物（缺 consumer.name /
//   无 interactions / interaction 缺 method 或 path）fail-closed 退出 1。
//
// CLI：node pact-normalize.mjs <pact.json> [more.json…] —— 单文件输出一个 consumerUsage
// 条目对象，多文件输出数组；供项目 runner 组装进观察 JSON。
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// 叶子字段路径：对象递归（点连接，深度 ≤4），数组取**元素**字段（同键路径归并，不带下标），原语为叶子。
const MAX_FIELD_DEPTH=4;
const bodyFieldPaths=(value,prefix='',depth=0,paths=new Set())=>{
 if(value===null||typeof value!=='object')return paths;
 if(depth>=MAX_FIELD_DEPTH)return paths;
 if(Array.isArray(value)){
  for(const element of value)bodyFieldPaths(element,prefix,depth,paths);
  return paths;
 }
 for(const [key,child] of Object.entries(value)){
  const next=prefix?`${prefix}.${key}`:key;
  if(child!==null&&typeof child==='object')bodyFieldPaths(child,next,depth+1,paths);
  else paths.add(next);
 }
 return paths;
};

export function pactToUsage(pactDocument){
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 if(!object(pactDocument))throw new Error('pact document must be a JSON object');
 const consumer=pactDocument.consumer?.name;
 if(typeof consumer!=='string'||!consumer.trim())throw new Error('pact document lacks consumer.name');
 if(!Array.isArray(pactDocument.interactions)||pactDocument.interactions.length===0)throw new Error('pact document has no interactions');
 const items=[];
 const endpointSeen=new Set();
 const fieldSeen=new Set();
 for(const interaction of pactDocument.interactions){
  const method=interaction?.request?.method;
  const rawPath=interaction?.request?.path;
  if(typeof method!=='string'||!method.trim()||typeof rawPath!=='string'||!rawPath.trim())throw new Error('pact interaction lacks request.method/path');
  const path=rawPath.split('?')[0];
  if(!path.startsWith('/'))throw new Error(`pact interaction path must start with /: ${rawPath}`);
  const upper=method.toUpperCase();
  const key=`${upper} ${path}`;
  if(!endpointSeen.has(key)){
   endpointSeen.add(key);
   items.push({path,method:upper});
  }
  const body=interaction.request.body;
  if(body!==null&&typeof body==='object'&&!Array.isArray(body)){
   for(const field of [...bodyFieldPaths(body)].sort()){
    const fieldKey=`${key}#${field}`;
    if(fieldSeen.has(fieldKey))continue;
    fieldSeen.add(fieldKey);
    items.push({path,method:upper,field});
   }
  }
 }
 return {consumer,usage:'contract-test',items};
}

const isMain=import.meta.url===pathToFileURL(path.resolve(process.argv[1]??'x')).href;
if(isMain&&process.argv.length>2){
 try{
  const entries=process.argv.slice(2).map(file=>pactToUsage(JSON.parse(fs.readFileSync(file,'utf8'))));
  console.log(JSON.stringify(entries.length===1?entries[0]:entries,null,2));
 }catch(error){
  console.error(String(error.message));
  process.exit(1);
 }
}
