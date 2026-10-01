import fs from 'node:fs';
import {createProvider,ontologyAckFinding} from './ontology.mjs';
import {projectFile} from './kernel.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
// Instance Alignment（实例级对齐，纯内建）：登记文件声明关键实体的期望类型，
// 数据样本逐条核对——类型未解析（unknownConcept）、实体缺观察（missingEntity）、
// 类型不符（typeMismatch）即 FAIL；同一实体多类型时用内建推理闭包判定：
// 互斥（disjointInstances，冲突）或不可比较（ambiguousInstanceType，歧义）均 FAIL，
// 仅包含链上的多类型（特化 typing）视为一致。
export function validateSemanticInstance(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type)&&text(g.dataFile),'semantic-instance requires L3, dataFile and ontology provider');
 check(g.entityTypes===undefined||(Array.isArray(g.entityTypes)&&g.entityTypes.length>0&&g.entityTypes.length<=100&&g.entityTypes.every(x=>object(x)&&text(x.entityId)&&text(x.typeIri))),'Invalid semantic-instance entityTypes');
 check(g.entityTypes===undefined||new Set(g.entityTypes.map(x=>x.entityId)).size===g.entityTypes.length,'Duplicate semantic-instance entityId');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
export function runSemanticInstance(g,c,root){
 const sample=JSON.parse(fs.readFileSync(projectFile(root,g.dataFile),'utf8').replace(/^\uFEFF/,''));
 check(Array.isArray(sample.records)&&sample.records.length>0&&sample.records.length<=100,'Expected 1..100 records');
 check(sample.records.every(r=>object(r)&&text(r.id)&&text(r.typeIri)&&(r.entityId===undefined||text(r.entityId))),'Invalid instance record');
 check(new Set(sample.records.map(r=>r.id)).size===sample.records.length,'Duplicate instance record');
 const provider=createProvider(c.ontology,root);
 check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
 const findings=[];
 for(const record of sample.records)if(provider.resolve(record.typeIri).status!=='FOUND')findings.push({recordId:record.id,typeIri:record.typeIri,rule:'unknownConcept'});
 for(const expected of g.entityTypes??[]){
  const observed=[...new Set(sample.records.filter(r=>r.entityId===expected.entityId).map(r=>r.typeIri))];
  if(observed.length===0)findings.push({entityId:expected.entityId,expectedIri:expected.typeIri,rule:'missingEntity'});
  else if(!observed.every(iri=>iri===expected.typeIri||provider.subsumptionPath?.(iri,expected.typeIri)))findings.push({entityId:expected.entityId,expectedIri:expected.typeIri,actualIris:observed,rule:'typeMismatch'});
 }
 const byEntity=new Map();
 for(const record of sample.records)if(record.entityId!==undefined){
  const types=byEntity.get(record.entityId)??new Set();
  types.add(record.typeIri);
  byEntity.set(record.entityId,types);
 }
 for(const [entityId,types] of byEntity){
  const iris=[...types];
  for(let i=0;i<iris.length;i++)for(let j=i+1;j<iris.length;j++){
   const [a,b]=iris[i]<iris[j]?[iris[i],iris[j]]:[iris[j],iris[i]];
   if(provider.isDisjoint?.(a,b)){findings.push({entityId,typeIris:iris,pair:[a,b],rule:'disjointInstances'});continue;}
   const compatible=provider.subsumptionPath?.(a,b)||provider.subsumptionPath?.(b,a);
   if(!compatible)findings.push({entityId,typeIris:iris,pair:[a,b],rule:'ambiguousInstanceType'});
  }
 }
 const ack=ontologyAckFinding(g,provider);
 if(ack)findings.push(ack);
 return {status:findings.length?'FAIL':'PASS',details:{provider:provider.describe(),recordCount:sample.records.length,declaredEntityCount:(g.entityTypes??[]).length,findings}};
}
