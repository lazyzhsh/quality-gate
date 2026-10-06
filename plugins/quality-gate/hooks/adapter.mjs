import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {run} from '../lib/kernel.mjs';
import {renderSummary} from '../lib/summary.mjs';
import {dependencyReport,formatDependencyHints} from '../lib/dependencies.mjs';
import {configSha256,latestRun,inputSnapshot,changedInputs,reusableRun,pathGlob} from '../lib/freshness.mjs';
import {parseTaskIntent} from '../lib/task-intent.mjs';
let raw='';
try {
 for await(const chunk of process.stdin){raw+=chunk;if(raw.length>1048576)throw new Error('Hook input too large');}
 const input=JSON.parse(raw), event=input.hook_event_name??input.hookEventName;
 if(!['SessionStart','Stop','UserPromptSubmit','PreToolUse'].includes(event))throw new Error('Unsupported event');
 if(typeof input.cwd!=='string'||!path.isAbsolute(input.cwd))throw new Error('Absolute cwd required');
 const root=fs.realpathSync(input.cwd);
 const stateDir=process.env.ZCODE_PLUGIN_DATA?path.join(process.env.ZCODE_PLUGIN_DATA,createHash('sha256').update(root).digest('hex')):null;
 const baselineFile=stateDir?path.join(stateDir,'session-baseline.json'):null;
 let output;
 // 意图软形态（v1.17.1，OD-105=登记即激活）：UserPromptSubmit 基准行注入与 PreToolUse 范围
 // 软提示只在意图登记存在时工作（登记即 opt-in）；intent.hooks:false 整体关、intent.capture:true
 // 开未登记引导。软形态是降低修复成本的提前暴露——自身任何故障（登记损坏/配置异常）一律静默
 // {} 不注入不提示，权威判定始终在 close 漂移对账
 if(event==='UserPromptSubmit'||event==='PreToolUse'){
  try{
   let intentOptions={};
   try{
    const c=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8').replace(/^\uFEFF/,''));
    if(c?.intent&&typeof c.intent==='object'&&!Array.isArray(c.intent))intentOptions=c.intent;
   }catch{/* 无配置/配置损坏：按默认（登记即激活、capture 关）工作 */}
   let register=null;
   try{register=parseTaskIntent(fs.readFileSync(path.join(root,'.quality-gate','registries','task-intent.json'),'utf8'));}catch{/* 无登记/登记损坏：软形态静默 */}
   const active=register!==null&&intentOptions.hooks!==false;
   if(event==='UserPromptSubmit'){
    if(active)output={hookSpecificOutput:{hookEventName:event,additionalContext:`任务意图基准: ${register.taskId}——${register.statement}（scope: ${register.scope.join('、')}）。本次会话的变更应落在 scope 内，close 阶段漂移对账会指名越界文件（outside-task-scope）；确需扩范围请显式修订（qgate intent <root> <answers> --revise，附理由），不要手改登记。`}};
    else if(register===null&&intentOptions.capture===true)output={hookSpecificOutput:{hookEventName:event,additionalContext:'Quality Gate: 本任务尚未登记任务意图基准。经 /quality-gate-intent 四步问询（目标→scope→验收→约束）确认后由 qgate intent 写入——没有意图基准的"完成"只是 agent 自述。'}};
    else output={};
   } else {
    const target=input.tool_input?.file_path??input.tool_input?.path;
    if(active&&typeof target==='string'&&/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(input.tool_name??'')){
     const rel=path.relative(root,path.resolve(root,target)).replaceAll('\\','/');
     if(rel&&!rel.startsWith('..')&&!register.scope.some(pattern=>pathGlob(pattern).test(rel))){
      output={systemMessage:`Quality Gate 范围提示（软提示，不拦截）: ${rel} 不在任务意图 ${register.taskId} 的 scope（${register.scope.join('、')}）内——close 阶段漂移对账将 FAIL outside-task-scope。还原该变更、改动 scope 内文件，或显式修订意图（qgate intent --revise）。`};
     } else output={};
    } else output={};
   }
  }catch{output={};}
 }
 else if(event==='SessionStart'){
  let context='Quality Gate enabled. Before closing, run configured quality gates. No .quality-gate.json means onboarding is required; never claim quality PASS without evidence. Stop feedback has a runtime retry limit; use CLI in CI for enforcement. After running gates, show the graded report in your reply as Markdown (never wrapped in a code fence; PASS: the brief stderr line; otherwise the full table with durations, per-gate evidence sources, reasons and the suggestion column); qgate.mjs report <root> [runId] re-renders archived runs (unique id prefix accepted).';
  if(Number(process.versions.node.split('.')[0])<20)context+=` Node ${process.versions.node} is below the required 20+; upgrade via https://nodejs.org/`;
  // 新项目接入：读得到配置时预检外部依赖并给出安装指引；读不到时区分缺配置（指向引导命令）与配置损坏
  let config=null,configError=null;
  try{config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8').replace(/^\uFEFF/,''));}
  catch(err){configError=err;}
  if(configError){
   if(configError.code==='ENOENT'){
    context+=' First run detected: no .quality-gate.json. Run /quality-gate-init to bootstrap it via guided template selection, or qgate.mjs init from the CLI.';
    // 重初始化场景：配置被删但运行历史/登记文件仍在，指向引导的清理确认流
    if(fs.existsSync(path.join(root,'.quality-gate')))context+=' Previous quality-gate state detected (runs/registries); /quality-gate-init will list leftovers and offer clean re-initialization.';
   }
   else context+=` .quality-gate.json exists but cannot be read (${configError.message}); fix the file or rerun onboarding.`;
  }
  else {
   try{
    const hints=formatDependencyHints(dependencyReport(config));
    if(hints.length)context+=` Dependency hints: ${hints.join(' ')}`;
   }catch{}
  }
  // 基线状态前置（v1.14）：会话开始即告知最近一次归档结论与新鲜度，既有红灯在任务中修复
  // 而不是在 Stop 被撞上。新鲜度走 mtime 抽查，目录过大（>20k 项）时省略括注不误报。
  let last=null;
  try{
   last=latestRun(root);
   if(last){
    const changed=last.inputsStable?changedInputs(last.inputSnapshot,inputSnapshot(root,{maxEntries:20000})):null;
    const freshness=changed===null?'':changed.length===0?'（此后输入未变）':'（此后有文件变更，先重跑再收尾）';
    context+=` 基准: 最近一次 ${last.stage} 运行 ${last.status}${freshness}，时间 ${last.finishedAt}`;
    if(last.status!=='PASS'){
     const failing=(last.evidence??[]).filter(e=>e.status==='FAIL'||e.status==='ERROR').map(e=>e.gateId);
     if(failing.length)context+=`，失败门禁: ${failing.slice(0,8).join(', ')}${failing.length>8?`（+${failing.length-8} 项）`:''}`;
    }
    context+='。';
   }
  }catch{}
  // new-only 基线锚（v1.14）：记录会话开始时的配置哈希与逐门禁结论，Stop 据此区分"会话前
  // 既有失败"与"本会话新引入失败"；写不进插件数据目录时 new-only 自动退化为 all（不降级）
  if(baselineFile)try{
   let sha=null;
   try{sha=configSha256(root);}catch{}
   const gates={};
   if(last)for(const e of last.evidence??[])gates[e.gateId]=e.status;
   fs.mkdirSync(stateDir,{recursive:true});
   fs.writeFileSync(baselineFile,JSON.stringify({root,configSha256:sha,finishedAt:last?.finishedAt??null,inputSnapshot:last?.inputsStable?last.inputSnapshot:null,gates}));
  }catch{}
  output={hookSpecificOutput:{hookEventName:event,additionalContext:context}};
 }
 else {
  // 未接入项目不阻断（v1.14）：引导由 SessionStart 指引承担，Stop 只对已声明门禁的项目执法
  if(!fs.existsSync(path.join(root,'.quality-gate.json'))){
   output={systemMessage:`Quality Gate: 此项目无 .quality-gate.json（未接入门禁），Stop 不阻断；初始化见会话开始时的 /quality-gate-init 指引。`};
  }else{
   let blockMode='all',inputs={};
   try{
    const c=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8').replace(/^\uFEFF/,''));
    if(c?.stop?.blockMode)blockMode=c.stop.blockMode;
    if(c?.stop?.inputs)inputs=c.stop.inputs;
   }catch{}
   // 证据落点统一（v1.14）：Stop 运行写入项目 .quality-gate/runs（与 CLI 同轨，便于 report
   // 重渲染与审计）；项目目录不可写时回退插件数据目录
   let reportDir=path.join(root,'.quality-gate','runs');
   try{fs.mkdirSync(reportDir,{recursive:true});}catch{reportDir=stateDir?path.join(stateDir,'runs'):undefined;}
   // 复用（v1.14）：归档结论与当前配置一致且其后输入无 mtime 变更 → 不重跑，直接按归档结论
   // 判定；无法判定（目录超限/不可读）一律回退全量重跑
   let report=reusableRun(root,'close');
   const reusedFrom=report?report.id:null;
   if(!report)report=run(root,'close',reportDir,{budgetMs:50000});
   if(report.status==='PASS')output={};
   else{
    // new-only 降级判定：仅对 FAIL 且（会话基线中同门禁已 FAIL）且（声明了该门禁的输入 glob
    // 且基线之后无命中变更）的门禁生效；ERROR、未声明输入、配置已变、无法枚举 → 一律仍阻断
    const failing=(report.evidence??[]).filter(e=>e.status==='FAIL');
    let preexisting=[];
    if(blockMode==='new-only'&&report.status==='FAIL'&&failing.length&&baselineFile){
     try{
      const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
      if(baseline.configSha256===report.configSha256){
       const changed=changedInputs(baseline.inputSnapshot,inputSnapshot(root));
       if(changed)for(const e of failing){
        if(baseline.gates?.[e.gateId]!=='FAIL')continue;
        const patterns=inputs[e.gateId];
        if(!Array.isArray(patterns))continue;
        if(changed.some(rel=>patterns.map(pathGlob).some(re=>re.test(rel))))continue;
        preexisting.push(e);
       }
      }
     }catch{/* 基线缺失/损坏 → 全部视为新失败，阻断 */}
    }
    if(blockMode==='new-only'&&report.status==='FAIL'&&failing.length>0&&failing.every(e=>preexisting.includes(e))){
     output={systemMessage:`Quality Gate: 本次报告仍为 FAIL——${failing.length} 个门禁失败均为会话开始前既有（${failing.map(e=>e.gateId).join(', ')}），stop.blockMode=new-only 允许本次 Stop 收尾；证据 ${report.reportPath??path.join(reportDir??'.quality-gate/runs',report.id+'.json')}。既有失败请安排修复，不要视为已通过。`};
    }else{
     const reason=renderSummary(report)
      +(reusedFrom?`\n（输入核验一致，复用归档 run ${reusedFrom.slice(0,8)}·原运行 ${report.finishedAt}，未重跑门禁）`:'')
      +(preexisting.length?`\n其中会话前既有失败: ${preexisting.map(e=>e.gateId).join(', ')}——但存在新失败或其输入已变，仍阻断。`:'');
     output={decision:'block',reason};
    }
   }
  }
 }
 console.log(JSON.stringify(output));
}catch(e){console.log(JSON.stringify({systemMessage:`Quality Gate adapter error (non-blocking): ${e.message}——宿主本次未阻断；该消息不构成质量判定，请以 CLI 结果为准: node "${fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url))}" <project-root> close`}));}
