import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
import {conditionsMet,evaluateOperator} from './assertions.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
// Constraint Alignment：本体目录在概念上声明的约束（与 invariant/property 同一
// 断言语义）在 runner 观察到的真实案例上执行——约束来自本体、案例来自代码运行，
// 两者当次对上才算 PASS。缺失操作数/未知约束/未知概念均 fail-closed ERROR。
export function validateSemanticConstraint(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'semantic-constraint requires L3 and ontology provider');
 check(text(g.concept),'semantic-constraint requires concept');
 check(g.minCases===undefined||Number.isInteger(g.minCases)&&g.minCases>0&&g.minCases<=500,'Invalid semantic-constraint minCases');
 check(g.constraintIds===undefined||(Array.isArray(g.constraintIds)&&g.constraintIds.length>0&&g.constraintIds.length<=20&&g.constraintIds.every(text)&&new Set(g.constraintIds).size===g.constraintIds.length),'Invalid semantic-constraint constraintIds');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
export function runSemanticConstraint(g,c,root){
 const minCases=g.minCases??1;
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,minCases})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Semantic constraint runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.cases)&&observed.cases.length>=minCases&&observed.cases.length<=500,'Invalid or stale semantic constraint observation');
  check(observed.cases.every(x=>object(x)&&text(x.id)&&object(x.values))&&new Set(observed.cases.map(x=>x.id)).size===observed.cases.length,'Invalid observed cases');
  const provider=createProvider(c.ontology,root);
  check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
  const concept=provider.resolve(g.concept);
  check(concept.status==='FOUND',`Unknown concept: ${g.concept}`);
  const declared=concept.concept.constraints;
  check(Array.isArray(declared)&&declared.length>0,'Concept has no declared constraints');
  if(g.constraintIds)for(const id of g.constraintIds)check(declared.some(constraint=>constraint.id===id),`Unknown constraint id: ${id}`);
  const constraints=g.constraintIds?declared.filter(constraint=>g.constraintIds.includes(constraint.id)):declared;
  const violations=[];
  for(const item of observed.cases){
   for(const constraint of constraints){
    if(constraint.when&&!conditionsMet(constraint.when,item.values)){violations.push({constraintId:constraint.id,caseId:item.id,operator:constraint.operator,status:'SKIP',reason:'Condition not met'});continue;}
    check(Object.hasOwn(item.values,constraint.left),`Missing constraint operand: ${constraint.id}`);
    if(constraint.right)check(Object.hasOwn(item.values,constraint.right),`Missing constraint operand: ${constraint.id}`);
    const left=item.values[constraint.left],right=constraint.right?item.values[constraint.right]:constraint.value;
    const pass=evaluateOperator(left,constraint.operator,right);
    violations.push({constraintId:constraint.id,caseId:item.id,operator:constraint.operator,left,right,status:pass?'PASS':'FAIL'});
   }
  }
  const findings=violations.filter(x=>x.status==='FAIL');
  const ack=ontologyAckFinding(g,provider);
  return {status:!findings.length&&!ack?'PASS':'FAIL',details:{...execution,source:observed.source,provider:provider.describe(),concept:g.concept,constraintCount:constraints.length,caseCount:observed.cases.length,violations:violations.filter(x=>x.status!=='PASS'),...(ack?{ontologyAck:ack}:{})}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
