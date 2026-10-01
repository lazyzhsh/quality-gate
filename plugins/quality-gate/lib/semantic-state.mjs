import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
// State Alignment：本体目录在概念上声明的生命周期（states + 允许转换）与 runner
// 观察到的真实实例状态转换对齐——观察到未声明状态或未声明转换即 FAIL。
export function validateSemanticState(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'semantic-state requires L3 and ontology provider');
 check(text(g.concept),'semantic-state requires concept');
 check(g.minCases===undefined||Number.isInteger(g.minCases)&&g.minCases>0&&g.minCases<=500,'Invalid semantic-state minCases');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
export function runSemanticState(g,c,root){
 const minCases=g.minCases??1;
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,minCases})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Semantic state runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.cases)&&observed.cases.length>=minCases&&observed.cases.length<=500,'Invalid or stale semantic state observation');
  check(observed.cases.every(x=>object(x)&&text(x.id)&&Array.isArray(x.transitions)&&x.transitions.every(t=>object(t)&&text(t.from)&&text(t.to)))&&new Set(observed.cases.map(x=>x.id)).size===observed.cases.length,'Invalid observed state cases');
  const provider=createProvider(c.ontology,root);
  check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
  const concept=provider.resolve(g.concept);
  check(concept.status==='FOUND',`Unknown concept: ${g.concept}`);
  const lifecycle=concept.concept.lifecycle;
  check(lifecycle!==undefined,'Concept has no declared lifecycle');
  const states=new Set(lifecycle.states);
  const allowed=new Set(lifecycle.transitions.map(t=>`${t.from}\0${t.to}`));
  const findings=[];
  for(const item of observed.cases){
   for(const transition of item.transitions){
    if(!states.has(transition.from)||!states.has(transition.to)){
     findings.push({caseId:item.id,from:transition.from,to:transition.to,rule:'unknownState'});
     continue;
    }
    if(!allowed.has(`${transition.from}\0${transition.to}`))findings.push({caseId:item.id,from:transition.from,to:transition.to,rule:'illegalTransition'});
   }
  }
  const ack=ontologyAckFinding(g,provider);
  if(ack)findings.push(ack);
  return {status:findings.length?'FAIL':'PASS',details:{...execution,source:observed.source,provider:provider.describe(),concept:g.concept,stateCount:states.size,declaredTransitionCount:lifecycle.transitions.length,caseCount:observed.cases.length,findings}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
