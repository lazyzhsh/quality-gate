import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';

function setup(t,change='') {
 const f=leanFixture(t);
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const {runId}=JSON.parse(raw);const o={schemaVersion:'0.1',runId,request:{method:'POST',url:'http://127.0.0.1/orders',status:201},persistence:{source:'test-fixture',recordCount:1,record:{id:runId,amount:1250,currency:'CNY',note:null}}};${change};console.log(JSON.stringify(o));`);
 f.c.gates=[{id:'persist',kind:'persistence',level:'L2',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','runner.mjs'],timeoutMs:2000,expectedHttpStatus:201,correlationField:'id',expected:{id:'$RUN_ID',amount:1250,currency:'CNY',note:null},requireSnapshots:false}];f.save();return f;
}
test('L2 passes real observations and records per-field evidence',t=>{const f=setup(t);const r=run(f.root);assert.equal(r.status,'PASS');assert.equal(r.evidence[0].details.fields.length,4);});
for(const [name,change,status] of [
 ['wrong value',"o.persistence.record.amount=1200",'FAIL'],
 ['wrong type',"o.persistence.record.amount='1250'",'FAIL'],
 ['missing nullable field',"delete o.persistence.record.note",'FAIL'],
 ['unexpected field',"o.persistence.record.hidden=true",'FAIL'],
 ['missing record',"o.persistence.recordCount=0;o.persistence.record=null",'FAIL'],
 ['duplicate records',"o.persistence.recordCount=2",'FAIL'],
 ['HTTP error',"o.request.status=500",'FAIL'],
 ['stale run',"o.runId='old-run'",'ERROR'],
 ['wrong record correlation',"o.persistence.record.id='old-record'",'FAIL'],
 ['invalid protocol',"delete o.persistence",'ERROR'],
 ['non JSON output',"console.log('diagnostic on stdout')",'ERROR'],
 ['output limit',"console.log('x'.repeat(70000))",'ERROR'],
 ['runner exit error',"process.exit(3)",'ERROR'],
 ['runner timeout',"await new Promise(r=>setTimeout(r,10000))",'ERROR']
])test('L2 '+name,t=>{const f=setup(t,change);if(name==='runner timeout'){f.c.gates[0].timeoutMs=40;f.save();}const r=run(f.root);assert.equal(r.status,status);assert.equal(r.evidence.length,1,'Gate must actually execute');if(status==='ERROR')assert.ok(r.evidence[0].details.error);});
test('L2 expected correlation is mandatory',t=>{const f=setup(t);f.c.gates[0].expected.id='fixed';f.save();assert.equal(run(f.root).status,'ERROR');});
test('Gate budget permits three small checks but rejects excess time',t=>{const f=setup(t);const g=f.c.gates[0];f.c.gates=[g,{...g,id:'two'},{...g,id:'three'}];f.save();assert.equal(run(f.root).status,'PASS');for(const g of f.c.gates)g.timeoutMs=25000;f.save();assert.equal(run(f.root).status,'ERROR');});

test('expectedRecordCount 0 asserts nothing persisted on rejection',t=>{
 const f=setup(t,"o.request.status=422;o.persistence.recordCount=0;o.persistence.record=null");
 f.c.gates[0].expectedRecordCount=0;f.c.gates[0].expectedHttpStatus=422;f.save();
 let r=run(f.root);
 assert.equal(r.status,'PASS');
 assert.ok(r.evidence[0].details.fields.every(field=>field.status==='PASS'));
 const g=setup(t,"o.request.status=422");
 g.c.gates[0].expectedRecordCount=0;g.c.gates[0].expectedHttpStatus=422;g.save();
 r=run(g.root);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence[0].details.recordCount,1);
});

test('expectedRecordCount N verifies every batch record field by field',t=>{
 const f=setup(t,"o.persistence.recordCount=2;o.persistence.records=[{id:runId,amount:1250,currency:'CNY',note:null},{id:runId,amount:1250,currency:'CNY',note:null}]");
 f.c.gates[0].expectedRecordCount=2;f.c.gates[0].requireSnapshots=false;f.save();
 let r=run(f.root);
 assert.equal(r.status,'PASS');
 assert.equal(r.evidence[0].details.recordResults.length,2);
 const g=setup(t,"o.persistence.recordCount=2;o.persistence.records=[{id:runId,amount:1250,currency:'CNY',note:null},{id:runId,amount:9,currency:'CNY',note:null}]");
 g.c.gates[0].expectedRecordCount=2;g.c.gates[0].requireSnapshots=false;g.save();
 r=run(g.root);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence[0].details.recordResults[1].status,'FAIL');
 const h=setup(t,"o.persistence.recordCount=2");
 h.c.gates[0].expectedRecordCount=2;h.c.gates[0].requireSnapshots=false;h.save();
 assert.equal(run(h.root).status,'ERROR');
});

test('batch expectations reject snapshots and non-2xx defaults fail closed',t=>{
 // E3：批量与快照互斥——未显式退出（默认强制）即配置 ERROR
 const f=setup(t);
 f.c.gates[0].expectedRecordCount=2;f.save();
 assert.equal(run(f.root).status,'ERROR');
 f.c.gates[0].requireSnapshots=true;f.save();
 assert.equal(run(f.root).status,'ERROR');
 const g=setup(t,"o.request.status=500");
 g.c.gates[0].expectedRecordCount=2;g.c.gates[0].requireSnapshots=false;g.c.gates[0].expectedHttpStatus=500;g.save();
 assert.equal(run(g.root).status,'ERROR');
});

test('E3: snapshots are mandatory by default and opt-out must be explicit',t=>{
 // 默认强制正例：runner 回报一致快照 → PASS，details.requireSnapshots=true 且快照入证据
 const f=leanFixture(t);
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const {runId}=JSON.parse(raw);const rec={id:runId,amount:1250,currency:'CNY',note:null};console.log(JSON.stringify({schemaVersion:'0.1',runId,request:{method:'POST',url:'http://127.0.0.1/orders',status:201},persistence:{source:'test-fixture',recordCount:1,record:rec},snapshots:{before:{recordCount:0,record:null},after:{recordCount:1,record:rec}}}));`);
 f.c.gates=[{id:'persist',kind:'persistence',level:'L2',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','runner.mjs'],timeoutMs:2000,expectedHttpStatus:201,correlationField:'id',expected:{id:'$RUN_ID',amount:1250,currency:'CNY',note:null}}];f.save();
 let r=run(f.root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence[0].details).slice(0,300));
 assert.equal(r.evidence[0].details.requireSnapshots,true);
 assert.equal(r.evidence[0].details.snapshots.delta.length,4);
 assert.deepEqual(r.evidence[0].details.snapshots.delta.map(entry=>entry.field),['amount','currency','id','note']);
 // 默认强制反例：未回报快照 → ERROR fail-closed（指名默认强制与退出方式）
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const {runId}=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId,request:{method:'POST',url:'http://127.0.0.1/orders',status:201},persistence:{source:'test-fixture',recordCount:1,record:{id:runId,amount:1250,currency:'CNY',note:null}}}));`);
 r=run(f.root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence[0].details.error,/snapshots are mandatory by default/);
 // 快照与独立观察不一致（after 回读值 ≠ persistence 观察值）→ ERROR（交叉核验）
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const {runId}=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId,request:{method:'POST',url:'http://127.0.0.1/orders',status:201},persistence:{source:'test-fixture',recordCount:1,record:{id:runId,amount:1250,currency:'CNY',note:null}},snapshots:{before:{recordCount:0,record:null},after:{recordCount:1,record:{id:runId,amount:999,currency:'CNY',note:null}}}}));`);
 r=run(f.root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence[0].details.error,/independent persistence observation/);
 // 显式退出可见：requireSnapshots:false 时 details 标志为 false 且无快照
 const g=leanFixture(t);
 fs.writeFileSync(path.join(g.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const {runId}=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId,request:{method:'POST',url:'http://127.0.0.1/orders',status:201},persistence:{source:'test-fixture',recordCount:1,record:{id:runId,amount:1250,currency:'CNY',note:null}}}));`);
 g.c.gates=[{id:'persist',kind:'persistence',level:'L2',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','runner.mjs'],timeoutMs:2000,expectedHttpStatus:201,correlationField:'id',expected:{id:'$RUN_ID',amount:1250,currency:'CNY',note:null},requireSnapshots:false}];g.save();
 r=run(g.root);
 assert.equal(r.status,'PASS');
 assert.equal(r.evidence[0].details.requireSnapshots,false);
 assert.equal(r.evidence[0].details.snapshots,undefined);
 // 非布尔 requireSnapshots 仍拒绝
 g.c.gates[0].requireSnapshots='yes';g.save();
 assert.equal(run(g.root).status,'ERROR');
});
