import {test} from 'node:test';import assert from 'node:assert/strict';import {validate} from '../lib/kernel.mjs';
// v1.21.1 预算上限上调（40000→60000）：自举驱动——框架自身回归套件 575 项在环境交互负载下
// 墙钟超 40s（诊断记录见 PLAN 未了事项 2026-10-01）。宿主 Stop Hook 预算 55s 属适配器层
// 约束（hooks/hooks.json），与本内核上限分层。
const commandGate=(id,timeoutMs)=>({id,kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'CL-1',argv:['$NODE','-e','process.exit(0)'],timeoutMs});
const config=gates=>({schemaVersion:'0.2',claims:[{id:'CL-1',statement:'s'}],gates,risks:[],exceptions:[]});

test('per-gate timeoutMs accepts 60000 and rejects beyond',()=>{
 assert.doesNotThrow(()=>validate(config([commandGate('g1',60000)])));
 assert.throws(()=>validate(config([commandGate('g1',60001)])),/timeoutMs must be 1\.\.60000/);
});

test('stage budget sums all enabled gates up to 60000',()=>{
 assert.doesNotThrow(()=>validate(config([commandGate('g1',30000),commandGate('g2',30000)])));
 assert.throws(()=>validate(config([commandGate('g1',30001),commandGate('g2',30000)])),/Stage execution budget exceeds 60000ms/);
 // 禁用门禁不计入预算（既有语义回归锚）
 const disabled=commandGate('g2',30000);disabled.enabled=false;
 assert.doesNotThrow(()=>validate(config([commandGate('g1',30000),disabled])));
});

test('sub-check gates follow the raised gate-level ceiling',()=>{
 const base={id:'eng',kind:'engineering',level:'L1',enabled:true,stages:['close'],claimId:'CL-1',timeoutMs:60000,argv:['$NODE','-e','0'],requiredChecks:['static'],checks:[{id:'static',type:'exit',argv:['$NODE','-e','0'],timeoutMs:20000}]};
 assert.doesNotThrow(()=>validate(config([base])));
 assert.throws(()=>validate(config([{...base,timeoutMs:60001}])),/Invalid engineering timeout budget/);
});
