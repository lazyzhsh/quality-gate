import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';
import {diff,filterDifferences,validateIgnorePaths} from './diff.mjs';
import {extractEventContract,compareEventSamples} from './asyncapi.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function validateAlignment(g){
 check(g.level==='L2'&&['api','schema','event','contract-diff'].includes(g.scope)&&text(g.file),'alignment requires L2, api/schema/event/contract-diff scope and file');
 check(g.scope!=='event'||g.ignorePaths===undefined,'event alignment does not support ignorePaths; revise the declared contract explicitly');
 check(g.scope!=='contract-diff'||['backward','forward','full'].includes(g.compatibilityLevel),'contract-diff requires compatibilityLevel backward/forward/full');
 validateIgnorePaths(g.ignorePaths,'ignorePaths');
 // 观察模式声明（W3）：requireLive 下 static 观察（未发真实请求/未连真实存储）即 FAIL
 check(g.requireLive===undefined||typeof g.requireLive==='boolean','Invalid requireLive');
 // 观察端来源指纹（AF）：requireSourceFingerprint 适用于文件型观察面；live 面走 mode+requireLive
 check(g.requireSourceFingerprint===undefined||typeof g.requireSourceFingerprint==='boolean','Invalid requireSourceFingerprint');
}
const observationMode=observation=>{
 check(observation.mode===undefined||['live','static'].includes(observation.mode),'Invalid observation mode');
 return observation.mode??null;
};
// requireLive 缺失语义（F02，2026-10-06 二轮评审）：开启后要求显式 mode:'live'——static 即
// FAIL（既有语义）；缺失 mode 是缺证据（无法区分实时观察与不回报模式声明的旧 runner），
// 同样 FAIL 指名（缺失来源不比诚实 static 更易放行）；畸形值仍由 observationMode ERROR。
// 未开启 requireLive 时缺失＝未声明，保持旧 runner 兼容不阻断。三条消费路径共用本判定：
// alignment api/schema、alignment contract-diff、consumer-matrix。
export function liveModeBlock(mode,requireLive){
 if(requireLive!==true||mode==='live')return null;
 return {missing:mode===null};
}
// 指纹声明即核验：存在性+防逃逸（复用 projectFile），与磁盘文件哈希不符即 FAIL
const sourceFingerprintCheck=(observation,root)=>{
 if(observation.sourceFingerprint===undefined||observation.sourceFingerprint===null)return null;
 const declared=observation.sourceFingerprint;
 check(declared!==null&&typeof declared==='object'&&!Array.isArray(declared)&&Object.keys(declared).length===2&&text(declared.file)&&/^[0-9a-f]{64}$/.test(declared.sha256??''),'Invalid observation sourceFingerprint');
 const file=projectFile(root,declared.file);
 const actual=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 return {file:declared.file,sha256:declared.sha256,actualSha256:actual,status:actual===declared.sha256?'VERIFIED':'MISMATCH'};
};

export function runAlignment(g,root){
 const raw=fs.readFileSync(projectFile(root,g.file));
 check(raw.length<=65536,'Alignment specification too large');
 const document=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
 const expected=g.scope==='event'?extractEventContract(document):document;
 if(g.scope==='contract-diff'){
  // 契约兼容协议：runner（如 oasdiff 类工具）对基线/当前契约做机器 diff，
  // 内核只消费结构化 breaking 结论——checked 不真即 ERROR，breaking 非空即 FAIL。
  check(object(expected)&&object(expected.fields)&&Object.keys(expected.fields).length>0,'Invalid contract specification');
  const runId=randomUUID();
  const argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
  const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,scope:g.scope,compatibilityLevel:g.compatibilityLevel,file:g.file})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
  const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
  if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Contract diff runner failed'}};
  try{
   const observation=JSON.parse(result.stdout);
   check(object(observation)&&observation.schemaVersion==='0.1'&&observation.runId===runId&&observation.kind==='contract-diff'&&text(observation.source)&&observation.checked===true&&Array.isArray(observation.breaking)&&observation.breaking.every(b=>object(b)&&text(b.path)&&text(b.rule)),'Invalid or stale contract diff observation');
   const mode=observationMode(observation);
   const fingerprint=sourceFingerprintCheck(observation,root);
   const liveBlock=liveModeBlock(mode,g.requireLive);
   const liveBlocked=liveBlock!==null;
   const fingerprintBlocked=(g.requireSourceFingerprint===true&&fingerprint===null)||fingerprint?.status==='MISMATCH';
   return {status:observation.breaking.length||liveBlocked||fingerprintBlocked?'FAIL':'PASS',details:{...execution,scope:g.scope,compatibilityLevel:g.compatibilityLevel,source:observation.source,...(mode?{observationMode:mode}:{}),...(fingerprint?{sourceFingerprint:fingerprint}:{}),...(liveBlocked?{requireLive:g.requireLive,...(liveBlock.missing?{missingObservationMode:true}:{})}:{}),...(g.requireSourceFingerprint===true&&fingerprint===null?{missingSourceFingerprint:true}:{}),currentSha256:createHash('sha256').update(raw).digest('hex'),...(observation.breaking.length?{breakingChanges:observation.breaking}:{})}};
  }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
 }
 check(object(expected)&&expected.kind===g.scope&&Array.isArray(expected.items)&&expected.items.length>0,'Invalid alignment specification');
 const runId=randomUUID();
 const argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,scope:g.scope})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Alignment runner failed'}};
 try{
  const observation=JSON.parse(result.stdout);
  check(object(observation)&&observation.schemaVersion==='0.1'&&observation.runId===runId&&observation.kind===g.scope&&text(observation.source)&&Array.isArray(observation.items),'Invalid or stale alignment observation');
  const mode=observationMode(observation);
  const fingerprint=sourceFingerprintCheck(observation,root);
  const liveBlock=liveModeBlock(mode,g.requireLive);
  const liveBlocked=liveBlock!==null;
  const fingerprintBlocked=(g.requireSourceFingerprint===true&&fingerprint===null)||fingerprint?.status==='MISMATCH';
  const allDifferences=g.scope==='event'?compareEventSamples(expected,observation.items):diff(expected.items,observation.items,'/items');
  // ignorePaths 只豁免声明过的易变路径；跳过的差异必须留在证据里，不放行未声明的漂移
  const {differences,ignoredDifferences}=filterDifferences(allDifferences,g.ignorePaths);
  return {status:differences.length||liveBlocked||fingerprintBlocked?'FAIL':'PASS',details:{...execution,scope:g.scope,source:observation.source,...(mode?{observationMode:mode}:{}),...(fingerprint?{sourceFingerprint:fingerprint}:{}),...(liveBlocked?{requireLive:g.requireLive,...(liveBlock.missing?{missingObservationMode:true}:{})}:{}),...(g.requireSourceFingerprint===true&&fingerprint===null?{missingSourceFingerprint:true}:{}),expectedSha256:createHash('sha256').update(raw).digest('hex'),expectedItems:expected.items,observedItems:observation.items,differences,...(ignoredDifferences.length?{ignoredDifferences}:{}),...(g.ignorePaths?{ignorePaths:g.ignorePaths}:{})}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
