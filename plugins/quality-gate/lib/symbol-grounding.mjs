import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isBuiltin} from 'node:module';
import {pathGlob} from './freshness.mjs';
import {projectFile} from './kernel.mjs';
import {endpointMatches,loadApiSurfaces} from './api-surface.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};

// OD-104 首版范围：JS/TS 内核原生。扫描扩展名（提取对象）与解析扩展名（存在性补全，
// 含可被 .ts 引用但不参与扫描的 .tsx/.jsx）分开
const SCAN_EXTENSIONS=['.js','.mjs','.cjs','.ts','.mts','.cts'];
const RESOLUTION_EXTENSIONS=['.js','.mjs','.cjs','.ts','.mts','.cts','.tsx','.jsx','.json'];
const SKIPPED_DIRECTORIES=new Set(['node_modules','.git','.quality-gate']);
const DEPENDENCY_SECTIONS=['dependencies','devDependencies','optionalDependencies','peerDependencies'];

export function validateSymbolGrounding(g){
 check(['L1','L2'].includes(g.level),'symbol-grounding requires L1 or L2');
 check(g.check===undefined||['changed-files','all'].includes(g.check),'check must be changed-files or all');
 check(g.baseRef===undefined||text(g.baseRef)&&!g.baseRef.startsWith('-')&&g.baseRef.length<=100,'Invalid baseRef');
 check(g.include===undefined||Array.isArray(g.include)&&g.include.length>0&&g.include.length<=50&&g.include.every(pattern=>text(pattern)&&pattern.length<=200&&!path.isAbsolute(pattern)&&!pattern.startsWith('../')&&!pattern.includes('\\')),'Invalid include patterns');
 check(g.apiSurface===undefined||(g.apiSurface!==null&&typeof g.apiSurface==='object'&&!Array.isArray(g.apiSurface)&&Object.keys(g.apiSurface).every(key=>key==='file')&&text(g.apiSurface.file)&&g.apiSurface.file.length<=200&&!path.isAbsolute(g.apiSurface.file)&&!g.apiSurface.file.startsWith('../')&&!g.apiSurface.file.includes('\\')),'Invalid apiSurface binding');
 check(g.importObservations===undefined||(Array.isArray(g.importObservations)&&g.importObservations.length>0&&g.importObservations.length<=10&&g.importObservations.every(binding=>binding!==null&&typeof binding==='object'&&!Array.isArray(binding)&&Object.keys(binding).every(key=>key==='language'||key==='file')&&(binding.language==='python'||binding.language==='java')&&text(binding.file)&&binding.file.length<=200&&!path.isAbsolute(binding.file)&&!binding.file.startsWith('../')&&!binding.file.includes('\\'))),'Invalid importObservations bindings');
}

// 保守词法预处理（单状态机，双输出）：剥离 // 行注释与 /* */ 块注释；返回两个**等长**变体——
// code（字符串内容原样，供提取）与 masked（字符串/模板内容掩码为空格、保留引号与换行，供判定
// 匹配是否落在字符串内部，防止 "select from 'users'" 之类字符串内容被当成 import）。
// 证明边界：正则字面量不识别——其中极端的连续 // 形态可能被当作行注释（方向=少报，不虚报多报）
export function prepareSource(source){
 let code='';
 let masked='';
 let quote=null;
 for(let index=0;index<source.length;index+=1){
  const char=source[index];
  const next=source[index+1];
  if(quote){
   if(char==='\\'){code+=source.slice(index,index+2);masked+='  ';index+=1;continue;}
   code+=char;
   masked+=char===quote?char:(char==='\n'?'\n':' ');
   if(char===quote)quote=null;
   continue;
  }
  if(char==='"'||char==="'"||char==='`'){quote=char;code+=char;masked+=char;continue;}
  if(char==='/'&&next==='/'){
   while(index<source.length&&source[index]!=='\n')index+=1;
   code+='\n';masked+='\n';
   continue;
  }
  if(char==='/'&&next==='*'){
   index+=2;
   while(index<source.length&&!(source[index]==='*'&&source[index+1]==='/'))index+=1;
   index+=1;
   code+=' ';masked+=' ';
   continue;
  }
  code+=char;masked+=char;
 }
 return {code,masked};
}

// 匹配是否落在字符串/模板字面量内部：对应 masked 区间去掉引号与空白后为空即在字符串内
const insideString=(masked,index,length)=>masked.slice(index,index+length).replace(/['"`\s]/g,'').length===0;

// 保守词法提取：只认静态字符串说明符（import/export…from、副作用 import、require()、
// 动态 import() 字面量）。模板字符串/变量拼接等动态形态明确不覆盖，由 dynamicForms 计数如实标注
const STATIC_PATTERNS=[
 /\bimport\s*['"]([^'"]+)['"]/g,
 /\bfrom\s*['"]([^'"]+)['"]/g,
 /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
 /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];
const DYNAMIC_PATTERNS=[
 /\brequire\s*\(\s*(?!['"])/g,
 /\bimport\s*\(\s*(?!['"])/g,
 /\bfrom\s*`/g,
 /\bimport\s*`/g
];
const MEMBER_PATTERN=/\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

export function extractImports(source){
 const {code,masked}=prepareSource(source);
 return extractImportsFrom(code,masked);
}

export function extractImportsFrom(code,masked){
 const bySpecifier=new Map();
 let dynamicForms=0;
 for(const pattern of DYNAMIC_PATTERNS){
  pattern.lastIndex=0;
  let match;
  while((match=pattern.exec(code))!==null){
   if(!insideString(masked,match.index,match[0].length))dynamicForms+=1;
  }
 }
 for(const pattern of STATIC_PATTERNS){
  pattern.lastIndex=0;
  let match;
  while((match=pattern.exec(code))!==null){
   if(insideString(masked,match.index,match[0].length))continue;
   const specifier=match[1];
   if(!text(specifier))continue;
   const line=code.slice(0,match.index).split('\n').length;
   const entry=bySpecifier.get(specifier)??{specifier,lines:[]};
   if(!entry.lines.includes(line))entry.lines.push(line);
   bySpecifier.set(specifier,entry);
  }
 }
 MEMBER_PATTERN.lastIndex=0;
 let memberMatch;
 while((memberMatch=MEMBER_PATTERN.exec(code))!==null){
  if(insideString(masked,memberMatch.index,memberMatch[0].length))continue;
  const specifier=memberMatch[2];
  if(!text(specifier))continue;
  const line=code.slice(0,memberMatch.index).split('\n').length;
  const entry=bySpecifier.get(specifier)??{specifier,lines:[]};
  if(!entry.lines.includes(line))entry.lines.push(line);
  const members=memberMatch[1].split(',').map(part=>part.trim()).filter(part=>part.length>0&&!part.startsWith('*')).map(part=>{
   const named=part.split(/\s+as\s+/);
   return {name:named[0],line,...(named[1]?{alias:named[1]}:{})};
  });
  if(members.length>0)entry.members=[...(entry.members??[]),...members];
  bySpecifier.set(specifier,entry);
 }
 return {imports:[...bySpecifier.values()],dynamicForms};
}

// 命名成员声明面（v1.20 轨道 C）：目标模块的词法导出枚举——import {x} 的 x 对账此面。
// 不可判定面 opaque 豁免（export * 再导出/CJS 运行时形状），计数如实，不虚报面也不装作可判
const EXPORT_DECLARATION=/\bexport\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|enum|interface|type|class|function)\s*\*?\s*([A-Za-z_$][\w$]*)/g;
const EXPORT_CLAUSE=/\bexport\s*\{([^}]*)\}/g;

export function enumerateExports(source){
 const {code}=prepareSource(source);
 const names=new Set();
 const reasons=[];
 if(/\bmodule\.exports\b/.test(code)||/(?<!\.)\bexports\s*\./.test(code))reasons.push('commonjs exports');
 if(/\bexport\s+\*/.test(code))reasons.push('export-all re-export');
 EXPORT_DECLARATION.lastIndex=0;
 let match;
 while((match=EXPORT_DECLARATION.exec(code))!==null)names.add(match[1]);
 EXPORT_CLAUSE.lastIndex=0;
 while((match=EXPORT_CLAUSE.exec(code))!==null){
  for(const item of match[1].split(',').map(part=>part.trim()).filter(part=>part.length>0)){
   if(item.startsWith('*'))continue;
   const named=item.split(/\s+as\s+/);
   names.add(named[1]??named[0]);
  }
 }
 return {names:[...names].sort(),opaque:reasons.length>0,...(reasons.length?{reasons}:{}),defaultExport:/\bexport\s+default\b/.test(code)};
}

// 端点引用提取：调用位词法形态首版两族（fetch('/x') 与 axios.<verb>('/x')，形态清单入 CONFIG-GUIDE）；
// 只认路径形字面量（'/' 开头，完整 URL 不提取——host 绑定边界如实）；查询串与片段剥后再对账
const ENDPOINT_PATTERNS=[
 /\bfetch\s*\(\s*['"]([^'"]+)['"]/g,
 /\baxios\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/g
];

export function extractEndpointReferences(code,masked){
 const references=[];
 for(let index=0;index<ENDPOINT_PATTERNS.length;index+=1){
  const pattern=ENDPOINT_PATTERNS[index];
  pattern.lastIndex=0;
  let match;
  while((match=pattern.exec(code))!==null){
   if(insideString(masked,match.index,match[0].length))continue;
   const raw=index===0?match[1]:match[2];
   if(!raw.startsWith('/'))continue;
   references.push({reference:raw.split('?')[0].split('#')[0],line:code.slice(0,match.index).split('\n').length,...(index===0?{}:{method:match[1].toUpperCase()})});
  }
 }
 return references.sort((left,right)=>left.line-right.line);
}

// 配置键引用提取：process.env.KEY 与 process.env['KEY'] 两形态（JS/TS 首版）
const CONFIG_KEY_PATTERNS=[
 /\bprocess\s*\.\s*env\s*\.\s*([A-Za-z_$][\w$]*)/g,
 /\bprocess\s*\.\s*env\s*\[\s*['"]([^'"]+)['"]\s*\]/g
];

export function extractConfigKeyReferences(code,masked){
 const references=[];
 for(const pattern of CONFIG_KEY_PATTERNS){
  pattern.lastIndex=0;
  let match;
  while((match=pattern.exec(code))!==null){
   if(insideString(masked,match.index,match[0].length))continue;
   references.push({key:match[1],line:code.slice(0,match.index).split('\n').length});
  }
 }
 return references.sort((left,right)=>left.line-right.line);
}

// ---- 观察输入口（v1.20 轨道 C，OD-108=C 协议部分＋OD-111=A 双向对账）----
// Python/Java import 的词法提取在内核（提取是词法知识，解析才需要真实工具链——OD-104 分界
// 不破）：适配器以真实解释器/依赖清单解析并产出观察文件，内核核验"恰好覆盖"——提取集缺回报
// = observation-coverage-gap（防瞒报，runner 无权决定引用集）；回报多出的条目进审计面（多报
// 疑点不阻断）；回报 unresolved 汇入失败面。观察文件形状 fail-closed。

export function preparePythonSource(source){
 let code='';
 let masked='';
 let quote=null;
 for(let index=0;index<source.length;index+=1){
  const char=source[index];
  if(quote){
   if(char==='\\'){code+=source.slice(index,index+2);masked+='  ';index+=1;continue;}
   code+=char;
   masked+=char===quote?char:(char==='\n'?'\n':' ');
   if(char===quote)quote=null;
   continue;
  }
  if(char==='"'||char==="'"){quote=char;code+=char;masked+=char;continue;}
  if(char==='#'){
   while(index<source.length&&source[index]!=='\n')index+=1;
   code+='\n';masked+='\n';
   continue;
  }
  code+=char;masked+=char;
 }
 return {code,masked};
}

const FOREIGN_PATTERNS={
 python:[
  /(?:^|[\n;])[ \t]*import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*)/g,
  /(?:^|[\n;])[ \t]*from\s+([A-Za-z_.][\w.]*)\s+import\b/g
 ],
 java:[
  /(?:^|[\n;])[ \t]*import\s+(?:static\s+)?([\w.]+)\s*;/g
 ]
};

export function extractForeignImports(code,masked,language){
 const byModule=new Map();
 for(const pattern of FOREIGN_PATTERNS[language]){
  pattern.lastIndex=0;
  let match;
  while((match=pattern.exec(code))!==null){
   if(insideString(masked,match.index,match[0].length))continue;
   const line=code.slice(0,match.index).split('\n').length;
   const modules=language==='python'&&pattern===FOREIGN_PATTERNS.python[0]
    ?match[1].split(/\s*,\s*/)
    :[match[1]];
   for(const module of modules){
    if(!text(module))continue;
    const entry=byModule.get(module)??{module,locations:[]};
    entry.locations.push(line);
    byModule.set(module,entry);
   }
  }
 }
 return [...byModule.values()].map(entry=>({...entry,locations:[...new Set(entry.locations)]}));
}

const OBSERVATION_RESOLUTIONS=['stdlib','third-party','project','unresolved'];

function validateImportObservation(data,language){
 check(data!==null&&typeof data==='object'&&!Array.isArray(data),'import observation must be an object');
 check(data.schemaVersion==='0.1','import observation schemaVersion must be 0.1');
 check(data.language===language,`import observation language mismatch: expected ${language}`);
 check(text(data.tool)&&data.tool.length<=200,'import observation requires a tool provenance string');
 check(Array.isArray(data.entries)&&data.entries.length<=1000,'import observation entries must be an array of at most 1000');
 for(const entry of data.entries){
  check(entry!==null&&typeof entry==='object'&&!Array.isArray(entry)&&text(entry.module)&&entry.module.length<=200&&(entry.detail===undefined||text(entry.detail)&&entry.detail.length<=200),'invalid import observation entry');
  check(OBSERVATION_RESOLUTIONS.includes(entry.resolution),'import observation resolution must be stdlib, third-party, project or unresolved');
 }
}

export function runImportObservations(bindings,extractedByLanguage,root){
 const foreignResults={};
 let gapsTotal=0;
 let unresolvedTotal=0;
 for(const binding of bindings){
  let raw;
  try{
   raw=fs.readFileSync(projectFile(root,binding.file),'utf8');
  }catch(error){
   throw new Error(`import observation file missing: ${binding.file}`);
  }
  let data;
  try{
   data=JSON.parse(raw.replace(/^\uFEFF/,''));
  }catch(error){
   throw new Error(`import observation file is not valid JSON: ${binding.file}`);
  }
  validateImportObservation(data,binding.language);
  const extracted=extractedByLanguage[binding.language]??[];
  const extractedKeys=new Set(extracted.map(entry=>entry.module));
  const reportedKeys=new Set(data.entries.map(entry=>entry.module));
  const coverageGaps=extracted.filter(entry=>!reportedKeys.has(entry.module)).map(entry=>({module:entry.module,locations:entry.locations.map(line=>`${entry.file}:${line}`)}));
  const unresolved=data.entries.filter(entry=>entry.resolution==='unresolved').map(entry=>({module:entry.module,...(entry.detail!==undefined?{detail:entry.detail}:{})}));
  const extraReported=data.entries.filter(entry=>!extractedKeys.has(entry.module)).map(entry=>entry.module);
  gapsTotal+=coverageGaps.length;
  unresolvedTotal+=unresolved.length;
  foreignResults[binding.language]={
   observation:{file:binding.file,tool:data.tool,contentSha256:createHash('sha256').update(raw,'utf8').digest('hex')},
   extractedCount:extractedKeys.size,
   reportedCount:reportedKeys.size,
   coverageGaps,
   unresolved,
   extraReported
  };
 }
 return {foreignResults,gapsTotal,unresolvedTotal};
}

// 三分类解析（Node 解析算法子集）：项目内模块 / 依赖清单（含子路径与自引用）/
// 内置模块。bare 说明符最后尝试项目根相对解析（覆盖 tsconfig baseUrl 类无别名配置）；
// tsconfig paths 别名与依赖 exports 子路径映射不覆盖（如实边界）
export function resolveSpecifier(specifier,importer,manifest,root){
 if(specifier.startsWith('node:')){
  return isBuiltin(specifier)?{resolution:'builtin',target:specifier}:{resolution:'unresolved',attempts:[`${specifier} is not a Node core module`]};
 }
 if(isBuiltin(specifier))return {resolution:'builtin',target:specifier};
 const resolveProject=(base,relative)=>{
  const candidates=[relative,...RESOLUTION_EXTENSIONS.map(ext=>relative+ext),...RESOLUTION_EXTENSIONS.map(ext=>`${relative}/index${ext}`)];
  const attempts=[];
  for(const candidate of candidates){
   const normalized=path.posix.normalize(path.posix.join(base,candidate));
   attempts.push(normalized);
   try{
    if(fs.statSync(path.join(root,normalized)).isFile())return {resolution:'project',target:normalized,attempts};
   }catch{/* 不存在即继续尝试 */}
  }
  return {resolution:'unresolved',attempts};
 };
 if(specifier.startsWith('./')||specifier.startsWith('../')||specifier==='.'||specifier==='..'){
  return resolveProject(path.posix.dirname(importer),specifier);
 }
 if(specifier.startsWith('/')||path.isAbsolute(specifier)){
  return {resolution:'unresolved',attempts:[`absolute specifier ${specifier} is outside the project module graph`]};
 }
 const segments=specifier.split('/');
 const names=segments[0].startsWith('@')?[segments.slice(0,2).join('/'),segments[0]]:[specifier,segments[0]];
 for(const name of names){
  if(DEPENDENCY_SECTIONS.some(section=>manifest[section]&&typeof manifest[section]==='object'&&name in manifest[section])){
   return {resolution:'dependency-manifest',target:name};
  }
  if(text(manifest.name)&&name===manifest.name)return {resolution:'dependency-manifest',target:`${name} (self-reference)`};
 }
 return resolveProject('.',specifier);
}

const glob=pathGlob;

function walk(root,dir,accumulator,extensions){
 for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  if(SKIPPED_DIRECTORIES.has(entry.name))continue;
  const relative=dir?`${dir}/${entry.name}`:entry.name;
  if(entry.isDirectory())walk(root,relative,accumulator,extensions);
  else if(extensions.includes(path.extname(entry.name)))accumulator.push(relative);
 }
 return accumulator;
}

const runGit=(root,args)=>{
 const result=spawnSync('git',args,{cwd:root,shell:false,encoding:'utf8',maxBuffer:1024*1024,timeout:10000,windowsHide:true});
 check(!result.error&&!result.signal&&result.status===0,`Git inspection failed: ${result.error?.code==='ENOENT'?'git executable not found; the symbol-grounding gate (changed-files mode) requires Git — install guide: https://git-scm.com/downloads':result.error?.message??result.stderr?.trim()??result.signal}`);
 return result.stdout;
};

// 引入即对账（v0.9 §4.11）：受检文件中的每个静态 import 说明符必须对账到一个已存在的声明面。
// F2P/P2P 管修复是不是真的，本门禁管引用是不是真的（存在性证明）；语义正确性不判（边界）
export function runSymbolGrounding(g,root){
 const mode=g.check??'changed-files';
 const foreignLanguages=new Set((g.importObservations??[]).map(binding=>binding.language));
 const scanExtensions=[...SCAN_EXTENSIONS,...(foreignLanguages.has('python')?['.py']:[]),...(foreignLanguages.has('java')?['.java']:[])];
 let files;
 if(mode==='all'){
  files=walk(root,'',[],scanExtensions).filter(file=>(g.include??['**/*']).some(pattern=>glob(pattern).test(file)));
 } else {
  const baseCommit=runGit(root,['rev-parse','--verify',`${g.baseRef??'HEAD'}^{commit}`]).trim();
  const entries=runGit(root,['diff','--no-ext-diff','--no-textconv','--name-status','-z',baseCommit,'--']).split('\0');
  const tracked=[];
  for(let index=0;index<entries.length;){
   if(!text(entries[index]))break;
   const status=entries[index].replace(/\d+$/,'');
   const count=status==='R'||status==='C'?3:2;
   for(let offset=1;offset<count;offset+=1)tracked.push((entries[index+offset]??'').replaceAll('\\','/'));
   index+=count;
  }
  const untracked=runGit(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean).map(file=>file.replaceAll('\\','/'));
  const include=(g.include??['**/*']).map(pattern=>glob(pattern));
  files=[...new Set([...untracked,...tracked])]
   .filter(Boolean)
   .filter(file=>!file.startsWith('.quality-gate/')&&!file.split('/').some(segment=>SKIPPED_DIRECTORIES.has(segment)))
   .filter(file=>scanExtensions.includes(path.extname(file)))
   .filter(file=>include.some(regex=>regex.test(file)))
   .sort();
 }
 let manifest={};
 if(fs.existsSync(path.join(root,'package.json')))manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const fileResults=[];
 const endpointReferences=[];
 const configKeyReferences=[];
 const extractedByLanguage={};
 for(const file of files){
  const extension=path.extname(file);
  const source=fs.readFileSync(projectFile(root,file),'utf8');
  if(extension==='.py'||extension==='.java'){
   const language=extension==='.py'?'python':'java';
   const {code,masked}=extension==='.py'?preparePythonSource(source):prepareSource(source);
   for(const entry of extractForeignImports(code,masked,language))extractedByLanguage[language]=[...(extractedByLanguage[language]??[]),{file,module:entry.module,locations:entry.locations}];
   continue;
  }
  const {code,masked}=prepareSource(source);
  const {imports,dynamicForms}=extractImportsFrom(code,masked);
  fileResults.push({path:file,dynamicForms,imports:imports.map(entry=>{const resolved=resolveSpecifier(entry.specifier,file,manifest,root);return {...entry,...resolved};})});
  if(g.apiSurface!==undefined){
   endpointReferences.push(...extractEndpointReferences(code,masked).map(reference=>({path:file,...reference})));
   configKeyReferences.push(...extractConfigKeyReferences(code,masked).map(reference=>({path:file,...reference})));
  }
 }
 // 命名成员对账（默认启用，无需声明面登记——目标模块即声明面）：仅 resolution=project 的
 // ESM 目标；opaque 面（export */CJS）豁免计数，缺成员即 unresolved-member
 const exportFaces=new Map();
 const unresolvedMember=[];
 for(const result of fileResults){
  for(const entry of result.imports){
   if(entry.members===undefined||entry.resolution!=='project')continue;
   let face=exportFaces.get(entry.target);
   if(face===undefined){
    face=fs.existsSync(path.join(root,entry.target))?enumerateExports(fs.readFileSync(path.join(root,entry.target),'utf8')):{names:[],opaque:true,reasons:['target unreadable'],defaultExport:false};
    exportFaces.set(entry.target,face);
   }
   if(face.opaque)continue;
   for(const member of entry.members){
    if(!face.names.includes(member.name))unresolvedMember.push({path:result.path,line:member.line,target:entry.target,member:member.name});
   }
  }
 }
 // API 存在性声明面对账（apiSurface 绑定即启用，OD-109 登记 文件）：端点×OpenAPI 面（{param}
 // 段通配，方法不判——fetch 不携带方法，如实边界）、配置键×schema 键面；对应类型声明面缺席
 // 则该类引用只计数不对账（无面不可判，不虚报）
 let apiSurfaceEvidence=null;
 const unresolvedReference=[];
 if(g.apiSurface!==undefined){
  const loaded=loadApiSurfaces(root,g.apiSurface.file);
  const endpointFaces=loaded.surfaces.filter(surface=>surface.endpoints!==undefined);
  const configKeys=new Set(loaded.surfaces.filter(surface=>surface.keys!==undefined).flatMap(surface=>surface.keys));
  apiSurfaceEvidence={file:g.apiSurface.file,contentSha256:loaded.contentSha256,surfaces:loaded.surfaces.map(surface=>({id:surface.id,type:surface.type,...(surface.endpoints!==undefined?{endpointCount:surface.endpoints.length}:{keyCount:surface.keys.length})})),endpointReferenceCount:endpointReferences.length,configKeyReferenceCount:configKeyReferences.length};
  if(endpointFaces.length>0){
   for(const reference of endpointReferences){
    if(!endpointFaces.some(surface=>surface.endpoints.some(endpoint=>endpointMatches(endpoint.path,reference.reference))))unresolvedReference.push({path:reference.path,line:reference.line,kind:'endpoint',reference:reference.reference});
   }
  }
  if(configKeys.size>0){
   for(const reference of configKeyReferences){
    if(!configKeys.has(reference.key))unresolvedReference.push({path:reference.path,line:reference.line,kind:'config-key',reference:reference.key});
   }
  }
 }
 let importObservationEvidence=null;
 let observationGaps=0;
 let observationUnresolved=0;
 if(g.importObservations!==undefined){
  const reconciled=runImportObservations(g.importObservations,extractedByLanguage,root);
  importObservationEvidence=reconciled.foreignResults;
  observationGaps=reconciled.gapsTotal;
  observationUnresolved=reconciled.unresolvedTotal;
 }
 const unresolved=fileResults.flatMap(result=>result.imports.filter(entry=>entry.resolution==='unresolved').map(entry=>({path:result.path,specifier:entry.specifier,lines:entry.lines,attempts:entry.attempts})));
 const importCount=fileResults.reduce((sum,result)=>sum+result.imports.length,0);
 const dynamicFormsTotal=fileResults.reduce((sum,result)=>sum+result.dynamicForms,0);
 const status=unresolved.length||unresolvedMember.length||unresolvedReference.length||observationGaps>0||observationUnresolved>0?'FAIL':'PASS';
 return {status,details:{mode,scannedFiles:files.length,importCount,dynamicFormsTotal,memberOpaqueTargets:[...exportFaces.values()].filter(face=>face.opaque).length,...(apiSurfaceEvidence!==null?{apiSurface:apiSurfaceEvidence}:{}),...(importObservationEvidence!==null?{importObservations:{observationGaps,observationUnresolved,languages:importObservationEvidence}}:{}),...(mode==='changed-files'?{baseRef:g.baseRef??'HEAD'}:{}),unresolved,unresolvedMember,unresolvedReference,files:fileResults}};
}
