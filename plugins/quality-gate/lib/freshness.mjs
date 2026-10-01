import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Stop verdict reuse is limited to deterministic file checks with identical content
// snapshots before/after execution and now. Unknown inputs always force a rerun.
const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export const pathGlob=pattern=>{
 check(text(pattern)&&!path.isAbsolute(pattern)&&!pattern.startsWith('../')&&!pattern.includes('\\')&&!pattern.includes('\0')&&pattern.length<=200,'Invalid path pattern');
 const escaped=pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*\//g,'\u0002').replace(/\*\*/g,'\u0001').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]').replace(/\u0002/g,'(?:.*/)?').replace(/\u0001/g,'.*');
 return new RegExp(`^${escaped}$`);
};

export function configSha256(root){
 const raw=fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8');
 return createHash('sha256').update(raw).digest('hex');
}

// 最近一次指定阶段的归档 run：按文件 mtime 从新到旧回看，最多解析 maxScan 个
export function latestRun(root,stage='close',maxScan=5){
 const dir=path.join(root,'.quality-gate','runs');
 let names;
 try{names=fs.readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>({name,mtime:fs.statSync(path.join(dir,name)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime);}
 catch(err){if(err.code==='ENOENT')return null;throw err;}
 for(const item of names.slice(0,maxScan)){
  try{
   const report=JSON.parse(fs.readFileSync(path.join(dir,item.name),'utf8'));
   if(report.stage===stage)return report;
  }catch{/* 损坏报告跳过，继续回看更早的 */}
 }
 return null;
}

const defaultMaxEntries=100000;
// finishedAt 之后项目内变更的相对路径列表（/ 分隔）。.quality-gate/runs 是报告输出目录
// 不构成输入，其余文件（登记文件、build 产物）一律参与判定；符号链接跳过。变更数超过
// limit 或遍历超过 maxEntries 时返回 null（无法完整枚举 → 调用方按"已变更"处理，fail-safe，
// 避免截断清单漏掉命中的门禁输入而误降级）。
export function modifiedSince(root,finishedAt,{maxEntries=defaultMaxEntries,limit=200}={}){
 const cutoff=Date.parse(finishedAt);
 if(!text(finishedAt)||!Number.isFinite(cutoff))return null;
 const changed=[];let visited=0;let unknown=false;
 const walk=dir=>{
  let entries;
  try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{unknown=true;return;}
  for(const entry of entries){
   if(++visited>maxEntries){unknown=true;return;}
   const abs=path.join(dir,entry.name);
   if(entry.isDirectory()){
    if(path.relative(root,abs).replaceAll('\\','/')!=='.quality-gate/runs')walk(abs);
   }else if(entry.isFile()){
    let mtime;
    try{mtime=fs.statSync(abs).mtimeMs;}catch{unknown=true;return;}
    if(mtime>cutoff){
     if(changed.length>=limit){unknown=true;return;}
     changed.push(path.relative(root,abs).replaceAll('\\','/'));
    }
   }
  }
 };
 walk(root);
 return unknown?null:changed;
}

// Stop 复用入口：存在可复用的归档 run（同阶段、配置哈希一致、结论为 PASS/FAIL、其后输入
// 无变更）返回该报告，否则 null。调用方拿到 null 必须全量重跑。
export function inputSnapshot(root,{maxEntries=defaultMaxEntries,maxBytes=134217728,maxMs=2000,reportDir}={}){
 const files=Object.create(null),started=Date.now();let entries=0,bytes=0;
 const excluded=new Set([path.resolve(root,'.git'),path.resolve(root,'.quality-gate','runs'),...(reportDir?[path.resolve(reportDir)]:[])]);
 try{
  const walk=dir=>{
   for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(++entries>maxEntries||Date.now()-started>maxMs)throw new Error('Snapshot limit');
    const abs=path.join(dir,entry.name);
    if(excluded.has(abs))continue;
    if(entry.isSymbolicLink())throw new Error('Untracked link target');
    if(entry.isDirectory())walk(abs);
    else if(entry.isFile()){
     const before=fs.statSync(abs);bytes+=before.size;
     if(bytes>maxBytes)throw new Error('Snapshot byte limit');
     const digest=createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
     const after=fs.statSync(abs);
     if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw new Error('Input drift');
     files[path.relative(root,abs).replaceAll('\\','/')]=digest;
    }else throw new Error('Unsupported input');
   }
  };walk(root);return {files};
 }catch{return null;}
}

export function changedInputs(before,after,{limit=200}={}){
 if(!before?.files||!after?.files)return null;
 const changed=[...new Set([...Object.keys(before.files),...Object.keys(after.files)])].filter(key=>before.files[key]!==after.files[key]).sort();
 return changed.length>limit?null:changed;
}

export function reusableRun(root,stage='close'){
 try{
  const sha=configSha256(root);
  const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8').replace(/^\uFEFF/,''));
  // Only deterministic file checks can reuse a verdict. Runners, Git/runtime resolution,
  // deadlines and external observations must be evaluated again.
  const safeKinds=new Set(['ontology-map','semantic-profile','semantic-consistency','configuration']);
  const selected=config.gates?.filter(g=>g.enabled&&g.stages?.includes(stage));
  if(!selected?.length||config.exceptions?.length||selected.some(g=>!safeKinds.has(g.kind)||g.shacl||g.reasoner))return null;
  const report=latestRun(root,stage);
  if(!report||report.configSha256!==sha||(report.status!=='PASS'&&report.status!=='FAIL'))return null;
  if(!Number.isFinite(Date.parse(report.finishedAt))||Date.parse(report.finishedAt)>Date.now())return null;
  if(report.inputsStable!==true)return null;
  const changed=changedInputs(report.inputSnapshot,inputSnapshot(root));
  return changed!==null&&changed.length===0?report:null;
 }catch{return null;}
}
