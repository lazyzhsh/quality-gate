import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';
import {evaluateAc,acTypeConflict} from './ac-structure.mjs';

const text=v=>typeof v==='string'&&v.trim().length>0;
const unique=items=>new Set(items).size===items.length;
const nonemptyList=(items,limit=100)=>Array.isArray(items)&&items.length>0&&items.length<=limit;
const requireValid=(condition,message)=>{if(!condition)throw new Error(message);};

function codeFile(root,name){
 requireValid(text(name)&&!path.isAbsolute(name),'Invalid RTM code path');
 const relative=path.relative(root,path.resolve(root,name));
 requireValid(relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'RTM code path escapes project');
 try {
  const file=projectFile(root,name);
  return {path:name,status:fs.statSync(file).isFile()?'FOUND':'MISSING'};
 } catch(error) {
  if(error.code==='ENOENT')return {path:name,status:'MISSING'};
  throw error;
 }
}

function observeCoverage(g,root,criteria){
 requireValid(Array.isArray(g.coverage.argv)&&g.coverage.argv.length>0&&g.coverage.argv.every(text)&&Number.isInteger(g.coverage.timeoutMs)&&g.coverage.timeoutMs>0&&g.coverage.timeoutMs<=20000,'Invalid coverage runner');
 const runId=randomUUID();
 const argv=g.coverage.argv.map(item=>item==='$NODE'?process.execPath:item);
 const request={schemaVersion:'0.1',runId,criteria:criteria.map(a=>({id:a.id,codeFiles:a.codeFiles}))};
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify(request)+'\n',timeout:g.coverage.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 requireValid(!result.error&&!result.signal&&result.status===0,`Coverage runner failed: ${result.error?.message??tail(result.stderr)??'non-zero exit'}`);
 const observed=JSON.parse(result.stdout);
 requireValid(observed&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.results),'Invalid or stale coverage observation');
 requireValid(observed.results.length===criteria.length&&criteria.every((a,index)=>observed.results[index]&&observed.results[index].criterionId===a.id),'Coverage results must match every criterion exactly once');
 const byCriterion=new Map();
 for(const a of criteria){
  const reported=observed.results.find(item=>item.criterionId===a.id);
  const configured=a.codeFiles.map(normalizePath).sort().join('\0');
  const reportedPaths=(Array.isArray(reported.files)?reported.files:[]).map(file=>normalizePath(String(file.path??'')));
  requireValid(reported.files?.length===a.codeFiles.length&&reported.files.every(file=>text(file.path)&&typeof file.covered==='boolean')&&[...reportedPaths].sort().join('\0')===configured,'Coverage files must match the configured codeFiles exactly');
  byCriterion.set(a.id,new Map(reported.files.map(file=>[normalizePath(file.path),file.covered])));
 }
 return {source:observed.source,execution,byCriterion};
}

const tail=value=>typeof value==='string'?value.trim().split(/\r?\n/).filter(Boolean).pop():undefined;
const normalizePath=value=>value.replace(/\\/g,'/');

export function runTraceability(g,root,config,evidence){
 const raw=fs.readFileSync(projectFile(root,g.file),'utf8');
 const data=JSON.parse(raw.replace(/^\uFEFF/,''));
 requireValid(nonemptyList(data.requirements),'Expected 1..100 requirements');
 requireValid(data.requirements.every(r=>text(r.id)&&text(r.statement)&&nonemptyList(r.acceptanceCriteria)),'Invalid requirement');
 requireValid(unique(data.requirements.map(r=>r.id)),'Duplicate requirement id');
 const criteria=data.requirements.flatMap(r=>r.acceptanceCriteria);
 requireValid(criteria.length<=500&&criteria.every(a=>text(a.id)&&text(a.statement)&&nonemptyList(a.codeFiles)&&nonemptyList(a.testGateIds)&&a.codeFiles.every(text)&&a.testGateIds.every(text)&&unique(a.codeFiles)&&unique(a.testGateIds)&&(a.format===undefined||['gherkin','ears'].includes(a.format))),'Invalid acceptance criterion');
 requireValid(unique(criteria.map(a=>a.id)),'Duplicate acceptance criterion id');
 const defaultRequiredTypes=g.defaultRequiredTypes;
 for(const r of data.requirements){
  if(r.requiredTypes!==undefined)requireValid(Array.isArray(r.requiredTypes)&&r.requiredTypes.length>0&&r.requiredTypes.every(type=>['normal','boundary','negative','exception','state-transition'].includes(type))&&unique(r.requiredTypes),'Invalid required acceptance types');
  // 自带 requiredTypes 或声明默认集（W4）时，AC 必须携带类型——v1.18 起 format 声明（标签/模板派生）亦可满足
  if(r.requiredTypes!==undefined||defaultRequiredTypes!==undefined)requireValid(r.acceptanceCriteria.every(a=>(a.format!==undefined||text(a.type))&&['normal','boundary','negative','exception','state-transition'].includes(a.type??'normal')),'Acceptance type required');
  // PRD 绑定（W4）：声明即核验文件存在性与防逃逸（section 为记录性文本不核验）
  if(r.prdRef!==undefined)requireValid(r.prdRef!==null&&typeof r.prdRef==='object'&&!Array.isArray(r.prdRef)&&Object.keys(r.prdRef).length===2&&text(r.prdRef.file)&&text(r.prdRef.section),'Invalid requirement prdRef');
 }
 const gates=new Map(config.gates.map(gate=>[gate.id,gate]));
 for(const a of criteria)for(const id of a.testGateIds){
  const linked=gates.get(id);
  requireValid(linked&&linked.kind!=='traceability','RTM testGateId must reference a non-meta gate kind (traceability evaluates after other gates)');
 }
 const coverage=g.coverage!==undefined?observeCoverage(g,root,criteria):null;
 const outcomes=new Map(evidence.map(item=>[item.gateId,item]));
 const requirements=data.requirements.map(r=>{
  const acceptanceCriteria=r.acceptanceCriteria.map(a=>{
   const codeFiles=a.codeFiles.map(name=>{
   const file=codeFile(root,name);
   const covered=coverage?coverage.byCriterion.get(a.id).get(normalizePath(name)):undefined;
   return covered===undefined?file:{...file,covered};
   });
   const testGates=a.testGateIds.map(id=>({id,status:outcomes.get(id)?.status??'ERROR',evidenceId:outcomes.get(id)?.id??null}));
   // AC 结构化协议（v1.18）：format 声明即校验结构骨架；类型覆盖集=标签/模板派生类型
   // （显式 type 与派生集冲突即 FAIL ac-type-conflict；无派生时回退显式 type——自由文本旧语义不变）
   const structure=a.format!==undefined?evaluateAc(a):null;
   const structureViolations=structure?structure.violations:[];
   const typeConflict=structure?acTypeConflict(a,structure):false;
   // 类型覆盖集：派生集为准；显式 type 在派生集内时收窄为该类型（EARS 不需要行为模板的
   // negative|exception 二义由作者显式定夺），无派生时回退显式 type——自由文本旧语义不变
   const types=structure?(a.type!==undefined&&structure.types.includes(a.type)?[a.type]:structure.types):(a.type!==undefined?[a.type]:[]);
   const passed=codeFiles.every(x=>x.status==='FOUND'&&x.covered!==false)&&testGates.every(x=>x.status==='PASS')&&structureViolations.length===0&&!typeConflict;
   return {id:a.id,statement:a.statement,type:a.type??null,...(a.format!==undefined?{format:a.format,types,structureViolations,...(typeConflict?{typeConflict:{declared:a.type,derived:structure.types}}:{})}:{}) ,codeFiles,testGates,status:passed?'PASS':'FAIL'};
  });
  // 默认集（W4）：未自带 requiredTypes 的需求按默认集判定缺失类型
  const effectiveTypes=r.requiredTypes??defaultRequiredTypes??[];
  const missingTypes=effectiveTypes.filter(type=>!acceptanceCriteria.some(a=>(a.types??(a.type!==null?[a.type]:[])).includes(type)));
  const prdRef=r.prdRef===undefined?null:{file:r.prdRef.file,section:r.prdRef.section,status:codeFile(root,r.prdRef.file).status};
  const missingPrdRef=g.requirePrdRefs===true&&r.prdRef===undefined;
  return {id:r.id,statement:r.statement,requiredTypes:effectiveTypes,missingTypes,...(prdRef?{prdRef}:{}),...(missingPrdRef?{missingPrdRef:true}:{}),acceptanceCriteria,status:missingTypes.length===0&&acceptanceCriteria.every(x=>x.status==='PASS')&&!missingPrdRef&&prdRef?.status!=='MISSING'?'PASS':'FAIL'};
 });
 return {status:requirements.every(x=>x.status==='PASS')?'PASS':'FAIL',details:{requirementCount:requirements.length,criterionCount:criteria.length,requirePrdRefs:g.requirePrdRefs===true,requirements,...(coverage?{coverage:{source:coverage.source,execution:coverage.execution}}:{})}};
}
