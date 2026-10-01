import {randomBytes} from 'node:crypto';
const hex=n=>randomBytes(n).toString('hex');

// 零依赖分布式追踪模拟器：gateway → orders → payments 两跳调用链，按 W3C Trace Context
// 传播 traceparent；故障注入可让下游丢上下文、错挂 parentSpanId、吞掉下游调用或发出
// 畸形头。丢上下文时下游新开 traceId 并把 parentSpanId 记为零 span（无父，W3C 惯例）。
export class OrderPipeline{
 constructor(){this.pairs=[];}
 // dropContext＝接收方服务丢弃入站上下文（新开 traceId、零 parentSpan）；wrongParentSpan＝
 // 接收方续对 traceId 却错挂 parentSpanId。两者都是接收方行为，只作用于当跳。
 downstream(call,parent,header,service,{dropContext=false,wrongParentSpan=false}={}){
  const parsed=/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header);
  const context=parsed&&!dropContext?{traceId:parsed[1],parentSpanId:parsed[2]}:{traceId:hex(16),parentSpanId:'0'.repeat(16)};
  const spanId=hex(8);
  const child={service,traceId:context.traceId,spanId,parentSpanId:wrongParentSpan?hex(8):context.parentSpanId};
  this.pairs.push({call,parent,child,traceparent:header});
  return child;
 }
 run(faults=new Set()){
  const traceId=hex(16),rootSpan=hex(8),gateway={service:'gateway',traceId,spanId:rootSpan};
  const toOrders=faults.has('bad-traceparent')?'00-INVALID-HEADER-01':`00-${traceId}-${rootSpan}-01`;
  const orders=this.downstream('gateway->orders',gateway,toOrders,'orders',{dropContext:faults.has('drop-context'),wrongParentSpan:faults.has('wrong-parent-span')});
  if(!faults.has('skip-payments')){
   const toPayments=`00-${orders.traceId}-${orders.spanId}-01`;
   this.downstream('orders->payments',orders,toPayments,'payments');
  }
  return this.pairs;
 }
}
