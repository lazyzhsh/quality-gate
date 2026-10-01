import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';
import {parseTaskIntent,taskIntentSha256} from './task-intent.mjs';
import {evaluateAc,acTypeConflict} from './ac-structure.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const NO_NEW_DEPENDENCIES='no-new-dependencies';
const runGit=(root,args)=>{
 const result=spawnSync('git',args,{cwd:root,shell:false,encoding:'utf8',maxBuffer:1024*1024,timeout:10000,windowsHide:true});
 check(!result.error&&!result.signal&&result.status===0,`Git scope inspection failed: ${result.error?.code==='ENOENT'?'git executable not found; the change-scope gate requires Git — install guide: https://git-scm.com/downloads':result.error?.message??result.stderr?.trim()??result.signal}`);
 return result.stdout;
};
const splitZ=value=>value.split('\0').filter(Boolean).map(value=>value.replaceAll('\\','/'));
const glob=pattern=>{
 check(text(pattern)&&!path.isAbsolute(pattern)&&!pattern.startsWith('../')&&!pattern.includes('\\')&&!pattern.includes('\0'),'Invalid scope pattern');
 const escaped=pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'\u0001').replace(/\*/g,'[^/]*').replace(/\u0001/g,'.*').replace(/\?/g,'[^/]');
 return new RegExp(`^${escaped}$`);
};

// git diff --name-status -z: entries are status\0path, or status\0old\0new for
// renames/copies. The source side of an R/C enters the change set as its own
// entry (type `R-source`/`C-source`) so moving a file out of a protected path
// cannot slip past the acknowledgement via the destination path alone.
function parseNameStatus(raw){
 const entries=raw.split('\0').filter(Boolean);
 const files=[];
 for(let index=0;index<entries.length;){
  const status=entries[index].replace(/\d+$/,'');
  if(status==='R'||status==='C'){
   files.push({path:entries[index+1].replaceAll('\\','/'),changeType:`${status}-source`});
   files.push({path:entries[index+2].replaceAll('\\','/'),changeType:status});
   index+=3;
  }
  else{files.push({path:entries[index+1].replaceAll('\\','/'),changeType:status});index+=2;}
 }
 return files;
}

function observeContent(spec,root,request){
 check(Array.isArray(spec.contentCheck.argv)&&spec.contentCheck.argv.length>0&&spec.contentCheck.argv.every(text)&&Number.isInteger(spec.contentCheck.timeoutMs)&&spec.contentCheck.timeoutMs>0&&spec.contentCheck.timeoutMs<=20000,'Invalid contentCheck runner');
 const runId=randomUUID();
 const argv=spec.contentCheck.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({...request,runId})+'\n',timeout:spec.contentCheck.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 check(!result.error&&!result.signal&&result.status===0,`Content check runner failed: ${result.error?.message??(typeof result.stderr==='string'?result.stderr.trim().split('\n').pop():undefined)??'non-zero exit'}`);
 const observed=JSON.parse(result.stdout);
 check(observed&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.findings),'Invalid or stale content observation');
 check(observed.findings.length<=200&&observed.findings.every(finding=>text(finding.path)&&text(finding.category)&&text(finding.detail)),'Invalid content findings');
 return {source:observed.source,execution,findings:observed.findings};
}

export function runChangeScope(g,root){
 check(g.level==='L0','change-scope requires L0');
 const spec=JSON.parse(fs.readFileSync(projectFile(root,g.file),'utf8').replace(/^\uFEFF/,''));
 check(text(spec.baseRef)&&!spec.baseRef.startsWith('-')&&spec.baseRef.length<=100,'Invalid baseRef');
 check(Array.isArray(spec.allowedPaths)&&spec.allowedPaths.length>0&&spec.allowedPaths.length<=100,'Expected allowedPaths');
 check(spec.requiredPaths===undefined||Array.isArray(spec.requiredPaths)&&spec.requiredPaths.length<=100,'Invalid requiredPaths');
 check(spec.protectedPaths===undefined||Array.isArray(spec.protectedPaths)&&spec.protectedPaths.length<=50&&spec.protectedPaths.every(rule=>text(rule.id)&&Array.isArray(rule.patterns)&&rule.patterns.length>0&&rule.patterns.length<=30&&typeof rule.acknowledged==='boolean'&&(rule.acknowledgedBase===undefined||/^[0-9a-f]{7,40}$/.test(rule.acknowledgedBase))),'Invalid protectedPaths');
 check(spec.contentCheck===undefined||(typeof spec.contentCheck==='object'&&spec.contentCheck!==null&&!Array.isArray(spec.contentCheck)),'Invalid contentCheck');
 check(spec.acceptedFindings===undefined||(Array.isArray(spec.acceptedFindings)&&spec.acceptedFindings.length<=200&&spec.acceptedFindings.every(item=>text(item.path)&&text(item.category)&&text(item.reason))&&new Set(spec.acceptedFindings.map(item=>`${item.path}\0${item.category}`)).size===spec.acceptedFindings.length),'Invalid acceptedFindings');
 check(spec.acceptedFindings===undefined||spec.contentCheck!==undefined,'acceptedFindings requires contentCheck');
 // 内容级强制（E4）：开启后受保护路径变更而未配置 contentCheck 即 FAIL——语义级超范围不再静默
 check(spec.requireContentCheck===undefined||typeof spec.requireContentCheck==='boolean','Invalid requireContentCheck');
 // 任务意图对账（v1.17 T2，OD-107 裁决=交集）：spec 可选绑定意图登记（登记形状见 task-intent.mjs，
 // fail-closed）；requireTaskIntent:true 时无登记（未绑定或文件不存在）即 FAIL——没有意图基准的"完成"只是 agent 自述
 check(spec.taskIntent===undefined||(spec.taskIntent!==null&&typeof spec.taskIntent==='object'&&!Array.isArray(spec.taskIntent)&&Object.keys(spec.taskIntent).every(key=>key==='file'||key==='acknowledgedSha256')&&text(spec.taskIntent.file)&&(spec.taskIntent.acknowledgedSha256===undefined||/^[0-9a-f]{64}$/.test(spec.taskIntent.acknowledgedSha256))),'Invalid taskIntent binding');
 check(spec.requireTaskIntent===undefined||typeof spec.requireTaskIntent==='boolean','Invalid requireTaskIntent');
 // 自绑定（W2）：selfGuard 绑定 spec 自身内容（去掉 selfGuard 字段后的 JSON 串 sha256），
 // allowedPaths/baseRef/protectedPaths 的任何静默修改使哈希不符即 FAIL spec-changed
 check(spec.selfGuard===undefined||(spec.selfGuard!==null&&typeof spec.selfGuard==='object'&&!Array.isArray(spec.selfGuard)&&Object.keys(spec.selfGuard).length===1&&/^[0-9a-f]{64}$/.test(spec.selfGuard.acknowledgedSpecSha256??'')),'Invalid selfGuard');
 // 基准绑定（W2）：pinnedBase 记录确认时的基准 commit，baseRef 前移后不一致即 FAIL base-moved
 check(spec.pinnedBase===undefined||(spec.pinnedBase!==null&&typeof spec.pinnedBase==='object'&&!Array.isArray(spec.pinnedBase)&&Object.keys(spec.pinnedBase).length===1&&/^[0-9a-f]{7,40}$/.test(spec.pinnedBase.commit??'')),'Invalid pinnedBase');
 let selfGuard=null;
 if(spec.selfGuard!==undefined){
  const {selfGuard:declaration,...anchored}=spec;
  const actual=createHash('sha256').update(JSON.stringify(anchored)).digest('hex');
  selfGuard={acknowledged:declaration.acknowledgedSpecSha256,actual,status:actual===declaration.acknowledgedSpecSha256?'verified':'spec-changed'};
 }
 const allowed=spec.allowedPaths.map(glob);
 const required=(spec.requiredPaths??[]).map(pattern=>({pattern,regex:glob(pattern)}));
 const protectedRules=(spec.protectedPaths??[]).map(rule=>({id:rule.id,acknowledged:rule.acknowledged,acknowledgedBase:rule.acknowledgedBase,patterns:rule.patterns.map(glob)}));
 check(new Set(protectedRules.map(rule=>rule.id)).size===protectedRules.length,'Duplicate protected rule');
 const repo=fs.realpathSync(runGit(root,['rev-parse','--show-toplevel']).trim());
 check(repo===fs.realpathSync(root),'Scope project root must be Git repository root');
 const baseCommit=runGit(root,['rev-parse','--verify',`${spec.baseRef}^{commit}`]).trim();
 const baseAnchor=spec.pinnedBase===undefined?null:{pinned:spec.pinnedBase.commit,baseCommit,status:spec.pinnedBase.commit===baseCommit?'verified':'base-moved'};
 const tracked=parseNameStatus(runGit(root,['diff','--no-ext-diff','--no-textconv','--name-status','-z',baseCommit,'--']));
 const untracked=splitZ(runGit(root,['ls-files','--others','--exclude-standard','-z'])).map(file=>({path:file,changeType:'A'}));
 const changedMap=new Map();
 for(const entry of [...untracked,...tracked])if(!entry.path.startsWith('.quality-gate/'))changedMap.set(entry.path,entry);
 const changed=[...changedMap.entries()].map(([path,entry])=>({path,changeType:entry.changeType})).sort((a,b)=>a.path.localeCompare(b.path));
 const files=changed.map(entry=>({...entry,allowed:allowed.some(regex=>regex.test(entry.path)),protected:protectedRules.filter(rule=>rule.patterns.some(regex=>regex.test(entry.path))).map(rule=>{
  const stale=rule.acknowledged&&rule.acknowledgedBase!==undefined&&rule.acknowledgedBase!==baseCommit;
  return {id:rule.id,acknowledged:rule.acknowledged,acknowledgedBase:rule.acknowledgedBase,effective:rule.acknowledged&&!stale,...(stale?{reason:'stale-base'}:{})};
 })}));
 const missingRequired=required.filter(item=>!changed.some(entry=>item.regex.test(entry.path))).map(item=>item.pattern);
 const overScope=files.filter(file=>!file.allowed).map(file=>file.path);
 const unacknowledgedProtected=files.flatMap(file=>file.protected.filter(rule=>!rule.effective).map(rule=>({path:file.path,ruleId:rule.id,...(rule.acknowledged?{reason:rule.reason??'stale-base'}:{reason:'not-acknowledged'})})));
 // E4：受保护路径发生变更（无论确认与否——确认覆盖路径变更，内容语义另需 contentCheck）而未配置内容级检查
 const protectedChangedWithoutContentCheck=spec.requireContentCheck===true&&spec.contentCheck===undefined?files.filter(file=>file.protected.length>0).map(file=>file.path):[];
 let contentCheck=null;
 if(spec.contentCheck!==undefined){
  const observation=observeContent(spec,root,{schemaVersion:'0.1',baseRef:spec.baseRef,baseCommit,files:changed});
  const accepted=spec.acceptedFindings??[];
  const unaccepted=observation.findings.filter(finding=>!accepted.some(item=>item.path===finding.path&&item.category===finding.category));
  contentCheck={source:observation.source,execution:observation.execution,findings:observation.findings,acceptedFindings:accepted,unaccepted};
 }
 // 任务意图对账（交集语义）：变更须同时落在项目 allowed 与任务 scope；
// 意图内容哈希与 spec 绑定的 acknowledgedSha256 比对（selfGuard 思想）——静默修改即 intent-file-modified
 let taskIntent=null;
 if(spec.taskIntent!==undefined||spec.requireTaskIntent===true){
  const binding=spec.taskIntent;
  let parsed=null;
  if(binding!==undefined){
   let raw;
   try{raw=fs.readFileSync(projectFile(root,binding.file),'utf8');}
   catch(error){
    if(error.code!=='ENOENT')throw error;
    // 声明了绑定而文件不存在：requireTaskIntent 下是"无登记"FAIL，否则声明输入缺失按 fail-closed ERROR
    check(spec.requireTaskIntent===true,`task intent file missing: ${binding.file}`);
   }
   if(raw!==undefined)parsed=parseTaskIntent(raw);
  }
  if(parsed!==null){
   const contentSha256=taskIntentSha256(parsed);
   const acknowledged=binding.acknowledgedSha256;
   const scopeRegexes=parsed.scope.map(pattern=>glob(pattern));
   const outsideTaskScope=files.filter(file=>!scopeRegexes.some(regex=>regex.test(file.path))).map(file=>file.path);
   taskIntent={taskId:parsed.taskId,file:binding.file,contentSha256,scopePatterns:parsed.scope,revisionsCount:(parsed.revisions??[]).length,constraints:parsed.constraints??[],outsideTaskScope,
    ...(acknowledged!==undefined?{acknowledgedSha256:acknowledged,status:acknowledged===contentSha256?'verified':'intent-file-modified'}:{status:'unpinned'})};
   // 可判定约束（首版一条）：no-new-dependencies——基准 commit 与工作树的依赖清单 diff，新增依赖键即违反；
   // 其余约束登记性呈现（由 alignment contract-diff/consumer-matrix 等既有门禁自然承载，不重复造判定）
   if(parsed.constraints?.includes(NO_NEW_DEPENDENCIES)){
    const sections=['dependencies','devDependencies','optionalDependencies'];
    const current=fs.existsSync(path.join(root,'package.json'))?JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')):{};
    const baseResult=spawnSync('git',['show',`${baseCommit}:package.json`],{cwd:root,shell:false,encoding:'utf8',maxBuffer:1024*1024,timeout:10000,windowsHide:true});
    const base=(baseResult.error||baseResult.status!==0)?{}:JSON.parse(baseResult.stdout);
    const newDependencies=[...new Set(sections.flatMap(section=>Object.keys(current[section]??{})))].filter(name=>!sections.some(section=>name in (base[section]??{})));
    taskIntent.constraintChecks=[{constraint:NO_NEW_DEPENDENCIES,newDependencies,status:newDependencies.length?'violated':'verified'}];
   }
   // AC 结构化协议（v1.18）：format 声明即校验（Gherkin/EARS 结构骨架+类型派生一致性）；
   // 自由文本 AC 不校验（旧语义不变）。违规 FAIL 指名 ac-structure-invalid / ac-type-conflict
   const acceptanceStructure=(parsed.acceptance??[]).map((entry,index)=>{
    const evaluation=evaluateAc(entry);
    return {acceptance:index,format:evaluation.format,types:evaluation.types,
     ...(evaluation.scenarios!==undefined?{scenarios:evaluation.scenarios}:{}),
     ...(evaluation.statements!==undefined?{statements:evaluation.statements}:{}),
     violations:evaluation.violations,...(acTypeConflict(entry,evaluation)?{typeConflict:{declared:entry.type,derived:evaluation.types}}:{})};
   });
   taskIntent.acceptanceStructure={count:(parsed.acceptance??[]).length,structured:acceptanceStructure.filter(item=>item.format!==null).length,
    violations:acceptanceStructure.flatMap(item=>[...item.violations.map(violation=>({acceptance:item.acceptance,rule:violation.rule,...(violation.line!==undefined?{line:violation.line}:{}),...(violation.scenario!==undefined?{scenario:violation.scenario}:{}),...(violation.tag!==undefined?{tag:violation.tag}:{})})),...(item.typeConflict?[{acceptance:item.acceptance,rule:'ac-type-conflict',...item.typeConflict}]:[])])};
  } else {
   taskIntent={status:'no-task-intent',...(binding!==undefined?{file:binding.file}:{})};
  }
 }
 const taskIntentBlocked=taskIntent!==null&&(taskIntent.status==='intent-file-modified'||taskIntent.status==='no-task-intent'||(taskIntent.outsideTaskScope?.length??0)>0||(taskIntent.constraintChecks?.some(item=>item.status==='violated')??false)||(taskIntent.acceptanceStructure?.violations.length??0)>0);
 return {status:overScope.length||missingRequired.length||unacknowledgedProtected.length||(contentCheck?.unaccepted.length??0)||protectedChangedWithoutContentCheck.length||selfGuard?.status==='spec-changed'||baseAnchor?.status==='base-moved'||taskIntentBlocked?'FAIL':'PASS',details:{baseRef:spec.baseRef,baseCommit,changedCount:changed.length,files,overScope,missingRequired,unacknowledgedProtected,...(protectedChangedWithoutContentCheck.length?{protectedChangedWithoutContentCheck}:{}),...(selfGuard?{selfGuard}:{}),...(baseAnchor?{baseAnchor}:{}),...(contentCheck?{contentCheck}:{}),...(taskIntent?{taskIntent}:{})}};
}
