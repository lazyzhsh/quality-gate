import {createHash} from 'node:crypto';

// 确定性结算作业：同一 seed 派生整批订单与复式分录，输出逐位可复现（R6 同 seed 双跑哈希一致）。
// 生产项目的 runs 哈希应由真实作业双跑产出；本作业证明协议与判定链路，不构成生产账务认证。
export const runSettlement=seed=>{
 let state=0x9e3779b9;
 for(const ch of seed)state=(Math.imul(state,33)^ch.codePointAt(0))>>>0;
 const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const entries=[];let debits=0,credits=0;
 const count=50+Math.floor(next()*50);
 for(let index=0;index<count;index++){
  const amount=Math.floor(next()*100000)+1;
  const fee=Math.ceil(amount*0.002);
  debits+=amount;credits+=amount-fee+fee;
  entries.push({orderId:`ORD-${String(index).padStart(4,'0')}`,amount,fee,settledAmount:amount-fee});
 }
 return {seed,entries,debits,credits};
};
export const outputOf=seed=>JSON.stringify(runSettlement(seed));
export const outputSha256=seed=>createHash('sha256').update(outputOf(seed)).digest('hex');

if(process.argv[1]&&import.meta.url===new URL(`file:///${process.argv[1].replaceAll('\\','/')}`).href){
 const seed=process.argv[2]??'fixture-2026-09-25';
 const {entries,debits,credits}=runSettlement(seed);
 console.log(JSON.stringify({seed,outputSha256:outputSha256(seed),entries:entries.length,debits,credits}));
}
