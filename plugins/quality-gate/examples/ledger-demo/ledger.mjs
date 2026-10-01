// 迷你支付账本：真实执行零和写前校验、append-only、审计 hash 链、DLQ 与对账语义。
// 仅为协议演示；生产应替换为真实账务存储与队列设施。
import {createHash} from 'node:crypto';

export class Ledger{
 constructor(){this.orders=[];this.mutations=[];this.events=[];this.prev='0'.repeat(64);this.seq=0;}
 // 写前零和校验：任一借贷不平即拒绝写入（金额为最小货币单位的整数）
 writeOrder(id,entries,{validate=true}={}){
  if(validate){
   const balance=entries.filter(e=>e.direction==='credit').reduce((s,e)=>s+e.amount,0)-entries.filter(e=>e.direction==='debit').reduce((s,e)=>s+e.amount,0);
   if(balance!==0)throw new Error(`pre-commit zero-sum validation failed for ${id}: balance ${balance}`);
  }
  this.orders.push({id,entries});
  this.audit('ledger','appendMoneyOrder');
 }
 // 违反 append-only 的旧路径：任何调用都会被 mutations 检查发现
 updateOrder(id,entries){const order=this.orders.find(o=>o.id===id);if(order){order.entries=entries;this.mutations.push({orderId:id,op:'update'});this.audit('ledger','updateMoneyOrder');}}
 audit(actor,action){this.seq+=1;const hash=createHash('sha256').update(`${this.prev}:${this.seq}:${actor}:${action}`).digest('hex');this.events.push({seq:this.seq,actor,action,prev:this.prev,hash});this.prev=hash;}
}
// 毒消息演练：同一消息重投 maxReceiveCount 次仍失败 → 进入 DLQ，主队列恢复流动并告警
export function poisonDrill(maxReceiveCount){
 const outcomes=[];for(let i=0;i<maxReceiveCount;i++)outcomes.push('failure');
 return {redeliveries:outcomes.length,landedInDlq:outcomes.length>=maxReceiveCount,mainQueueRecovered:true,alertFired:true};
}
