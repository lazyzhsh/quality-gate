import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import {diff,filterDifferences,validateIgnorePaths} from './diff.mjs';
import {BASELINE_MODES,evaluateBaselineSource,normalizeBaselineSource} from './baseline.mjs';
import {parseTranscript,TRANSCRIPT_FORMAT} from './raw-evidence.mjs';
import {projectFile} from './kernel.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};

export function validateBehavior(g){
 check(g.level==='L3','behavior requires L3');
 check(Array.isArray(g.cases)&&g.cases.length>0&&g.cases.length<=20,'Expected 1..20 behavior cases');
 check(g.cases.every(c=>text(c.id)&&Object.hasOwn(c,'input')&&Object.hasOwn(c,'expected')),'Invalid behavior case');
 check(new Set(g.cases.map(c=>c.id)).size===g.cases.length,'Duplicate behavior case id');
 validateIgnorePaths(g.ignorePaths,'ignorePaths');
 if(g.expected!==undefined){
  check(object(g.expected),'Invalid expected');
  const directions=['f2p','p2p'].filter(key=>key in g.expected);
  check(directions.length>0,'expected requires at least one of f2p/p2p');
  const caseIds=new Set(g.cases.map(c=>c.id));
  for(const direction of directions){
   const ids=g.expected[direction];
   check(Array.isArray(ids)&&ids.length>0&&ids.length<=20&&ids.every(text)&&new Set(ids).size===ids.length&&ids.every(id=>caseIds.has(id)),`Invalid expected ${direction}`);
  }
  if(directions.length===2)check(g.expected.f2p.every(id=>!g.expected.p2p.includes(id)),'expected f2p and p2p must not overlap');
 }
 // 基线来源协议（W3）：expected 声明时可要求真实 git 基线（baselineMode:git）
 check(g.baselineMode===undefined||BASELINE_MODES.includes(g.baselineMode),'Invalid baselineMode');
 // 原始用例观察记录（v1.13 T2）：门禁级可选强制（缺声明 FAIL 指名；显式 false 保留旧语义）
 check(g.requireRawTranscript===undefined||typeof g.requireRawTranscript==='boolean','Invalid requireRawTranscript');
 // 基线观察记录（v1.15 T2）：门禁级可选强制——观察记录必须声明基线块且与观察 baselineSource 两源
 // 一致（缺任一 FAIL 指名；显式 false 保留旧语义）。基线语义仅在声明 expected 时存在。
 check(g.requireBaselineTranscript===undefined||typeof g.requireBaselineTranscript==='boolean','Invalid requireBaselineTranscript');
 check(g.requireBaselineTranscript!==true||g.expected!==undefined,'requireBaselineTranscript requires expected');
 // 回放资产（v1.21 轨道 D）：归档观察记录为期望基线——contentSha256 内容绑定（基线被改动而
 // 配置未同步即 FAIL，换基线须显式重 pin）；当次无观察记录时容忍自报对照（弱一档，如实标注）
 check(g.replayBaseline===undefined||(object(g.replayBaseline)&&Object.keys(g.replayBaseline).length===2&&text(g.replayBaseline.file)&&/^[0-9a-f]{64}$/.test(g.replayBaseline.contentSha256)),'Invalid replayBaseline');
}

export function runBehavior(g,root){
 const runId=randomUUID();
 const argv=g.argv.map(v=>v==='$NODE'?process.execPath:v);
 const request={schemaVersion:'0.1',runId,cases:g.cases.map(c=>({id:c.id,input:c.input}))};
 const r=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify(request)+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:r.status,signal:r.signal,stderr:r.stderr};
 if(r.error||r.signal||r.status!==0)return {status:'ERROR',details:{...execution,error:r.error?.message??'Behavior runner did not exit successfully'}};
 try {
  const result=JSON.parse(r.stdout);
  check(object(result)&&result.schemaVersion==='0.1'&&result.runId===runId&&Array.isArray(result.cases),'Invalid or stale behavior result');
  check(result.cases.length===g.cases.length&&result.cases.every(c=>object(c)&&text(c.id)&&Object.hasOwn(c,'actual'))&&new Set(result.cases.map(c=>c.id)).size===result.cases.length,'Invalid behavior case results');
  const actual=new Map(result.cases.map(c=>[c.id,c]));
  check(g.cases.every(c=>actual.has(c.id)),'Behavior case IDs do not match');
  // 原始用例观察记录核验（v1.13 T2）：观察可选 rawTranscript{format,file}——声明即核验。
  // 内核解析观察记录（当次 runId 绑定，重放旧观察记录即失配）并逐用例与自报 actual/baselineActual
  // 交叉核验，不符 ERROR fail-closed 指名逐项分歧；核验一致后判定以观察记录为准（两源已证相等，
  // 语义上观察记录为权威记录）。requireRawTranscript:true 下缺声明 FAIL 指名（防静默，不防
  // 蓄意伪造内容一致的观察记录——解析器只保证结构与两源一致）。
  let rawTranscript;
  let missingRawTranscript;
  let authoritative=actual;
  let transcriptBaseline;
  if(result.rawTranscript!==undefined&&result.rawTranscript!==null){
   check(result.rawTranscript!==null&&typeof result.rawTranscript==='object'&&!Array.isArray(result.rawTranscript)&&Object.keys(result.rawTranscript).length===2&&result.rawTranscript.format===TRANSCRIPT_FORMAT&&text(result.rawTranscript.file),`Invalid behavior rawTranscript (expected exactly {format:${TRANSCRIPT_FORMAT}, file})`);
   const file=projectFile(root,result.rawTranscript.file);
   const transcript=parseTranscript(fs.readFileSync(file,'utf8'),{kind:'behavior'});
   check(transcript.runId===runId,'rawTranscript runId does not match this run (stale transcript)');
   // 基线声明两源一致（v1.15 T2）：观察记录承载 baseline 块时，观察 baselineSource 必须同形
   // 同值（含 git 型 file+contentSha256 内容绑定）——伪 runner 需伪造两份一致的基线声明，
   // 且内容须通过内核 git show 内容比对（evaluateBaselineSource）。
   if(transcript.baseline!==undefined){
    check(result.baselineSource!==undefined&&result.baselineSource!==null,'rawTranscript declares baseline but the observation has no baselineSource');
    const observedBaseline=normalizeBaselineSource(result.baselineSource);
    check(diff(transcript.baseline,observedBaseline).length===0,`rawTranscript baseline disagrees with observation baselineSource: transcript ${JSON.stringify(transcript.baseline)} vs observation ${JSON.stringify(observedBaseline)}`);
    transcriptBaseline=transcript.baseline;
   }
   const recorded=new Map(transcript.cases.map(c=>[c.id,c]));
   const disagreements=[];
   for(const reported of result.cases){
    const case_=recorded.get(reported.id);
    if(!case_){disagreements.push(`case ${reported.id} reported but missing from transcript`);continue;}
    if(diff(case_.actual,reported.actual).length)disagreements.push(`case ${reported.id} actual reported ${JSON.stringify(reported.actual)} but transcript says ${JSON.stringify(case_.actual)}`);
    if(Object.hasOwn(reported,'baselineActual')!==Object.hasOwn(case_,'baselineActual'))disagreements.push(`case ${reported.id} baselineActual presence disagrees with transcript`);
    else if(Object.hasOwn(case_,'baselineActual')&&diff(case_.baselineActual,reported.baselineActual).length)disagreements.push(`case ${reported.id} baselineActual reported ${JSON.stringify(reported.baselineActual)} but transcript says ${JSON.stringify(case_.baselineActual)}`);
   }
   for(const case_ of transcript.cases)if(!actual.has(case_.id))disagreements.push(`case ${case_.id} present in transcript but not reported`);
   check(disagreements.length===0,`rawTranscript disagrees with self-reported: ${disagreements.join('; ')}`);
   rawTranscript={file:result.rawTranscript.file,format:result.rawTranscript.format,caseCount:transcript.cases.length,crossCheck:'match'};
   authoritative=recorded;
  }else if(g.requireRawTranscript===true)missingRawTranscript=true;
  // 回放资产对照（v1.21 轨道 D）：归档观察记录为期望基线，当次执行逐用例对照——差异即行为
  // 漂移（replay-drift 指名路径；基线缺用例=replay-missing、当次多出=replay-extra）；基线内容
  // 与配置绑定不符即 replay-baseline-modified（基线被改动须显式重 pin）。易变字段走既有
  // ignorePaths；对照面为用例 actual 关键字段，不含 runId/基线块等包络。当次无观察记录时以
  // 自报数据对照（容忍自报，弱一档——replay.source 如实呈现）。
  let replay;
  if(g.replayBaseline!==undefined){
   const baselineContent=fs.readFileSync(projectFile(root,g.replayBaseline.file),'utf8');
   const actualSha256=createHash('sha256').update(baselineContent).digest('hex');
   if(actualSha256!==g.replayBaseline.contentSha256){
    replay={file:g.replayBaseline.file,status:'replay-baseline-modified',problem:`回放基线内容与配置绑定不符（期望 ${g.replayBaseline.contentSha256.slice(0,8)}…，实际 ${actualSha256.slice(0,8)}…）——基线被改动须显式重 pin`};
   }else{
    const baselineTranscript=parseTranscript(baselineContent,{kind:'behavior'});
    const baselineCases=new Map(baselineTranscript.cases.map(c=>[c.id,c]));
    const drift=[];
    for(const [id,base] of baselineCases){
     const currentCase=authoritative.get(id);
     if(!currentCase){drift.push({id,rule:'replay-missing',problem:'基线用例在当次执行中缺失'});continue;}
     const {differences}=filterDifferences(diff(base.actual,currentCase.actual),g.ignorePaths);
     if(differences.length)drift.push({id,rule:'replay-drift',differences});
    }
    for(const id of authoritative.keys())if(!baselineCases.has(id))drift.push({id,rule:'replay-extra',problem:'当次执行多出基线外用例'});
    replay={file:g.replayBaseline.file,contentVerified:true,source:rawTranscript?'transcript':'self-reported',...(drift.length?{status:'replay-drift',drift}:{status:'match'})};
   }
  }
  // 基线观察记录强制（v1.15 T2）：requireBaselineTranscript 下，未声明观察记录、观察记录缺基线块
  // 即 FAIL 指名（两源不一致/内容不符此前已 ERROR fail-closed）。
  const missingBaselineTranscript=g.requireBaselineTranscript===true&&(!rawTranscript||!transcriptBaseline);
  const statusOf=(expected,value)=>{const caseDifferences=diff(expected,value);const {differences,ignoredDifferences}=filterDifferences(caseDifferences,g.ignorePaths);return {differences,ignoredDifferences,status:differences.length?'fail':'pass'};};
  const cases=g.cases.map(c=>{
   const observed=authoritative.get(c.id);
   const current=statusOf(c.expected,observed.actual);
   const declared=Boolean(g.expected&&(g.expected.f2p?.includes(c.id)||g.expected.p2p?.includes(c.id)));
   const baseline=declared&&Object.hasOwn(observed,'baselineActual')?statusOf(c.expected,observed.baselineActual):null;
   return {id:c.id,expected:c.expected,actual:observed.actual,status:current.status==='pass'?'PASS':'FAIL',...(current.differences.length?{differences:current.differences}:{}),...(g.ignorePaths&&current.ignoredDifferences.length?{ignoredDifferences:current.ignoredDifferences}:{}),...(baseline?{baselineStatus:baseline.status}:{})};
  });
  let expectedViolations;
  let baseline=null;
  if(g.expected!==undefined){
   baseline=evaluateBaselineSource(g.baselineMode,result.baselineSource,root);
   expectedViolations=[];
   const caseById=new Map(cases.map(c=>[c.id,c]));
   for(const [direction,ids] of Object.entries(g.expected))for(const id of ids){
    const item=caseById.get(id);
    if(item.baselineStatus===undefined){expectedViolations.push({direction,name:id,rule:'missingBaseline'});continue;}
    const violation={direction,name:id,currentStatus:item.status==='PASS'?'pass':'fail',baselineStatus:item.baselineStatus};
    if(direction==='f2p'&&item.status==='FAIL')expectedViolations.push({...violation,rule:'f2pStillFailing'});
    else if(direction==='f2p'&&item.baselineStatus==='pass')expectedViolations.push({...violation,rule:'f2pPassedOnBaseline'});
    else if(direction==='p2p'&&item.status==='FAIL')expectedViolations.push({...violation,rule:'p2pRegressed'});
    else if(direction==='p2p'&&item.baselineStatus!=='pass')expectedViolations.push({...violation,rule:'p2pFailedOnBaseline'});
   }
  }
  const extras={...(rawTranscript?{rawTranscript}:{}),...(missingRawTranscript?{missingRawTranscript:true}:{}),...(g.requireRawTranscript!==undefined?{requireRawTranscript:g.requireRawTranscript}:{}),...(missingBaselineTranscript?{missingBaselineTranscript:true}:{}),...(g.requireBaselineTranscript!==undefined?{requireBaselineTranscript:g.requireBaselineTranscript}:{}),...(replay?{replay}:{})};
  return {status:cases.every(c=>c.status==='PASS')&&!(expectedViolations&&expectedViolations.length)&&baseline?.accepted!==false&&!missingRawTranscript&&!missingBaselineTranscript&&(!replay||replay.status==='match')?'PASS':'FAIL',details:{...execution,cases,...extras,...(baseline?{baseline}:{}),...(expectedViolations&&expectedViolations.length?{expectedViolations}:{})}};
 } catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
