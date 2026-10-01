// 原始证据内核解析（B1，v1.11.0）：TAP 与 JUnit XML 的无第三方依赖解析器（纯 Node 标准库）。
// 目的：L1.3 unit 测试计数不再信任 runner 自报——runner 声明 rawOutput 后，内核解析原始
// 测试输出、自行重算 total/passed/failed/skipped 并与自报交叉核验（见 engineering.mjs）。
// 解析器为纯函数且 fail-closed：空文本、格式不识别、plan/属性与点数矛盾、工具自产摘要
// 与逐点计数不一致等结构性异常一律抛错，由调用方转为门禁 ERROR。
//
// TAP 语义（面向 node --test --test-reporter=tap 的真实输出，兼容无 YAML 块的外部 TAP）：
// - 测试点 `ok|not ok [N] - description`，任一缩进层级均为点；`# SKIP`/`# TODO` 指令计 skipped；
// - node 的 suite 点（describe 块）后随 YAML 块标注 type: 'suite'——容器点不计入测试数；
// - plan `1..N` 按缩进层级各自与该层点数互核；顶层摘要注释（# tests/pass/fail/skipped/todo/suites）
//   存在时与逐点计数互核，不一致即拒收；
// - `Bail out!` 或零测试点即拒收。
//
// JUnit XML 语义（面向 pytest --junitxml / surefire / gradle 的标准形状）：
// - `<testsuite>` 属性 tests/failures/errors/skipped 求和后与逐 testcase 计数互核；
// - testcase 状态由子元素判定：<failure> 或 <error> → failed，<skipped> → skipped，其余 → passed；
// - 案例名取 classname.name（无 classname 则 name）。
// 边界（如实声明）：非流式正则解析——CDATA/system-out 内含字面 "</testcase>" 或伪造标签的
// 属性互核会把绝大多数不一致拦下（fail-closed），不做完整 XML 校验。
import {normalizeBaselineSource} from './baseline.mjs';

export const RAW_OUTPUT_FORMATS=['tap','junit'];

const directiveOf=description=>{
 const match=/^(.*?)\s#\s*(SKIP|TODO)\b/i.exec(description);
 if(!match)return {name:description.trim(),directive:null};
 return {name:(match[1]||'').trim(),directive:match[2].toUpperCase()};
};

export function parseTAP(text){
 if(typeof text!=='string'||text.trim().length===0)throw new Error('rawOutput TAP text is empty');
 const lines=text.split(/\r?\n/);
 const pointRe=/^(\s*)(not )?ok\b(?:\s+\d+)?(?:\s+-)?\s*(.*)$/;
 const yamlTypeRe=/type:\s*['"]suite['"]/;
 let bailed=false;
 const points=[]; // {indent,status,isSuite,name}
 const plans=new Map(); // indent -> N
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(/^Bail out!/i.test(line.trim())){bailed=true;continue;}
  if(/^TAP version/.test(line.trim()))continue;
  const planMatch=/^(\s*)1\.\.(\d+)\s*$/.exec(line);
  if(planMatch){plans.set(planMatch[1].length,Number(planMatch[2]));continue;}
  const match=pointRe.exec(line);
  if(!match)continue;
  const indent=match[1].length;
  const description=match[3]??'';
  const {name,directive}=directiveOf(description);
  // 紧随其后的 YAML 块（缩进更深，--- 到 ...）若标注 type: 'suite' 则为容器点
  let isSuite=false;
  let cursor=index+1;
  if(cursor<lines.length&&/^\s+---\s*$/.test(lines[cursor])){
   while(cursor<lines.length&&!/^\s+\.\.\.\s*$/.test(lines[cursor])){
    if(yamlTypeRe.test(lines[cursor]))isSuite=true;
    cursor++;
   }
   index=cursor;
  }
  const status=directive?'skipped':match[2]?'failed':'passed';
  points.push({indent,status,isSuite,name});
 }
 if(bailed)throw new Error('rawOutput TAP declares Bail out!');
 const tests=points.filter(point=>!point.isSuite);
 if(tests.length===0)throw new Error('rawOutput TAP has no test points');
 for(const [indent,planned] of plans){
  const atLevel=points.filter(point=>point.indent===indent).length;
  if(atLevel!==planned)throw new Error(`rawOutput TAP plan 1..${planned} at indent ${indent} does not match ${atLevel} test points`);
 }
 const counts={total:tests.length,passed:0,failed:0,skipped:0};
 for(const point of tests)counts[point.status]++;
 const summary=(key)=>{
  const match=new RegExp(`^# ${key} (\\d+)$`,'m').exec(text);
  return match===null?null:Number(match[1]);
 };
 const declaredSkipped=summary('skipped');
 const declaredTodo=summary('todo');
 const expectedSkipped=[declaredSkipped,declaredTodo].filter(value=>value!==null);
 const checks=[['tests',counts.total],['pass',counts.passed],['fail',counts.failed]];
 if(expectedSkipped.length)checks.push(['skipped(+todo)',counts.skipped]);
 for(const [key,actual] of checks){
  const declared=summary(key==='skipped(+todo)'?'skipped':key);
  if(key==='skipped(+todo)'){
   if(declaredSkipped!==null&&declaredSkipped!==counts.skipped)throw new Error(`rawOutput TAP summary "# skipped ${declaredSkipped}" disagrees with parsed ${counts.skipped}`);
   if(declaredTodo!==null&&declaredSkipped===null&&declaredTodo!==counts.skipped)throw new Error(`rawOutput TAP summary "# todo ${declaredTodo}" disagrees with parsed skipped ${counts.skipped}`);
   continue;
  }
  if(declared!==null&&declared!==actual)throw new Error(`rawOutput TAP summary "# ${key} ${declared}" disagrees with parsed ${actual}`);
 }
 return {...counts,parser:'tap',cases:tests.map(point=>({name:point.name||`(test point)`,status:point.status}))};
}

const attributesOf=tag=>{
 const map={};
 const re=/([A-Za-z_][-\w.]*)\s*=\s*"([^"]*)"/g;
 let match;
 while((match=re.exec(tag)))map[match[1]]=match[2];
 return map;
};

export function parseJUnit(text){
 if(typeof text!=='string'||text.trim().length===0)throw new Error('rawOutput JUnit XML is empty');
 const suiteTags=text.match(/<testsuite\b[^>]*>/g)??[];
 if(suiteTags.length===0)throw new Error('rawOutput JUnit XML has no <testsuite>');
 const declared={tests:0,failures:0,errors:0,skipped:0};
 for(const tag of suiteTags){
  const attrs=attributesOf(tag);
  const tests=Number(attrs.tests);
  if(!Number.isInteger(tests)||tests<0)throw new Error('rawOutput JUnit XML <testsuite> lacks a valid tests attribute');
  declared.tests+=tests;
  declared.failures+=Number(attrs.failures??0);
  declared.errors+=Number(attrs.errors??0);
  declared.skipped+=Number(attrs.skipped??0);
 }
 const caseBlocks=text.match(/<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase>/g)??[];
 const cases=[];
 for(const block of caseBlocks){
  const openTag=/<testcase\b[^>]*>/.exec(block)[0];
  const attrs=attributesOf(openTag);
  const rawName=attrs.name??'(testcase)';
  const name=attrs.classname?`${attrs.classname}.${rawName}`:rawName;
  let status='passed';
  if(/<failure\b/.test(block)||/<error\b/.test(block))status='failed';
  else if(/<skipped\b/.test(block))status='skipped';
  cases.push({name,status});
 }
 if(cases.length===0)throw new Error('rawOutput JUnit XML has no <testcase>');
 const counts={total:cases.length,passed:0,failed:0,skipped:0};
 for(const item of cases)counts[item.status]++;
 const declaredFailed=declared.failures+declared.errors;
 if(declared.tests!==counts.total)throw new Error(`rawOutput JUnit XML declares tests=${declared.tests} but has ${counts.total} testcases`);
 if(declaredFailed!==counts.failed)throw new Error(`rawOutput JUnit XML declares failures+errors=${declaredFailed} but ${counts.failed} testcases failed`);
 if(declared.skipped!==counts.skipped)throw new Error(`rawOutput JUnit XML declares skipped=${declared.skipped} but ${counts.skipped} testcases skipped`);
 return {...counts,parser:'junit',cases};
}

export function parseRawOutput(format,text){
 if(format==='tap')return parseTAP(text);
 if(format==='junit')return parseJUnit(text);
 throw new Error(`Unknown rawOutput format: ${format}`);
}

// 原始用例观察记录解析（v1.13 T1）：behavior/journey 的 raw-transcript 等价物（B1 的 L3 延伸）。
// 与 TAP/JUnit 不同，transcript 无业界标准格式可借——这是本框架自己的协议形状
// （{schemaVersion:'0.1', kind, runId, ...观察原样}），边界如实：解析器只保证结构与
// 自洽（fail-closed 拒收畸形），不宣称对齐任何第三方标准。runId 绑定由调用方核验
// （观察记录必须是当次运行的——内核每运行生成新 UUID 经 stdin 交付，重放旧观察记录即失配）。
// 基线声明块（v1.15 T1）：behavior 观察记录顶层可选 baseline——观察记录所载基线来源（git 型可含
// 内容绑定 file+contentSha256），形状与观察 baselineSource 同规（normalizeBaselineSource）；
// 与观察的两源一致核验在 behavior 门禁侧进行（lib/behavior.mjs），内容核验在 lib/baseline.mjs。
export const TRANSCRIPT_FORMAT='qgate-transcript';

const transcriptText=value=>typeof value==='string'&&value.trim().length>0;

export function parseTranscript(text,{kind}={}){
 if(typeof text!=='string'||text.trim().length===0)throw new Error('rawTranscript text is empty');
 let document;
 try{document=JSON.parse(text);}catch{throw new Error('rawTranscript is not valid JSON');}
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 if(!object(document))throw new Error('rawTranscript must be a JSON object');
 if(document.schemaVersion!=='0.1')throw new Error('rawTranscript schemaVersion must be 0.1');
 if(kind!==undefined&&document.kind!==kind)throw new Error(`rawTranscript kind must be ${kind} but says ${String(document.kind)}`);
 if(!transcriptText(document.runId))throw new Error('rawTranscript lacks a runId');
 // 文档顶层键白名单（v1.15 收紧）：behavior 另可承载 baseline 块（与观察 baselineSource
 // 同形，经 normalizeBaselineSource 校验）；journey 无基线语义，不承载 baseline。
 const unexpectedKeys=(allowed)=>{const unknown=Object.keys(document).filter(key=>!allowed.includes(key));if(unknown.length)throw new Error(`rawTranscript ${document.kind} has unexpected top-level keys: ${unknown.join(', ')}`);};
 if(document.kind==='behavior'){
  unexpectedKeys(['schemaVersion','kind','runId','cases','baseline']);
  if(!Array.isArray(document.cases)||document.cases.length===0)throw new Error('rawTranscript behavior cases must be a non-empty array');
  const seen=new Set();
  const cases=document.cases.map(item=>{
   if(!object(item)||!transcriptText(item.id)||!Object.hasOwn(item,'actual'))throw new Error('rawTranscript behavior case must have id and actual');
   const keys=Object.keys(item).filter(key=>key!=='id'&&key!=='actual'&&key!=='baselineActual');
   if(keys.length)throw new Error(`rawTranscript behavior case ${item.id} has unexpected keys: ${keys.join(', ')}`);
   if(seen.has(item.id))throw new Error(`rawTranscript behavior case id ${item.id} is duplicated`);
   seen.add(item.id);
   return {id:item.id,actual:item.actual,...(Object.hasOwn(item,'baselineActual')?{baselineActual:item.baselineActual}:{})};
  });
  // 基线声明块（v1.15 T1）：观察记录所载基线来源（git 型可含内容绑定 file+contentSha256），
  // 形状与观察 baselineSource 同规（normalizeBaselineSource）；与观察的两源一致核验在
  // behavior 门禁侧进行（lib/behavior.mjs），内容核验在 lib/baseline.mjs。
  let baseline;
  if(document.baseline!==undefined&&document.baseline!==null){
   try{baseline=normalizeBaselineSource(document.baseline);}catch(error){throw new Error(`rawTranscript baseline is invalid: ${error.message}`);}
  }
  return {kind:'behavior',runId:document.runId,cases,...(baseline?{baseline}:{})};
 }
 if(document.kind==='journey'){
  unexpectedKeys(['schemaVersion','kind','runId','source','scenarios']);
  if(!transcriptText(document.source))throw new Error('rawTranscript journey source is required');
  if(!Array.isArray(document.scenarios)||document.scenarios.length===0)throw new Error('rawTranscript journey scenarios must be a non-empty array');
  const seenScenario=new Set();
  const scenarios=document.scenarios.map(scenario=>{
   if(!object(scenario)||!transcriptText(scenario.id))throw new Error('rawTranscript journey scenario must have an id');
   const keys=Object.keys(scenario).filter(key=>key!=='id'&&key!=='steps');
   if(keys.length)throw new Error(`rawTranscript journey scenario ${scenario.id} has unexpected keys: ${keys.join(', ')}`);
   if(seenScenario.has(scenario.id))throw new Error(`rawTranscript journey scenario id ${scenario.id} is duplicated`);
   seenScenario.add(scenario.id);
   if(!Array.isArray(scenario.steps)||scenario.steps.length===0)throw new Error(`rawTranscript journey scenario ${scenario.id} has no steps`);
   const seenStep=new Set();
   const steps=scenario.steps.map(step=>{
    if(!object(step)||!transcriptText(step.id)||!Object.hasOwn(step,'actual'))throw new Error(`rawTranscript journey step must have id and actual (scenario ${scenario.id})`);
    const stepKeys=Object.keys(step).filter(key=>key!=='id'&&key!=='actual');
    if(stepKeys.length)throw new Error(`rawTranscript journey step ${step.id} has unexpected keys: ${stepKeys.join(', ')}`);
    if(seenStep.has(step.id))throw new Error(`rawTranscript journey step id ${step.id} is duplicated in scenario ${scenario.id}`);
    seenStep.add(step.id);
    return {id:step.id,actual:step.actual};
   });
   return {id:scenario.id,steps};
  });
  return {kind:'journey',runId:document.runId,source:document.source,scenarios};
 }
 throw new Error(`rawTranscript kind must be behavior or journey but says ${String(document.kind)}`);
}
