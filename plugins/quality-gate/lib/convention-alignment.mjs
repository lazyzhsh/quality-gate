import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';
import {pathGlob} from './freshness.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const SKIPPED_DIRECTORIES=new Set(['.git','node_modules','.quality-gate','dist']);

export function validateConventionAlignment(g){
 check(g.level==='L0','convention-alignment requires L0');
 check(text(g.file),'convention-alignment requires a conventions registry file');
}

// 约定登记（v1.19 轨道 B，OD-103 裁决=独立 kind）：仓库自声明的约定条目 ↔ 制品对账。
// banned-words 为内核原生扫描（机制泛化本仓库 glossary 防回归测试的成熟实践：映射记法
// "词→替换" 行内豁免、行内白名单标记、前缀/后缀跳过）；argv 规则复用统一观察协议
// （与 contentCheck 同形：stdin runId、stdout 结构化 findings，runner 无权自判放行）。
// 边界如实：只对账结构化条目（字面词命中），不核验约定文件全文语义；豁免即放行——被豁免
// 的命中不入证据、无审计面（豁免可被滥用，完整豁免审计属后续增量，见 RTM X14）。
function validateRegistry(data){
 check(data!==null&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.rules)&&data.rules.length>0&&data.rules.length<=50,'Expected 1..50 convention rules');
 check(new Set(data.rules.map(rule=>rule.id)).size===data.rules.length,'Duplicate convention rule id');
 for(const rule of data.rules){
  check(text(rule.id)&&rule.id.length<=100,'Invalid convention rule id');
  check(text(rule.source?.file)&&rule.source.file.length<=200&&(rule.source.section===undefined||text(rule.source.section)&&rule.source.section.length<=200),'Convention rule requires a provenance source {file, section?}');
  check(rule.severity===undefined||['fail','advisory'].includes(rule.severity),'severity must be fail or advisory');
  if(rule.type==='banned-words'){
   check(Array.isArray(rule.words)&&rule.words.length>0&&rule.words.length<=100&&rule.words.every(word=>text(word)&&word.length<=100)&&new Set(rule.words).size===rule.words.length,'Invalid banned-words list');
   check(Array.isArray(rule.scope)&&rule.scope.length>0&&rule.scope.length<=50&&rule.scope.every(pattern=>text(pattern)&&pattern.length<=200&&!path.isAbsolute(pattern)&&!pattern.startsWith('../')&&!pattern.includes('\\')),'Invalid banned-words scope');
   check(rule.exemptions===undefined||Array.isArray(rule.exemptions)&&rule.exemptions.length<=50&&rule.exemptions.every(entry=>{
    const keys=Object.keys(entry);
    const mechanisms=keys.filter(key=>key==='lineContains'||key==='precededBy'||key==='followedBy');
    return (keys.every(key=>key==='word'||key==='lineContains'||key==='precededBy'||key==='followedBy'))&&mechanisms.length===1&&text(entry[mechanisms[0]])&&(entry.word===undefined||text(entry.word));
   }),'Invalid exemption (exactly one of lineContains|precededBy|followedBy, optional word)');
  } else if(rule.type==='argv'){
   check(Array.isArray(rule.argv)&&rule.argv.length>0&&rule.argv.every(text)&&Number.isInteger(rule.timeoutMs)&&rule.timeoutMs>0&&rule.timeoutMs<=20000,'Invalid argv convention rule');
  } else check(false,'Convention rule type must be banned-words or argv');
 }
}

function walk(root,dir,accumulator){
 for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  if(SKIPPED_DIRECTORIES.has(entry.name))continue;
  const relative=dir?`${dir}/${entry.name}`:entry.name;
  if(entry.isDirectory())walk(root,relative,accumulator);
  else accumulator.push(relative);
 }
 return accumulator;
}

function scanBannedWords(root,rule){
 const patterns=rule.scope.map(pattern=>pathGlob(pattern));
 const exemptions=rule.exemptions??[];
 const lineExemptions=exemptions.filter(entry=>entry.lineContains!==undefined);
 const preceded=exemptions.filter(entry=>entry.precededBy!==undefined);
 const followed=exemptions.filter(entry=>entry.followedBy!==undefined);
 const files=walk(root,'',[]).filter(file=>patterns.some(regex=>regex.test(file))).sort();
 const hits=[];
 for(const file of files){
  const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/);
  lines.forEach((line,index)=>{
   for(const word of rule.words){
    let at=line.indexOf(word);
    while(at!==-1){
     const before=line[at-1]??'';
     const tail=line.slice(at+word.length);
     // 映射记法（GLOSSARY 约定）恒豁免：命中后紧跟 → 的对照行是登记行为不是使用行为
     const mapping=tail.startsWith('→');
     const lineOk=lineExemptions.some(entry=>(entry.word===undefined||entry.word===word)&&line.includes(entry.lineContains));
     const prevOk=preceded.some(entry=>(entry.word===undefined||entry.word===word)&&entry.precededBy===before);
     const followOk=followed.some(entry=>(entry.word===undefined||entry.word===word)&&(entry.followedBy==='→'?tail.startsWith('→'):tail.startsWith(entry.followedBy)));
     if(!mapping&&!lineOk&&!prevOk&&!followOk)hits.push({path:file,line:index+1,word});
     at=line.indexOf(word,at+1);
    }
   }
  });
 }
 return {scannedFiles:files.length,hits};
}

function runArgvRule(root,rule,deadline){
 const runId=randomUUID();
 // 剩余期限守卫（F01）：宿主期限下不再启动声明预算超出剩余期限的规则——逐条检查，
 // 先行规则的实际耗时（含 spawn 开销）会压缩后续规则的可用期限
 if(deadline!==undefined&&deadline!==null&&Date.now()+rule.timeoutMs>deadline)throw new Error(`Execution budget exhausted before convention rule ${rule.id}: remaining ${Math.max(0,deadline-Date.now())}ms < declared ${rule.timeoutMs}ms`);
 const argv=rule.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,ruleId:rule.id})+'\n',timeout:rule.timeoutMs,maxBuffer:65536,windowsHide:true});
 check(!result.error&&!result.signal&&result.status===0,`Convention runner failed for ${rule.id}: ${result.error?.message??(typeof result.stderr==='string'?result.stderr.trim().split('\n').pop():undefined)??'non-zero exit'}`);
 const observed=JSON.parse(result.stdout);
 check(observed&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.findings),'Invalid or stale convention observation');
 check(observed.findings.length<=200&&observed.findings.every(finding=>text(finding.path)&&text(finding.detail)&&(finding.category===undefined||text(finding.category))),`Invalid convention findings for ${rule.id}`);
 return {source:observed.source,execution:{runId,argv,exitCode:result.status},hits:observed.findings.map(finding=>({path:finding.path,line:finding.line??null,word:finding.detail,...(finding.category!==undefined?{category:finding.category}:{})}))};
}

export function runConventionAlignment(g,root,{deadline}={}){
 const data=JSON.parse(fs.readFileSync(projectFile(root,g.file),'utf8').replace(/^\uFEFF/,''));
 validateRegistry(data);
 const rules=data.rules.map(rule=>{
  if(rule.type==='banned-words'){
   const scan=scanBannedWords(root,rule);
   return {id:rule.id,type:rule.type,severity:rule.severity??'fail',source:rule.source,scannedFiles:scan.scannedFiles,hits:scan.hits};
  }
  const execution=runArgvRule(root,rule,deadline);
  return {id:rule.id,type:rule.type,severity:rule.severity??'fail',source:rule.source,scannedFiles:null,hits:execution.hits,observation:{source:execution.source,execution:execution.execution}};
 });
 const blocking=rules.filter(rule=>rule.severity==='fail');
 const advisory=rules.filter(rule=>rule.severity==='advisory');
 return {status:blocking.some(rule=>rule.hits.length>0)?'FAIL':'PASS',details:{ruleCount:rules.length,blockingHits:blocking.reduce((sum,rule)=>sum+rule.hits.length,0),advisoryHits:advisory.reduce((sum,rule)=>sum+rule.hits.length,0),rules}};
}
