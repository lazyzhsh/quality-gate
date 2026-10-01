import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const canonical=pairs=>new Set(pairs.map(([a,b])=>a<b?`${a}\0${b}`:`${b}\0${a}`));
// 一致性核验 + 可选外部 reasoner 增强。内建部分：目录构建即核验（互斥与包含
// 矛盾、环、悬垂目标均 fail-closed ERROR），证据输出声明/推断互斥对计数。
// 外部增强采用"双实现一致性核对"协议：内核把目录事实经 stdin 完整交给外部
// reasoner，其独立计算推断互斥对集合；集合不一致即 ERROR（无法裁决谁对谁错，
// 只能阻断），一致才记 AGREED。内核不采信外部单独声称的任何结论。
export function validateSemanticConsistency(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'semantic-consistency requires L3 and ontology provider');
 check(g.reasoner===undefined||(object(g.reasoner)&&Array.isArray(g.reasoner.argv)&&g.reasoner.argv.length>0&&g.reasoner.argv.every(text)&&Number.isInteger(g.reasoner.timeoutMs)&&g.reasoner.timeoutMs>0&&g.reasoner.timeoutMs<=20000),'Invalid semantic-consistency reasoner');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
export function runSemanticConsistency(g,c,root){
 const provider=createProvider(c.ontology,root);
 check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
 const concepts=provider.concepts();
 const declared=canonical(concepts.flatMap(concept=>(concept.disjointWith??[]).map(target=>[concept.iri,target])));
 const inferred=provider.disjointPairs?provider.disjointPairs():[...declared].map(key=>key.split('\0'));
 const details={provider:provider.describe(),conceptCount:concepts.length,subclassEdgeCount:concepts.reduce((count,concept)=>count+(concept.subClassOf?.length??0),0),declaredDisjointPairCount:declared.size,inferredDisjointPairCount:inferred.length};
 if(g.reasoner){
  const runId=randomUUID(),argv=g.reasoner.argv.map(x=>x==='$NODE'?process.execPath:x);
  const request={schemaVersion:'0.1',runId,facts:{concepts:concepts.map(concept=>({iri:concept.iri,...(concept.subClassOf?{subClassOf:concept.subClassOf}:{}),...(concept.disjointWith?{disjointWith:concept.disjointWith}:{}),...(concept.equivalentClass?{equivalentClass:concept.equivalentClass}:{}),...(concept.unionOf?{unionOf:concept.unionOf}:{})}))}};
  const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify(request)+'\n',timeout:g.reasoner.timeoutMs,maxBuffer:65536,windowsHide:true});
  const runnerError=result.error?.message??(typeof result.stderr==='string'?result.stderr.trim().split('\n').pop():undefined)??'non-zero exit';
  if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...details,reasoner:{status:'RUNNER_ERROR',error:runnerError},error:`External reasoner failed: ${runnerError}`}};
  let observed;
  try{
   observed=JSON.parse(result.stdout);
   check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&text(observed.tool)&&Array.isArray(observed.entailedDisjointPairs)&&observed.entailedDisjointPairs.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(text)),'Invalid or stale reasoner observation');
  }catch(error){return {status:'ERROR',details:{...details,reasoner:{status:'INVALID',error:error.message},error:error.message}};}
  const theirs=canonical(observed.entailedDisjointPairs),mine=canonical(inferred);
  const claimedOnlyByExternal=[...theirs].filter(key=>!mine.has(key)).map(key=>key.split('\0'));
  const kernelOnly=[...mine].filter(key=>!theirs.has(key)).map(key=>key.split('\0'));
  if(claimedOnlyByExternal.length||kernelOnly.length)return {status:'ERROR',details:{...details,reasoner:{status:'DISAGREEMENT',source:observed.source,tool:observed.tool,claimedOnlyByExternal,kernelOnly},error:`reasoner disagreement with ${observed.tool}: claimed-only ${claimedOnlyByExternal.length} pairs, kernel-only ${kernelOnly.length} pairs`}};
  details.reasoner={status:'AGREED',source:observed.source,tool:observed.tool,agreedPairCount:inferred.length};
 }
 const ack=ontologyAckFinding(g,provider);
 if(ack)return {status:'FAIL',details:{...details,ontologyAck:ack}};
 return {status:'PASS',details};
}
