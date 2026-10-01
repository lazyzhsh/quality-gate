import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const triple=x=>`${x.from}\0${x.predicate}\0${x.to}`;
// Relation Alignment：项目声明概念间期望关系，runner 从当次代码读取实际关系注解，
// 内核核对三方一致——代码缺失（missing）、本体未认可（unsanctioned）、代码多出
// 未声明关系（undeclared）、引用未知概念（unknown）均为 FAIL。符号→概念的映射
// 由 semantic-alignment 负责，本门禁对齐概念间关系本身。
export function validateSemanticRelation(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'semantic-relation requires L3 and ontology provider');
 check(Array.isArray(g.relations)&&g.relations.length>0&&g.relations.length<=100&&g.relations.every(x=>object(x)&&text(x.from)&&text(x.predicate)&&text(x.to)),'Invalid semantic relations');
 check(new Set(g.relations.map(triple)).size===g.relations.length,'Duplicate semantic relation');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
export function runSemanticRelation(g,c,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Semantic relation runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.relations)&&observed.relations.length<=200,'Invalid or stale semantic relation observation');
  check(observed.relations.every(x=>object(x)&&text(x.from)&&text(x.predicate)&&text(x.to)&&text(x.location)),'Invalid observed relations');
  const provider=createProvider(c.ontology,root);
  check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
  // 满足判定（v1.23 推理深化，确定性 OWL 子集）：期望 P(a,b) 被观察满足当且仅当——
  // 直接/子属性：观察到 Q(a,b) 且 Q⊑*P（superProperties(Q)∋P）；或
  // 逆属性：观察到 Q(b,a) 且 Q 与 P 互逆（inverseOf 单边声明即双向）；或
  // 传递：传递属性 Q 的观察链可推得 Q(a,b)，且 Q⊑*P；父属性链不能证明子属性。
  // 被满足路径上的观察边记为已覆盖——未覆盖的观察边即 undeclaredRelation。
  const superProps=p=>typeof provider.superProperties==='function'?provider.superProperties(p):new Set([p]);
  const inverseOf=p=>typeof provider.inverseOf==='function'?provider.inverseOf(p):null;
  const isTransitive=p=>typeof provider.isTransitiveProperty==='function'&&provider.isTransitiveProperty(p);
  const covered=new Set(),inferred=[];
  const singleEdgeSatisfies=expected=>{
   for(let index=0;index<observed.relations.length;index++){
    const rel=observed.relations[index];
    if(rel.from===expected.from&&rel.to===expected.to&&superProps(rel.predicate).has(expected.predicate))return {via:rel.predicate===expected.predicate?'direct':'subproperty',index};
    const inv=inverseOf(expected.predicate);
    if(inv&&rel.from===expected.to&&rel.to===expected.from&&superProps(rel.predicate).has(inv))return {via:'inverse',index};
   }
   return null;
  };
  const transitiveSatisfies=expected=>{
   const candidates=new Set([expected.predicate,...observed.relations.flatMap(rel=>[...superProps(rel.predicate)])]);
   for(const predicate of candidates){
    if(!isTransitive(predicate)||!superProps(predicate).has(expected.predicate))continue;
    const edges=new Map();
    observed.relations.forEach((rel,index)=>{
     if(!superProps(rel.predicate).has(predicate))return;
     const list=edges.get(rel.from)??[];
     list.push({to:rel.to,index});
     edges.set(rel.from,list);
    });
    const queue=[[expected.from,[]]],seen=new Set([expected.from]);
    while(queue.length){
     const [node,trail]=queue.shift();
     if(node===expected.to&&trail.length>0)return {via:'transitive',trail};
     for(const edge of edges.get(node)??[]){
      if(seen.has(edge.to))continue;
      seen.add(edge.to);
      queue.push([edge.to,[...trail,edge.index]]);
     }
    }
   }
   return null;
  };
  const findings=[];
  for(const expected of g.relations){
   const fromConcept=provider.resolve(expected.from),toConcept=provider.resolve(expected.to);
   if(fromConcept.status!=='FOUND'||toConcept.status!=='FOUND'){
    findings.push({...expected,rule:'unknownConcept',detail:`${fromConcept.status!=='FOUND'?expected.from:expected.to} not in catalog`});
    continue;
   }
   const single=singleEdgeSatisfies(expected);
   const chain=single?null:transitiveSatisfies(expected);
   if(!single&&!chain)findings.push({...expected,rule:'missingRelation'});
   else{
    if(single){covered.add(single.index);if(single.via!=='direct')inferred.push({from:expected.from,predicate:expected.predicate,to:expected.to,via:single.via,observed:observed.relations[single.index]});}
    else{chain.trail.forEach(index=>covered.add(index));inferred.push({from:expected.from,predicate:expected.predicate,to:expected.to,via:'transitive',trail:chain.trail.map(index=>observed.relations[index].location)});}
   }
   // 本体认可：目录在 from 概念上声明了 D(→to) 且 D⊑*... D ⊒ P（声明更强属性认可更弱主张）；
   // 或目录在 to 概念上以互逆谓词声明了反向关系
   const forwardSanctioned=(fromConcept.concept.relations??[]).some(relation=>relation.to===expected.to&&superProps(expected.predicate).has(relation.predicate));
   const inverseSanctioned=(toConcept.concept.relations??[]).some(relation=>{
    if(relation.to!==expected.from)return false;
    const inv=inverseOf(expected.predicate);
    return relation.predicate===expected.predicate||(inv!==null&&superProps(inv).has(relation.predicate));
   });
   if(!forwardSanctioned&&!inverseSanctioned)findings.push({...expected,rule:'unsanctionedRelation'});
  }
  observed.relations.forEach((relation,index)=>{
   if(!covered.has(index))findings.push({from:relation.from,predicate:relation.predicate,to:relation.to,location:relation.location,rule:'undeclaredRelation'});
  });
  const ack=ontologyAckFinding(g,provider);
  if(ack)findings.push(ack);
  return {status:findings.length?'FAIL':'PASS',details:{...execution,source:observed.source,provider:provider.describe(),expectedCount:g.relations.length,observedCount:observed.relations.length,...(inferred.length?{inferred}:{}),findings}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
