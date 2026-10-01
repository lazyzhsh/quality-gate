import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import {projectFile} from './kernel.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0,object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),check=(ok,msg)=>{if(!ok)throw new Error(msg);};
const roles=['code','api','user','operator'];
export function validateDocumentation(g){check(g.level==='L5'&&text(g.version)&&Array.isArray(g.requiredTopics)&&g.requiredTopics.length>0&&g.requiredTopics.every(text),'documentation requires L5, version and topics');}
export function runDocumentation(g,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x),result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Documentation runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.artifacts),'Invalid or stale documentation observation');
  check(observed.artifacts.every(a=>roles.includes(a.role)&&text(a.path)&&text(a.version)&&Array.isArray(a.topics)&&a.topics.every(text))&&new Set(observed.artifacts.map(a=>a.role)).size===observed.artifacts.length,'Invalid document artifacts');
  const byRole=new Map(observed.artifacts.map(a=>[a.role,a]));const artifacts=roles.map(role=>{const a=byRole.get(role);const missingTopics=g.requiredTopics.filter(topic=>!a?.topics.includes(topic));
   // 与 RTM 对齐：制品路径必须真实存在且非空，缺失即 FAIL，路径逃逸 ERROR
   let fileStatus='MISSING';
   if(a?.path){
    const relative=path.relative(root,path.resolve(root,a.path));
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Document artifact path escapes project');
    try{const file=projectFile(root,a.path);const stat=fs.statSync(file);fileStatus=stat.isFile()&&stat.size>0?'FOUND':'EMPTY';}
    catch(error){if(error.code!=='ENOENT')throw error;}
   }
   return {role,path:a?.path??null,version:a?.version??null,expectedVersion:g.version,missingTopics,...(a?.path?{fileStatus}:{}),status:a&&a.version===g.version&&missingTopics.length===0&&fileStatus==='FOUND'?'PASS':'FAIL'};});
  return {status:artifacts.every(a=>a.status==='PASS')?'PASS':'FAIL',details:{...execution,source:observed.source,artifacts}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
