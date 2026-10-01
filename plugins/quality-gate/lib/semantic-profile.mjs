import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';
import {createProvider} from './ontology.mjs';

const text=v=>typeof v==='string'&&v.trim().length>0;
const valid=(condition,message)=>{if(!condition)throw new Error(message);};
const typeOf=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const LANG=/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
// 与 W3C SHACL Core 的组件注册表：profile 字段 ↔ 标准约束组件（观察核验时组件名须在此表内）。
// v1.22.1 起十组组件全部内核零依赖原生判定（OD-116=默认零外部依赖）；pyshacl 引擎为可选
// 第二实现（OD-114=B 保留）：配置 shacl 即接入，并集判定，观察核验与自报矛盾 fail-closed。
export const SHACL_COMPONENTS={
 datatype:'sh:DatatypeConstraintComponent',
 nodeKind:'sh:NodeKindConstraintComponent',
 minCount:'sh:MinCountConstraintComponent',
 maxCount:'sh:MaxCountConstraintComponent',
 allowedValues:'sh:InConstraintComponent',
 pattern:'sh:PatternConstraintComponent',
 minLength:'sh:MinLengthConstraintComponent',
 maxLength:'sh:MaxLengthConstraintComponent',
 minInclusive:'sh:MinInclusiveConstraintComponent',
 maxInclusive:'sh:MaxInclusiveConstraintComponent',
 languageIn:'sh:LanguageInConstraintComponent',
 closed:'sh:ClosedConstraintComponent'
};
// 组件全集内核原生判定（v1.22.1 起，OD-116=默认零外部依赖）：minCount/maxCount/valueType/
// allowedValues/pattern/长度/数值范围/languageIn/closed 十组全部确定性 JSON 判定，默认插件
// 不依赖任何外部安装。pyshacl 引擎为"环境就绪时的可选集成"（OD-114=B 保留为第二实现）：
// 配置 shacl 即接入——并集判定（任一侧发现违规即 FAIL），观察核验与自报矛盾 fail-closed 不变。

const SHACL_DATATYPES={
 string:'sh:datatype=xsd:string',
 number:'sh:datatype=xsd:decimal',
 boolean:'sh:datatype=xsd:boolean',
 object:'sh:nodeKind=sh:BlankNodeOrIRI (approximate)'
};

export function runSemanticProfile(g,config,root){
 const profile=JSON.parse(fs.readFileSync(projectFile(root,g.file),'utf8').replace(/^\uFEFF/,''));
 const sample=JSON.parse(fs.readFileSync(projectFile(root,g.dataFile),'utf8').replace(/^\uFEFF/,''));
 valid(Array.isArray(profile.shapes)&&profile.shapes.length>0&&profile.shapes.length<=50,'Expected 1..50 shapes');
 valid(Array.isArray(sample.records)&&sample.records.length>0&&sample.records.length<=100,'Expected 1..100 records');
 valid(profile.shapes.every(s=>text(s.id)&&text(s.targetClass)&&Array.isArray(s.properties)&&s.properties.length>0&&s.properties.length<=50&&(s.closed===undefined||typeof s.closed==='boolean')),'Invalid shape');
 valid(new Set(profile.shapes.map(s=>s.id)).size===profile.shapes.length&&new Set(profile.shapes.map(s=>s.targetClass)).size===profile.shapes.length,'Duplicate shape');
 for(const s of profile.shapes){
  valid(s.properties.every(p=>text(p.path)&&Number.isInteger(p.minCount)&&p.minCount>=0&&Number.isInteger(p.maxCount)&&p.maxCount>=p.minCount&&p.maxCount<=100&&['string','number','boolean','object'].includes(p.valueType)&&(!('allowedValues'in p)||Array.isArray(p.allowedValues))&&(!('pattern'in p)||(text(p.pattern)&&isValidPattern(p.pattern)))&&(p.minLength===undefined||(Number.isInteger(p.minLength)&&p.minLength>=0&&p.minLength<=1000))&&(p.maxLength===undefined||(Number.isInteger(p.maxLength)&&p.maxLength>=0&&p.maxLength<=1000))&&(p.minLength===undefined||p.maxLength===undefined||p.minLength<=p.maxLength)&&(p.minInclusive===undefined||Number.isFinite(p.minInclusive))&&(p.maxInclusive===undefined||Number.isFinite(p.maxInclusive))&&(p.minInclusive===undefined||p.maxInclusive===undefined||p.minInclusive<=p.maxInclusive)&&(!('languageIn'in p)||(Array.isArray(p.languageIn)&&p.languageIn.length>0&&p.languageIn.every(l=>text(l)&&LANG.test(l))&&new Set(p.languageIn).size===p.languageIn.length))),`Invalid properties for ${s.id}`);
  valid(new Set(s.properties.map(p=>p.path)).size===s.properties.length,`Duplicate property for ${s.id}`);
 }
 valid(sample.records.every(r=>text(r.id)&&text(r.typeIri)&&r.properties&&typeof r.properties==='object'&&!Array.isArray(r.properties)),'Invalid profile record');
 valid(new Set(sample.records.map(r=>r.id)).size===sample.records.length,'Duplicate profile record');
 const provider=createProvider(config.ontology,root);
 valid(provider.describe().status!=='NOT_IMPLEMENTED','Ontology provider is not implemented');
 for(const s of profile.shapes)valid(provider.resolve(s.targetClass).status==='FOUND',`Unknown shape targetClass: ${s.targetClass}`);
 // sh:targetClass 深度匹配（v1.22）：记录类型是目标类或其后代即套用该 shape（旧精确匹配为缺陷面，
 // 真 SHACL 语义即 rdfs:subClassOf* 深度匹配）；一个记录可同时命中多个 shape，全部核验。
 const shapesOf=typeIri=>profile.shapes.filter(s=>provider.subsumptionPath(typeIri,s.targetClass));
 const violations=[];
 const deepMatches=[];
 for(const record of sample.records){
  if(provider.resolve(record.typeIri).status!=='FOUND'){violations.push({recordId:record.id,path:'typeIri',rule:'unknownConcept',actual:record.typeIri});continue;}
  const matched=shapesOf(record.typeIri);
  if(matched.length===0){violations.push({recordId:record.id,path:'typeIri',rule:'missingShape',actual:record.typeIri});continue;}
  for(const shape of matched){
   const subsumption=provider.subsumptionPath(record.typeIri,shape.targetClass);
   if(record.typeIri!==shape.targetClass)deepMatches.push({recordId:record.id,shapeId:shape.id,via:subsumption.join(' ⊑ ')});
   for(const property of shape.properties){
    const present=Object.hasOwn(record.properties,property.path);
    const value=record.properties[property.path];
    const values=!present?[]:Array.isArray(value)?value:[value];
    if(values.length<property.minCount)violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'minCount',expected:property.minCount,actual:values.length,shacl:SHACL_COMPONENTS.minCount});
    if(values.length>property.maxCount)violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'maxCount',expected:property.maxCount,actual:values.length,shacl:SHACL_COMPONENTS.maxCount});
    for(const item of values){
     // 语言标签值 {value,lang} 按其字符串载荷参与原生判定（v1.22 多语言——标签见 languageIn 组件）
     const native=item!==null&&typeof item==='object'&&!Array.isArray(item)&&Object.hasOwn(item,'value')&&Object.hasOwn(item,'lang')?item.value:item;
     if(typeOf(native)!==property.valueType){violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'valueType',expected:property.valueType,actual:typeOf(native),shacl:SHACL_DATATYPES[property.valueType]});continue;}
     if(property.allowedValues&&!property.allowedValues.some(v=>Object.is(v,native)))violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'allowedValues',actual:native,shacl:SHACL_COMPONENTS.allowedValues});
     if(property.pattern!==undefined&&typeof native==='string'&&!new RegExp(property.pattern).test(native))violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'pattern',expected:property.pattern,actual:native,shacl:SHACL_COMPONENTS.pattern});
     if(property.minLength!==undefined&&typeof native==='string'&&[...native].length<property.minLength)violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'minLength',expected:property.minLength,actual:[...native].length,shacl:SHACL_COMPONENTS.minLength});
     if(property.maxLength!==undefined&&typeof native==='string'&&[...native].length>property.maxLength)violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'maxLength',expected:property.maxLength,actual:[...native].length,shacl:SHACL_COMPONENTS.maxLength});
     if(property.minInclusive!==undefined&&typeof native==='number'&&native<property.minInclusive)violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'minInclusive',expected:property.minInclusive,actual:native,shacl:SHACL_COMPONENTS.minInclusive});
     if(property.maxInclusive!==undefined&&typeof native==='number'&&native>property.maxInclusive)violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'maxInclusive',expected:property.maxInclusive,actual:native,shacl:SHACL_COMPONENTS.maxInclusive});
     if(property.languageIn!==undefined){
      const lang=typeof item==='object'&&item!==null&&!Array.isArray(item)&&Object.hasOwn(item,'lang')?item.lang:null;
      if(lang===null||!property.languageIn.includes(lang))violations.push({recordId:record.id,shapeId:shape.id,path:property.path,rule:'languageIn',expected:property.languageIn,actual:lang??'(untagged)',shacl:SHACL_COMPONENTS.languageIn});
     }
    }
   }
   // closed（v1.22.1 原生）：记录属性超出形状声明集即违规（逐多余路径指名）
   if(shape.closed===true)for(const key of Object.keys(record.properties))if(!shape.properties.some(p=>p.path===key))violations.push({recordId:record.id,shapeId:shape.id,path:key,rule:'closed',actual:key,shacl:SHACL_COMPONENTS.closed});
  }
 }
 // 外接 SHACL 引擎核验（v1.22，OD-114=B）：统一观察协议——内核经 stdin 交付形状/记录/子类边，
 // 引擎回报结构化 findings；内核核验形状（runId/来源/未知记录或未知组件即 ERROR fail-closed）
 // 并判定（findings 非空即 FAIL；conformance 与 findings 矛盾即 ERROR——不采信自报放行）。
 let shacl;
 if(g.shacl!==undefined){
  const runId=randomUUID(),argv=g.shacl.argv.map(x=>x==='$NODE'?process.execPath:x);
  const request={schemaVersion:'0.1',runId,shapes:profile.shapes,records:sample.records,subClassOf:subClassEdges(provider)};
  const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify(request)+'\n',timeout:g.shacl.timeoutMs,maxBuffer:65536,windowsHide:true});
  const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
  if(result.error||result.signal||result.status!==0){
   valid(false,`SHACL engine failed (exit ${result.status}${result.signal?`, signal ${result.signal}`:''})${result.stderr?`: ${result.stderr.split('\n').filter(Boolean).slice(-3).join(' | ')}`:''}`);
  }
  const observed=JSON.parse(result.stdout);
  valid(observed!==null&&typeof observed==='object'&&!Array.isArray(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.findings)&&typeof observed.conformance==='boolean','Invalid or stale SHACL engine observation');
  const recordIds=new Set(sample.records.map(r=>r.id));
  const shapeIds=new Set(profile.shapes.map(s=>s.id));
  const knownComponents=new Set(Object.values(SHACL_COMPONENTS));
  // 引擎回报的组件名归一化：完整 IRI（http://www.w3.org/ns/shacl#Xxx）↔ sh: 前缀短名等价
  const normalizeComponent=component=>component.startsWith('http://www.w3.org/ns/shacl#')?'sh:'+component.slice('http://www.w3.org/ns/shacl#'.length):component;
  for(const finding of observed.findings){
   valid(finding!==null&&typeof finding==='object'&&text(finding.recordId)&&text(finding.component)&&recordIds.has(finding.recordId),`SHACL engine finding references unknown record: ${JSON.stringify(finding)}`);
   valid(knownComponents.has(normalizeComponent(finding.component)),`SHACL engine finding references unknown component: ${finding.component}`);
   if(finding.shapeId!==undefined&&finding.shapeId!==null)valid(shapeIds.has(finding.shapeId),`SHACL engine finding references unknown shape: ${finding.shapeId}`);
  }
  valid(!(observed.conformance&&observed.findings.length>0)&&!(!observed.conformance&&observed.findings.length===0),'SHACL engine conformance disagrees with its own findings (self-report inconsistency)');
  violations.push(...observed.findings.map(f=>({recordId:f.recordId,...(f.shapeId?{shapeId:f.shapeId}:{}),path:f.path??'(node)',rule:normalizeComponent(f.component),message:f.message,...(f.value!==undefined?{value:f.value}:{})})));
  shacl={source:observed.source,conformance:observed.conformance,findingCount:observed.findings.length};
 }
 return {status:violations.length?'FAIL':'PASS',details:{provider:provider.describe(),shapeCount:profile.shapes.length,recordCount:sample.records.length,violations,...(deepMatches.length?{deepMatches}:{}),...(shacl?{shacl}:{})}};
}

function isValidPattern(pattern){
 try{new RegExp(pattern);return true;}catch{return false;}
}
function subClassEdges(provider){
 const concepts=provider.concepts();
 return concepts.filter(c=>Array.isArray(c.subClassOf)&&c.subClassOf.length>0).map(c=>({iri:c.iri,parents:c.subClassOf}));
}
