import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const ISO=value=>text(value)&&!Number.isNaN(Date.parse(value));
const HEX64=/^[0-9a-f]{64}$/;
const ACCEPTANCE_TYPES=['normal','boundary','negative','exception','state-transition'];

// 任务意图登记（v1.17 轨道 A，OD-101 裁决：registries 单文件、活跃意图唯一）。
// 结构校验 fail-closed：畸形、缺确认字段、修订链断裂一律抛错（门禁侧落 ERROR）。
// 证明边界：confirmedBy/revisions 是声明字段的确认留痕（人在回路），框架不判
// "登记是否等于用户真实意图"；写入走确定性通道，agent 只问询不代写。
export function parseTaskIntent(raw){
 const data=JSON.parse(raw.replace(/^\uFEFF/,''));
 check(data!==null&&typeof data==='object'&&!Array.isArray(data),'task intent must be a JSON object');
 check(text(data.taskId)&&data.taskId.length<=100,'Invalid taskId');
 check(text(data.statement)&&data.statement.length<=2000,'Invalid statement (what this task must deliver)');
 check(Array.isArray(data.scope)&&data.scope.length>0&&data.scope.length<=100,'scope patterns required (1..100)');
 check(data.scope.every(pattern=>text(pattern)&&pattern.length<=200&&!path.isAbsolute(pattern)&&!pattern.startsWith('../')&&!pattern.includes('\\')&&!pattern.includes('\0')),'Invalid scope pattern');
 check(new Set(data.scope).size===data.scope.length,'Duplicate scope pattern');
 check(data.acceptance===undefined||Array.isArray(data.acceptance)&&data.acceptance.length<=50&&data.acceptance.every(item=>text(item.text)&&item.text.length<=2000&&(item.type===undefined||ACCEPTANCE_TYPES.includes(item.type))&&(item.format===undefined||['gherkin','ears'].includes(item.format))),'Invalid acceptance entry (text plus optional type: normal/boundary/negative/exception/state-transition, and optional format: gherkin|ears)');
 check(new Set((data.acceptance??[]).map(item=>item.text)).size===(data.acceptance??[]).length,'Duplicate acceptance text');
 check(data.constraints===undefined||Array.isArray(data.constraints)&&data.constraints.length<=20&&data.constraints.every(item=>text(item)&&item.length<=500),'Invalid constraints');
 check(data.source===undefined||data.source!==null&&typeof data.source==='object'&&!Array.isArray(data.source)&&Object.keys(data.source).every(key=>key==='kind'||key==='ref')&&text(data.source.kind)&&data.source.kind.length<=50&&(data.source.ref===undefined||text(data.source.ref)&&data.source.ref.length<=500),'Invalid source (registration provenance, e.g. {kind:"user-prompt",ref:"first prompt of the task"})');
 check(ISO(data.createdAt),'createdAt required (ISO 8601)');
 check(text(data.confirmedBy)&&data.confirmedBy.length<=100,'confirmedBy required (confirmation trail: no intent baseline, no alignment claim)');
 const revisions=data.revisions;
 check(revisions===undefined||Array.isArray(revisions)&&revisions.length<=50&&revisions.every(entry=>ISO(entry.revisedAt)&&text(entry.reason)&&entry.reason.length<=2000&&text(entry.confirmedBy)&&entry.confirmedBy.length<=100&&HEX64.test(entry.previousSha256??'')),'Invalid revision entry (revisedAt/reason/confirmedBy/previousSha256)');
 if(Array.isArray(revisions)){
  for(let index=1;index<revisions.length;index+=1)check(revisions[index].revisedAt>=revisions[index-1].revisedAt,'Revisions must stay chronologically ordered');
  check(new Set(revisions.map(entry=>entry.previousSha256)).size===revisions.length,'Revision chain broken: duplicate previousSha256');
  check(revisions.every(entry=>Date.parse(entry.revisedAt)>=Date.parse(data.createdAt)),'Revision precedes registration');
 }
 return data;
}

// 内容哈希（change-scope taskIntent.acknowledgedSha256 绑定用）：对解析后的 JSON 串
// （原键序）计算——空白与 BOM 差异不算变更，与 selfGuard 的 acknowledgedSpecSha256 同口径
export function taskIntentSha256(data){
 return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

const INTENT_FILE='.quality-gate/registries/task-intent.json';

// 确定性写入通道（对齐 init 纪律）：agent 只问询不代写，登记文件与 change-scope 的
// taskIntent.acknowledgedSha256 由本函数一次写齐——修订 = 新内容 + revisions 留痕 + 重新绑定。
// 写入前先按门禁同款结构自校验（fail-closed 在写入通道就拦住，不产出会被自己 ERROR 的登记）
export function writeTaskIntent(root,answers,{revise=false}={}){
 const registerPath=path.join(root,INTENT_FILE);
 const existed=fs.existsSync(registerPath);
 let previous=null;
 if(existed){
  previous=parseTaskIntent(fs.readFileSync(registerPath,'utf8'));
  if(!revise)throw new Error(`${INTENT_FILE} already exists: an intent is active for this task — revise explicitly (qgate intent <root> <answers-file> --revise, reason required), or finish the task and register the next task fresh`);
 }
 if(revise){
  if(!existed)throw new Error(`nothing to revise: ${INTENT_FILE} does not exist`);
  check(text(answers.reason)&&answers.reason.length<=2000,'revision requires a reason');
 }
 const now=new Date().toISOString();
 const register={
  taskId:answers.taskId,
  statement:answers.statement,
  scope:answers.scope,
  ...(answers.acceptance!==undefined?{acceptance:answers.acceptance}:{}),
  ...(answers.constraints!==undefined?{constraints:answers.constraints}:{}),
  ...(answers.source!==undefined?{source:answers.source}:{}),
  createdAt:previous?.createdAt??now,
  confirmedBy:answers.confirmedBy,
  ...(previous?{revisions:[...(previous.revisions??[]),{revisedAt:now,reason:answers.reason,confirmedBy:answers.confirmedBy,previousSha256:taskIntentSha256(previous)}]}:{})
 };
 const contentSha256=taskIntentSha256(parseTaskIntent(JSON.stringify(register)));
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 fs.writeFileSync(registerPath,JSON.stringify(register,null,2)+'\n');
 // 重新绑定已声明 taskIntent 的 change-scope spec（未声明者不动——漂移对账对该门禁保持关闭）
 const rebound=[];
 const configPath=path.join(root,'.quality-gate.json');
 if(fs.existsSync(configPath)){
  const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
  for(const gate of config.gates??[]){
   if(gate.kind!=='change-scope'||typeof gate.file!=='string')continue;
   const specPath=path.join(root,gate.file);
   if(!fs.existsSync(specPath))continue;
   let spec;
   try{spec=JSON.parse(fs.readFileSync(specPath,'utf8').replace(/^\uFEFF/,''));}catch{continue;}
   if(spec===null||typeof spec!=='object'||Array.isArray(spec)||spec.taskIntent===undefined||spec.taskIntent===null||typeof spec.taskIntent!=='object')continue;
   spec.taskIntent.acknowledgedSha256=contentSha256;
   fs.writeFileSync(specPath,JSON.stringify(spec,null,2)+'\n');
   rebound.push({gateId:gate.id,specFile:gate.file});
  }
 }
 return {registerPath:INTENT_FILE,taskId:register.taskId,contentSha256,revisionsCount:(register.revisions??[]).length,...(rebound.length?{reboundSpecs:rebound}:{})};
}

// 只读渲染（qgate intent <root>）：当前任务基准 + 各 change-scope 绑定核验状态
export function readTaskIntentStatus(root){
 const registerPath=path.join(root,INTENT_FILE);
 if(!fs.existsSync(registerPath))return {registered:false,file:INTENT_FILE};
 const register=parseTaskIntent(fs.readFileSync(registerPath,'utf8'));
 const contentSha256=taskIntentSha256(register);
 const bindings=[];
 const configPath=path.join(root,'.quality-gate.json');
 if(fs.existsSync(configPath)){
  const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
  for(const gate of config.gates??[]){
   if(gate.kind!=='change-scope'||typeof gate.file!=='string')continue;
   let spec=null;
   try{spec=JSON.parse(fs.readFileSync(path.join(root,gate.file),'utf8').replace(/^\uFEFF/,''));}catch{/* spec 问题由门禁自己 fail-closed 报告 */}
   const binding=spec?.taskIntent;
   if(binding===undefined||binding===null||typeof binding!=='object')continue;
   bindings.push({gateId:gate.id,specFile:gate.file,intentFile:binding.file,acknowledged:binding.acknowledgedSha256??null,status:binding.file===INTENT_FILE?(binding.acknowledgedSha256===contentSha256?'verified':'intent-file-modified'):'bound-to-other-file'});
  }
 }
 return {registered:true,file:INTENT_FILE,taskId:register.taskId,statement:register.statement,scope:register.scope,acceptanceCount:(register.acceptance??[]).length,constraints:register.constraints??[],createdAt:register.createdAt,confirmedBy:register.confirmedBy,revisionsCount:(register.revisions??[]).length,contentSha256,bindings};
}
