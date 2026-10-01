import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes,evidenceStrength} from '../lib/summary.mjs';

const source=fileURLToPath(new URL('../examples/consumer-matrix-demo',import.meta.url));
function project(t){
 // demo 的 observe.mjs 经 ../../../adapters/ 原位引用 consumer-usage 适配器——
 // 拷贝时保持 examples/<demo> 与 adapters/ 的相对层级（与插件树/解包交付同构）。
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-consumer-matrix-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(source,path.join(root,'examples','consumer-matrix-demo'),{recursive:true});
 fs.cpSync(path.resolve(source,'..','..','adapters','consumer-usage'),path.join(root,'adapters','consumer-usage'),{recursive:true});
 const demo=path.join(root,'examples','consumer-matrix-demo');
 fs.rmSync(path.join(demo,'.quality-gate'),{recursive:true,force:true});
 return demo;
}
const gate=result=>result.evidence.find(evidence=>evidence.gateId==='api-matrix');
const configOf=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const saveConfig=(root,config)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
const readJson=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const writeJson=(root,file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,1));
const providerOf=root=>readJson(root,'provider/openapi.json');

test('compatible provider passes with per-consumer matrix, fingerprint anchor and usage sources',t=>{
 const root=project(t);
 const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(gate(result),null,1));
 const details=gate(result).details;
 assert.deepEqual(details.matrix,[
  {consumer:'orders-web',compatibilityLevel:'backward',status:'compatible',breakingCount:0,ignoredCount:0,usageSource:'contract-test',usageItemCount:4},
  {consumer:'settlement-batch',compatibilityLevel:'backward',status:'compatible',breakingCount:0,ignoredCount:0,usageSource:'declared',usageItemCount:2},
  {consumer:'orders-cli',compatibilityLevel:'backward',status:'compatible',breakingCount:0,ignoredCount:0,usageSource:'scanned',usageItemCount:1}
 ]);
 assert.deepEqual(details.attribution,[]);
 assert.equal(details.usageFindings,undefined);
 assert.equal(details.sourceFingerprint.status,'VERIFIED');
 assert.equal(details.observationMode,'static');
 // 降级标注：static 观察 + declared 使用面（PASS 也显示）
 const notes=downgradeNotes(result);
 assert.ok(notes.some(note=>note.includes('静态读取')&&note.includes('api-matrix')));
 assert.ok(notes.some(note=>note.includes('settlement-batch 使用面为 declared')));
});

test('provider type change breaks the depending consumer only, with attribution',t=>{
 const root=project(t);
 const provider=providerOf(root);
 provider.paths['/payments'].post.requestBody.content['application/json'].schema.properties.amount.type='string';
 writeJson(root,'provider/openapi.json',provider);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const details=gate(result).details;
 assert.equal(details.matrix.find(row=>row.consumer==='orders-web').status,'broken');
 assert.equal(details.matrix.find(row=>row.consumer==='settlement-batch').status,'compatible');
 assert.equal(details.attribution.length,1);
 assert.equal(details.attribution[0].rule,'typeChanged');
 assert.deepEqual(details.attribution[0].brokenConsumers,['orders-web']);
 assert.equal(details.attribution[0].expected,'integer');
 assert.equal(details.attribution[0].actual,'string');
 const reasons=failureReasons(gate(result));
 assert.ok(reasons.some(reason=>reason.includes('orders-web: POST /payments amount 类型变更（期望 integer，实际 string）')),JSON.stringify(reasons));
});

test('removed endpoint breaks its consumer with missingEndpoint',t=>{
 const root=project(t);
 const provider=providerOf(root);
 delete provider.paths['/refunds'];
 writeJson(root,'provider/openapi.json',provider);
 const result=run(root);
 const details=gate(result).details;
 assert.equal(details.matrix.find(row=>row.consumer==='settlement-batch').status,'broken');
 assert.equal(details.matrix.find(row=>row.consumer==='orders-web').status,'compatible');
 assert.equal(details.attribution[0].rule,'missingEndpoint');
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('settlement-batch: POST /refunds 端点缺失')));
});

test('compatibilityLevel exact flags extra provider fields on expected endpoints',t=>{
 const root=project(t);
 const provider=providerOf(root);
 provider.paths['/payments'].post.requestBody.content['application/json'].schema.properties.idempotencyKey={type:'string'};
 writeJson(root,'provider/openapi.json',provider);
 const config=configOf(root);
 config.gates[0].consumers.find(consumer=>consumer.id==='orders-web').compatibilityLevel='exact';
 saveConfig(root,config);
 const result=run(root);
 const details=gate(result).details;
 assert.equal(details.attribution[0].rule,'unexpectedField');
 assert.equal(details.attribution[0].field,'idempotencyKey');
 assert.equal(details.matrix.find(row=>row.consumer==='settlement-batch').status,'compatible');
});

test('declared usage beyond expectation fails named (stale expectation is not silent)',t=>{
 const root=project(t);
 // settlement-batch 期望删掉 reason 字段，而其自报使用面仍在使用它——期望过期必须显式失败
 //（v1.15 起 contract-test 来源也携带字段级使用面，字段级越界使用另测）
 const expectation=readJson(root,'consumers/settlement-batch.json');
 delete expectation.items[0].fields.reason;
 writeJson(root,'consumers/settlement-batch.json',expectation);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const details=gate(result).details;
 assert.equal(details.usageFindings.length,1);
 assert.deepEqual(details.usageFindings[0],{consumer:'settlement-batch',path:'/refunds',method:'POST',field:'reason'});
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('settlement-batch: 使用面超出声明期望 POST /refunds reason')));
});

test('contract-test field usage beyond expectation fails named (v1.15 field-level usage)',t=>{
 const root=project(t);
 // Pact 请求 body 派生的字段级使用面（refundFirst）超出期望声明的字段集——contract-test
 // 来源的字段级越界使用同样 FAIL"期望文件已过期"
 const expectation=readJson(root,'consumers/orders-web.json');
 delete expectation.items[0].fields.refundFirst;
 writeJson(root,'consumers/orders-web.json',expectation);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const finding=gate(result).details.usageFindings.find(item=>item.consumer==='orders-web'&&item.field==='refundFirst');
 assert.deepEqual(finding,{consumer:'orders-web',path:'/payments',method:'POST',field:'refundFirst'});
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('orders-web: 使用面超出声明期望 POST /payments refundFirst')));
});

test('ignoreRoutes exempts declared route patterns but keeps them as evidence',t=>{
 const root=project(t);
 const provider=providerOf(root);
 delete provider.paths['/refunds'];
 writeJson(root,'provider/openapi.json',provider);
 const config=configOf(root);
 config.gates[0].ignoreRoutes=['/refunds'];
 saveConfig(root,config);
 const result=run(root);
 assert.equal(result.status,'PASS');
 const details=gate(result).details;
 assert.equal(details.matrix.find(row=>row.consumer==='settlement-batch').status,'compatible');
 assert.equal(details.matrix.find(row=>row.consumer==='settlement-batch').ignoredCount,1);
 assert.equal(details.ignoredBreaking.length,1);
 assert.equal(details.ignoredBreaking[0].rule,'missingEndpoint');
});

test('requireLive rejects static observation',t=>{
 const root=project(t);
 const config=configOf(root);
 config.gates[0].requireLive=true;
 saveConfig(root,config);
 const result=run(root);
 assert.equal(gate(result).status,'FAIL');
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('静态读取（requireLive）')));
});

test('malformed inputs fail closed',t=>{
 const root=project(t);
 // 期望文件 consumer 绑定不符（文件装载在 runner 之前，内核分派层 ERROR——details 为消息字符串）
 const expectation=readJson(root,'consumers/orders-web.json');
 expectation.consumer='someone-else';
 writeJson(root,'consumers/orders-web.json',expectation);
 assert.match(String(gate(run(root)).details),/must bind consumer id/);
 // 期望文件为空 items（validateItems 拒绝）
 writeJson(root,'consumers/orders-web.json',{schemaVersion:'0.1',kind:'consumer-matrix',consumer:'orders-web',items:[]});
 assert.match(String(gate(run(root)).details),/Invalid consumer orders-web items/);
 // 非法 usage 枚举（先恢复合法期望文件，使错误来自观察层）
 writeJson(root,'consumers/orders-web.json',{schemaVersion:'0.1',kind:'consumer-matrix',consumer:'orders-web',items:[{path:'/payments',method:'POST',fields:{amount:'integer',currency:'string'}}]});
 const observe=path.join(root,'scripts','observe.mjs');
 const runner=fs.readFileSync(observe,'utf8');
 fs.writeFileSync(observe,runner.replace("usage:'declared'","usage:'guessed'"));
 assert.match(gate(run(root)).details.error,/Invalid consumerUsage/);
 // 非法 compatibilityLevel / requireLive 类型（validate 层，运行级 ERROR）
 const config=configOf(root);
 config.gates[0].consumers[0].compatibilityLevel='sideways';
 saveConfig(root,config);
 const broken=run(root);
 assert.equal(broken.status,'ERROR');
 assert.match(broken.error,/consumer-matrix requires/);
});
