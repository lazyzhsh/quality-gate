import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';

// E6 API 消费者链层（v1.12.0，用户选定方案 B：独立 kind）：回答"provider 当前契约对每个
// 消费者是否兼容、一次变更破坏了谁"。分层来源协议：
//  - 声明层（必需）：每个消费者声明期望文件（端点+字段+类型词汇——类型为项目自有字符串，
//    内核比较相等性）；runner 观察 provider 当前契约（items 同形状），内核逐消费者比对，
//    产出兼容矩阵与破坏归因表（attribution：provider 项 → 被破坏消费者列表）。
//  - 观察层（可选）：runner 可回报 consumerUsage（逐消费者使用面 + 来源枚举
//    scanned|contract-test|declared）——usage 超出声明期望即 FAIL"使用面超出声明期望"
//    （期望过期不可静默）；declared 来源无扫描/契约测试佐证，摘要降级标注（W3 模式）。
// 观察可信度沿用 alignment 协议：mode live|static（static 降级，requireLive 强制）、
// sourceFingerprint 声明即核验。ignoreRoutes 只豁免声明的路由模式（'*' 通配一段），
// 被忽略项留在证据 ignoredBreaking，不放行未声明的漂移。
const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

const COMPATIBILITY_LEVELS=['backward','exact'];
const USAGE_SOURCES=['scanned','contract-test','declared'];

const validateItems=(items,label)=>{
 check(Array.isArray(items)&&items.length>0&&items.length<=(label==='provider'?500:200),`Invalid ${label} items`);
 check(items.every(item=>object(item)&&text(item.path)&&item.path.startsWith('/')&&text(item.method)&&(!('fields'in item)||object(item.fields)&&Object.keys(item.fields).length<=50&&Object.entries(item.fields).every(([field,type])=>text(field)&&text(type)))),`Invalid ${label} items`);
 check(new Set(items.map(item=>`${item.method} ${item.path}`)).size===items.length,`Duplicate ${label} endpoint`);
};

export function validateConsumerMatrix(g){
 check(Array.isArray(g.consumers)&&g.consumers.length>0&&g.consumers.length<=20&&g.consumers.every(consumer=>object(consumer)&&text(consumer.id)&&text(consumer.expectedFile)&&(consumer.compatibilityLevel===undefined||COMPATIBILITY_LEVELS.includes(consumer.compatibilityLevel))),'consumer-matrix requires 1..20 consumers {id, expectedFile, compatibilityLevel? backward|exact}');
 check(new Set(g.consumers.map(consumer=>consumer.id)).size===g.consumers.length,'Duplicate consumer id');
 check(g.ignoreRoutes===undefined||(Array.isArray(g.ignoreRoutes)&&g.ignoreRoutes.length>0&&g.ignoreRoutes.length<=50&&g.ignoreRoutes.every(pattern=>text(pattern)&&pattern.startsWith('/'))),'Invalid ignoreRoutes');
 check(g.requireLive===undefined||typeof g.requireLive==='boolean','Invalid requireLive');
 check(g.requireSourceFingerprint===undefined||typeof g.requireSourceFingerprint==='boolean','Invalid requireSourceFingerprint');
}

const routeMatches=(path,pattern)=>{
 const segments=path.split('/');
 const wanted=pattern.split('/');
 return segments.length===wanted.length&&wanted.every((segment,index)=>segment==='*'||segment===segments[index]);
};

export function runConsumerMatrix(g,root){
 const runId=randomUUID();
 const expectedByConsumer=new Map();
 const expectedSha256={};
 for(const consumer of g.consumers){
  const file=projectFile(root,consumer.expectedFile);
  const raw=fs.readFileSync(file);
  check(raw.length<=65536,'Consumer expectation too large');
  const parsed=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
  check(object(parsed)&&parsed.schemaVersion==='0.1'&&parsed.kind==='consumer-matrix'&&parsed.consumer===consumer.id&&Array.isArray(parsed.items),`Invalid consumer expectation file for ${consumer.id} (must bind consumer id)`);
  validateItems(parsed.items,`consumer ${consumer.id}`);
  expectedByConsumer.set(consumer.id,parsed.items);
  expectedSha256[consumer.id]=createHash('sha256').update(raw).digest('hex');
 }
 const argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,kind:'consumer-matrix',consumers:g.consumers.map(consumer=>consumer.id)})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Consumer matrix runner failed'}};
 try{
  const observation=JSON.parse(result.stdout);
  check(object(observation)&&observation.schemaVersion==='0.1'&&observation.runId===runId&&observation.kind==='consumer-matrix'&&text(observation.source)&&Array.isArray(observation.items),'Invalid or stale consumer matrix observation');
  validateItems(observation.items,'provider');
  const mode=observation.mode===undefined?null:(['live','static'].includes(observation.mode)?observation.mode:check(false,'Invalid observation mode'));
  let fingerprint=null;
  if(observation.sourceFingerprint!==undefined&&observation.sourceFingerprint!==null){
   const declared=observation.sourceFingerprint;
   check(object(declared)&&Object.keys(declared).length===2&&text(declared.file)&&/^[0-9a-f]{64}$/.test(declared.sha256??''),'Invalid observation sourceFingerprint');
   const file=projectFile(root,declared.file);
   const actual=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   fingerprint={file:declared.file,sha256:declared.sha256,actualSha256:actual,status:actual===declared.sha256?'VERIFIED':'MISMATCH'};
  }
  // 分层来源协议（观察层，可选）：逐消费者使用面 + 来源枚举；越界使用使用即 FAIL（期望过期不可静默）
  const usageByConsumer=new Map();
  if(observation.consumerUsage!==undefined&&observation.consumerUsage!==null){
   check(Array.isArray(observation.consumerUsage)&&observation.consumerUsage.every(entry=>object(entry)&&text(entry.consumer)&&USAGE_SOURCES.includes(entry.usage)&&(entry.items===undefined||Array.isArray(entry.items)&&entry.items.length<=200&&entry.items.every(item=>object(item)&&text(item.path)&&item.path.startsWith('/')&&text(item.method)&&(item.field===undefined||text(item.field))))),'Invalid consumerUsage observation');
   check(new Set(observation.consumerUsage.map(entry=>entry.consumer)).size===observation.consumerUsage.length,'Duplicate consumerUsage consumer');
   for(const entry of observation.consumerUsage)usageByConsumer.set(entry.consumer,entry);
  }
  const providerFields=new Map(observation.items.map(item=>[`${item.method} ${item.path}`,item.fields??{}]));
  const matrix=[];
  const breakingByItem=new Map();
  const ignoredBreaking=[];
  const usageFindings=[];
  for(const consumer of g.consumers){
   const compatibilityLevel=consumer.compatibilityLevel??'backward';
   const findings=[];
   for(const item of expectedByConsumer.get(consumer.id)){
    const key=`${item.method} ${item.path}`;
    const actualFields=providerFields.get(key);
    if(actualFields===undefined)findings.push({path:item.path,method:item.method,rule:'missingEndpoint'});
    else{
     for(const [field,type] of Object.entries(item.fields??{})){
      if(!(field in actualFields))findings.push({path:item.path,method:item.method,field,rule:'missingField',expected:type});
      else if(actualFields[field]!==type)findings.push({path:item.path,method:item.method,field,rule:'typeChanged',expected:type,actual:actualFields[field]});
     }
     if(compatibilityLevel==='exact')for(const field of Object.keys(actualFields))if(!Object.hasOwn(item.fields??{},field))findings.push({path:item.path,method:item.method,field,rule:'unexpectedField'});
    }
   }
   const ignored=g.ignoreRoutes?findings.filter(finding=>g.ignoreRoutes.some(pattern=>routeMatches(finding.path,pattern))):[];
   const judged=findings.filter(finding=>!ignored.includes(finding));
   for(const finding of judged){
    const itemKey=`${finding.method} ${finding.path}${finding.field?` ${finding.field}`:''}`;
    const attributed=breakingByItem.get(itemKey)??{...finding,brokenConsumers:[]};
    attributed.brokenConsumers.push(consumer.id);
    breakingByItem.set(itemKey,attributed);
   }
   ignoredBreaking.push(...ignored.map(finding=>({consumer:consumer.id,...finding})));
   // 观察层判定：使用面必须被声明期望覆盖（端点在期望中，且字段级使用在期望字段中）
   const usage=usageByConsumer.get(consumer.id);
   if(usage)for(const used of usage.items??[]){
    const expectedItem=expectedByConsumer.get(consumer.id).find(item=>item.method===used.method&&item.path===used.path);
    if(expectedItem===undefined||(used.field!==undefined&&!Object.hasOwn(expectedItem.fields??{},used.field)))usageFindings.push({consumer:consumer.id,path:used.path,method:used.method,...(used.field!==undefined?{field:used.field}:{})});
   }
   matrix.push({consumer:consumer.id,compatibilityLevel,status:judged.length?'broken':'compatible',breakingCount:judged.length,ignoredCount:ignored.length,...(usage?{usageSource:usage.usage,usageItemCount:(usage.items??[]).length}:{})});
  }
  const staticBlocked=mode==='static'&&g.requireLive===true;
  const fingerprintBlocked=(g.requireSourceFingerprint===true&&fingerprint===null)||fingerprint?.status==='MISMATCH';
  const broken=breakingByItem.size||usageFindings.length;
  return {status:broken||staticBlocked||fingerprintBlocked?'FAIL':'PASS',details:{
   ...execution,source:observation.source,expectedSha256,
   ...(mode?{observationMode:mode}:{}),...(fingerprint?{sourceFingerprint:fingerprint}:{}),
   ...(staticBlocked?{requireLive:g.requireLive}:{}),...(g.requireSourceFingerprint===true&&fingerprint===null?{missingSourceFingerprint:true}:{}),
   matrix,attribution:[...breakingByItem.values()],
   ...(ignoredBreaking.length?{ignoredBreaking,ignoreRoutes:g.ignoreRoutes}:{}),
   ...(observation.consumerUsage?{consumerUsage:observation.consumerUsage}:{}),
   ...(usageFindings.length?{usageFindings}:{})}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
