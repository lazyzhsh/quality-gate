import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes} from '../lib/summary.mjs';
import {project,gate,check,focusConsistency} from './consistency-helpers.mjs';


test('malformed consistency observation fails closed',t=>{
 const root=project(t);
 focusConsistency(root,null,{contract:false});
 fs.writeFileSync(path.join(root,'check.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"stale",source:"fake"}));');
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.ok(gate(result).details.checks.every(c=>c.status==='ERROR'));
});

test('contract-diff passes additive change and blocks breaking change by path',t=>{
 const root=project(t,'healthy',{consistency:false});
 let result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='contract-compat').status,'PASS');
 process.env.QGATE_SCENARIO='breaking';
 result=run(root);
 const gate=result.evidence.find(e=>e.gateId==='contract-compat');
 assert.equal(gate.status,'FAIL');
 assert.deepEqual(gate.details.breakingChanges.map(change=>change.path).sort(),['transfer.amount','transfer.reference']);
 assert.ok(failureReasons(gate).includes('破坏性变更: transfer.reference removedField'));
 delete process.env.QGATE_SCENARIO;
});
test('contract-diff without a performed check fails closed',t=>{
 const root=project(t);
 focusConsistency(root,null,{consistency:false});
 fs.writeFileSync(path.join(root,'contract-diff.mjs'),fs.readFileSync(path.join(root,'contract-diff.mjs'),'utf8').replace('checked:true','checked:false'));
 const result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='contract-compat').status,'ERROR');
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 delete config.gates.find(g=>g.id==='contract-compat').compatibilityLevel;
 fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});

test('every consistency check must be required or explicitly excluded with a reason',t=>{
 const root=project(t);
 focusConsistency(root,null,{contract:false});
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const gateSpec=config.gates.find(item=>item.id==='ledger-consistency');
 gateSpec.requiredChecks=gateSpec.requiredChecks.filter(id=>id!=='audit');
 fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
 gateSpec.excludedChecks=[{id:'audit',reason:'audit pipeline vendor migration in progress'}];
 fs.writeFileSync(configPath,JSON.stringify(config));
 const result=run(root);
 assert.equal(result.status,'PASS');
 assert.equal(check(result,'audit').status,'PASS');
 gateSpec.excludedChecks=[{id:'audit'}];
 fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
 gateSpec.excludedChecks=[{id:'unknown',reason:'not a check'}];
 fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});

test('append-only sourceType is mandatory, enumerated and enforceable',t=>{
 const root=project(t);
 focusConsistency(root,['mutations'],{contract:false});
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const gateSpec=config.gates.find(item=>item.id==='ledger-consistency');
 const mutationsCheck=gateSpec.checks.find(check=>check.type==='append-only');
 // demo 如实回报 declared：默认接受列表全收 → PASS，摘要降级标注
 let result=run(root);
 assert.equal(check(result,'mutations').status,'PASS');
 assert.equal(check(result,'mutations').sourceType,'declared');
 assert.ok(downgradeNotes(result).some(note=>note.includes('append-only 来源为 declared')),JSON.stringify(downgradeNotes(result)));
 // 收紧接受列表为真实日志类型：declared 不在列表 → FAIL 指名
 mutationsCheck.acceptedSourceTypes=['binlog','wal'];fs.writeFileSync(configPath,JSON.stringify(config));
 result=run(root);
 assert.equal(check(result,'mutations').status,'FAIL');
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('append-only 来源 declared 不在接受列表 [binlog/wal]')),JSON.stringify(failureReasons(gate(result))));
 // binlog 观察被接受；缺失 sourceType → ERROR；未知枚举 → ERROR
 mutationsCheck.argv=['$NODE','binlog-observe.mjs'];fs.writeFileSync(configPath,JSON.stringify(config));
 fs.writeFileSync(path.join(root,'binlog-observe.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'binlog-observe',mutations:[],sourceType:'binlog'}));");
 result=run(root);
 assert.equal(check(result,'mutations').status,'PASS');
 assert.equal(check(result,'mutations').sourceAccepted,true);
 fs.writeFileSync(path.join(root,'binlog-observe.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'binlog-observe',mutations:[]}));");
 assert.equal(run(root).status,'ERROR');
 fs.writeFileSync(path.join(root,'binlog-observe.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'binlog-observe',mutations:[],sourceType:'csv'}));");
 assert.equal(run(root).status,'ERROR');
 // 非法 acceptedSourceTypes 值 → 配置 ERROR
 mutationsCheck.argv=['$NODE','check.mjs'];mutationsCheck.acceptedSourceTypes=['binlog','csv'];fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});
