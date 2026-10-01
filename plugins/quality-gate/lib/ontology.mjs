import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {operators,validateCondition} from './assertions.mjs';
import {projectFile} from './kernel.mjs';
const FIBO_VERSION='master_2026Q1';
const FIBO_REVISION='574a83150a34d7188384c2ecbe124843761931d6';
export const FIBO_CATALOG_SHA='eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e';
const sha=b=>createHash('sha256').update(b).digest('hex');

const stringList=v=>Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&x)&&new Set(v).size===v.length;
// 语言标签（BCP 47 子集，v1.22 多语言术语）：两三字母主子标签＋可选扩展段
const LANG_TAG=/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
export const isLanguageTag=v=>typeof v==='string'&&LANG_TAG.test(v);
// altLabels（v1.22 起条目可为 SKOS 语言标签对象）：纯字符串＝语言未定（旧目录零改动兼容），
// {value,lang} 恰两键——value 非空、lang 合法语言标签；跨语言同形词合法（S14 按 lang+value 分域）
const altLabelList=v=>Array.isArray(v)&&v.length>0&&v.every(x=>(typeof x==='string'&&x)||(x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===2&&typeof x.value==='string'&&x.value&&typeof x.lang==='string'&&isLanguageTag(x.lang)));
// 属性注册表（v1.23 推理深化）：predicate 元数据——subPropertyOf（层级，须无环）、
// inverseOf（逆属性）、transitive（传递属性）。声明性、确定性子集。
const propertyList=v=>v===undefined||(Array.isArray(v)&&v.length>0&&v.length<=50&&new Set(v.map(p=>p.predicate)).size===v.length&&v.every(x=>x!==null&&typeof x==='object'&&typeof x.predicate==='string'&&x.predicate&&(x.subPropertyOf===undefined||stringList(x.subPropertyOf))&&(x.inverseOf===undefined||(typeof x.inverseOf==='string'&&x.inverseOf))&&(x.transitive===undefined||typeof x.transitive==='boolean')));
export const isPropertyRegistry=propertyList;
const relationList=v=>Array.isArray(v)&&v.length>0&&v.length<=50&&v.every(r=>r!==null&&typeof r==='object'&&typeof r.predicate==='string'&&r.predicate&&typeof r.to==='string'&&r.to)&&new Set(v.map(r=>`${r.predicate}\0${r.to}`)).size===v.length;
// 概念约束复用 invariant/property 的断言语义（operators + when 条件），
// 使"本体声明约束"与"L3.6 不变量执行"是同一套判定。
const constraintList=v=>Array.isArray(v)&&v.length>0&&v.length<=20&&v.every(x=>x!==null&&typeof x==='object'&&typeof x.id==='string'&&x.id&&typeof x.left==='string'&&x.left&&operators.includes(x.operator)&&((typeof x.right==='string'&&x.right&&!('value'in x))||(!('right'in x)&&'value'in x))&&(x.when===undefined||(Array.isArray(x.when)?x.when.every(condition=>{validateCondition(condition);return true;}):(validateCondition(x.when),true))))&&new Set(v.map(x=>x.id)).size===v.length;
// 概念生命周期：states 唯一，transitions 的 from/to 必须都是已声明状态。
const lifecycleValue=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v.states)&&v.states.length>0&&v.states.length<=20&&v.states.every(x=>typeof x==='string'&&x)&&new Set(v.states).size===v.states.length&&Array.isArray(v.transitions)&&v.transitions.length<=50&&v.transitions.every(x=>x!==null&&typeof x==='object'&&typeof x.from==='string'&&x.from&&typeof x.to==='string'&&x.to&&v.states.includes(x.from)&&v.states.includes(x.to))&&new Set(v.transitions.map(x=>`${x.from}\0${x.to}`)).size===v.transitions.length;
const conceptList=v=>Array.isArray(v)&&v.length>0&&v.every(c=>c!==null&&typeof c==='object'&&typeof c.iri==='string'&&c.iri&&typeof c.label==='string'&&c.label&&(c.altLabels===undefined||altLabelList(c.altLabels))&&(c.subClassOf===undefined||stringList(c.subClassOf))&&(c.equivalentClass===undefined||stringList(c.equivalentClass))&&(c.unionOf===undefined||stringList(c.unionOf))&&(c.disjointWith===undefined||stringList(c.disjointWith))&&(c.relations===undefined||relationList(c.relations))&&(c.constraints===undefined||constraintList(c.constraints))&&(c.lifecycle===undefined||lifecycleValue(c.lifecycle))&&(c.exposure===undefined||c.exposure==='public'||c.exposure==='internal'));

// acknowledgedOntology 确认比对（与 change-scope acknowledgedBase 同语义）：门禁声明
// 其映射/术语确认所依据的本体 id/version/catalogSha256；目录移动后即失效，须人工
// 重审映射并更新确认。返回 null 表示一致或未启用。
export function ontologyAckFinding(g,provider){
 const ack=g.acknowledgedOntology;
 if(!ack)return null;
 const actual=provider.describe();
 const fields=['id','version','catalogSha256'].filter(field=>actual[field]!==ack[field]).map(field=>({field,expected:ack[field],actual:actual[field]??null}));
 return fields.length?{rule:'staleOntologyAck',fields}:null;
}

 // 目录型 provider 共同构建：唯一 IRI、subClassOf 目标必须在目录内且无环（fail-closed），
 // 之后提供精确 IRI 解析、词表枚举与 subClassOf 包含路径（BFS 最短链，含首尾）。
 // 互斥推理（OWL 子集，纯内建）：declared disjointWith 沿 subClassOf 传递给后代——
 // A⊥B 且 C⊆A、D⊆B 则推断 C⊥D；推理闭包与包含关系矛盾（X⊥Y 且 X 包含 Y/同一概念
 // 落入两侧）即目录不一致，构建时 fail-closed。这不是完整 OWL reasoner。
 function catalogProvider(data,extra={}){
 if(!conceptList(data.concepts)||!propertyList(data.properties)||new Set(data.concepts.map(c=>c.iri)).size!==data.concepts.length)throw new Error('Invalid ontology catalog');
 const concepts=new Map(data.concepts.map(c=>[c.iri,c]));
 for(const concept of data.concepts)for(const parent of concept.subClassOf??[])if(!concepts.has(parent))throw new Error(`Unknown subClassOf target: ${parent}`);
 for(const concept of data.concepts){
  for(const twin of concept.equivalentClass??[]){
   if(!concepts.has(twin))throw new Error(`Unknown equivalentClass target: ${twin}`);
   if(twin===concept.iri)throw new Error(`Self equivalentClass: ${twin}`);
  }
  for(const operand of concept.unionOf??[]){
   if(!concepts.has(operand))throw new Error(`Unknown unionOf target: ${operand}`);
   if(operand===concept.iri)throw new Error(`Self unionOf: ${operand}`);
  }
 }
 for(const concept of data.concepts)for(const relation of concept.relations??[])if(!concepts.has(relation.to))throw new Error(`Unknown relation target: ${relation.to}`);
 // 属性注册表：subPropertyOf 须成 DAG（环 fail-closed）；逆属性单边声明即视为双向
 const propertyMeta=new Map((data.properties??[]).map(p=>[p.predicate,p]));
 for(const property of data.properties??[])for(const parent of property.subPropertyOf??[])if(!propertyMeta.has(parent))throw new Error(`Unknown subPropertyOf target: ${parent}`);
 {
  const state=new Map();
  const visit=p=>{
   if(state.get(p)===1)return;
   if(state.get(p)===0)throw new Error(`Cyclic subPropertyOf in ontology catalog: ${p}`);
   state.set(p,0);
   for(const parent of (propertyMeta.get(p)?.subPropertyOf??[]))visit(parent);
   state.set(p,1);
  };
  for(const predicate of propertyMeta.keys())visit(predicate);
 }
 // 推理深化物化（v1.23）：等价边双向＋并类算作操作数的父类，全部并入扩展包含图；
 // 原生 subClassOf 仍须 DAG（环检查只看原生边），闭包/互斥传播/一致性检查走扩展图
 const parentsOf=iri=>concepts.get(iri)?.subClassOf??[];
 const state=new Map();
 const visit=iri=>{
  if(state.get(iri)===1)return;
  if(state.get(iri)===0)throw new Error('Cyclic subClassOf in ontology catalog');
  state.set(iri,0);
  for(const parent of parentsOf(iri))visit(parent);
  state.set(iri,1);
 };
 for(const iri of concepts.keys())visit(iri);
 // 等价邻接对称物化：单边声明 A≡B 即双向（B 的扩展父/子都含 A）
 const equivalentsOf=new Map();
 for(const concept of data.concepts)for(const twin of concept.equivalentClass??[]){
  const a=equivalentsOf.get(concept.iri)??[];a.push(twin);equivalentsOf.set(concept.iri,a);
  const b=equivalentsOf.get(twin)??[];b.push(concept.iri);equivalentsOf.set(twin,b);
 }
 const parentsOfE=iri=>{
  const parents=[...parentsOf(iri),...(equivalentsOf.get(iri)??[])];
  for(const [unionIri,concept] of concepts)if((concept.unionOf??[]).includes(iri))parents.push(unionIri);
  return parents;
 };
 const childrenOf=new Map();
 for(const iri of concepts.keys())for(const parent of parentsOf(iri)){
  const children=childrenOf.get(parent)??[];
  children.push(iri);
  childrenOf.set(parent,children);
 }
 const childrenOfE=iri=>[...(childrenOf.get(iri)??[]),...(equivalentsOf.get(iri)??[]),...(concepts.get(iri)?.unionOf??[])];
 const closure=(start,next)=>{ // BFS 全邻接闭包（不含自身）
  const seen=new Set(),queue=[...next(start)];
  for(const node of queue)seen.add(node);
  while(queue.length){const node=queue.shift();for(const follower of next(node))if(!seen.has(follower)){seen.add(follower);queue.push(follower);}}
  return seen;
 };
 const ancestorsCache=new Map(),descendantsCache=new Map();
 const ancestors=iri=>ancestorsCache.get(iri)??closure(iri,parentsOfE);
 const descendants=iri=>descendantsCache.get(iri)??closure(iri,childrenOfE);
 for(const iri of concepts.keys()){ancestorsCache.set(iri,ancestors(iri));descendantsCache.set(iri,descendants(iri));}
 const disjointSet=new Set();
 const pair=(a,b)=>a<b?`${a}\0${b}`:a===b?`${a}\0${a}`:`${b}\0${a}`;
 for(const concept of data.concepts)for(const target of concept.disjointWith??[]){
  for(const left of [concept.iri,...descendants(concept.iri)])for(const right of [target,...descendants(target)])disjointSet.add(pair(left,right));
 }
 for(const key of disjointSet){
  const [left,right]=key.split('\0');
  if(left===right||ancestors(left).has(right)||ancestors(right).has(left))throw new Error(`Inconsistent ontology catalog: ${left} and ${right} are disjoint yet subsumption-related`);
 }
 const hasSubclasses=data.concepts.some(c=>Array.isArray(c.subClassOf));
 const hasEquivalence=data.concepts.some(c=>Array.isArray(c.equivalentClass));
 const hasUnions=data.concepts.some(c=>Array.isArray(c.unionOf));
 const hasDisjoint=data.concepts.some(c=>Array.isArray(c.disjointWith));
 const hasRelations=data.concepts.some(c=>Array.isArray(c.relations));
 const hasConstraints=data.concepts.some(c=>Array.isArray(c.constraints));
 const hasLifecycle=data.concepts.some(c=>c.lifecycle!==undefined);
 const hasExposure=data.concepts.some(c=>c.exposure!==undefined);
 const hasPropertyMeta=propertyMeta.size>0;
 // 属性闭包（v1.23 推理深化）：superProperties(p)=p 及其全部祖先（子属性满足蕴含父属性满足）；
 // 逆属性单边声明即视为双向；transitive 供关系门禁做可达性推理
 const propertyAncestorsCache=new Map();
 const superProperties=p=>{
  if(propertyAncestorsCache.has(p))return propertyAncestorsCache.get(p);
  const set=closure(p,x=>propertyMeta.get(x)?.subPropertyOf??[]);
  set.add(p);
  propertyAncestorsCache.set(p,set);
  return set;
 };
 const inverseOf=p=>{
  const declared=propertyMeta.get(p)?.inverseOf;
  if(declared)return declared;
  for(const [predicate,meta] of propertyMeta)if(meta.inverseOf===p)return predicate;
  return null;
 };
 return {
  describe:()=>({id:data.id,version:data.version,capabilities:['exact-iri-lookup','labels',...(hasSubclasses?['subclasses']:[]),...(hasEquivalence?['equivalence']:[]),...(hasUnions?['union-classes']:[]),...(hasDisjoint?['disjoint-with','disjoint-inference']:[]),...(hasRelations?['relations']:[]),...(hasConstraints?['constraints']:[]),...(hasLifecycle?['lifecycle']:[]),...(hasExposure?['exposure']:[]),...(hasPropertyMeta?['property-hierarchy']:[])],...extra}),
  resolve:iri=>({iri,status:concepts.has(iri)?'FOUND':'UNKNOWN',concept:concepts.get(iri)}),
  concepts:()=>data.concepts,
  isDisjoint:(a,b)=>disjointSet.has(pair(a,b)),
  disjointPairs:()=>[...disjointSet].map(key=>key.split('\0')).sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:x[1]<y[1]?-1:1),
  superProperties,inverseOf,
  isTransitiveProperty:p=>propertyMeta.get(p)?.transitive===true,
  subsumptionPath:(from,to)=>{
   if(from===to)return [from];
   if(!concepts.has(from)||!concepts.has(to))return null;
   const queue=[[from]],seen=new Set([from]);
   while(queue.length){
    const trail=queue.shift(),node=trail[trail.length-1];
    for(const parent of parentsOfE(node)){
     if(parent===to)return [...trail,to];
     if(!seen.has(parent)){seen.add(parent);queue.push([...trail,parent]);}
    }
   }
   return null;
  }
 };
 }

// 固定 FIBO 目录的加载与完整性核验：代码常量 pin 目录 SHA → 目录记录源摘要 → vendored
// 文件（信任链）；运行不联网。dir 参数供测试在副本上复现篡改场景——生产路径恒用内核资产目录。
export function loadPinnedFiboCatalog(dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/fibo/2026Q1')){
 const bytes=fs.readFileSync(path.join(dir,'catalog.json'));
 if(sha(bytes)!==FIBO_CATALOG_SHA)throw new Error('FIBO catalog integrity check failed');
 const data=JSON.parse(bytes.toString('utf8'));
 if(data.id!=='fibo-fnd-agreements'||data.version!==FIBO_VERSION||data.revision!==FIBO_REVISION||!Array.isArray(data.sources)||data.sources.length===0||data.sources.some(s=>typeof s?.file!=='string'||!s.file||typeof s?.sha256!=='string'||!s.sha256))throw new Error('Invalid pinned FIBO catalog');
 if(!Array.isArray(data.concepts)||!Number.isInteger(data.conceptCount)||data.conceptCount<=0||data.concepts.length!==data.conceptCount)throw new Error('Invalid pinned FIBO catalog');
 for(const source of data.sources){
  const raw=fs.readFileSync(path.join(dir,source.file));
  if(sha(raw)!==source.sha256)throw new Error(`FIBO source integrity check failed: ${source.file}`);
 }
 return data;
}

export function createProvider(config,root) {
 if(config?.type==='fibo-skeleton')return {
  describe:()=>({id:'fibo',status:'NOT_IMPLEMENTED',source:'https://spec.edmcouncil.org/fibo/',version:null,capabilities:[]}),
  resolve:iri=>({iri,status:'NOT_IMPLEMENTED'})
 };
 if(config?.type==='fibo-pinned') {
  if(config.expectedCatalogSha256!==FIBO_CATALOG_SHA)throw new Error('FIBO catalog pin mismatch');
  const data=loadPinnedFiboCatalog();
  return catalogProvider(data,{revision:data.revision,sources:data.sources.map(s=>({file:s.file,sha256:s.sha256})),catalogSha256:FIBO_CATALOG_SHA,conceptCount:data.conceptCount});
 }
 if(config?.type==='local-catalog') {
  const bytes=fs.readFileSync(projectFile(root,config.file));
  const data=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(typeof data.id!=='string'||!data.id||typeof data.version!=='string'||!data.version)throw new Error('Invalid ontology catalog');
  return catalogProvider(data,{catalogSha256:sha(bytes)});
 }
 throw new Error('Unknown ontology provider');
}
