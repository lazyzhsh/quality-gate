#!/usr/bin/env node
// OpenAPI→契约提取器（W8，v1.29；F06 收敛 2026-10-06 二轮评审）：把真实 OpenAPI 文档
// （声明子集）转换为 alignment 门禁的期望 items 协议（kind:'api'），使契约来源可以是真实
// OpenAPI 文件而非手工归一化 JSON。输出可直接作为 alignment.file 期望制品。
//
// 声明子集（越界即 fail-closed 非零退出，不做静默近似）：
// - OpenAPI 3.0.x，JSON 形态（YAML 不在本适配器子集内）
// - paths→operations：get/post/put/patch/delete；路径模板原样保留（{param} 段与观察端一致）
// - path item 只容忍 OpenAPI 既有的非操作字段（summary/description/servers/parameters），
//   其余键（head/options/trace/connect 或未知键）＝子集外，退出 3 指名——不静默丢操作
// - requestBody：application/json 的 schema.properties 字段名序列；schema 组合关键字
//   （allOf/oneOf/anyOf/not）子集外，退出 3——不静默展开为空字段表
// - responses：取字典序最小的 2xx 响应（确定性规则），responseFields 取其 application/json
//   schema.properties 字段名序列
// - parameters（query/path）：operation 定义按 name+in 覆盖 path 级同名同位置参数
//   （OpenAPI 语义——不是两个字段），同级内 name+in 重复＝无效输入退出 3；字段名并入
//   requestFields，path 级声明序在前（覆盖项占 path 槽位）、body 字段在后
// - $ref 在消费子树内任意深度出现即退出 3（无解析器，不做静默跳过）；components 复用、
//   非 JSON 媒体类型、yaml 同样不支持
import fs from 'node:fs';
import path from 'node:path';

const methods=['get','post','put','patch','delete'];
const PATH_ITEM_FIELDS=new Set(['summary','description','servers','parameters']);
const fail=code=>{console.error(code);process.exit(3);};
const assertSubset=(condition,code)=>{if(!condition)fail(code);};

let raw='';
for await(const chunk of process.stdin)raw+=chunk;
let request;
try{request=JSON.parse(raw);}catch{console.error('bad stdin');process.exit(2);}
const {runId,file}=request??{};
if(typeof runId!=='string'||typeof file!=='string'){console.error('stdin requires runId and file');process.exit(2);}

const documentPath=path.resolve(process.cwd(),file);
const jsonProperties=(schema,where)=>{
 assertSubset(schema!==null&&typeof schema==='object'&&!Array.isArray(schema),`non-object schema at ${where} (declared subset)`);
 assertSubset(schema.allOf===undefined&&schema.oneOf===undefined&&schema.anyOf===undefined&&schema.not===undefined,`composition (allOf/oneOf/anyOf/not) unsupported at ${where} (declared subset)`);
 assertSubset(schema.type===undefined||schema.type==='object',`non-object schema at ${where} (declared subset)`);
 const properties=schema.properties??{};
 return Object.keys(properties);
};
const mediaFields=(media,where)=>{
 assertSubset(media!==null&&typeof media==='object',`missing media object at ${where} (declared subset)`);
 const json=media.content?.['application/json'];
 assertSubset(json!==undefined,`non-JSON media at ${where} (declared subset)`);
 return jsonProperties(json.schema??{},where);
};
// 消费子树内任意深度的 $ref 都不解析——检出即退出 3（可定位路径），不做静默跳过
const assertNoRefs=(node,where)=>{
 if(Array.isArray(node)){node.forEach((item,index)=>assertNoRefs(item,`${where}[${index}]`));return;}
 if(node!==null&&typeof node==='object'){
  for(const [key,value] of Object.entries(node)){
   if(key==='$ref')fail(`$ref unsupported at ${where}.${key} (declared subset: no $ref resolution)`);
   assertNoRefs(value,`${where}.${key}`);
  }
 }
};
const parameterName=parameter=>{
 assertSubset(parameter!==null&&typeof parameter==='object','malformed parameter (declared subset)');
 assertSubset(typeof parameter.name==='string'&&['query','path'].includes(parameter.in),`parameter ${parameter?.name} in ${parameter?.in} outside declared subset`);
 return parameter.name;
};

let spec;
try{spec=JSON.parse(fs.readFileSync(documentPath,'utf8'));}
catch(error){console.error(`cannot read OpenAPI document: ${error.message}`);process.exit(3);}
assertSubset(typeof spec.openapi==='string'&&spec.openapi.startsWith('3.0'),`openapi ${spec.openapi} outside declared subset (3.0.x JSON)`);
assertSubset(spec.paths!==null&&typeof spec.paths==='object'&&!Array.isArray(spec.paths),'paths object required');

const items=[];
for(const [route,pathItem] of Object.entries(spec.paths)){
 assertSubset(pathItem!==null&&typeof pathItem==='object'&&pathItem.$ref===undefined,`$ref path item unsupported at ${route}`);
 for(const key of Object.keys(pathItem)){
  if(PATH_ITEM_FIELDS.has(key))continue;
  assertSubset(methods.includes(key),`${key} operation at ${route} outside declared subset (supported: ${methods.map(method=>method.toUpperCase()).join('/')})`);
 }
 assertNoRefs(pathItem,`paths.${route}`);
 const sharedParameters=pathItem.parameters??[];
 const sharedKeys=new Set(sharedParameters.map(parameter=>`${parameter.in}\0${parameter.name}`));
 assertSubset(sharedKeys.size===sharedParameters.length,`duplicate path-level parameter name+in at ${route}`);
 for(const method of methods){
  const operation=pathItem[method];
  if(operation===undefined)continue;
  assertSubset(operation!==null&&typeof operation==='object'&&operation.$ref===undefined,`$ref operation unsupported at ${method.toUpperCase()} ${route}`);
  const operationParameters=operation.parameters??[];
  const operationKeys=new Set(operationParameters.map(parameter=>`${parameter.in}\0${parameter.name}`));
  assertSubset(operationKeys.size===operationParameters.length,`duplicate operation-level parameter name+in at ${method.toUpperCase()} ${route}`);
  // name+in 唯一识别；operation 定义覆盖 path 级同名同位置参数（占 path 槽位），不是拼接
  const merged=[...sharedParameters];
  for(const parameter of operationParameters){
   const slot=merged.findIndex(item=>`${item.in}\0${item.name}`===`${parameter.in}\0${parameter.name}`);
   if(slot>=0)merged[slot]=parameter;
   else merged.push(parameter);
  }
  const requestFieldNames=merged.map(parameterName);
  if(operation.requestBody!==undefined){
   assertSubset(operation.requestBody.$ref===undefined,'$ref requestBody unsupported (declared subset)');
   requestFieldNames.push(...mediaFields(operation.requestBody,`${method.toUpperCase()} ${route} requestBody`));
  }
  const successCodes=Object.keys(operation.responses??{}).filter(code=>/^2\d\d$/.test(code)).sort();
  assertSubset(successCodes.length>0,`no 2xx response at ${method.toUpperCase()} ${route}`);
  const response=operation.responses[successCodes[0]];
  assertSubset(response!==null&&typeof response==='object'&&response.$ref===undefined,`$ref response unsupported at ${method.toUpperCase()} ${route}`);
  const responseFieldNames=Object.keys(response.content??{}).length?mediaFields(response,`${method.toUpperCase()} ${route} responses.${successCodes[0]}`):[];
  items.push({method:method.toUpperCase(),path:route,requestFields:requestFieldNames,responseStatus:Number(successCodes[0]),responseFields:responseFieldNames});
 }
}
console.log(JSON.stringify({schemaVersion:'0.1',runId,kind:'api',source:`openapi ${spec.openapi} subset extraction`,file,itemCount:items.length,items}));
