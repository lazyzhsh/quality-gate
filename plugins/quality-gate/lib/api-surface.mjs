import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectFile} from './kernel.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};

// API 存在性声明面（v1.20 轨道 C，OD-109 裁决=登记文件）：registries/api-surface.json 集中登记
// OpenAPI 端点面 / JSON Schema 配置键面（类型声明面不在登记内——命名 import 成员对账的
// 声明面就是目标模块自身，随解析即得）。声明即核验：登记文件与全部声明面文件缺失或畸形
// 一律 fail-closed；openapi-yaml 的 JSON 归一产物（OD-110：YAML 经 Python 参考适配器归一）
// 过期（源 mtime 晚于归一 mtime）同样 fail-closed——过期面比对等于对账幻影。
const SURFACE_TYPES=['openapi','openapi-yaml','json-schema'];
const HTTP_METHODS=['get','put','post','delete','options','head','patch','trace'];

const safePath=value=>text(value)&&value.length<=200&&!path.isAbsolute(value)&&!value.startsWith('../')&&!value.includes('\\');

export function validateApiSurfaceRegistry(data){
 check(data!==null&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.surfaces)&&data.surfaces.length>0&&data.surfaces.length<=50,'Expected 1..50 api surfaces');
 check(new Set(data.surfaces.map(surface=>surface.id)).size===data.surfaces.length,'Duplicate api surface id');
 for(const surface of data.surfaces){
  check(text(surface.id)&&surface.id.length<=100,'Invalid api surface id');
  check(SURFACE_TYPES.includes(surface.type),'api surface type must be openapi, openapi-yaml or json-schema');
  check(safePath(surface.file),'Invalid api surface file');
  check(surface.source!==null&&typeof surface.source==='object'&&!Array.isArray(surface.source)&&text(surface.source.file)&&surface.source.file.length<=200&&(surface.source.section===undefined||text(surface.source.section)&&surface.source.section.length<=200),'api surface requires a provenance source {file, section?}');
  if(surface.type==='openapi-yaml'){
   check(safePath(surface.normalizedFile),'openapi-yaml requires a normalizedFile');
  }else{
   check(surface.normalizedFile===undefined,'normalizedFile only applies to openapi-yaml');
  }
 }
}

// OpenAPI 端点面：paths × 声明的方法。$ref path item 与 servers basePath 不展开（如实边界：
// 面只取文档显式声明的操作，方向=不虚报面）；零端点文档 fail-closed（空面会让一切引用误判未解析）
export function enumerateOpenApiEndpoints(document){
 check(document!==null&&typeof document==='object'&&!Array.isArray(document),'Invalid OpenAPI document: object required');
 check(document.paths!==null&&typeof document.paths==='object'&&!Array.isArray(document.paths),'Invalid OpenAPI document: paths object required');
 const endpoints=[];
 for(const [route,operations] of Object.entries(document.paths)){
  check(typeof route==='string'&&route.startsWith('/'),`Invalid OpenAPI path: ${route}`);
  check(operations!==null&&typeof operations==='object'&&!Array.isArray(operations),`Invalid OpenAPI path item: ${route}`);
  for(const method of HTTP_METHODS){
   if(operations[method]!==undefined){
    check(operations[method]!==null&&typeof operations[method]==='object'&&!Array.isArray(operations[method]),`Invalid OpenAPI operation: ${method.toUpperCase()} ${route}`);
    endpoints.push({method:method.toUpperCase(),path:route});
   }
  }
 }
 check(endpoints.length>0,'OpenAPI document declares no endpoints');
 return endpoints;
}

// JSON Schema 配置键面：properties 递归枚举为点分键路径（嵌套结构供 'a.b' 形态访问对账）。
// patternProperties/条件组合（oneOf/anyIf 等）不展开（如实边界）；零键 schema fail-closed
export function enumerateSchemaKeys(schema){
 check(schema!==null&&typeof schema==='object'&&!Array.isArray(schema),'Invalid JSON Schema document');
 const keys=new Set();
 const walk=(node,prefix)=>{
  if(node.properties===undefined)return;
  check(node.properties!==null&&typeof node.properties==='object'&&!Array.isArray(node.properties),`Invalid properties at ${prefix||'root'}`);
  for(const [key,child] of Object.entries(node.properties)){
   check(text(key),`Invalid property name at ${prefix||'root'}`);
   const full=prefix?`${prefix}.${key}`:key;
   keys.add(full);
   check(child!==null&&typeof child==='object'&&!Array.isArray(child),`Invalid property schema at ${full}`);
   walk(child,full);
  }
 };
 walk(schema,'');
 check(keys.size>0,'JSON Schema declares no properties');
 return [...keys].sort();
}

// 端点引用匹配：{param} 模板段按段级通配（'/users/{id}' 匹配 '/users/42'，不匹配 '/users/42/posts'）；
// 查询串由调用方剥离后传入
export function endpointMatches(declaredPath,referencedPath){
 const declared=declaredPath.split('/');
 const referenced=referencedPath.split('/');
 if(declared.length!==referenced.length)return false;
 return declared.every((segment,index)=>segment===referenced[index]||(segment.startsWith('{')&&segment.endsWith('}')&&referenced[index].length>0));
}

// 载入声明面：登记文件存在＋validate＋内容哈希；逐声明面枚举端点/键面入证据。
// openapi-yaml 读归一 JSON（源 YAML 只做存在性与新鲜度哨兵——内核不解析 YAML，OD-110）
export function loadApiSurfaces(root,file){
 let raw;
 try{
  raw=fs.readFileSync(projectFile(root,file),'utf8');
 }catch(error){
  if(error.code!=='ENOENT')throw new Error(`api surface registry unreadable: ${file}`);
  throw new Error(`api surface registry missing: ${file}`);
 }
 let data;
 try{
  data=JSON.parse(raw.replace(/^\uFEFF/,''));
 }catch(error){
  throw new Error(`api surface registry is not valid JSON: ${file}`);
 }
 validateApiSurfaceRegistry(data);
 const surfaces=data.surfaces.map(surface=>{
  const readFile=relative=>{
   const content=fs.readFileSync(projectFile(root,relative),'utf8');
   check(content.trim().length>0,`api surface file is empty: ${relative}`);
   return content;
  };
  if(surface.type==='json-schema'){
   return {id:surface.id,type:surface.type,file:surface.file,source:surface.source,keys:enumerateSchemaKeys(JSON.parse(readFile(surface.file)))};
  }
  if(surface.type==='openapi-yaml'){
   const yamlStat=fs.statSync(projectFile(root,surface.file));
   const normalizedStat=fs.statSync(projectFile(root,surface.normalizedFile));
   check(yamlStat.mtimeMs<=normalizedStat.mtimeMs,`stale normalization: ${surface.normalizedFile} predates ${surface.file} — rerun the YAML normalization adapter`);
   return {id:surface.id,type:surface.type,file:surface.file,normalizedFile:surface.normalizedFile,source:surface.source,endpoints:enumerateOpenApiEndpoints(JSON.parse(readFile(surface.normalizedFile)))};
  }
  return {id:surface.id,type:surface.type,file:surface.file,source:surface.source,endpoints:enumerateOpenApiEndpoints(JSON.parse(readFile(surface.file)))};
 });
 return {file,contentSha256:createHash('sha256').update(raw,'utf8').digest('hex'),surfaces};
}
