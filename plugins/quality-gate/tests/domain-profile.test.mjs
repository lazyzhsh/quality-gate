import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {renderSummary} from '../lib/summary.mjs';

test('required quality domains fail when no gate executes in a domain',t=>{
 const f=leanFixture(t);f.c.requiredLevels={close:['L0','L5']};f.save();
 const r=run(f.root);assert.equal(r.status,'FAIL');
 assert.deepEqual(r.missingRequiredLevels,['L0']);
 assert.equal(r.levelCoverage.find(x=>x.level==='L5').status,'PASS');
});
test('all declared required domains can pass and report coverage',t=>{
 const f=leanFixture(t);f.c.requiredLevels={close:['L5']};f.save();
 const r=run(f.root);assert.equal(r.status,'PASS');assert.deepEqual(r.missingRequiredLevels,[]);
});
test('proposed exception is recorded but never waives a gate',t=>{
 const f=leanFixture(t);
 f.c.risks=[{id:'R1',gateId:'build',description:'Residual risk'}];
 f.c.exceptions=[{id:'E1',gateId:'build',riskId:'R1',reason:'Review requested',owner:'demo-owner',expiresAt:'2027-01-01',status:'proposed'}];f.save();
 const r=run(f.root);assert.equal(r.status,'FAIL');assert.equal(r.exceptions[0].id,'E1');
 assert.equal(r.exceptions[0].waiver.status,'blocking');
 assert.equal(r.evidence[0].status,'PASS');
 f.c.exceptions[0].status='approved';f.save();assert.equal(run(f.root).status,'ERROR');
});
test('approved in-window exception renders WAIVED and stops blocking an otherwise passing run',t=>{
 const f=leanFixture(t);
 f.c.risks=[{id:'R1',gateId:'build',description:'Residual risk'}];
 const base={id:'E1',gateId:'build',riskId:'R1',reason:'Reviewed waiver',owner:'demo-owner',status:'approved',approvedBy:'reviewer@team',approvedAt:'2026-01-01'};
 f.c.exceptions=[{...base,expiresAt:'2027-01-01'}];f.save();
 const r=run(f.root);
 assert.equal(r.status,'PASS','approved unexpired exception must not fail a passing run');
 assert.equal(r.exceptions[0].waiver.status,'waived');
 assert.match(renderSummary(r),/已豁免例外: E1（审批 reviewer@team，至 2027-01-01）——不改变门禁判定/);
});
test('approved exception never waives a failing gate',t=>{
 const f=leanFixture(t);
 f.c.risks=[{id:'R1',gateId:'build',description:'Residual risk'}];
 f.c.exceptions=[{id:'E1',gateId:'build',riskId:'R1',reason:'Reviewed waiver',owner:'demo-owner',expiresAt:'2027-01-01',status:'approved',approvedBy:'reviewer@team',approvedAt:'2026-01-01'}];f.save();
 f.c.gates[0]={id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000};f.save();
 const r=run(f.root);
 assert.equal(r.status,'FAIL','waived exception cannot exempt a FAIL gate');
 assert.equal(r.exceptions[0].waiver.status,'waived');
});
test('expired approval falls back to blocking with the reason named',t=>{
 const f=leanFixture(t);
 f.c.risks=[{id:'R1',gateId:'build',description:'Residual risk'}];
 f.c.exceptions=[{id:'E1',gateId:'build',riskId:'R1',reason:'Reviewed waiver',owner:'demo-owner',expiresAt:'2026-01-01',status:'approved',approvedBy:'reviewer@team',approvedAt:'2025-06-01'}];f.save();
 const r=run(f.root);
 assert.equal(r.status,'FAIL','expired approval must block again');
 assert.deepEqual(r.exceptions[0].waiver,{status:'blocking',reason:'expired'});
 assert.match(renderSummary(r),/未决例外: E1（豁免已过期）——登记即阻断/);
});
test('approval dated after expiry or in the future is rejected or not yet effective',t=>{
 const f=leanFixture(t);
 f.c.risks=[{id:'R1',gateId:'build',description:'Residual risk'}];
 const base={id:'E1',gateId:'build',riskId:'R1',reason:'Reviewed waiver',owner:'demo-owner',expiresAt:'2027-01-01',status:'approved',approvedBy:'reviewer@team'};
 f.c.exceptions=[{...base,approvedAt:'2027-06-01'}];f.save();
 assert.equal(run(f.root).status,'ERROR','approvedAt after expiresAt is invalid');
 f.c.exceptions=[{...base,approvedAt:new Date(new Date().getTime()+86400000).toISOString().slice(0,10)}];f.save();
 const r=run(f.root);
 assert.equal(r.status,'FAIL','future-dated approval is not yet effective');
 assert.deepEqual(r.exceptions[0].waiver,{status:'blocking',reason:'not-yet-effective'});
});
