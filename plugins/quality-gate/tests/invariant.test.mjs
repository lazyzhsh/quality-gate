import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';

const source=fileURLToPath(new URL('../examples/invariant-demo',import.meta.url));
function project(t,mode='normal'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-invariant-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].argv=['python','runner.py',mode];fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));return root;
}

test('actual cross-table SQLite readback satisfies balance, cap and status implications',t=>{
 const result=run(project(t));assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 const assertions=result.evidence[0].details.assertions;
 assert.equal(assertions.length,7);
 assert.ok(assertions.every(assertion=>assertion.status==='PASS'));
});

test('neq, lt, gt and compound when conditions evaluate with operand evidence',t=>{
 const f=fixture(t);
 f.c.claims.push({id:'C2',statement:'invariants'});
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const {runId}=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId,source:'synthetic',values:{a:5,b:5,c:'X',d:'Y'}}));`);
 f.c.gates.push({id:'inv',kind:'invariant',level:'L2',enabled:true,stages:['close'],claimId:'C2',argv:['$NODE','runner.mjs'],timeoutMs:2000,assertions:[
  {id:'n1',left:'a',operator:'neq',right:'b'},
  {id:'n2',left:'a',operator:'lt',right:'b'},
  {id:'n3',when:{field:'c',notEquals:'Z'},left:'a',operator:'gt',value:0},
  {id:'n4',when:{field:'c',in:['Q']},left:'a',operator:'ge',value:0},
  {id:'n5',when:[{field:'d',equals:'Y'},{field:'c',notEquals:'Z'}],left:'b',operator:'gt',value:10}
 ]});
 f.save();
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const assertions=result.evidence.find(evidence=>evidence.gateId==='inv').details.assertions;
 assert.deepEqual(assertions.map(assertion=>assertion.status),['FAIL','FAIL','PASS','SKIP','FAIL']);
 assert.deepEqual(assertions[0].left,5);
});

test('ledger imbalance and status mismatch fail with operands',t=>{
 let result=run(project(t,'wrong-balance'));assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.assertions[0].left,1000);
 assert.deepEqual(result.evidence[0].details.assertions[0].right,999);
 result=run(project(t,'wrong-status'));assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.assertions[2].status,'FAIL');
});

test('stale invariant observation cannot pass',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'runner.py'),'import json;print(json.dumps({"schemaVersion":"0.1","runId":"old","source":"fake","values":{}}))');
 assert.equal(run(root).status,'ERROR');
});

test('all conditions unmet yield SKIP semantics, never PASS evidence',t=>{
 const f=fixture(t);
 f.c.claims.push({id:'C3',statement:'skip case'});
 fs.writeFileSync(path.join(f.root,'skip-runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'synthetic',values:{mode:'off'}}));`);
 f.c.gates.push({id:'skipinv',kind:'invariant',level:'L2',enabled:true,stages:['close'],claimId:'C3',argv:['$NODE','skip-runner.mjs'],timeoutMs:2000,assertions:[{id:'s1',when:{field:'mode',equals:'on'},left:'mode',operator:'eq',value:'on'}]});
 f.save();
 let result=run(f.root);
 assert.equal(result.evidence.find(e=>e.gateId==='skipinv').status,'SKIP');
 assert.equal(result.status,'PASS','other passing gates still carry the run');
 f.c.gates[0].enabled=false;f.save();
 result=run(f.root);
 assert.equal(result.status,'SKIP');
});
