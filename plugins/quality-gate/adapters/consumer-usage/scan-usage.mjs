#!/usr/bin/env node
// 消费者调用面扫描参考（v1.13 T5，consumer-matrix 观察层；v1.15 T7 多语言扩展）：对消费者
// 源码做静态正则扫描，提取 HTTP 调用面 → consumerUsage 条目（usage:'scanned'）。零 npm 依赖。
//
// 识别形状（参考级，非完备解析）：
// - JS/TS：fetch('<url>', {method:'POST'}) / fetch(`<url>`)——method 缺省按 GET；options 里
//   的 method 以调用点后同一条语句内的 method:'X' 为准（到分号或 160 字符截断）；
//   axios.get/post/put/patch/delete('<url>') 与 axios('<url>', {method:'X'})；
// - Python（v1.15）：requests./httpx. 的 get|post|put|patch|delete('<url>')；
// - Go（v1.15）：http.Get/Post/Head('<url>') 与 http.NewRequest(http.MethodX, '<url>', …)；
// - Java（v1.15）：RestTemplate 的 getXxxForEntity/Object、postForEntity/Object('<url>')
//   与 OkHttp Request.Builder().url('<url>').get()/post() 链式形状；
// - URL 取路径段：绝对地址剥 origin，相对地址须以 / 开头；query 串剥离；非路径跳过。
//
// 边界如实：静态正则扫描——动态拼接 URL、SDK 封装层、间接调用会漏，运行时配置的
// method 取不到；多语言形状只覆盖各生态最常见调用式（如 Python requests.request('POST',…)、
// Go resty、Java WebClient 均不在识别集合）。scanned 是观察层弱来源（内核只把它当使用面
// 证据，不当契约正确性证明）；漏扫意味着"使用面小于真实面"，超出声明期望的 FAIL 判定
// 可能因此偏松——项目应结合契约测试产物（contract-test）或如实登记 declared。
//
// CLI：node scan-usage.mjs --consumer <id> <file-or-dir…>（目录递归扫
// .js/.mjs/.cjs/.ts/.jsx/.tsx/.py/.go/.java）；输出一个 consumerUsage 条目对象（JSON）。
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SCANNABLE=/\.(js|mjs|cjs|ts|jsx|tsx|py|go|java)$/;

const pathOf=url=>{
 const target=url.split('?')[0];
 const match=/^https?:\/\/[^/]+(\/.*)$/.exec(target);
 const candidate=match?match[1]:target;
 return candidate.startsWith('/')?candidate:null;
};

// 每个形状一个提取器（match → {url, method}|null），explicit 形状 method 由捕获组给出，
// 其余缺省 GET 后经同语句 method 前瞻补全。
const VERB='get|post|put|patch|delete';
const patterns=[
 {re:new RegExp(`\\bfetch\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`,'g'),extract:m=>({url:m[2]})},
 {re:new RegExp(`\\baxios\\s*\\.\\s*(${VERB})\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,'g'),extract:m=>({url:m[3],method:m[1]})},
 {re:new RegExp(`\\baxios\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`,'g'),extract:m=>({url:m[2]})},
 {re:new RegExp(`\\brequests\\s*\\.\\s*(${VERB})\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,'g'),extract:m=>({url:m[3],method:m[1]})},
 {re:new RegExp(`\\bhttpx\\s*\\.\\s*(${VERB})\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,'g'),extract:m=>({url:m[3],method:m[1]})},
 {re:new RegExp(`\\bhttp\\s*\\.\\s*([gG]et|[pP]ost|[hH]ead)\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,'g'),extract:m=>({url:m[3],method:m[1]})},
 {re:new RegExp(`\\bhttp\\.Method(Get|Post|Put|Patch|Delete)\\s*,\\s*(['"\`])([^'"\`]+)\\2`,'g'),extract:m=>({url:m[3],method:m[1]})},
 {re:new RegExp(`\\.(${VERB})For(?:Entity|Object)\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,'g'),extract:m=>({url:m[3],method:m[1]})},
 {re:new RegExp(`\\.url\\s*\\(\\s*(['"\`])([^'"\`]+)\\1\\s*\\)\\s*\\.\\s*(${VERB})\\s*\\(`,'g'),extract:m=>({url:m[2],method:m[3]})}
];

export function scanUsage(sources,{consumer}){
 if(typeof consumer!=='string'||!consumer.trim())throw new Error('scanUsage requires a consumer id');
 if(!Array.isArray(sources)||sources.length===0||!sources.every(source=>typeof source==='string'&&source.trim()))throw new Error('scanUsage requires non-empty source texts');
 const items=[];
 const seen=new Set();
 for(const text of sources){
  for(const {re,extract} of patterns){
   re.lastIndex=0;
   let match;
   while((match=re.exec(text))){
    const found=extract(match);
    const target=pathOf(found.url);
    if(!target)continue;
    let method=found.method?found.method.toUpperCase():'GET';
    if(!found.method){
     // method 只在**同一条语句内**找（到下一个分号或 160 字符截断）——跨语句前瞻会把
     // 后续调用的 method 误记到当前调用上
     const stop=text.indexOf(';',re.lastIndex);
     const tail=text.slice(re.lastIndex,stop===-1?re.lastIndex+160:Math.min(stop,re.lastIndex+160));
     const methodMatch=/method\s*:\s*['"`](\w+)['"`]/.exec(tail);
     if(methodMatch)method=methodMatch[1].toUpperCase();
    }
    const key=`${method} ${target}`;
    if(seen.has(key))continue;
    seen.add(key);
    items.push({path:target,method});
   }
  }
 }
 return {consumer,usage:'scanned',items};
}

function collect(targets){
 const files=[];
 for(const target of targets){
  const stat=fs.statSync(target);
  if(stat.isFile())files.push(target);
  else if(stat.isDirectory()){
   const queue=[target];
   while(queue.length){
    const dir=queue.shift();
    for(const name of fs.readdirSync(dir)){
     const full=path.join(dir,name);
     const st=fs.statSync(full);
     if(st.isDirectory())queue.push(full);
     else if(SCANNABLE.test(full))files.push(full);
    }
   }
  }else throw new Error(`no such file or directory: ${target}`);
 }
 return files;
}

const isMain=import.meta.url===pathToFileURL(path.resolve(process.argv[1]??'x')).href;
if(isMain){
 try{
  const argv=process.argv.slice(2);
  const consumerIndex=argv.indexOf('--consumer');
  if(consumerIndex===-1||consumerIndex+1>=argv.length)throw new Error('usage: scan-usage.mjs --consumer <id> <file-or-dir…>');
  const consumer=argv[consumerIndex+1];
  const targets=argv.filter((_,index)=>index!==consumerIndex&&index!==consumerIndex+1);
  if(targets.length===0)throw new Error('no source files or directories given');
  const files=collect(targets);
  if(files.length===0)throw new Error('no scannable source files found (js/mjs/cjs/ts/jsx/tsx)');
  const entry=scanUsage(files.map(file=>fs.readFileSync(file,'utf8')),{consumer});
  console.log(JSON.stringify(entry,null,2));
 }catch(error){
  console.error(String(error.message));
  process.exit(1);
 }
}
