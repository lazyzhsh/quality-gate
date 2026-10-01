import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';
import {BASELINE_MODES,evaluateBaselineSource} from './baseline.mjs';
import {RAW_OUTPUT_FORMATS,parseRawOutput} from './raw-evidence.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const roles={static:'exit',build:'artifact',unit:'test',mutation:'metric',structure:'findings',convention:'findings'};
const caseStatuses=['pass','fail','skip'];

export function validateEngineering(g){
 check(g.level==='L1','engineering requires L1');
 check(Array.isArray(g.checks)&&g.checks.length>0&&g.checks.length<=6,'Expected 1..6 engineering checks');
 check(g.checks.every(c=>text(c.id)&&roles[c.id]===c.type&&Array.isArray(c.argv)&&c.argv.length>0&&c.argv.every(text)&&Number.isInteger(c.timeoutMs)&&c.timeoutMs>0&&c.timeoutMs<=20000),'Invalid engineering check');
 check(new Set(g.checks.map(c=>c.id)).size===g.checks.length,'Duplicate engineering check');
 check(Array.isArray(g.requiredChecks)&&g.requiredChecks.length>0&&g.requiredChecks.every(id=>roles[id]&&g.checks.some(c=>c.id===id))&&new Set(g.requiredChecks).size===g.requiredChecks.length,'Invalid required engineering checks');
 // 全覆盖或显式排除（W2）：每个 check 必须出现在 requiredChecks 或 excludedChecks（须带理由）之一
 check(g.excludedChecks===undefined||(Array.isArray(g.excludedChecks)&&g.excludedChecks.length>0&&g.excludedChecks.every(item=>text(item.id)&&text(item.reason))&&new Set(g.excludedChecks.map(item=>item.id)).size===g.excludedChecks.length&&g.excludedChecks.every(item=>g.checks.some(c=>c.id===item.id))),'Invalid excludedChecks');
 check(g.excludedChecks===undefined||g.excludedChecks.every(item=>!g.requiredChecks.includes(item.id)),'Check cannot be both required and excluded');
 check(g.checks.every(c=>g.requiredChecks.includes(c.id)||(g.excludedChecks??[]).some(item=>item.id===c.id)),'Every engineering check must be required or explicitly excluded with a reason');
 check(!('requireRawOutput'in g)||typeof g.requireRawOutput==='boolean','Invalid requireRawOutput');
 // 基线原始输出强制（v1.15 T3）：开启时所有 test 检查必须声明 expected（基线语义仅在其
 // 下存在），运行期缺 baselineRawOutput 声明 FAIL 指名（见 observe）。
 check(!('requireBaselineRawOutput'in g)||typeof g.requireBaselineRawOutput==='boolean','Invalid requireBaselineRawOutput');
 check(g.requireBaselineRawOutput!==true||g.checks.every(c=>c.type!=='test'||c.expected!==undefined),'requireBaselineRawOutput requires expected on test checks');
 check(Number.isInteger(g.timeoutMs)&&g.timeoutMs>0&&g.timeoutMs<=60000&&g.checks.reduce((sum,c)=>sum+c.timeoutMs,0)<=g.timeoutMs,'Invalid engineering timeout budget');
 for(const c of g.checks){
  if(c.type==='metric')check(Number.isFinite(c.min)&&c.min>=0&&c.min<=1,'Mutation minimum score must be 0..1');
  if(c.type==='findings'){
   check(Number.isInteger(c.maxFindings)&&c.maxFindings>=0,'Invalid maxFindings');
   check(c.maxBySeverity===undefined||(c.maxBySeverity!==null&&typeof c.maxBySeverity==='object'&&!Array.isArray(c.maxBySeverity)&&Object.keys(c.maxBySeverity).length>0&&Object.entries(c.maxBySeverity).every(([severity,max])=>['low','medium','high'].includes(severity)&&Number.isInteger(max)&&max>=0)&&new Set(Object.keys(c.maxBySeverity)).size===Object.keys(c.maxBySeverity).length),'Invalid maxBySeverity');
  }
  if(c.type==='test'){
   check(!('blockOnSkipped'in c)||typeof c.blockOnSkipped==='boolean','Invalid blockOnSkipped');
   check(c.baselineMode===undefined||BASELINE_MODES.includes(c.baselineMode),'Invalid baselineMode');
   check(!('minTotal'in c)||(Number.isInteger(c.minTotal)&&c.minTotal>0),'Invalid minTotal');
   check(!('minCoverageRatio'in c)||(Number.isFinite(c.minCoverageRatio)&&c.minCoverageRatio>0&&c.minCoverageRatio<=1),'Invalid minCoverageRatio');
   if(c.expected!==undefined){
    check(object(c.expected),'Invalid expected');
    const directions=['f2p','p2p'].filter(key=>key in c.expected);
    check(directions.length>0,'expected requires at least one of f2p/p2p');
    for(const direction of directions){
     const names=c.expected[direction];
     check(Array.isArray(names)&&names.length>0&&names.length<=100&&names.every(text)&&new Set(names).size===names.length,`Invalid expected ${direction}`);
    }
    if(directions.length===2)check(c.expected.f2p.every(name=>!c.expected.p2p.includes(name)),'expected f2p and p2p must not overlap');
   }
  }
 }
}

function observe(checkSpec,root,requireRawOutput,requireBaselineRawOutput){
 const runId=randomUUID();
 const argv=checkSpec.argv.map(item=>item==='$NODE'?process.execPath:item);
 const startedAt=new Date().toISOString();
 const processResult=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,checkId:checkSpec.id})+'\n',timeout:checkSpec.timeoutMs,maxBuffer:65536,windowsHide:true});
 const base={id:checkSpec.id,type:checkSpec.type,runId,argv,startedAt,exitCode:processResult.status,signal:processResult.signal,stderr:processResult.stderr,finishedAt:new Date().toISOString()};
 if(processResult.error||processResult.signal)return {...base,status:'ERROR',error:processResult.error?.message??'Tool interrupted'};
 if(checkSpec.type==='exit')return {...base,status:processResult.status===0?'PASS':'FAIL',stdout:processResult.stdout};
 if(processResult.status!==0)return {...base,status:'ERROR',error:'Tool did not return an observation',stdout:processResult.stdout};
 try{
  const result=JSON.parse(processResult.stdout);
  check(result&&result.schemaVersion==='0.1'&&result.runId===runId&&text(result.source),'Invalid or stale engineering observation');
  if(checkSpec.type==='artifact'){
   check(result.artifact&&text(result.artifact.path)&&text(result.artifact.sha256),'Invalid build artifact observation');
   const file=projectFile(root,result.artifact.path);
   check(fs.statSync(file).isFile()&&fs.statSync(file).size>0,'Build artifact missing or empty');
   const actualSha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   return {...base,source:result.source,artifact:{path:result.artifact.path,sha256:actualSha256,bytes:fs.statSync(file).size},status:actualSha256===result.artifact.sha256?'PASS':'FAIL'};
  }
  if(checkSpec.type==='test'){
   check(Number.isInteger(result.total)&&result.total>0&&Number.isInteger(result.passed)&&result.passed>=0&&Number.isInteger(result.failed)&&result.failed>=0&&Number.isInteger(result.skipped)&&result.skipped>=0&&result.passed+result.failed+result.skipped===result.total,'Invalid unit test counts');
   // 原始证据内核解析（B1，v1.11.0）：unit 观察可选 rawOutput{format,file}——声明即核验。
   // 内核读取并解析原始测试输出、自行重算计数与自报交叉核验；不符即 ERROR fail-closed
   // （自报不可信时判定不成立），核验一致后判定计数即内核重算值。requireRawOutput 开启
   // 时缺声明 FAIL 指名（防静默，不防蓄意伪造文件内容——解析器只保证计数自洽）。
   let rawOutput;
   let missingRawOutput;
   if(result.rawOutput!==undefined&&result.rawOutput!==null){
    check(object(result.rawOutput)&&Object.keys(result.rawOutput).length===2&&RAW_OUTPUT_FORMATS.includes(result.rawOutput.format)&&text(result.rawOutput.file),'Invalid unit rawOutput (expected exactly {format:tap|junit, file})');
    const file=projectFile(root,result.rawOutput.file);
    const parsed=parseRawOutput(result.rawOutput.format,fs.readFileSync(file,'utf8'));
    const disagree=['total','passed','failed','skipped'].filter(key=>parsed[key]!==result[key]);
    check(disagree.length===0,`rawOutput counts disagree with self-reported: ${disagree.map(key=>`${key} reported ${result[key]} but raw file says ${parsed[key]}`).join('; ')}`);
    rawOutput={file:result.rawOutput.file,format:result.rawOutput.format,parser:parsed.parser,total:parsed.total,passed:parsed.passed,failed:parsed.failed,skipped:parsed.skipped,caseCount:parsed.cases.length,crossCheck:'match'};
   }else if(requireRawOutput===true)missingRawOutput=true;
   // 覆盖率证据可选上报;阈值在配置侧声明,比值由内核与可选计数交叉核验,不由 runner 自判。
   let coverage;
   if(result.coverage!==undefined){
    check(object(result.coverage)&&text(result.coverage.tool)&&Number.isFinite(result.coverage.ratio)&&result.coverage.ratio>=0&&result.coverage.ratio<=1,'Invalid unit coverage observation');
    if(result.coverage.total!==undefined||result.coverage.covered!==undefined){
     check(Number.isInteger(result.coverage.total)&&result.coverage.total>0&&Number.isInteger(result.coverage.covered)&&result.coverage.covered>=0&&result.coverage.covered<=result.coverage.total,'Invalid unit coverage counts');
     check(Math.abs(result.coverage.covered/result.coverage.total-result.coverage.ratio)<=0.005,'Unit coverage ratio disagrees with counts');
    }
    coverage={tool:result.coverage.tool,ratio:result.coverage.ratio};
   }
   if(checkSpec.minCoverageRatio!==undefined)check(coverage!==undefined,'minCoverageRatio declared but the unit observation lacks coverage evidence');
   const coverageViolation=coverage&&checkSpec.minCoverageRatio!==undefined&&coverage.ratio<checkSpec.minCoverageRatio?{ratio:coverage.ratio,minCoverageRatio:checkSpec.minCoverageRatio}:undefined;
   const extras={...(coverage?{coverage}:{}),...(checkSpec.minCoverageRatio!==undefined?{minCoverageRatio:checkSpec.minCoverageRatio}:{}),...(coverageViolation?{coverageViolation}:{}),...(rawOutput?{rawOutput}:{}),...(missingRawOutput?{missingRawOutput:true}:{}),...(requireRawOutput===true?{requireRawOutput:true}:{})};
   const skippedBlocked=checkSpec.blockOnSkipped===true&&result.skipped>0;
   const belowMinimum=checkSpec.minTotal!==undefined&&result.total<checkSpec.minTotal;
   if(checkSpec.expected===undefined){
   return {...base,source:result.source,total:result.total,passed:result.passed,failed:result.failed,skipped:result.skipped,...(checkSpec.blockOnSkipped!==undefined?{blockOnSkipped:checkSpec.blockOnSkipped}:{}),...(checkSpec.minTotal!==undefined?{minTotal:checkSpec.minTotal}:{}),...extras,status:result.failed===0&&!skippedBlocked&&!belowMinimum&&!coverageViolation&&!missingRawOutput?'PASS':'FAIL'};
   }
   check(Array.isArray(result.cases)&&result.cases.every(item=>object(item)&&text(item.name)&&caseStatuses.includes(item.status)&&caseStatuses.includes(item.baselineStatus)),'Invalid unit case observation');
   check(new Set(result.cases.map(item=>item.name)).size===result.cases.length,'Duplicate unit case name');
   // 基线来源协议（W3）：声明 expected 即适用，与 behavior 同语义（逐 check 的 baselineMode）
   const baseline=evaluateBaselineSource(checkSpec.baselineMode,result.baselineSource,root);
   // 基线原始输出内核解析（v1.15 T3）：unit 观察可选 baselineRawOutput{format,file}——
   // 内核解析基线 TAP/JUnit、逐用例重算基线状态与自报 baselineStatus 交叉核验，不符
   // ERROR fail-closed；核验一致后 F2P/P2P 方向审计的基线侧取内核重算值（基线自报不再
   // 凭信）。基线内容绑定经 baselineSource 的 file+contentSha256（git show 内容比对，见
   // lib/baseline.mjs）。requireBaselineRawOutput 开启时缺声明 FAIL 指名。
   let baselineRawOutput;
   let missingBaselineRawOutput;
   let authoritativeBaseline=null;
   if(result.baselineRawOutput!==undefined&&result.baselineRawOutput!==null){
    check(object(result.baselineRawOutput)&&Object.keys(result.baselineRawOutput).length===2&&RAW_OUTPUT_FORMATS.includes(result.baselineRawOutput.format)&&text(result.baselineRawOutput.file),'Invalid unit baselineRawOutput (expected exactly {format:tap|junit, file})');
    const parsedBaseline=parseRawOutput(result.baselineRawOutput.format,fs.readFileSync(projectFile(root,result.baselineRawOutput.file),'utf8'));
    const statusOf={passed:'pass',failed:'fail',skipped:'skip'};
    authoritativeBaseline=new Map();
    const disagreements=[];
    for(const item of parsedBaseline.cases){
     if(authoritativeBaseline.has(item.name)){disagreements.push(`duplicate case name in baseline raw output: ${item.name}`);continue;}
     authoritativeBaseline.set(item.name,statusOf[item.status]);
    }
    for(const reported of result.cases){
     const kernelStatus=authoritativeBaseline.get(reported.name);
     if(kernelStatus===undefined)disagreements.push(`case ${reported.name} missing from baseline raw output`);
     else if(kernelStatus!==reported.baselineStatus)disagreements.push(`case ${reported.name} baselineStatus reported ${reported.baselineStatus} but baseline raw output says ${kernelStatus}`);
    }
    check(disagreements.length===0,`baselineRawOutput disagrees with self-reported baselineStatus: ${disagreements.join('; ')}`);
    baselineRawOutput={file:result.baselineRawOutput.file,format:result.baselineRawOutput.format,parser:parsedBaseline.parser,total:parsedBaseline.total,passed:parsedBaseline.passed,failed:parsedBaseline.failed,skipped:parsedBaseline.skipped,caseCount:parsedBaseline.cases.length,crossCheck:'match'};
   }else if(requireBaselineRawOutput===true)missingBaselineRawOutput=true;
   const byName=new Map(result.cases.map(item=>[item.name,item]));
   const expectedViolations=[];
   for(const [direction,names] of Object.entries(checkSpec.expected)){
    for(const name of names){
     const observed=byName.get(name);
     if(!observed){expectedViolations.push({direction,name,rule:'missingCase'});continue;}
     const kernelBaselineStatus=authoritativeBaseline!==null?authoritativeBaseline.get(name):undefined;
     const baselineStatus=kernelBaselineStatus??observed.baselineStatus;
     const violation={direction,name,currentStatus:observed.status,baselineStatus};
     if(observed.status==='skip')expectedViolations.push({...violation,rule:'skippedCase'});
     else if(direction==='f2p'&&observed.status!=='pass')expectedViolations.push({...violation,rule:'f2pStillFailing'});
     else if(direction==='f2p'&&baselineStatus!=='fail')expectedViolations.push({...violation,rule:'f2pPassedOnBaseline'});
     else if(direction==='p2p'&&observed.status!=='pass')expectedViolations.push({...violation,rule:'p2pRegressed'});
     else if(direction==='p2p'&&baselineStatus!=='pass')expectedViolations.push({...violation,rule:'p2pFailedOnBaseline'});
    }
   }
   return {...base,source:result.source,total:result.total,passed:result.passed,failed:result.failed,skipped:result.skipped,expected:checkSpec.expected,cases:result.cases,baseline,...(checkSpec.blockOnSkipped!==undefined?{blockOnSkipped:checkSpec.blockOnSkipped}:{}),...(checkSpec.minTotal!==undefined?{minTotal:checkSpec.minTotal}:{}),...extras,...(baselineRawOutput?{baselineRawOutput}:{}),...(missingBaselineRawOutput?{missingBaselineRawOutput:true}:{}),...(requireBaselineRawOutput===true?{requireBaselineRawOutput:true}:{}),...(expectedViolations.length?{expectedViolations}:{}),status:result.failed===0&&!skippedBlocked&&!belowMinimum&&!coverageViolation&&!missingRawOutput&&!missingBaselineRawOutput&&expectedViolations.length===0&&baseline.accepted?'PASS':'FAIL'};
  }
  if(checkSpec.type==='metric'){
   check(Number.isFinite(result.score)&&result.score>=0&&result.score<=1&&Number.isInteger(result.killed)&&Number.isInteger(result.total)&&result.total>0&&result.killed>=0&&result.killed<=result.total&&Math.abs(result.score-result.killed/result.total)<1e-9,'Invalid mutation score');
   if(result.survivors!==undefined){
    check(Array.isArray(result.survivors)&&result.survivors.length===result.total-result.killed&&result.survivors.every(survivor=>text(survivor.id)&&text(survivor.description))&&new Set(result.survivors.map(survivor=>survivor.id)).size===result.survivors.length,'Invalid mutation survivors');
   }
   return {...base,source:result.source,score:result.score,killed:result.killed,total:result.total,min:checkSpec.min,...(result.survivors!==undefined?{survivors:result.survivors}:{}),status:result.score>=checkSpec.min?'PASS':'FAIL'};
  }
  check(Array.isArray(result.findings)&&result.findings.length<=1000&&result.findings.every(f=>text(f.path)&&text(f.rule)&&text(f.message)&&['low','medium','high'].includes(f.severity)),'Invalid engineering findings');
  const severityCounts={low:0,medium:0,high:0};
  for(const finding of result.findings)severityCounts[finding.severity]++;
  const severityBreaches=Object.entries(checkSpec.maxBySeverity??{}).filter(([severity,max])=>severityCounts[severity]>max).map(([severity])=>severity);
  const withinTotal=result.findings.length<=checkSpec.maxFindings&&severityBreaches.length===0;
  return {...base,source:result.source,findings:result.findings,maxFindings:checkSpec.maxFindings,severityCounts,...(checkSpec.maxBySeverity!==undefined?{maxBySeverity:checkSpec.maxBySeverity}:{}),...(severityBreaches.length?{severityBreaches}:{}),status:withinTotal?'PASS':'FAIL'};
 }catch(error){return {...base,status:'ERROR',error:error.message};}
}

export function runEngineering(g,root){
 const checks=g.checks.map(spec=>observe(spec,root,g.requireRawOutput,g.requireBaselineRawOutput));
 const required=g.requiredChecks.map(id=>({id,status:checks.find(check=>check.id===id)?.status??'ERROR'}));
 return {status:required.some(item=>item.status==='ERROR')?'ERROR':required.some(item=>item.status==='FAIL')?'FAIL':'PASS',details:{requiredChecks:required,checks}};
}
