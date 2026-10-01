import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const text=v=>typeof v==='string'&&v.trim().length>0,object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),check=(ok,msg)=>{if(!ok)throw new Error(msg);};
export function validateResilience(g){
 check(g.level==='L4'&&Array.isArray(g.scenarios)&&g.scenarios.length>0&&g.scenarios.length<=20&&g.scenarios.every(s=>text(s.id)&&Number.isFinite(s.maxRecoveryMs)&&s.maxRecoveryMs>=0&&text(s.expectedFinalState)&&Array.isArray(s.requiredSignals)&&s.requiredSignals.length>0&&s.requiredSignals.every(x=>['log','metric','trace','alert'].includes(x))&&(s.requiredTransitions===undefined||(Array.isArray(s.requiredTransitions)&&s.requiredTransitions.length>=2&&s.requiredTransitions.length<=8&&s.requiredTransitions.every(text)))),'Invalid resilience scenarios');
 check(new Set(g.scenarios.map(s=>s.id)).size===g.scenarios.length,'Duplicate resilience scenario');
 check(g.maxAgeDays===undefined||(Number.isInteger(g.maxAgeDays)&&g.maxAgeDays>0&&g.maxAgeDays<=3650),'Invalid maxAgeDays');
}
export function runResilience(g,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x),result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,scenarios:g.scenarios.map(s=>s.id)})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Resilience runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.scenarios),'Invalid or stale resilience observation');
  let evidenceExpired;
  if(g.maxAgeDays!==undefined){
   check(text(observed.observedAt)&&!Number.isNaN(Date.parse(observed.observedAt)),'maxAgeDays configured but observation lacks a valid observedAt');
   const ageDays=(Date.now()-Date.parse(observed.observedAt))/86400000;
   if(ageDays>g.maxAgeDays)evidenceExpired={observedAt:observed.observedAt,ageDays:Math.round(ageDays*10)/10,maxAgeDays:g.maxAgeDays};
  }
  check(observed.scenarios.every(s=>text(s.id)&&text(s.fault)&&Number.isFinite(s.recoveryMs)&&s.recoveryMs>=0&&text(s.finalState)&&object(s.signals)&&(s.transitions===undefined||Array.isArray(s.transitions)&&s.transitions.every(text)))&&new Set(observed.scenarios.map(s=>s.id)).size===observed.scenarios.length,'Invalid observed resilience scenarios');
  const byId=new Map(observed.scenarios.map(s=>[s.id,s]));const scenarios=g.scenarios.map(s=>{const a=byId.get(s.id);check(a,`Missing resilience scenario: ${s.id}`);const missingSignals=s.requiredSignals.filter(x=>!text(a.signals[x]));
   let transitionProblem;
   if(s.requiredTransitions!==undefined){
    if(a.transitions===undefined)check(false,`Scenario ${s.id} requires breaker transitions but the runner reported none`);
    if(a.transitions.join('>')!==s.requiredTransitions.join('>'))transitionProblem=`状态序列 ${a.transitions.join('>')} ≠ 期望 ${s.requiredTransitions.join('>')}`;
    else if(a.breakerEventsLogged!==true)transitionProblem='状态跳变未记录日志事件';
   }
   return {id:s.id,fault:a.fault,recoveryMs:a.recoveryMs,maxRecoveryMs:s.maxRecoveryMs,finalState:a.finalState,expectedFinalState:s.expectedFinalState,signals:a.signals,missingSignals,...(s.requiredTransitions?{requiredTransitions:s.requiredTransitions,transitions:a.transitions,breakerEventsLogged:a.breakerEventsLogged===true}:{}),...(transitionProblem?{transitionProblem}:{}),status:a.recoveryMs<=s.maxRecoveryMs&&a.finalState===s.expectedFinalState&&missingSignals.length===0&&!transitionProblem?'PASS':'FAIL'};});
  return {status:!evidenceExpired&&scenarios.every(s=>s.status==='PASS')?'PASS':'FAIL',details:{...execution,source:observed.source,...(evidenceExpired?{evidenceExpired}:{}),scenarios}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
