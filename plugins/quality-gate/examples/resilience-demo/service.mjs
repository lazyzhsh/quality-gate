export class PaymentService{
 constructor(){this.dbAvailable=true;this.externalLatencyMs=0;this.payments=new Set();this.signals={};}
 async checkExternal(id){
  const budget=100;
  const started=Date.now();
  await new Promise(resolve=>setTimeout(resolve,this.externalLatencyMs));
  if(Date.now()-started>budget){
   this.signals={log:'external check timeout',metric:'external_timeout_total=1',trace:`pay:${id}:external-timeout`};
   return {status:504};
  }
  return {status:200};
 }
 async pay(id){
  const external=await this.checkExternal(id);
  if(external.status===504)return {status:503};
  if(!this.dbAvailable){this.signals={log:'db unavailable',metric:'db_error_total=1',trace:`pay:${id}:db-error`,alert:'db unavailable alert'};return {status:503};}
  if(this.payments.has(id)){this.signals={log:'duplicate suppressed',metric:'duplicate_total=1',trace:`pay:${id}:duplicate`};return {status:200};}
  this.payments.add(id);return {status:201};
 }
}

// 熔断状态机:closed→open(失败率超阈)→half-open(重置超时后单试探)→closed/reopen。
// 每次状态跳变记录日志事件(演练证据要求 breakerEventsLogged)。
export class CircuitBreaker{
 constructor({failureThreshold=0.5,minimumCalls=4,resetMs=50}={}){
  this.state='closed';this.failures=0;this.calls=0;this.resetMs=resetMs;this.failureThreshold=failureThreshold;this.minimumCalls=minimumCalls;this.events=[];this.openedAt=0;
 }
 log(from,to){this.events.push(`${from}->${to}`);}
 record(outcome){
  const before=this.state;
  this.calls++;
  if(outcome==='failure')this.failures++;
  if(this.state==='closed'&&this.calls>=this.minimumCalls&&this.failures/this.calls>=this.failureThreshold){this.state='open';this.openedAt=Date.now();this.log(before,this.state);}
  if(this.state==='open'&&Date.now()-this.openedAt>=this.resetMs){this.state='half-open';this.log(before,this.state);}
 }
 probe(outcome){
  const before=this.state;
  if(this.state!=='half-open')return false;
  this.state=outcome==='success'?'closed':'open';
  if(this.state==='open')this.openedAt=Date.now();
  this.log(before,this.state);
  return true;
 }
}
