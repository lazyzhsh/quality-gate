import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {leanFixture} from './fixture.mjs';
// 基础门禁换为零 spawn 的常规期 kind（symbol-grounding all 模式对无 import 的临时项目恒 PASS）——延后门禁(assumptions/decisions/traceability)引用 build 作同轮证据需要常规期已 PASS
const SG_GATE={id:'build',kind:'symbol-grounding',level:'L2',enabled:true,stages:['close'],claimId:'C1',check:'all'};
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

function setup(t,options={}){
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};
 f.c.claims.push({id:'C2',statement:'Assumptions hold'});
 const gate={id:'asm',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'assumptions.json'};
 if(options.requireProvenance)gate.requireProvenance=true;
 f.c.gates.push(gate);f.save();
 const write=assumptions=>fs.writeFileSync(path.join(f.root,'assumptions.json'),JSON.stringify({assumptions}));
 return {...f,write};
}

test('structured file and gate references verify and pass with provenance',t=>{
 const f=setup(t,{requireProvenance:true});
 fs.writeFileSync(path.join(f.root,'adr-1.md'),'# ADR 1\n');
 f.write([{id:'A-1',statement:'Retries bounded',status:'confirmed',source:{file:'adr-1.md'},evidence:{gateId:'build'},impact:'timeouts',risk:'overload',resolution:'max 2'}]);
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const details=result.evidence.find(e=>e.gateId==='asm').details;
 assert.deepEqual(details.referenceChecks.map(x=>`${x.field}:${x.status}`),['source:FOUND','evidence:PASS']);
});

test('missing referenced file fails with explicit check and summary reason',t=>{
 const f=setup(t);
 f.write([{id:'A-1',statement:'x',status:'confirmed',source:{file:'missing.md'},evidence:'notes'}]);
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence.find(e=>e.gateId==='asm');
 assert.equal(evidence.details.referenceChecks[0].status,'MISSING');
 assert.equal(failureReasons(evidence)[0],'A-1.source 引用未通过: file missing.md → MISSING');
});

test('gate reference fails when linked gate fails; unknown gate fails closed',t=>{
 const f=setup(t);
 f.c.gates[0]={id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000};f.save();
 f.write([{id:'A-1',statement:'x',status:'confirmed',source:'doc',evidence:{gateId:'build'}}]);
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence.find(e=>e.gateId==='asm').details.referenceChecks[0].gateStatus,'FAIL');
 f.write([{id:'A-1',statement:'x',status:'confirmed',source:'doc',evidence:{gateId:'nope'}}]);
 result=run(f.root);
 assert.equal(result.status,'ERROR');
});

test('malformed reference object and path escape fail closed',t=>{
 const f=setup(t);
 f.write([{id:'A-1',statement:'x',status:'confirmed',source:{what:1},evidence:'doc'}]);
 assert.equal(run(f.root).status,'ERROR');
 f.write([{id:'A-1',statement:'x',status:'confirmed',source:{file:'../outside.md'},evidence:'doc'}]);
 assert.equal(run(f.root).status,'ERROR');
});

test('open assumption still fails regardless of valid references',t=>{
 const f=setup(t);
 fs.writeFileSync(path.join(f.root,'adr-1.md'),'# ADR\n');
 f.write([{id:'A-1',statement:'x',status:'open',source:{file:'adr-1.md'},evidence:'doc'}]);
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence.find(e=>e.gateId==='asm').details.unresolved,['A-1']);
});

test('empty register passes only with an explicit none declaration',t=>{
 const f=setup(t);
 const file=path.join(f.root,'assumptions.json');
 fs.writeFileSync(file,JSON.stringify({assumptions:[],none:true}));
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence.find(e=>e.gateId==='asm').details.none,true);
});

test('bare empty register fails as vacuous and the summary names it',t=>{
 const f=setup(t);
 fs.writeFileSync(path.join(f.root,'assumptions.json'),JSON.stringify({assumptions:[]}));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence.find(e=>e.gateId==='asm');
 assert.deepEqual(evidence.details.registerIssues,['empty-register-undeclared']);
 assert.deepEqual(failureReasons(evidence),['空登记未显式声明: 需要 "none": true']);
});

test('none declaration contradicting entries fails; non-boolean none errors',t=>{
 const f=setup(t);
 const file=path.join(f.root,'assumptions.json');
 fs.writeFileSync(file,JSON.stringify({assumptions:[{id:'A-1',statement:'x',status:'confirmed',source:'doc',evidence:'doc'}],none:true}));
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence.find(e=>e.gateId==='asm').details.registerIssues,['none-with-entries']);
 assert.deepEqual(failureReasons(result.evidence.find(e=>e.gateId==='asm')),['none:true 与非空登记矛盾']);
 fs.writeFileSync(file,JSON.stringify({assumptions:[],none:'yes'}));
 result=run(f.root);
 assert.equal(result.status,'ERROR');
});
