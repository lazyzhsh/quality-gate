import {createProvider,ontologyAckFinding,isLanguageTag} from './ontology.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function validateTerminology(g,c){
 check(g.level==='L3'&&c.ontology&&text(c.ontology.type),'terminology requires L3 and ontology provider');
 check(g.terms===undefined||(Array.isArray(g.terms)&&g.terms.length>0&&g.terms.length<=100&&g.terms.every(x=>object(x)&&text(x.term)&&(x.lang===undefined||isLanguageTag(x.lang)))),'Invalid terminology terms');
 check(g.terms===undefined||new Set(g.terms.map(x=>`${x.lang??'*'}\0${x.term}`)).size===g.terms.length,'Duplicate terminology term');
 check(g.acknowledgedOntology===undefined||(object(g.acknowledgedOntology)&&text(g.acknowledgedOntology.id)&&text(g.acknowledgedOntology.version)&&text(g.acknowledgedOntology.catalogSha256)),'Invalid acknowledgedOntology');
}
// Terminology Ambiguity（v1.22 起多语言）：目录级 SKOS 完整性——prefLabel/altLabel 的
// S14 唯一性按 (语言, 值) 分域检查（纯字符串条目＝语言未定；跨语言同形词合法）
// 加项目术语解析（label/altLabels 精确匹配；术语可选 lang 限定同语言命中，不带 lang
// 则跨语言匹配——跨语言重名命中多概念即歧义，如实暴露）。
const labelEntries=concept=>{
 const entries=[{value:concept.label,lang:null}];
 for(const alt of concept.altLabels??[])entries.push(typeof alt==='string'?{value:alt,lang:null}:{value:alt.value,lang:alt.lang});
 return entries;
};
export function runTerminology(g,c,root){
 const provider=createProvider(c.ontology,root);
 check(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider not implemented');
 check(typeof provider.concepts==='function','Ontology provider does not expose its vocabulary');
 const concepts=provider.concepts();
 check(Array.isArray(concepts)&&concepts.length>0&&concepts.every(concept=>text(concept.iri)&&text(concept.label)),'Ontology provider returned an invalid vocabulary');
 const byKey=new Map();
 for(const concept of concepts){
  for(const {value,lang} of labelEntries(concept)){
   const key=`${lang??'*'}\0${value}`;
   const iris=byKey.get(key)??[];
   if(!iris.includes(concept.iri))iris.push(concept.iri);
   byKey.set(key,iris);
  }
 }
 const duplicateLabels=[...byKey.entries()].filter(([,iris])=>iris.length>1).map(([key,iris])=>{const [lang,value]=key.split('\0');return {rule:'duplicateLabel',label:value,...(lang!=='*'?{lang}:{}),concepts:iris};});
 const termFindings=(g.terms??[]).map(term=>{
  const matches=concepts.filter(concept=>labelEntries(concept).some(entry=>entry.value===term.term&&(term.lang===undefined||entry.lang===term.lang))).map(concept=>concept.iri);
  if(matches.length===1)return {term:term.term,...(term.lang!==undefined?{lang:term.lang}:{}),matches,status:'PASS',concept:matches[0]};
  return {term:term.term,...(term.lang!==undefined?{lang:term.lang}:{}),matches,status:'FAIL',rule:matches.length===0?'unmatchedTerm':'ambiguousTerm'};
 }).filter(finding=>finding.status==='FAIL');
 const ack=ontologyAckFinding(g,provider);
 const findings=[...duplicateLabels,...termFindings,...(ack?[ack]:[])];
 return {status:findings.length?'FAIL':'PASS',details:{provider:provider.describe(),conceptCount:concepts.length,termCount:(g.terms??[]).length,findings}};
}
