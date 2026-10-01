import fs from 'node:fs';
// 架构适应度 runner：从声明的服务拓扑推导四项原则的违背数与灰度判定协议（R5）指标。
// 生产项目应改为从真实依赖图/编排清单与分析作业读取，指标定义保持不变。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const {services}=JSON.parse(fs.readFileSync('topology.json','utf8'));
const canary=s=>{
 const analysis=s.canaryAnalysis;
 if(!analysis)return {satisfied:s.canarySupported===true,structured:false};
 // R5：SRM 检出（序贯检验多次窥视）作废该服务全部灰度指标结论；inconclusive/marginal 不计 PASS
 const voided=analysis.srmDetected===true;
 const effectiveVerdict=voided?'inconclusive':analysis.verdict;
 const promoteOk=effectiveVerdict==='promote'&&Array.isArray(analysis.guardrailViolations)&&analysis.guardrailViolations.length===0;
 if(!promoteOk)console.error(`canary ${s.name}: verdict=${effectiveVerdict} guardrails=${(analysis.guardrailViolations??[]).length} srm=${voided}`);
 return {satisfied:promoteOk,structured:true,voided,contradiction:analysis.verdict==='promote'&&Array.isArray(analysis.guardrailViolations)&&analysis.guardrailViolations.length>0};
};
const canaryState=services.filter(s=>s.critical&&['realtime','background'].includes(s.layer)).map(s=>({name:s.name,...canary(s)}));
const metrics={
 // 原则一：实时链路不允许单点依赖（关键依赖实例数 >= 2）
 realtimeSinglePointDependencies:services.filter(s=>s.layer==='realtime').flatMap(s=>s.dependencies.filter(d=>d.instances<2).map(d=>`${s.name}->${d.name}`)).length,
 // 原则二：关键后台服务平等多活（副本 >= 2）
 backgroundNotActiveActive:services.filter(s=>s.layer==='background'&&s.critical&&s.replicas<2).length,
 // 原则三：核心链路服务支持并跑试算或灰度（布尔最低档或结构化 promote）
 coreWithoutCanary:canaryState.filter(s=>!s.satisfied).length,
 // 原则四：批量任务支持重跑并跑
 batchNotRerunnable:services.filter(s=>s.layer==='batch'&&!(s.rerunnable&&s.parallelizable)).length,
 // R5 灰度判定协议：结构化结论非 promote（含被 SRM 作废）即违背——inconclusive/marginal 不计 PASS
 canaryNotPromoted:canaryState.filter(s=>s.structured&&!s.satisfied).length,
 // promote 结论却带 guardrail 违背 = 自相矛盾的证据
 canaryGuardrailContradiction:canaryState.filter(s=>s.contradiction).length,
 // SRM 检出（多次窥视）作废该服务灰度结论
 canarySrmVoided:canaryState.filter(s=>s.voided).length
};
const now=new Date().toISOString();
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'architecture-demo/topology.json',observedAt:now,provenance:{source:'declared',tool:'topology.json',generatedAt:now},metrics}));
