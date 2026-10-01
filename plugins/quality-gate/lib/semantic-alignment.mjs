import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function validateSemanticAlignment(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'semantic-alignment requires L3 and ontology provider');
 check(Array.isArray(g.mappings)&&g.mappings.length>0&&g.mappings.length<=100&&g.mappings.every(x=>text(x.symbol)&&text(x.expectedIri)),'Invalid semantic mappings');
 check(new Set(g.mappings.map(x=>x.symbol)).size===g.mappings.length,'Duplicate semantic symbol');
 check(g.matchMode===undefined||['strict','subsumed'].includes(g.matchMode),'Invalid semantic matchMode');
 check(g.requireRuntimeOrigin===undefined||typeof g.requireRuntimeOrigin==='boolean','Invalid requireRuntimeOrigin');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
// 同一符号的多个候选 IRI（含声明的 expectedIri）两两互斥即为语义冲突。
// provider 具备推理能力时使用推断闭包（disjointWith 沿 subClassOf 传播），
// 否则回退到仅声明级检查。
const disjointPair=(provider,left,right)=>{
 if(typeof provider.isDisjoint==='function')return provider.isDisjoint(left,right);
 const leftConcept=provider.resolve(left).concept,rightConcept=provider.resolve(right).concept;
 return (Array.isArray(leftConcept?.disjointWith)&&leftConcept.disjointWith.includes(right))||(Array.isArray(rightConcept?.disjointWith)&&rightConcept.disjointWith.includes(left));
};
export function runSemanticAlignment(g,c,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Semantic runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.mappings),'Invalid or stale semantic observation');
  check(observed.mappings.every(x=>text(x.symbol)&&text(x.iri)&&text(x.location)&&(x.origin===undefined||['annotation','runtime'].includes(x.origin))),'Invalid observed mappings');
  const provider=createProvider(c.ontology,root);check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
  const bySymbol=new Map();
  for(const mapping of observed.mappings){
   const list=bySymbol.get(mapping.symbol)??[];
   list.push(mapping);
   bySymbol.set(mapping.symbol,list);
  }
  const findings=g.mappings.map(x=>{
   const candidates=bySymbol.get(x.symbol)??[];
   const expected=provider.resolve(x.expectedIri);
   const resolved=candidates.map(candidate=>provider.resolve(candidate.iri));
   // strict：候选必须与声明 IRI 完全一致；subsumed：另允许候选为声明概念的本体子类
   //（目录 subClassOf 传递闭包，BFS 最短包含链入证据，仅 RDFS 子集、非 OWL 推理）。
   const matchMode=g.matchMode??'strict';
   const subsumedMatches=[];
   for(const candidate of candidates){
    if(candidate.iri===x.expectedIri||matchMode!=='subsumed'||typeof provider.subsumptionPath!=='function')continue;
    const chain=provider.subsumptionPath(candidate.iri,x.expectedIri);
    if(chain)subsumedMatches.push({iri:candidate.iri,chain});
   }
   const allMatch=candidates.length>0&&expected.status==='FOUND'&&resolved.every(r=>r.status==='FOUND')&&candidates.every(candidate=>candidate.iri===x.expectedIri||subsumedMatches.some(match=>match.iri===candidate.iri));
   // 运行时来源（W5）：requireRuntimeOrigin 下每个符号须至少有一条 runtime 来源候选且与声明一致，
   // 否则 FAIL 指名 runtime-unbound（核验的是运行时绑定与声明一致，非完整行为语义验证）
   const runtimeCandidates=candidates.filter(candidate=>(candidate.origin??'annotation')==='runtime');
   const runtimeMatching=runtimeCandidates.some(candidate=>candidate.iri===x.expectedIri||subsumedMatches.some(match=>match.iri===candidate.iri));
   const runtimeUnbound=g.requireRuntimeOrigin===true&&!runtimeMatching;
   const origins={annotation:candidates.length-runtimeCandidates.length,runtime:runtimeCandidates.length};
   const iris=[...new Set([x.expectedIri,...candidates.map(candidate=>candidate.iri)])];
   const disjointPairs=[];
   for(let i=0;i<iris.length;i++)for(let j=i+1;j<iris.length;j++)if(disjointPair(provider,iris[i],iris[j]))disjointPairs.push([iris[i],iris[j]]);
   return {symbol:x.symbol,expectedIri:x.expectedIri,matchMode,actualIri:candidates.length===1?candidates[0].iri:null,actualIris:candidates.map(candidate=>candidate.iri),locations:candidates.map(candidate=>candidate.location),origins,...(runtimeUnbound?{runtimeUnbound:true}:{}),expectedConceptStatus:expected.status,actualConceptStatuses:resolved.map(r=>r.status),...(subsumedMatches.length?{subsumedMatches}:{}),...(disjointPairs.length?{disjointPairs}:{}),status:allMatch&&disjointPairs.length===0&&!runtimeUnbound?'PASS':'FAIL'};
  });
  const ack=ontologyAckFinding(g,provider);
  return {status:!ack&&findings.every(x=>x.status==='PASS')?'PASS':'FAIL',details:{...execution,source:observed.source,provider:provider.describe(),...(ack?{ontologyAck:ack}:{}),findings}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
