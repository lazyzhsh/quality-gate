import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {createHash} from 'node:crypto';
import {failureReasons,downgradeNotes} from '../lib/summary.mjs';

const source=fileURLToPath(new URL('../examples/alignment-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-alignment-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}

test('live HTTP contract and actual migrated SQLite schema align',t=>{
 const root=project(t);const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 assert.deepEqual(result.evidence.map(e=>e.status),['PASS','PASS']);
 assert.equal(result.evidence[0].details.source,'live-http:api-server.mjs');
 assert.equal(result.evidence[1].details.source,'sqlite:PRAGMA table_info(orders)');
});

test('API and database schema drift produce exact JSON paths',t=>{
 const root=project(t);
 const api=path.join(root,'api-server.mjs');fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("path:'/quote'","path:'/quotes'"));
 let result=run(root);assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.differences.map(x=>x.path),['/items/0/path']);
 fs.writeFileSync(api,fs.readFileSync(api,'utf8').replace("path:'/quotes'","path:'/quote'"));
 const schema=path.join(root,'migration.sql');fs.writeFileSync(schema,fs.readFileSync(schema,'utf8').replace('amount_minor INTEGER','amount_minor TEXT'));
 result=run(root);assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[1].details.differences.map(x=>x.path),['/items/0/columns/1/type']);
});

test('stale alignment observation is an error',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'api-observe.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",kind:"api",source:"fake",items:[]}));');
 const result=run(root);assert.equal(result.status,'ERROR');assert.equal(result.evidence[0].status,'ERROR');
});

test('declared ignorePaths suppress volatile drift and record what was ignored',t=>{
 const root=project(t);
 const details=run(root).evidence[0].details;
 assert.deepEqual(details.ignoredDifferences.map(x=>x.path),['/items/0/serverTime']);
 assert.deepEqual(details.ignorePaths,['/items/*/serverTime']);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 delete config.gates[0].ignorePaths;
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.differences.map(x=>x.path),['/items/0/serverTime']);
});

test('observation mode: static downgrades in summary and fails under requireLive',t=>{
 const root=project(t);
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const apiGate=config.gates.find(gate=>gate.kind==='alignment'&&gate.scope==='api');
 const originalArgv=[...apiGate.argv];
 // 静态读取型观察（未发真实请求）：默认放行并在摘要降级标注
 apiGate.argv=['$NODE','static-observe.mjs'];fs.writeFileSync(configPath,JSON.stringify(config));
 fs.writeFileSync(path.join(root,'static-observe.mjs'),'let raw="";for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:"0.1",runId:r.runId,kind:"api",source:"static-file-read",mode:"static",items:[{method:"POST",path:"/quote",requestFields:["amount","currency"],responseStatus:200,responseFields:["decision","fee"]}]}));');
 let result=run(root);
 assert.equal(result.evidence[0].status,'PASS');
 assert.equal(result.evidence[0].details.observationMode,'static');
 assert.ok(downgradeNotes(result).some(note=>note.includes('观察为静态读取')),JSON.stringify(downgradeNotes(result)));
 // requireLive 开启：static 即 FAIL 指名
 apiGate.requireLive=true;fs.writeFileSync(configPath,JSON.stringify(config));
 result=run(root);
 assert.equal(result.evidence[0].status,'FAIL');
 assert.deepEqual(failureReasons(result.evidence[0]),['观察为静态读取（requireLive）']);
 // live 观察在 requireLive 下通过
 apiGate.argv=originalArgv;fs.writeFileSync(configPath,JSON.stringify(config));
 result=run(root);
 assert.equal(result.evidence[0].status,'PASS');
 // 畸形 mode 值 fail-closed
 apiGate.argv=['$NODE','static-observe.mjs'];fs.writeFileSync(configPath,JSON.stringify(config));
 fs.writeFileSync(path.join(root,'static-observe.mjs'),'let raw="";for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:"0.1",runId:r.runId,kind:"api",source:"static-file-read",mode:"replay",items:[{method:"POST",path:"/quote",requestFields:["amount","currency"],responseStatus:200,responseFields:["decision","fee"]}]}));');
 assert.equal(run(root).evidence[0].status,'ERROR');
 // requireLive 非布尔 → 配置 ERROR
 apiGate.argv=originalArgv;apiGate.requireLive='yes';fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});

test('observation sourceFingerprint binds the observation to a project artifact',t=>{
 const root=project(t);
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const apiGate=config.gates.find(gate=>gate.kind==='alignment'&&gate.scope==='api');
 const sha=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 const runnerPath=path.join(root,'api-observe.mjs');
 const original=fs.readFileSync(runnerPath,'utf8');
 const inject=(fingerprint,keepOriginal)=>("const fingerprint="+JSON.stringify(fingerprint)+";console.log(JSON.stringify({schemaVersion:'0.1'")
  +"".concat(keepOriginal?"":",runId:request.runId");
 const withFingerprint=file=>original
  .replace("console.log(JSON.stringify({schemaVersion:'0.1'",inject({file,sha256:sha(file)},false))
  .replace("kind:'api',source:'live-http:api-server.mjs'","kind:'api',source:'live-http:api-server.mjs',sourceFingerprint:fingerprint");
 // 未声明指纹：默认放行（details 无 sourceFingerprint）
 let result=run(root);
 assert.equal(result.evidence[0].status,'PASS');
 assert.equal(result.evidence[0].details.sourceFingerprint,undefined);
 // requireSourceFingerprint 而未声明 → FAIL 指名
 apiGate.requireSourceFingerprint=true;fs.writeFileSync(configPath,JSON.stringify(config));
 result=run(root);
 assert.equal(result.evidence[0].status,'FAIL');
 assert.equal(result.evidence[0].details.missingSourceFingerprint,true);
 assert.deepEqual(failureReasons(result.evidence[0]),['观察缺少来源指纹（requireSourceFingerprint）']);
 // 声明正确指纹 → PASS 且 VERIFIED
 fs.writeFileSync(runnerPath,withFingerprint('api-server.mjs'));
 result=run(root);
 assert.equal(result.evidence[0].status,'PASS',JSON.stringify(result.evidence[0].details).slice(0,400));
 assert.equal(result.evidence[0].details.sourceFingerprint.status,'VERIFIED');
 // 哈希不符 → FAIL 指名
 fs.writeFileSync(runnerPath,original
  .replace("console.log(JSON.stringify({schemaVersion:'0.1'",inject({file:'api-server.mjs',sha256:'0'.repeat(64)},false))
  .replace("kind:'api',source:'live-http:api-server.mjs'","kind:'api',source:'live-http:api-server.mjs',sourceFingerprint:fingerprint"));
 result=run(root);
 assert.equal(result.evidence[0].status,'FAIL');
 assert.equal(result.evidence[0].details.sourceFingerprint.status,'MISMATCH');
 assert.deepEqual(failureReasons(result.evidence[0]),['观察来源指纹不符: api-server.mjs']);
 // 畸形指纹（非 64hex）与逃逸路径 → ERROR；requireSourceFingerprint 非布尔 → 配置 ERROR
 fs.writeFileSync(runnerPath,original
  .replace("console.log(JSON.stringify({schemaVersion:'0.1'",inject({file:'api-server.mjs',sha256:'nothex'},false))
  .replace("kind:'api',source:'live-http:api-server.mjs'","kind:'api',source:'live-http:api-server.mjs',sourceFingerprint:fingerprint"));
 assert.equal(run(root).evidence[0].status,'ERROR');
 fs.writeFileSync(runnerPath,original
  .replace("console.log(JSON.stringify({schemaVersion:'0.1'",inject({file:'../outside.mjs',sha256:'0'.repeat(64)},false))
  .replace("kind:'api',source:'live-http:api-server.mjs'","kind:'api',source:'live-http:api-server.mjs',sourceFingerprint:fingerprint"));
 assert.equal(run(root).evidence[0].status,'ERROR');
 fs.writeFileSync(runnerPath,original);
 apiGate.requireSourceFingerprint='yes';fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});
