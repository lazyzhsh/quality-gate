import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {runSemanticProfile} from '../lib/semantic-profile.mjs';

// ---- W6（v1.29）：OWL/SHACL 规则组合性质测试 ----
// 评审残余："错误蕴含、约束形状验证……说明规则组合还需验证"。本文件用固定种子随机生成
// 属性层级×传递×互逆组合（OWL）与组件矩阵（SHACL），以独立实现的朴素 oracle 对照内核判定。
// 发现分歧即缺陷回归——两侧实现风格刻意不同（集合闭包 vs 内核的逐期望 BFS）。

const mulberry32=seed=>()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const pick=(rng,list)=>list[Math.floor(rng()*list.length)];

// ===== OWL：semantic-relation 满足判定的组合对照 =====
const supersClosure=properties=>{
 const supers={};
 for(const property of properties)supers[property.predicate]=new Set([property.predicate,...(property.subPropertyOf??[])]);
 let changed=true;
 while(changed){
  changed=false;
  for(const property of properties)for(const parent of property.subPropertyOf??[])for(const grand of supers[parent]??[])if(!supers[property.predicate].has(grand)){supers[property.predicate].add(grand);changed=true;}
 }
 return supers;
};
const inverseMap=properties=>{
 const inverse={};
 for(const property of properties)if(property.inverseOf){inverse[property.predicate]=property.inverseOf;inverse[property.inverseOf]=property.predicate;}
 return inverse;
};
const owlOracle=(properties,observed,expected)=>{
 // super*(p)：p 的祖先闭集（含自身）——朴素定点迭代
 const supers=supersClosure(properties);
 const inverse=inverseMap(properties);
 const transitive=new Set(properties.filter(p=>p.transitive).map(p=>p.predicate));
 const inSuper=(q,p)=>supers[q]?.has(p)??false;
 return expected.map(triple=>{
  // 直接/子属性：观察 (a,Q,b) 且 Q⊑*P
  if(observed.some(rel=>rel.from===triple.from&&rel.to===triple.to&&inSuper(rel.predicate,triple.predicate)))return {...triple,satisfied:true};
  // 逆属性：观察 (b,Q,a) 且 Q⊑*inv(P)
  const inv=inverse[triple.predicate];
  if(inv&&observed.some(rel=>rel.from===triple.to&&rel.to===triple.from&&inSuper(rel.predicate,inv)))return {...triple,satisfied:true};
  // 传递：候选 T（P 自身或观察谓词的任一祖先）传递且 T⊑*P，边集为谓词⊑*T 的观察边
  const candidates=new Set([triple.predicate,...observed.flatMap(rel=>[...(supers[rel.predicate]??[])])]);
  for(const candidate of candidates){
   if(!transitive.has(candidate)||!inSuper(candidate,triple.predicate))continue;
   const adjacency=new Map();
   for(const rel of observed)if(inSuper(rel.predicate,candidate)){
    if(!adjacency.has(rel.from))adjacency.set(rel.from,[]);
    adjacency.get(rel.from).push(rel.to);
   }
   // 从后继出发闭包：a→…→b 须至少一条边——a=b 时要求真实环回，起点平凡自达不算
   const reach=new Set(),queue=[...(adjacency.get(triple.from)??[])];
   while(queue.length){const node=queue.shift();if(reach.has(node))continue;reach.add(node);queue.push(...(adjacency.get(node)??[]));}
   if(reach.has(triple.to))return {...triple,satisfied:true,via:candidate};
  }
  return {...triple,satisfied:false};
 });
};

// 认可 oracle（F03）：正向=from 概念声明 D(→to) 且 D∈super*(P)；反向=to 概念声明 D(→from)
// 且存在 inv(P) 且 D∈super*(inv)。同谓词反向在无 inverseOf 声明时不认可。
const sanctionOracle=(catalog,expected)=>{
 const supers=supersClosure(catalog.properties??[]),inverse=inverseMap(catalog.properties??[]);
 const inSuper=(q,p)=>supers[q]?.has(p)??false;
 const byIri=new Map(catalog.concepts.map(concept=>[concept.iri,concept]));
 return expected.map(triple=>{
  const from=byIri.get(triple.from),to=byIri.get(triple.to);
  const forward=(from.relations??[]).some(r=>r.to===triple.to&&inSuper(triple.predicate,r.predicate));
  const inv=inverse[triple.predicate];
  const reverse=(to.relations??[]).some(r=>r.to===triple.from&&inv!==undefined&&inSuper(inv,r.predicate));
  return {...triple,sanctioned:forward||reverse};
 });
};

// 覆盖面 oracle（单向健全性）：内核标记为已覆盖的观察边必须落在某满足路径上——
// 直接/子属性/逆属性单边，或传递候选边集上 u 可自起点后继达且 v 可达终点。
const justifyingEdges=(properties,observed,expected)=>{
 const supers=supersClosure(properties),inverse=inverseMap(properties);
 const transitive=new Set(properties.filter(p=>p.transitive).map(p=>p.predicate));
 const inSuper=(q,p)=>supers[q]?.has(p)??false;
 const justified=new Set();
 for(const triple of expected){
  observed.forEach((rel,index)=>{
   if(rel.from===triple.from&&rel.to===triple.to&&inSuper(rel.predicate,triple.predicate))justified.add(index);
   const inv=inverse[triple.predicate];
   if(inv&&rel.from===triple.to&&rel.to===triple.from&&inSuper(rel.predicate,inv))justified.add(index);
  });
  for(const candidate of new Set([triple.predicate,...observed.flatMap(rel=>[...(supers[rel.predicate]??[])])])){
   if(!transitive.has(candidate)||!inSuper(candidate,triple.predicate))continue;
   const edges=observed.map((rel,index)=>({rel,index})).filter(({rel})=>inSuper(rel.predicate,candidate));
   const forward=new Set(),queue=edges.filter(({rel})=>rel.from===triple.from).map(({rel})=>rel.to);
   queue.forEach(node=>forward.add(node));
   let grew=true;
   while(grew){grew=false;for(const {rel} of edges)if(forward.has(rel.from)&&!forward.has(rel.to)){forward.add(rel.to);grew=true;}}
   const backward=new Set([triple.to]);grew=true;
   while(grew){grew=false;for(const {rel} of edges)if(backward.has(rel.to)&&!backward.has(rel.from)){backward.add(rel.from);grew=true;}}
   for(const {rel,index} of edges)if((rel.from===triple.from||forward.has(rel.from))&&(rel.to===triple.to||backward.has(rel.to)))justified.add(index);
  }
 }
 return justified;
};

const owlCase=(seed)=>{
 const rng=mulberry32(seed);
 const concepts=['urn:A','urn:B','urn:C','urn:D'].map(iri=>({iri,label:iri.slice(4)}));
 // 属性集：随机 DAG（窄⊑宽）＋随机传递性＋一两对互逆
 const names=['p0','p1','p2','p3'];
 const properties=names.map((predicate,index)=>({predicate,...(index>0&&rng()<0.65?{subPropertyOf:[pick(rng,names.slice(0,index))]}:{})}));
 for(const property of properties)if(rng()<0.4)property.transitive=true;
 const inversePair=rng()<0.6?[pick(rng,names),pick(rng,names)]:null;
 if(inversePair&&inversePair[0]!==inversePair[1])properties.find(p=>p.predicate===inversePair[0]).inverseOf=inversePair[1];
 // 观察边：随机谓词×随机节点对
 const observed=Array.from({length:3+Math.floor(rng()*5)},()=>{
  const from=pick(rng,concepts).iri,to=pick(rng,concepts).iri;
  return {from,to,predicate:pick(rng,names),location:`${from.slice(4)}-${to.slice(4)}`};
 });
 // 期望：一半来自观察可直接/间接推出，一半纯随机（大概率 missing）；重复三元组会被
 // validate 拒绝（Duplicate semantic relation），生成时去重保持合法形状
 const seen=new Set(),expected=[];
 for(let index=0;index<10&&expected.length<6;index++){
  const useObserved=rng()<0.5;
  const base=useObserved?pick(rng,observed):{from:pick(rng,concepts).iri,to:pick(rng,concepts).iri,predicate:pick(rng,names)};
  const key=`${base.from}\0${base.predicate}\0${base.to}`;
  if(seen.has(key))continue;
  seen.add(key);
  expected.push({from:base.from,to:base.to,predicate:base.predicate});
 }
 // 认可（F03 起含反向面）：目录在 from 概念上声明认可（同谓词或更强祖先属性）；
 // 并随机在 to 概念上补反向关系——同谓词反向（无 inverseOf）不构成认可，互逆/互逆祖先
 // 谓词反向才构成。反向噪声使 unsanctionedRelation 进入对照面而非恒空。
 const supers=supersClosure(properties),inverse=inverseMap(properties);
 const byIri=new Map(concepts.map(concept=>[concept.iri,concept]));
 // 目录 relationList 要求同概念上 predicate+to 唯一——生成端先查重再补声明
 const addRelation=(concept,predicate,to)=>{
  if((concept.relations??[]).some(r=>r.predicate===predicate&&r.to===to))return;
  concept.relations=[...(concept.relations??[]),{predicate,to}];
 };
 for(const triple of expected){
  addRelation(byIri.get(triple.from),pick(rng,[...supers[triple.predicate]]),triple.to);
  if(rng()<0.5){
   const inv=inverse[triple.predicate];
   const pool=inv?[...supers[inv]]:[...names];
   if(!pool.includes(triple.predicate)&&rng()<0.4)pool.push(triple.predicate);
   addRelation(byIri.get(triple.to),pick(rng,pool),triple.from);
  }
 }
 return {catalog:{id:'comb',version:'1',concepts,properties},observed,expected,seed};
};

const writeOwlProject=(dir,caze)=>{
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify(caze.catalog));
 fs.writeFileSync(path.join(dir,'runner.mjs'),`let raw='';for await(const chunk of process.stdin)raw+=chunk;const q=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'combinatorial observation',relations:${JSON.stringify(caze.observed)}}));`);
 const expectations=caze.expected.map((triple,index)=>({id:`E${index}`,from:triple.from,to:triple.to,predicate:triple.predicate}));
 const config={schemaVersion:'0.2',claims:[{id:'C',statement:'owl combinatorial'}],gates:[{id:'rel',kind:'semantic-relation',level:'L3',enabled:true,stages:['close'],claimId:'C',argv:['$NODE','runner.mjs'],timeoutMs:5000,relations:expectations}],risks:[],exceptions:[],ontology:{type:'local-catalog',file:'catalog.json'}};
 fs.writeFileSync(path.join(dir,'.quality-gate.json'),JSON.stringify(config));
 return expectations;
};

test('owl combinatorial: kernel satisfaction matches independent oracle across seeded cases (W6)',t=>{
 const seeds=[11,22,33,44,55,66,77,88,99,111,222,333,444,555,666,777,888,999,1234,4321,2026,1024];
 for(const seed of seeds){const t0=Date.now();
  const caze=owlCase(seed);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),`qgate-owl-comb-${seed}-`));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const expectations=writeOwlProject(root,caze);
  const oracle=owlOracle(caze.catalog.properties,caze.observed,caze.expected);
  const report=run(root);
  assert.equal(report.status==='FAIL'||report.status==='PASS',true,`seed ${seed}: unexpected status ${report.status}`);
  const evidence=report.evidence[0];
  assert.notEqual(evidence.status,'ERROR',`seed ${seed}: ${typeof evidence.details==='string'?evidence.details:JSON.stringify(evidence.details).slice(0,300)}`);
  const kernelMissing=new Set(evidence.details.findings.filter(f=>f.rule==='missingRelation').map(f=>`${f.from}|${f.predicate}|${f.to}`));
  const oracleMissing=new Set(oracle.filter(x=>!x.satisfied).map(x=>`${x.from}|${x.predicate}|${x.to}`));
  const kernelSatisfiedButOracleMissing=[...kernelMissing].filter(key=>!oracleMissing.has(key));
  const oracleMissingButKernel=[...oracleMissing].filter(key=>!kernelMissing.has(key));
  assert.deepEqual(kernelMissing,oracleMissing,`seed ${seed}: satisfaction mismatch — kernel-only missing ${kernelSatisfiedButOracleMissing}, oracle-only missing ${oracleMissingButKernel}; properties=${JSON.stringify(caze.catalog.properties)} observed=${JSON.stringify(caze.observed)} expected=${JSON.stringify(caze.expected)}`);
  // F03：目录认可对照（生成含同谓词/互逆反向噪声，unsanctioned 不再恒空）
  const sanction=sanctionOracle(caze.catalog,caze.expected);
  const kernelUnsanctioned=new Set(evidence.details.findings.filter(f=>f.rule==='unsanctionedRelation').map(f=>`${f.from}|${f.predicate}|${f.to}`));
  const oracleUnsanctioned=new Set(sanction.filter(x=>!x.sanctioned).map(x=>`${x.from}|${x.predicate}|${x.to}`));
  assert.deepEqual(kernelUnsanctioned,oracleUnsanctioned,`seed ${seed}: sanction mismatch — kernel-only ${[...kernelUnsanctioned].filter(k=>!oracleUnsanctioned.has(k))}, oracle-only ${[...oracleUnsanctioned].filter(k=>!kernelUnsanctioned.has(k))}; catalog=${JSON.stringify(caze.catalog.concepts)}`);
  // 覆盖面单向健全性：内核未报 undeclaredRelation 的观察边必须能被 oracle 满足路径正当化
  const undeclared=new Set(evidence.details.findings.filter(f=>f.rule==='undeclaredRelation').map(f=>`${f.from}|${f.predicate}|${f.to}`));
  const justified=justifyingEdges(caze.catalog.properties,caze.observed,caze.expected);
  caze.observed.forEach((rel,index)=>{
   if(undeclared.has(`${rel.from}|${rel.predicate}|${rel.to}`))return;
   assert.ok(justified.has(index),`seed ${seed}: covered edge #${index} ${rel.from} -${rel.predicate}-> ${rel.to} not justifiable by oracle satisfaction paths`);
  });
  // verdict 一致性：单门禁项目 findings 空 ⟺ PASS；finding 规则面封闭；内核 PASS 蕴含 oracle 无缺口
  for(const finding of evidence.details.findings)assert.ok(['missingRelation','unsanctionedRelation','undeclaredRelation'].includes(finding.rule),`seed ${seed}: unexpected finding rule ${finding.rule}`);
  assert.equal(evidence.details.findings.length===0,evidence.status==='PASS',`seed ${seed}: findings vs status contradiction`);
  assert.equal(report.status,evidence.status,`seed ${seed}: report status must follow the single gate`);
  if(report.status==='PASS'){
   assert.deepEqual([...oracleMissing],[],`seed ${seed}: kernel PASS but oracle finds unsatisfied expectations`);
   assert.deepEqual([...oracleUnsanctioned],[],`seed ${seed}: kernel PASS but oracle finds unsanctioned expectations`);
  }
 }
});

// ===== SHACL：组件矩阵的原生判定对照（直调内核，无 spawn） =====
const shaclOracle=(shapes,records,subClassOf)=>{
 const ancestors=iri=>{const out=new Set([iri]);let changed=true;while(changed){changed=false;for(const [child,parent] of subClassOf)if(out.has(child)&&!out.has(parent)){out.add(parent);changed=true;}}return out;};
 const typeOf=value=>value===null?'object':Array.isArray(value)?'object':typeof value==='object'?'object':typeof value==='string'?'string':typeof value;
 const violations=[];
 for(const record of records){
  const matched=shapes.filter(shape=>ancestors(record.typeIri).has(shape.targetClass));
  if(matched.length===0){violations.push(`${record.id}||typeIri|missingShape`);continue;}
  for(const shape of matched)for(const property of shape.properties){
   const raw=record.properties[property.path];
   const values=raw===undefined?[]:Array.isArray(raw)?raw:[raw];
   if(values.length<property.minCount)violations.push(`${record.id}|${shape.id}|${property.path}|minCount`);
   if(values.length>property.maxCount)violations.push(`${record.id}|${shape.id}|${property.path}|maxCount`);
   for(const item of values){
    const native=item!==null&&typeof item==='object'&&!Array.isArray(item)&&'value'in item&&'lang'in item?item.value:item;
    if(typeOf(native)!==property.valueType){violations.push(`${record.id}|${shape.id}|${property.path}|valueType`);continue;}
    if(property.allowedValues&&!property.allowedValues.some(candidate=>Object.is(candidate,native)))violations.push(`${record.id}|${shape.id}|${property.path}|allowedValues`);
    if(property.pattern!==undefined&&typeof native==='string'&&!new RegExp(property.pattern).test(native))violations.push(`${record.id}|${shape.id}|${property.path}|pattern`);
    if(property.minLength!==undefined&&typeof native==='string'&&[...native].length<property.minLength)violations.push(`${record.id}|${shape.id}|${property.path}|minLength`);
    if(property.maxLength!==undefined&&typeof native==='string'&&[...native].length>property.maxLength)violations.push(`${record.id}|${shape.id}|${property.path}|maxLength`);
    if(property.minInclusive!==undefined&&typeof native==='number'&&native<property.minInclusive)violations.push(`${record.id}|${shape.id}|${property.path}|minInclusive`);
    if(property.maxInclusive!==undefined&&typeof native==='number'&&native>property.maxInclusive)violations.push(`${record.id}|${shape.id}|${property.path}|maxInclusive`);
    if(property.languageIn!==undefined){
     const lang=typeof item==='object'&&item!==null&&!Array.isArray(item)&&'lang'in item?item.lang:null;
     if(lang===null||!property.languageIn.includes(lang))violations.push(`${record.id}|${shape.id}|${property.path}|languageIn`);
    }
   }
   if(shape.closed===true)for(const key of Object.keys(record.properties))if(!shape.properties.some(p=>p.path===key))violations.push(`${record.id}|${shape.id}|${key}|closed`);
  }
 }
 return new Set(violations);
};

test('shacl combinatorial: native component matrix matches independent oracle (W6)',t=>{
 const rng=mulberry32(20261006);
 const concepts=[{iri:'urn:Base',label:'Base'},{iri:'urn:Mid',label:'Mid',subClassOf:['urn:Base']},{iri:'urn:Leaf',label:'Leaf',subClassOf:['urn:Mid']},{iri:'urn:Side',label:'Side'}];
 const subClassOf=[['urn:Leaf','urn:Mid'],['urn:Mid','urn:Base']];
 const typeIris=concepts.map(c=>c.iri);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-shacl-comb-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify({id:'comb',version:'1',concepts}));
 const stringPool=['ab','abc','😀x','zz','', 'long-enough-value'];
 for(let iteration=0;iteration<120;iteration++){
  const valueTypes=['string','number','boolean'];
  const properties=['p0','p1'].map(name=>{
   const minCount=Math.floor(rng()*2),maxCount=minCount+Math.floor(rng()*2);
   const property={path:name,minCount,maxCount,valueType:pick(rng,valueTypes)};
   if(rng()<0.4)property.allowedValues=property.valueType==='string'?['ab','abc']:property.valueType==='number'?[1,5]:[true];
   if(property.valueType==='string'&&rng()<0.5)property.pattern=rng()<0.5?'^[a-z]+$':'z';
   if(property.valueType==='string'&&rng()<0.5)property.minLength=Math.floor(rng()*3);
   if(property.valueType==='string'&&rng()<0.5)property.maxLength=3+Math.floor(rng()*10);
   if(property.valueType==='number'&&rng()<0.6)property.minInclusive=Math.floor(rng()*5);
   if(property.valueType==='number'&&rng()<0.6)property.maxInclusive=5+Math.floor(rng()*10);
   if(rng()<0.3)property.languageIn=['en'];
   return property;
  });
  const shape={id:`S${iteration}`,targetClass:pick(rng,typeIris),properties,...(rng()<0.25?{closed:true}:{})};
  const record={id:`R${iteration}`,typeIri:pick(rng,typeIris),properties:{}};
  for(const property of properties){
   if(rng()<0.15)continue; // 缺失路径（minCount 面）
   const count=1+Math.floor(rng()*2);
   const values=[];
   for(let index=0;index<count;index++){
    let value;
    const wrong=rng()<0.25;
    if(property.valueType==='string')value=wrong?42:pick(rng,stringPool);
    else if(property.valueType==='number')value=wrong?'7':Math.floor(rng()*20);
    else value=wrong?'yes':rng()<0.5;
    if(typeof value==='string'&&rng()<0.3)values.push({value,lang:rng()<0.7?'en':'fr'});
    else values.push(value);
   }
   record.properties[property.path]=count===1&&rng()<0.7?values[0]:values;
  }
  if(shape.closed&&rng()<0.5)record.properties.extra='surprise';
  const profile={shapes:[shape]};
  const sample={records:[record]};
  fs.writeFileSync(path.join(root,'profile.json'),JSON.stringify(profile));
  fs.writeFileSync(path.join(root,'data.json'),JSON.stringify(sample));
  const gate={id:'prof',kind:'semantic-profile',level:'L2',file:'profile.json',dataFile:'data.json'};
  const config={schemaVersion:'0.2',claims:[],gates:[],risks:[],exceptions:[],ontology:{type:'local-catalog',file:'catalog.json'}};
  const result=runSemanticProfile(gate,config,root);
  const kernel=new Set(result.details.violations.map(v=>`${v.recordId}|${v.shapeId??''}|${v.path}|${v.rule}`));
  const oracle=shaclOracle([shape],[record],subClassOf);
  assert.deepEqual([...kernel].sort(),[...oracle].sort(),`iteration ${iteration}: shape=${JSON.stringify(shape)} record=${JSON.stringify(record)} kernelOnly=${[...kernel].filter(k=>!oracle.has(k))} oracleOnly=${[...oracle].filter(k=>!kernel.has(k))}`);
 }
});
