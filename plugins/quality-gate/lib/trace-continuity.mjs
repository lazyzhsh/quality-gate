import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const text=v=>typeof v==='string'&&v.trim().length>0,object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),check=(ok,msg)=>{if(!ok)throw new Error(msg);};
// W3C Trace Context 传播头：version(2)-traceId(32)-spanId(16)-flags(2)，小写十六进制
const TRACEPARENT=/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export function validateTraceContinuity(g){
 check(g.level==='L4','trace-continuity requires L4');
 check(Array.isArray(g.links)&&g.links.length>0&&g.links.length<=40&&g.links.every(text),'Invalid trace-continuity links');
 check(new Set(g.links).size===g.links.length,'Duplicate trace-continuity link');
 check(g.requireTraceparent===undefined||typeof g.requireTraceparent==='boolean','Invalid requireTraceparent');
}

// trace 贯通核验（轨道 D，v0.9 §44.1）：resilience 核验信号存在性，本 kind 核验贯通性——
// 每个声明调用对 child 与 parent 同 traceId、child.parentSpanId 与 parent.spanId 衔接、
// traceparent（回报即在）符合 W3C 格式且与两端一致。问题逐项收集（畸形头现实中同时引发
// 新开 traceId，只报首中会掩盖另一半）。内核只对账 runner 回报的传播对，不采集流量、
// 不做 APM（生产 OpenTelemetry 接入属项目工程）。
export function runTraceContinuity(g,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x),result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,links:g.links})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Trace continuity runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&Array.isArray(observed.propagation),'Invalid or stale trace-continuity observation');
  check(observed.propagation.every(p=>object(p)&&text(p.call)&&object(p.parent)&&text(p.parent.traceId)&&/^[0-9a-f]{32}$/.test(p.parent.traceId)&&text(p.parent.spanId)&&/^[0-9a-f]{16}$/.test(p.parent.spanId)&&object(p.child)&&text(p.child.traceId)&&/^[0-9a-f]{32}$/.test(p.child.traceId)&&text(p.child.spanId)&&/^[0-9a-f]{16}$/.test(p.child.spanId)&&text(p.child.parentSpanId)&&/^[0-9a-f]{16}$/.test(p.child.parentSpanId)&&(p.parent.service===undefined||text(p.parent.service))&&(p.child.service===undefined||text(p.child.service))&&(p.traceparent===undefined||text(p.traceparent)))&&new Set(observed.propagation.map(p=>p.call)).size===observed.propagation.length,'Invalid observed propagation pairs');
  const byCall=new Map(observed.propagation.map(p=>[p.call,p]));
  const links=g.links.map(call=>{
   const pair=byCall.get(call);
   if(!pair)return {call,status:'FAIL',problems:[{rule:'missing-link',problem:'调用对无传播记录（child 缺失）——runner 未回报该跨服务调用的两端 span'}]};
   const problems=[];
   if(pair.parent.traceId!==pair.child.traceId)problems.push({rule:'trace-id-discontinuity',problem:`child 新开 traceId（parent ${pair.parent.traceId} ≠ child ${pair.child.traceId}）`});
   if(pair.child.parentSpanId!==pair.parent.spanId)problems.push({rule:'span-id-mismatch',problem:`id 不匹配（child.parentSpanId ${pair.child.parentSpanId} ≠ parent.spanId ${pair.parent.spanId}）`});
   if(g.requireTraceparent===true&&pair.traceparent===undefined)problems.push({rule:'missing-traceparent',problem:'requireTraceparent 声明下传播对缺少 traceparent 头'});
   if(pair.traceparent!==undefined){
    const parsed=TRACEPARENT.exec(pair.traceparent);
    if(!parsed)problems.push({rule:'invalid-traceparent',problem:`traceparent 不符合 W3C 传播格式: ${pair.traceparent}`});
    else if(parsed[1]!==pair.parent.traceId||parsed[2]!==pair.parent.spanId)problems.push({rule:'traceparent-mismatch',problem:`traceparent 与两端不一致（头携带 ${parsed[1]}/${parsed[2]}，parent 实际 ${pair.parent.traceId}/${pair.parent.spanId}）`});
   }
   return {call,parent:{service:pair.parent.service,traceId:pair.parent.traceId,spanId:pair.parent.spanId},child:{service:pair.child.service,traceId:pair.child.traceId,spanId:pair.child.spanId,parentSpanId:pair.child.parentSpanId},...(pair.traceparent!==undefined?{traceparent:pair.traceparent}:{}),...(problems.length?{problems}:{}),status:problems.length?'FAIL':'PASS'};
  });
  // 未声明的回报记录进审计面不判 FAIL：核验面由声明调用对决定（与观察输入口双向对账的裁量不同）
  const extraLinks=observed.propagation.map(p=>p.call).filter(call=>!g.links.includes(call));
  return {status:links.every(link=>link.status==='PASS')?'PASS':'FAIL',details:{...execution,source:observed.source,links,extraLinks,...(g.requireTraceparent!==undefined?{requireTraceparent:g.requireTraceparent}:{})}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
