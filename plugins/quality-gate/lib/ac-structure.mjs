// AC 结构化协议（v1.18 轨道 A 收官，OD-102 裁决 Gherkin 首选+EARS 双支持[用户 2026-10-01 覆盖推荐]）：
// 只做结构形状校验（骨架齐备性），不判语义——"这条 AC 是否表达了用户真实意图"由确认留痕背书。
// 映射约定（用户裁决=@type 标签权威）：Gherkin 场景标签（五枚类型词）→ AC 类型（多场景取并集，
// 显式 type 须属于并集）；EARS 无标签机制，类型=五模板映射集（v0.9 §41.3 联动建议的结构化落地）。
const AC_TYPES=['normal','boundary','negative','exception','state-transition'];

const GHERKIN_SCENARIO=/^\s*(?:场景大纲|场景|Scenario Outline|Scenario)\s*:\s*(.*)$/;
const GHERKIN_STEP=/^\s*(假如|当|那么|而且|但是|Given|When|Then|And|But)\s+(.*)$/;
const STEP_KINDS={假如:'given',Given:'given',当:'when',When:'when',那么:'then',Then:'then',而且:'and',And:'and',但是:'but',But:'but'};
const GHERKIN_TAG=/^@\S+$/;
const EXAMPLE_ROW=/^\s*\|/;

// Gherkin 结构校验：允许多场景（用户裁决，2026-10-01）——每场景独立骨架校验
// （经 And/But 关键字继承后至少一个 when 与一个 then）；标签行与 Examples 表行结构放行。
export function validateGherkin(raw){
 const lines=String(raw).split(/\r?\n/);
 const violations=[];
 const scenarios=[];
 let tags=[];
 let current=null;
 let lastKind=null;
 let exampleRows=0;
 const pushCurrent=()=>{
  if(current){
   const kinds=new Set(current.steps.map(step=>step.kind));
   if(!kinds.has('when'))violations.push({rule:'missing-when',scenario:current.name});
   if(!kinds.has('then'))violations.push({rule:'missing-then',scenario:current.name});
   if(current.steps.length===0)violations.push({rule:'empty-scenario',scenario:current.name});
   scenarios.push(current);
  }
 };
 for(const line of lines){
  const trimmed=line.trim();
  if(trimmed==='')continue;
  if(/^(@\S+\s*)+$/.test(trimmed)){tags=tags.concat(trimmed.split(/\s+/).filter(Boolean));continue;}
  if(/^\s*(?:功能|Feature)\s*:/.test(trimmed))continue; // 可选 Feature 行（结构放行，不参与判定）
  const scenarioMatch=GHERKIN_SCENARIO.exec(line);
  if(scenarioMatch){pushCurrent();current={name:scenarioMatch[1].trim()||`(anonymous #${scenarios.length+1})`,tags:[...tags],steps:[]};tags=[];lastKind=null;continue;}
  if(EXAMPLE_ROW.test(line)){exampleRows+=1;continue;}
  if(/^\s*(?:示例|Examples)\s*:/.test(trimmed))continue;
  const stepMatch=GHERKIN_STEP.exec(line);
  if(stepMatch){
   const kind=STEP_KINDS[stepMatch[1]];
   const text=stepMatch[2].trim();
   if(!text){violations.push({rule:'empty-step',scenario:current?.name??'(before scenario)'});continue;}
   if(!current){violations.push({rule:'steps-outside-scenario',step:stepMatch[2].slice(0,40)});continue;}
   // And/But 继承上一关键字的行为类型（Gherkin 语义）；场景首步即 And/But 视为结构违规
   const effective=kind==='and'||kind==='but'?lastKind:kind;
   if((kind==='and'||kind==='but')&&!lastKind)violations.push({rule:'leading-and-but',scenario:current.name});
   current.steps.push({kind:effective??kind,text});
   lastKind=effective??kind;
   continue;
  }
  violations.push({rule:'unrecognized-line',line:trimmed.slice(0,40)});
 }
 pushCurrent();
 if(scenarios.length===0)violations.push({rule:'no-scenario'});
 const typeTags=[...new Set(scenarios.flatMap(s=>s.tags).map(tag=>tag.slice(1)))].filter(tag=>AC_TYPES.includes(tag));
 const unknownTypeTags=[...new Set(scenarios.flatMap(s=>s.tags).map(tag=>tag.slice(1)))].filter(tag=>!AC_TYPES.includes(tag));
 return {scenarios,violations,exampleRows,typeTags,unknownTypeTags,types:typeTags};
}

// EARS 结构校验（五模板，中英词表——中文词表按 v0.9 §41.3 草案随本轮定稿）：
// 允许多语句（与多场景裁决同精神）；每条非空语句须恰好匹配一模板。
// 模板→AC 类型映射集：无处不在/事件驱动→normal；状态驱动→state-transition；
// 不需要行为→negative|exception（显式 type 二选一）；可选特征→normal。
const EARS_TEMPLATES=[
 {name:'ubiquitous',types:['normal'],en:/^the\s+\S.+\s+shall\s+\S.*$/i,zh:/^(?!当|在|如果|其中)\S{1,80}应当\S.*$/},
 {name:'event-driven',types:['normal'],en:/^when\s+.+,\s*the\s+.+\s+shall\s+.+$/i,zh:/^当.{1,80}时[，,]\S.{0,80}应当\S.*$/},
 {name:'state-driven',types:['state-transition'],en:/^while\s+.+,\s*the\s+.+\s+shall\s+.+$/i,zh:/^在.{1,80}期间[，,]\S.{0,80}应当\S.*$/},
 {name:'unwanted-behavior',types:['negative','exception'],en:/^if\s+.+,\s*then\s+the\s+.+\s+shall\s+.+$/i,zh:/^如果.{1,80}[，,]则\S.{0,80}应当\S.*$/},
 {name:'optional-feature',types:['normal'],en:/^where\s+.+,\s*the\s+.+\s+shall\s+.+$/i,zh:/^其中.{1,80}[，,]\S.{0,80}应当\S.*$/}
];

export function validateEars(raw){
 const violations=[];
 const statements=[];
 for(const line of String(raw).split(/\r?\n/)){
  const trimmed=line.trim();
  if(trimmed==='')continue;
  const template=EARS_TEMPLATES.find(item=>item.en.test(trimmed)||item.zh.test(trimmed));
  if(!template){violations.push({rule:'unmatched-statement',line:trimmed.slice(0,40)});continue;}
  statements.push({template:template.name,types:template.types});
 }
 // 空文本才报 no-statement；逐行 unmatched 已指名问题行，不叠加冗余违规
 if(String(raw).trim()==='')violations.push({rule:'no-statement'});
 const types=[...new Set(statements.flatMap(item=>item.types))];
 return {statements,violations,types};
}

// 统一入口：一条 AC 的结构判定与类型派生（format 缺省=自由文本，不校验不派生——旧语义不变）。
// 文本字段名兼容两处登记（task-intent acceptance[].text 与 traceability acceptanceCriteria[].statement）
export function evaluateAc(entry){
 const body=entry.text??entry.statement;
 if(entry.format===undefined)return {format:null,violations:[],types:entry.type!==undefined?[entry.type]:[]};
 if(entry.format==='gherkin'){
  const result=validateGherkin(body);
  const violations=[...result.violations.map(item=>({...item,rule:`gherkin:${item.rule}`})),...result.unknownTypeTags.map(tag=>({rule:'unknown-type-tag',tag}))];
  return {format:'gherkin',violations,types:result.types,scenarios:result.scenarios.length,exampleRows:result.exampleRows};
 }
 if(entry.format==='ears'){
  const result=validateEars(body);
  return {format:'ears',violations:result.violations.map(item=>({...item,rule:`ears:${item.rule}`})),types:result.types,statements:result.statements.length};
 }
 return {format:entry.format,violations:[{rule:'unknown-format',format:entry.format}],types:[]};
}

// 显式 type 与派生类型集的一致性（ac-type-conflict）：显式声明不在派生集内即冲突——
// 人写错类型立即暴露，而不是让 requiredTypes 覆盖检查悄悄错位
export function acTypeConflict(entry,evaluation){
 if(entry.type===undefined||evaluation.types.length===0)return false;
 return !evaluation.types.includes(entry.type);
}
