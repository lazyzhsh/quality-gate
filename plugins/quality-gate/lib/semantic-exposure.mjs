import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
// Semantic Exposure：目录概念用 `exposure: public|internal` 声明暴露策略，
// runner 观察项目公共面（其 source 字段说明判定依据，如"api 模块导出符号"），
// 内部概念出现在公共面即 FAIL。内核只核对策略与观察，公共面的定义由项目
// runner 给出并作为观察证据记录——不是内核自行判定的安全边界。
export function validateSemanticExposure(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'semantic-exposure requires L3 and ontology provider');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
export function runSemanticExposure(g,c,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Semantic exposure runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.exposed)&&observed.exposed.length<=200,'Invalid or stale semantic exposure observation');
  check(observed.exposed.every(x=>object(x)&&text(x.iri)&&text(x.location)),'Invalid exposed concepts');
  const provider=createProvider(c.ontology,root);
  check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
  check(provider.concepts().some(concept=>concept.exposure!==undefined),'Catalog declares no exposure policy');
  const findings=[];
  const byIri=new Map();
  for(const item of observed.exposed){
   const seen=byIri.get(item.iri)??[];
   seen.push(item.location);
   byIri.set(item.iri,seen);
  }
  for(const [iri,locations] of byIri){
   const resolved=provider.resolve(iri);
   if(resolved.status!=='FOUND'){findings.push({iri,locations,rule:'unknownExposedConcept'});continue;}
   if(resolved.concept.exposure==='internal')findings.push({iri,label:resolved.concept.label,locations,rule:'internalConceptExposed'});
  }
  const ack=ontologyAckFinding(g,provider);
  if(ack)findings.push(ack);
  return {status:findings.length?'FAIL':'PASS',details:{...execution,source:observed.source,provider:provider.describe(),exposedCount:observed.exposed.length,findings}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
