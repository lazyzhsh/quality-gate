// consumer-matrix demo runner：把 provider/openapi.json（最小 OpenAPI 3 形状）归一为内核
// items 形状，并回报分层来源协议的 consumerUsage——
//   orders-web：契约测试产物（contract-test，最强来源）——consumers/orders-web.pact.json
//     经 adapters/consumer-usage/pact-normalize.mjs 归一（v1.15 起提取请求 body 的字段级
//     使用面条目[叶子字段、点连接嵌套、深度 ≤4]；响应侧字段使用仍不记录，边界见适配器头注）；
//   orders-cli：调用面静态扫描（scanned，观察层弱来源）——consumers/orders-cli/ 源码经
//     adapters/consumer-usage/scan-usage.mjs 提取（v1.15 起识别 python/go/java 常见调用
//     形状；动态 URL/SDK 封装会漏，边界见头注）；
//   settlement-batch：runner 自报（declared，摘要降权标注）。
// mode:'static' 如实声明（文件读取，未对真实服务发请求）；sourceFingerprint 声明即核验。
// 适配器经相对路径 ../../../adapters/ 原位引用（插件树内运行；测试拷贝保持
// examples/<demo> 与 adapters/ 的相对层级，见 tests/consumer-matrix.test.mjs）。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pactToUsage} from '../../../adapters/consumer-usage/pact-normalize.mjs';
import {scanUsage} from '../../../adapters/consumer-usage/scan-usage.mjs';

let input='';
for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const providerFile='provider/openapi.json';
const raw=fs.readFileSync(providerFile);
const document=JSON.parse(raw.toString('utf8'));
const items=[];
for(const [pathName,pathItem] of Object.entries(document.paths??{}))
 for(const [method,operation] of Object.entries(pathItem)){
  if(!['get','post','put','patch','delete'].includes(method))continue;
  const fields=operation.requestBody?.content?.['application/json']?.schema?.properties;
  items.push({path:pathName,method:method.toUpperCase(),...(fields?{fields:Object.fromEntries(Object.entries(fields).map(([field,schema])=>[field,schema.type]))}:{})});
 }
const pactUsage=pactToUsage(JSON.parse(fs.readFileSync('consumers/orders-web.pact.json','utf8')));
const cliDir='consumers/orders-cli';
const cliSources=fs.readdirSync(cliDir).filter(name=>name.endsWith('.mjs')||name.endsWith('.js')).map(name=>fs.readFileSync(path.join(cliDir,name),'utf8'));
const scannedUsage=scanUsage(cliSources,{consumer:'orders-cli'});
console.log(JSON.stringify({
 schemaVersion:'0.1',
 runId:request.runId,
 kind:'consumer-matrix',
 source:'consumer-matrix-demo/scripts/observe.mjs (provider/openapi.json, minimal OpenAPI 3)',
 items,
 mode:'static',
 sourceFingerprint:{file:providerFile,sha256:createHash('sha256').update(raw).digest('hex')},
 consumerUsage:[
  pactUsage,
  scannedUsage,
  {consumer:'settlement-batch',usage:'declared',items:[{path:'/refunds',method:'POST',field:'amount'},{path:'/refunds',method:'POST',field:'reason'}]}
 ]
}));
