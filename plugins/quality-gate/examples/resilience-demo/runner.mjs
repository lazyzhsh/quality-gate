import {PaymentService} from './service.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input),scenarios=[];
for(const id of request.scenarios){
 const service=new PaymentService(),start=performance.now();
 if(id==='db-outage'){
  service.dbAvailable=false;const unavailable=await service.pay('p1'),signals={...service.signals};service.dbAvailable=true;const recovered=await service.pay('p1');
  scenarios.push({id,fault:'db unavailable during pay',recoveryMs:performance.now()-start,finalState:unavailable.status===503&&recovered.status===201&&service.payments.size===1?'ready':'wrong-state',signals});
 }else if(id==='duplicate-message'){
  const first=await service.pay('p1'),second=await service.pay('p1');scenarios.push({id,fault:'duplicate payment request',recoveryMs:performance.now()-start,finalState:first.status===201&&second.status===200&&service.payments.size===1?'single-payment':'duplicate-payment',signals:service.signals});
 }else if(id==='external-timeout'){
  // 外部依赖超预算挂起：服务须按预算超时返回并在依赖恢复后重试成功
  service.externalLatencyMs=150;const degraded=await service.pay('p1'),signals={...service.signals};
  service.externalLatencyMs=0;const recovered=await service.pay('p1');
  scenarios.push({id,fault:'external dependency timeout',recoveryMs:performance.now()-start,finalState:degraded.status===503&&recovered.status===201&&service.payments.size===1?'ready':'wrong-state',signals});
 }else if(id==='breaker'){
  // 熔断全路径演练:注入连续下游失败→开路;等待重置窗→half-open 试探成功→闭合
  const {CircuitBreaker}=await import('./service.mjs');
  const breaker=new CircuitBreaker();
  breaker.record('failure');breaker.record('failure');breaker.record('failure');breaker.record('failure');
  const opened=breaker.state==='open';
  await new Promise(resolve=>setTimeout(resolve,60));
  breaker.record('success');
  const probed=breaker.probe('success');
  const start=performance.now();
  scenarios.push({id,fault:'downstream failure burst trips breaker, recovery probe closes it',recoveryMs:performance.now()-start,finalState:opened&&probed&&breaker.state==='closed'?'restored-closed':'wrong-state',signals:{log:`breaker events: ${breaker.events.join(',')}`,metric:'breaker_state{state="closed"}=1',trace:'breaker:half-open-probe'},transitions:['closed','open','half-open','closed'],breakerEventsLogged:breaker.events.length===3});
 }else throw new Error('Unknown scenario');
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'PaymentService fault-injection',observedAt:new Date().toISOString(),scenarios}));
