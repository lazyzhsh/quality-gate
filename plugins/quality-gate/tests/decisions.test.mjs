import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {leanFixture} from './fixture.mjs';
// 基础门禁换为零 spawn 的常规期 kind（symbol-grounding all 模式对无 import 的临时项目恒 PASS）——延后门禁(assumptions/decisions/traceability)引用 build 作同轮证据需要常规期已 PASS
const SG_GATE={id:'build',kind:'symbol-grounding',level:'L2',enabled:true,stages:['close'],claimId:'C1',check:'all'};

test('open decision blocks L0 and resolution yields linked evidence',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};
 f.c.claims.push({id:'C2',statement:'Design decisions have a documented resolution'});
 f.c.gates.push({id:'decisions',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json'});
 f.save();
 const file=path.join(f.root,'decisions.json');
 const data={decisions:[{id:'D-1',question:'Which retry policy?',status:'open',owner:'team',resolution:'Pending review',evidence:'ADR-1'}]};
 fs.writeFileSync(file,JSON.stringify(data));
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence.find(e=>e.gateId==='decisions').details.unresolved,['D-1']);
 data.decisions[0].status='resolved';data.decisions[0].resolution='Use bounded retries';fs.writeFileSync(file,JSON.stringify(data));
 result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence.find(e=>e.gateId==='decisions').details.decisions[0].evidence,'ADR-1');
});

test('deferred decision is allowed only for an explicitly configured L0 gate',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Decision is recorded'});
 f.c.gates.push({id:'decisions',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json',allowDeferred:true});f.save();
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[{id:'D-1',question:'Which rollout?',status:'deferred',owner:'team',resolution:'Decide before release',evidence:'ADR-1',revisitBy:'2099-12-31'}]}));
 assert.equal(run(f.root).status,'PASS');
 f.c.gates[1].level='L5';f.save();
 assert.equal(run(f.root).status,'FAIL');
});

test('deferred decision without revisitBy fails closed as an error',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Decision is recorded'});
 f.c.gates.push({id:'decisions',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json',allowDeferred:true});f.save();
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[{id:'D-1',question:'Which rollout?',status:'deferred',owner:'team',resolution:'Decide before release',evidence:'ADR-1'}]}));
 assert.equal(run(f.root).status,'ERROR');
});

test('expired revisitBy fails a deferred decision even with allowDeferred',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Decision is recorded'});
 f.c.gates.push({id:'decisions',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json',allowDeferred:true});f.save();
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[{id:'D-1',question:'Which rollout?',status:'deferred',owner:'team',resolution:'Decide before release',evidence:'ADR-1',revisitBy:'2000-01-01'}]}));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence.find(e=>e.gateId==='decisions');
 assert.deepEqual(evidence.details.decisions[0].reasons,['revisit-overdue']);
 assert.deepEqual(failureReasons(evidence),['未闭合决策: D-1','D-1 悬置决策已过复审期限（revisitBy 2000-01-01）']);
});

test('requireProvenance demands structured evidence; text no longer passes',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Decisions are evidenced'});
 f.c.gates.push({id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json',requireProvenance:true});f.save();
 const file=path.join(f.root,'decisions.json');
 const write=decisions=>fs.writeFileSync(file,JSON.stringify({decisions}));
 write([{id:'D-1',question:'retry?',status:'resolved',owner:'team',resolution:'bounded',evidence:{gateId:'build'}}]);
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence.find(e=>e.gateId==='dec').details.requireProvenance,true);
 write([{id:'D-1',question:'retry?',status:'resolved',owner:'team',resolution:'bounded',evidence:'design review notes'}]);
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence.find(e=>e.gateId==='dec');
 assert.deepEqual(evidence.details.decisions[0].reasons,['provenance-required']);
 assert.deepEqual(failureReasons(evidence),['未闭合决策: D-1','D-1 evidence 需结构化引用（{file}/{gateId}），纯文本不再放行']);
 write([{id:'D-1',question:'retry?',status:'resolved',owner:'team',resolution:'bounded',evidence:{file:'missing-adr.md'}}]);
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence.find(e=>e.gateId==='dec').details.referenceChecks[0].status,'MISSING');
});

test('requireProvenance must be boolean in config',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Decisions are evidenced'});
 f.c.gates.push({id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json',requireProvenance:'yes'});f.save();
 assert.equal(run(f.root).status,'ERROR');
});

test('malformed decision register fails closed',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Decision is recorded'});
 f.c.gates.push({id:'decisions',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json'});f.save();
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[{id:'D-1',question:'Q',status:'resolved'}]}));
 assert.equal(run(f.root).status,'ERROR');
});

test('strict assumption register requires source, evidence, impact, risk and resolution',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};f.c.claims.push({id:'C2',statement:'Assumptions are evidenced'});
 f.c.gates.push({id:'assumptions',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'assumptions.json',requireProvenance:true});f.save();
 const file=path.join(f.root,'assumptions.json');
 const assumption={id:'A-1',statement:'Retries are bounded',status:'confirmed',source:'ADR-1',evidence:'TC-9',impact:'Timeout behavior',risk:'Possible overload',resolution:'Maximum 2 retries'};
 fs.writeFileSync(file,JSON.stringify({assumptions:[assumption]}));
 assert.equal(run(f.root).status,'PASS');
 delete assumption.evidence;fs.writeFileSync(file,JSON.stringify({assumptions:[assumption]}));
 assert.equal(run(f.root).status,'ERROR');
});

test('decision evidence reference and affect links verify in the same run',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};
 f.c.claims.push({id:'C2',statement:'Decisions are closed'});
 f.c.gates.push({id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'app.mjs'),'export const x=1;\n');
 const file=path.join(f.root,'decisions.json');
 const write=decisions=>fs.writeFileSync(file,JSON.stringify({decisions}));
 write([{id:'D-1',question:'retry?',status:'resolved',owner:'team',resolution:'bounded',evidence:{gateId:'build'},affectsPaths:['app.mjs'],affectsGateIds:['build']}]);
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const details=result.evidence.find(e=>e.gateId==='dec').details;
 assert.deepEqual(details.referenceChecks.map(x=>`${x.type}:${x.status}`),['gate:PASS']);
 assert.deepEqual(details.affectsChecks,[{decisionId:'D-1',type:'path',target:'app.mjs',status:'FOUND'},{decisionId:'D-1',type:'gate',target:'build',status:'PASS'}]);
});

test('unverifiable decision evidence and affects fail or error closed',t=>{
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};
 f.c.claims.push({id:'C2',statement:'Decisions are closed'});
 f.c.gates.push({id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json'});
 f.save();
 const file=path.join(f.root,'decisions.json');
 const write=decisions=>fs.writeFileSync(file,JSON.stringify({decisions}));
 write([{id:'D-1',question:'q',status:'resolved',owner:'t',resolution:'r',evidence:{file:'missing-adr.md'}}]);
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence.find(e=>e.gateId==='dec').details.referenceChecks[0].status,'MISSING');
 write([{id:'D-1',question:'q',status:'resolved',owner:'t',resolution:'r',evidence:'note',affectsPaths:['gone.mjs']}]);
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence.find(e=>e.gateId==='dec').details.affectsChecks.map(x=>x.status),['MISSING']);
 write([{id:'D-1',question:'q',status:'resolved',owner:'t',resolution:'r',evidence:'note',affectsGateIds:['nope']}]);
 assert.equal(run(f.root).status,'ERROR');
 write([{id:'D-1',question:'q',status:'resolved',owner:'t',resolution:'r',evidence:'note',affectsPaths:['../escape.mjs']}]);
 assert.equal(run(f.root).status,'ERROR');
});

test('failing linked evidence gate blocks a resolved decision',t=>{
 const f=leanFixture(t);f.c.gates[0]={id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000};
 f.c.claims.push({id:'C2',statement:'Decisions are closed'});
 f.c.gates.push({id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[{id:'D-1',question:'q',status:'resolved',owner:'t',resolution:'r',evidence:{gateId:'build'}}]}));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence.find(e=>e.gateId==='dec').details.referenceChecks[0].gateStatus,'FAIL');
});
