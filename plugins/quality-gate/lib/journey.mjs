import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import {diff,filterDifferences,validateIgnorePaths} from './diff.mjs';
import {parseTranscript,TRANSCRIPT_FORMAT} from './raw-evidence.mjs';
import {projectFile} from './kernel.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export function validateJourney(g){
 check(g.level==='L3','journey requires L3');
 check(Array.isArray(g.scenarios)&&g.scenarios.length>0&&g.scenarios.length<=20,'Expected 1..20 journey scenarios');
 check(g.scenarios.every(s=>text(s.id)&&['smoke','integration','e2e'].includes(s.level)&&Array.isArray(s.expectedSteps)&&s.expectedSteps.length>0&&s.expectedSteps.length<=30&&s.expectedSteps.every(step=>text(step.id)&&Object.hasOwn(step,'expected'))),'Invalid journey scenario');
 check(new Set(g.scenarios.map(s=>s.id)).size===g.scenarios.length,'Duplicate journey scenario');
 for(const scenario of g.scenarios)check(new Set(scenario.expectedSteps.map(step=>step.id)).size===scenario.expectedSteps.length,'Duplicate journey step');
 validateIgnorePaths(g.ignorePaths,'ignorePaths');
 // 原始用例观察记录（v1.13 T3）：门禁级可选强制（缺声明 FAIL 指名；显式 false 保留旧语义）
 check(g.requireRawTranscript===undefined||typeof g.requireRawTranscript==='boolean','Invalid requireRawTranscript');
 // 回放资产（v1.21 轨道 D）：归档观察记录为期望基线——contentSha256 内容绑定（基线被改动而
 // 配置未同步即 FAIL，换基线须显式重 pin）；当次无观察记录时容忍自报对照（弱一档，如实标注）
 check(g.replayBaseline===undefined||(object(g.replayBaseline)&&Object.keys(g.replayBaseline).length===2&&text(g.replayBaseline.file)&&/^[0-9a-f]{64}$/.test(g.replayBaseline.contentSha256)),'Invalid replayBaseline');
}

export function runJourney(g,root){
 const runId=randomUUID();const argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
 const request={schemaVersion:'0.1',runId,scenarios:g.scenarios.map(s=>({id:s.id,level:s.level,input:s.input??{}}))};
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify(request)+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Journey runner failed'}};
 try{
  const observation=JSON.parse(result.stdout);
  check(object(observation)&&observation.schemaVersion==='0.1'&&observation.runId===runId&&text(observation.source)&&Array.isArray(observation.scenarios),'Invalid or stale journey observation');
  check(observation.scenarios.length===g.scenarios.length&&new Set(observation.scenarios.map(s=>s.id)).size===observation.scenarios.length,'Journey scenario IDs do not match');
  const actualScenarios=new Map(observation.scenarios.map(s=>[s.id,s]));
  // 原始用例观察记录核验（v1.13 T3）：观察可选 rawTranscript{format,file}——声明即核验（与
  // behavior 同构）：当次 runId 绑定、逐场景逐步骤与自报 actual 交叉核验、source 一致性
  // 核验，不符 ERROR 指名；核验一致后判定以观察记录为准。requireRawTranscript:true 下缺声明
  // FAIL 指名（防静默，不防蓄意伪造两份一致记录）。
  let rawTranscript;
  let missingRawTranscript;
  let authoritativeScenarios=actualScenarios;
  let authoritativeSource=observation.source;
  if(observation.rawTranscript!==undefined&&observation.rawTranscript!==null){
   check(observation.rawTranscript!==null&&typeof observation.rawTranscript==='object'&&!Array.isArray(observation.rawTranscript)&&Object.keys(observation.rawTranscript).length===2&&observation.rawTranscript.format===TRANSCRIPT_FORMAT&&text(observation.rawTranscript.file),`Invalid journey rawTranscript (expected exactly {format:${TRANSCRIPT_FORMAT}, file})`);
   const file=projectFile(root,observation.rawTranscript.file);
   const transcript=parseTranscript(fs.readFileSync(file,'utf8'),{kind:'journey'});
   check(transcript.runId===runId,'rawTranscript runId does not match this run (stale transcript)');
   check(transcript.source===observation.source,'rawTranscript source disagrees with self-reported observation');
   const recordedScenarios=new Map(transcript.scenarios.map(s=>[s.id,s]));
   const disagreements=[];
   for(const reported of observation.scenarios){
    const recorded=recordedScenarios.get(reported.id);
    if(!recorded){disagreements.push(`scenario ${reported.id} reported but missing from transcript`);continue;}
    const recordedSteps=new Map(recorded.steps.map(step=>[step.id,step]));
    for(const step of reported.steps){
     const recordedStep=recordedSteps.get(step.id);
     if(!recordedStep){disagreements.push(`scenario ${reported.id} step ${step.id} reported but missing from transcript`);continue;}
     if(diff(recordedStep.actual,step.actual).length)disagreements.push(`scenario ${reported.id} step ${step.id} actual reported ${JSON.stringify(step.actual)} but transcript says ${JSON.stringify(recordedStep.actual)}`);
    }
    for(const recordedStep of recorded.steps)if(!reported.steps.some(step=>step.id===recordedStep.id))disagreements.push(`scenario ${reported.id} step ${recordedStep.id} present in transcript but not reported`);
   }
   for(const recorded of transcript.scenarios)if(!actualScenarios.has(recorded.id))disagreements.push(`scenario ${recorded.id} present in transcript but not reported`);
   check(disagreements.length===0,`rawTranscript disagrees with self-reported: ${disagreements.join('; ')}`);
   rawTranscript={file:observation.rawTranscript.file,format:observation.rawTranscript.format,scenarioCount:transcript.scenarios.length,stepCount:transcript.scenarios.reduce((sum,s)=>sum+s.steps.length,0),crossCheck:'match'};
   authoritativeScenarios=recordedScenarios;
  }else if(g.requireRawTranscript===true)missingRawTranscript=true;
  // 回放资产对照（v1.21 轨道 D）：归档观察记录为期望基线，当次执行对照——步骤序（replay-
  // sequence-drift：旅程步骤按 id 匹配不判序，回放对照补上序）＋逐步骤 actual 关键字段
  // （replay-drift 指名路径；基线缺步骤/场景=replay-missing、当次多出=replay-extra）；基线
  // 内容与配置绑定不符即 replay-baseline-modified（基线被改动须显式重 pin）。易变字段走既有
  // ignorePaths；对照面不含 runId/source 等包络。当次无观察记录时以自报数据对照（容忍自报，
  // 弱一档——replay.source 如实呈现）。
  let replay;
  if(g.replayBaseline!==undefined){
   const baselineContent=fs.readFileSync(projectFile(root,g.replayBaseline.file),'utf8');
   const actualSha256=createHash('sha256').update(baselineContent).digest('hex');
   if(actualSha256!==g.replayBaseline.contentSha256){
    replay={file:g.replayBaseline.file,status:'replay-baseline-modified',problem:`回放基线内容与配置绑定不符（期望 ${g.replayBaseline.contentSha256.slice(0,8)}…，实际 ${actualSha256.slice(0,8)}…）——基线被改动须显式重 pin`};
   }else{
    const baselineTranscript=parseTranscript(baselineContent,{kind:'journey'});
    const baselineScenarios=new Map(baselineTranscript.scenarios.map(s=>[s.id,s]));
    const drift=[];
    for(const [id,base] of baselineScenarios){
     const currentScenario=authoritativeScenarios.get(id);
     if(!currentScenario){drift.push({scenario:id,rule:'replay-missing',problem:'基线场景在当次执行中缺失'});continue;}
     const baselineSteps=new Map(base.steps.map(step=>[step.id,step]));
     const currentSteps=new Map(currentScenario.steps.map(step=>[step.id,step]));
     const baselineOrder=base.steps.map(step=>step.id).join('>'),currentOrder=currentScenario.steps.map(step=>step.id).join('>');
     if(baselineOrder!==currentOrder)drift.push({scenario:id,rule:'replay-sequence-drift',problem:`步骤序漂移（基线 ${baselineOrder} ≠ 当次 ${currentOrder}）`});
     for(const [stepId,baseStep] of baselineSteps){
      const currentStep=currentSteps.get(stepId);
      if(!currentStep){drift.push({scenario:id,step:stepId,rule:'replay-missing',problem:'基线步骤在当次执行中缺失'});continue;}
      const {differences}=filterDifferences(diff(baseStep.actual,currentStep.actual),g.ignorePaths);
      if(differences.length)drift.push({scenario:id,step:stepId,rule:'replay-drift',differences});
     }
     for(const stepId of currentSteps.keys())if(!baselineSteps.has(stepId))drift.push({scenario:id,step:stepId,rule:'replay-extra',problem:'当次执行多出基线外步骤'});
    }
    for(const id of authoritativeScenarios.keys())if(!baselineScenarios.has(id))drift.push({scenario:id,rule:'replay-extra',problem:'当次执行多出基线外场景'});
    replay={file:g.replayBaseline.file,contentVerified:true,source:rawTranscript?'transcript':'self-reported',...(drift.length?{status:'replay-drift',drift}:{status:'match'})};
   }
  }
  const scenarios=g.scenarios.map(spec=>{
   const actual=authoritativeScenarios.get(spec.id);check(actual&&Array.isArray(actual.steps)&&actual.steps.every(step=>text(step.id)&&Object.hasOwn(step,'actual')),'Invalid journey steps');
   const actualSteps=new Map(actual.steps.map(step=>[step.id,step.actual]));
   check(actualSteps.size===actual.steps.length,'Duplicate observed journey step');
   const steps=spec.expectedSteps.map(step=>{
    const stepDifferences=actualSteps.has(step.id)?diff(step.expected,actualSteps.get(step.id)):[{path:'/',rule:'missing',expected:step.expected}];
    const {differences,ignoredDifferences}=filterDifferences(stepDifferences,g.ignorePaths);
    return {id:step.id,expected:step.expected,actual:actualSteps.get(step.id),status:differences.length?'FAIL':'PASS',...(differences.length?{differences}:{}),...(g.ignorePaths&&ignoredDifferences.length?{ignoredDifferences}:{})};
   });
   const unexpectedSteps=actual.steps.filter(step=>!spec.expectedSteps.some(expected=>expected.id===step.id)).map(step=>step.id);
   return {id:spec.id,level:spec.level,steps,unexpectedSteps,status:steps.every(step=>step.status==='PASS')&&unexpectedSteps.length===0?'PASS':'FAIL'};
  });
  const extras={...(rawTranscript?{rawTranscript}:{}),...(missingRawTranscript?{missingRawTranscript:true}:{}),...(g.requireRawTranscript!==undefined?{requireRawTranscript:g.requireRawTranscript}:{}),...(replay?{replay}:{})};
  return {status:scenarios.every(s=>s.status==='PASS')&&!missingRawTranscript&&(!replay||replay.status==='match')?'PASS':'FAIL',details:{...execution,source:authoritativeSource,scenarios,...extras}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
