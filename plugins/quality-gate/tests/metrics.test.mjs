import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

function setup(t){
 const f=leanFixture(t);
 f.c.claims.push({id:'C2',statement:'Measured quality metrics meet thresholds'});
 f.c.gates.push({id:'metrics',kind:'metrics',level:'L4',enabled:true,stages:['close'],claimId:'C2',argv:['$NODE','measure.mjs'],timeoutMs:2000,thresholds:{architectureViolations:{max:0},latencyMs:{max:100}}});f.save();
 const write=(architectureViolations,latencyMs,runId='request.runId')=>fs.writeFileSync(path.join(f.root,'measure.mjs'),`let raw='';for await(const x of process.stdin)raw+=x;const request=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:${runId},source:'demo-scanner',metrics:{architectureViolations:${architectureViolations},latencyMs:${latencyMs}}}));`);
 write(0,20);
 return {...f,write};
}
test('L4 metrics compare observed values against configured thresholds',t=>{
 const f=setup(t);const e=run(f.root).evidence.find(e=>e.gateId==='metrics');
 assert.equal(e.status,'PASS');assert.equal(e.details.metrics.length,2);
});
test('architecture and performance thresholds fail with per-metric evidence',t=>{
 const f=setup(t);f.write(1,120);const e=run(f.root).evidence.find(e=>e.gateId==='metrics');
 assert.equal(e.status,'FAIL');assert.ok(e.details.metrics.every(m=>m.status==='FAIL'));
});
test('stale observations and invalid thresholds fail closed',t=>{
 const f=setup(t);f.write(0,20,"'stale'");assert.equal(run(f.root).status,'ERROR');
 f.c.gates.find(g=>g.id==='metrics').thresholds.latencyMs={max:'100'};f.save();
 assert.equal(run(f.root).status,'ERROR');
});

const architectureDemo=fileURLToPath(new URL('../examples/architecture-demo',import.meta.url));
function topologyProject(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-architecture-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(architectureDemo,root,{recursive:true});return root;}

test('architecture fitness principles pass on the declared topology',t=>{
 const result=run(topologyProject(t));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 const metrics=result.evidence[0].details.metrics;
 assert.equal(metrics.length,7);
 assert.ok(metrics.every(metric=>metric.actual===0&&metric.status==='PASS'));
});

test('each architecture principle violation fails its named metric',t=>{
 const root=topologyProject(t);
 const mutate=(from,to)=>{
  const topology=JSON.parse(fs.readFileSync(path.join(root,'topology.json'),'utf8'));
  const text=JSON.stringify(topology).replace(from,to);
  fs.writeFileSync(path.join(root,'topology.json'),text);
 };
 // 原则一：实时依赖降为单实例
 mutate('"name":"payment-db","instances":2','"name":"payment-db","instances":1');
 let evidence=run(root).evidence[0];
 assert.equal(evidence.status,'FAIL');
 assert.equal(evidence.details.metrics.find(m=>m.name==='realtimeSinglePointDependencies').actual,1);
 // 原则二：关键后台服务降为单副本（先恢复原则一）
 mutate('"name":"payment-db","instances":1','"name":"payment-db","instances":2');
 mutate('{"name":"ledger-worker","layer":"background","critical":true,"replicas":2','{"name":"ledger-worker","layer":"background","critical":true,"replicas":1');
 evidence=run(root).evidence[0];
 assert.equal(evidence.details.metrics.find(m=>m.name==='backgroundNotActiveActive').actual,1);
 // 原则三：核心服务关掉灰度（布尔最低档与结构化结论一并失效）
 mutate('{"name":"ledger-worker","layer":"background","critical":true,"replicas":1','{"name":"ledger-worker","layer":"background","critical":true,"replicas":2');
 mutate('{"name":"order-api","layer":"realtime","critical":true,"replicas":2,"canarySupported":true,"canaryAnalysis":{"verdict":"promote"','{"name":"order-api","layer":"realtime","critical":true,"replicas":2,"canarySupported":false,"canaryAnalysis":{"verdict":"inconclusive"');
 evidence=run(root).evidence[0];
 assert.equal(evidence.details.metrics.find(m=>m.name==='coreWithoutCanary').actual,1);
 // 原则四：批量任务失去重跑能力
 mutate('{"name":"order-api","layer":"realtime","critical":true,"replicas":2,"canarySupported":false,"canaryAnalysis":{"verdict":"inconclusive"','{"name":"order-api","layer":"realtime","critical":true,"replicas":2,"canarySupported":true,"canaryAnalysis":{"verdict":"promote"');
 mutate('"rerunnable":true,"parallelizable":true','"rerunnable":false,"parallelizable":true');
 evidence=run(root).evidence[0];
 assert.equal(evidence.status,'FAIL');
 assert.equal(evidence.details.metrics.find(m=>m.name==='batchNotRerunnable').actual,1);
});

test('R5 canary verdict inconclusive never counts as PASS',t=>{
 const root=topologyProject(t);
 const mutateTopology=(from,to)=>{const file=path.join(root,'topology.json');fs.writeFileSync(file,JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8'))).replace(from,to));};
 mutateTopology('"verdict":"promote"','"verdict":"inconclusive"');
 const e=run(root).evidence[0];
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.metrics.find(m=>m.name==='canaryNotPromoted').actual,1);
 assert.match(failureReasons(e).join('\n'),/canaryNotPromoted=1/);
 assert.match(e.details.stderr,/canary order-api: verdict=inconclusive/);
});

test('R5 SRM detection voids the service canary conclusions',t=>{
 const root=topologyProject(t);
 const file=path.join(root,'topology.json');
 fs.writeFileSync(file,JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8'))).replace('"sequentialMethod":"fixed-horizon"','"sequentialMethod":"fixed-horizon","srmDetected":true'));
 const e=run(root).evidence[0];
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.metrics.find(m=>m.name==='canarySrmVoided').actual,1);
 assert.equal(e.details.metrics.find(m=>m.name==='canaryNotPromoted').actual,1);
});

test('R5 promote verdict with guardrail violations is a contradiction',t=>{
 const root=topologyProject(t);
 const file=path.join(root,'topology.json');
 fs.writeFileSync(file,JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8'))).replace('"guardrailViolations":[]','"guardrailViolations":["latency-p99"]'));
 const e=run(root).evidence[0];
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.metrics.find(m=>m.name==='canaryGuardrailContradiction').actual,1);
 assert.equal(e.details.metrics.find(m=>m.name==='canaryNotPromoted').actual,1);
});
