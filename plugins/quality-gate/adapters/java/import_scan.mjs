#!/usr/bin/env node
// qgate symbol-grounding Java import 参考 适配器（v1.20 轨道 C，OD-104/OD-111）。
//
// 用法:
//   node adapters/java/import_scan.mjs --output .quality-gate/observations/imports-java.json src/Main.java ...
//
// 对账形状（与内核双向对账约定一致）:
// - 按与内核相同的语句锚定词法规则提取 import（import a.b.C; / import static 全链名）;
// - 分类: stdlib（JDK 内建包前缀 java./javax./jakarta./org.w3c./org.xml./org.ietf./org.omg.）/
//   project（package 声明定位源根后，import 点分路径解析到扫描集内的 .java 文件）/
//   third-party（pom.xml <groupId>/<artifactId> 或 build.gradle 'group:artifact:ver' 词法提取的
//   groupId 前缀命中）;
// - 其余 unresolved（detail 指名不在依赖清单）。JDK 边界如实: 纯清单与源码对账，不编译。
// 产出观察文件 {schemaVersion:'0.1', language:'java', tool, entries}——供 importObservations 消费。

import fs from 'node:fs';
import path from 'node:path';

const IMPORT_PATTERN=/(?:^|[\n;])[ \t]*import\s+(?:static\s+)?([\w.]+)\s*;/g;
const PACKAGE_PATTERN=/(?:^|[\n;])[ \t]*package\s+([\w.]+)\s*;/g;
const POM_DEPENDENCY=/<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g;
const GRADLE_DEPENDENCY=/['"]([\w.-]+):([\w.-]+):[^'"]+['"]/g;
const JDK_PREFIXES=['java.','javax.','jakarta.','org.w3c.','org.xml.','org.ietf.','org.omg.'];

const stripCommentsAndStrings=source=>{
 let out='';
 let quote=null;
 for(let index=0;index<source.length;index+=1){
  const char=source[index];
  const next=source[index+1];
  if(quote){
   if(char==='\\'){out+='  ';index+=1;continue;}
   out+=char===quote||char==='\n'?char:' ';
   if(char===quote)quote=null;
   continue;
  }
  if(char==='"'||char==="'"){quote=char;out+=char;continue;}
  if(char==='/'&&next==='/'){
   while(index<source.length&&source[index]!=='\n')index+=1;
   out+='\n';
   continue;
  }
  if(char==='/'&&next==='*'){
   index+=2;
   while(index<source.length&&!(source[index]==='*'&&source[index+1]==='/'))index+=1;
   index+=1;
   out+=' ';
   continue;
  }
  out+=char;
 }
 return out;
};

const args=process.argv.slice(2);
let output=null;
const files=[];
for(let index=0;index<args.length;index+=1){
 if(args[index]==='--output')output=args[++index];
 else files.push(args[index]);
}
if(files.length===0){
 console.error('no java source files given; usage: node import_scan.mjs --output <obs.json> <files...>');
 process.exit(1);
}

const root=process.cwd();
const prepared=new Map();
const packageRoots=new Map();
for(const file of files){
 const code=stripCommentsAndStrings(fs.readFileSync(path.resolve(root,file),'utf8'));
 prepared.set(file.replaceAll('\\','/'),code);
 PACKAGE_PATTERN.lastIndex=0;
 let packageMatch=PACKAGE_PATTERN.exec(code);
 while(packageMatch){
  const packageName=packageMatch[1];
  const suffix=`/${packageName.split('.').join('/')}/`;
  const normalized=file.replaceAll('\\','/');
  // 包路径是路径中段（源根+包目录+文件名），取最深一次出现切出源根
  const at=normalized.lastIndexOf(suffix);
  const cut=at>=0?normalized.slice(0,at):null;
  if(cut!==null&&!packageRoots.has(packageName))packageRoots.set(packageName,cut);
  packageMatch=PACKAGE_PATTERN.exec(code);
 }
}

const groupIds=new Set();
for(const manifest of ['pom.xml','build.gradle','build.gradle.kts']){
 const manifestPath=path.join(root,manifest);
 if(!fs.existsSync(manifestPath))continue;
 const text=fs.readFileSync(manifestPath,'utf8');
 if(manifest==='pom.xml'){
  POM_DEPENDENCY.lastIndex=0;
  let match=POM_DEPENDENCY.exec(text);
  while(match){
   groupIds.add(match[1]);
   groupIds.add(`${match[1]}.${match[2]}`);
   match=POM_DEPENDENCY.exec(text);
  }
 }else{
  GRADLE_DEPENDENCY.lastIndex=0;
  let match=GRADLE_DEPENDENCY.exec(text);
  while(match){
   groupIds.add(match[1]);
   groupIds.add(`${match[1]}.${match[2]}`);
   match=GRADLE_DEPENDENCY.exec(text);
  }
 }
}

const resolvesToSource=dotted=>{
 const asPath=dotted.split('.').join('/');
 for(let depth=dotted.split('.').length-1;depth>=1;depth-=1){
  const packageName=dotted.split('.').slice(0,depth).join('.');
  const base=packageRoots.get(packageName);
  if(base===undefined)continue;
  const candidate=`${base}/${asPath}.java`;
  if(prepared.has(candidate))return true;
 }
 return false;
};

const seen=new Map();
for(const file of files){
 const code=prepared.get(file);
 IMPORT_PATTERN.lastIndex=0;
 let match=IMPORT_PATTERN.exec(code);
 while(match){
  const module=match[1];
  if(!seen.has(module)){
   let resolution;
   let detail;
   if(JDK_PREFIXES.some(prefix=>module.startsWith(prefix))){
    resolution='stdlib';
    detail='JDK built-in package prefix';
   }else if(resolvesToSource(module)){
    resolution='project';
    detail='resolves to a scanned source file';
   }else if([...groupIds].some(groupId=>module===groupId||module.startsWith(`${groupId}.`))){
    resolution='third-party';
    detail='declared in dependency manifest (lexical)';
   }else{
    resolution='unresolved';
    detail='not in dependency manifest and not a scanned source';
   }
   seen.set(module,{module,resolution,detail});
  }
  match=IMPORT_PATTERN.exec(code);
 }
}

const observation={
 schemaVersion:'0.1',
 language:'java',
 tool:'adapters/java/import_scan.mjs',
 entries:[...seen.values()].sort((left,right)=>left.module<right.module?-1:left.module>right.module?1:0)
};
const serialized=JSON.stringify(observation,null,2)+'\n';
if(output){
 fs.mkdirSync(path.dirname(path.resolve(root,output)),{recursive:true});
 fs.writeFileSync(path.resolve(root,output),serialized);
 console.log(`wrote ${seen.size} entries to ${output}`);
}else{
 console.log(serialized);
}
