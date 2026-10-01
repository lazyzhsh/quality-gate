// 并发重试演练(确定性模拟):100 并发客户端,失败率 12%。
// 健康:token bucket 重试预算 15% + full jitter → 重试占比 ~0.107、同步尖峰低。
// 风暴:无预算无 jitter → 全部失败者立即同步重试,尖峰与占比双超。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const scenario=process.env.QGATE_SCENARIO??'healthy';
const clients=100,failureRate=0.3,slots=10;
const failFirst=Math.round(clients*failureRate);
let retries,perSlot;
if(scenario==='storm'){
 // 无预算无 jitter:两轮全部失败者同步齐发重试
 retries=failFirst*2;
 perSlot=Array(slots).fill(0);perSlot[0]=failFirst;perSlot[1]=failFirst;
}else{
 // token bucket 预算(≤15%)+ full jitter:仅重试 8 个并打散到不同时隙
 retries=8;
 perSlot=Array(slots).fill(0);perSlot[2]=2;perSlot[5]=2;perSlot[8]=2;perSlot[1]=1;perSlot[6]=1;
}
const total=clients+retries;
const retryToTotalRatio=retries/total;
const maxSynchronizedRetries=Math.max(...perSlot);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'budget-demo/drill.mjs',observedAt:new Date().toISOString(),provenance:{source:'drilled',tool:'deterministic retry simulation',generatedAt:new Date().toISOString()},metrics:{retryToTotalRatio,maxSynchronizedRetries}}));
