import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {leanFixture} from './fixture.mjs';
// 基础门禁换为零 spawn 的常规期 kind（symbol-grounding all 模式对无 import 的临时项目恒 PASS）——延后门禁(assumptions/decisions/traceability)引用 build 作同轮证据需要常规期已 PASS
const SG_GATE={id:'build',kind:'symbol-grounding',level:'L2',enabled:true,stages:['close'],claimId:'C1',check:'all'};
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

function setup(t){
 const f=leanFixture(t);f.c.gates[0]={...SG_GATE};
 f.c.claims.push({id:'C2',statement:'The acceptance criteria have implementation and test links'});
 f.c.gates.unshift({id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'requirements.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'app.mjs'),'export const ready=true;\n');
 const requirements=[{id:'REQ-1',statement:'Demo is buildable',acceptanceCriteria:[{id:'AC-1',statement:'Module parses',codeFiles:['app.mjs'],testGateIds:['build']}]}];
 const saveRequirements=()=>fs.writeFileSync(path.join(f.root,'requirements.json'),JSON.stringify({requirements}));
 saveRequirements();
 return {...f,requirements,saveRequirements};
}

test('RTM checks AC-to-code and same-run test evidence, independent of gate order',t=>{
 const f=setup(t);
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const rtm=result.evidence.find(e=>e.gateId==='rtm');
 assert.equal(rtm.details.requirements[0].acceptanceCriteria[0].testGates[0].status,'PASS');
 assert.equal(rtm.details.requirements[0].acceptanceCriteria[0].codeFiles[0].status,'FOUND');
 assert.equal(rtm.details.requirementCount,1);
 assert.equal(rtm.details.criterionCount,1);
});

test('missing implementation and failed test gate make RTM fail',t=>{
 const f=setup(t);
 f.requirements[0].acceptanceCriteria[0].codeFiles=['missing.mjs'];f.saveRequirements();
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence.find(e=>e.gateId==='rtm').details.requirements[0].acceptanceCriteria[0].codeFiles[0].status,'MISSING');
 f.requirements[0].acceptanceCriteria[0].codeFiles=['app.mjs'];f.saveRequirements();
 f.c.gates[f.c.gates.findIndex(g=>g.id==='build')]={id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000};f.save();
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence.find(e=>e.gateId==='rtm').details.requirements[0].acceptanceCriteria[0].testGates[0].status,'FAIL');
});

test('skipped, disabled, or unknown linked test gate cannot satisfy RTM',t=>{
 const f=setup(t);
 f.c.gates.find(g=>g.id==='build').enabled=false;f.save();
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='rtm').status,'FAIL');
 f.c.gates.find(g=>g.id==='build').enabled=true;
 f.c.gates.find(g=>g.id==='build').stages=['pr'];f.save();
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='rtm').status,'FAIL');
 f.requirements[0].acceptanceCriteria[0].testGateIds=['unknown'];f.saveRequirements();
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='rtm').status,'ERROR');
});

test('invalid RTM and path escape fail closed',t=>{
 const f=setup(t);
 f.requirements[0].acceptanceCriteria=[];f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
 f.requirements[0].acceptanceCriteria=[{id:'AC-1',statement:'a',codeFiles:['../outside.mjs'],testGateIds:['build']}];f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
 f.requirements.push({...f.requirements[0]});f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
});

test('declared normal and boundary acceptance types require same-run evidence',t=>{
 const f=setup(t);
 f.requirements[0].requiredTypes=['normal','boundary'];
 f.requirements[0].acceptanceCriteria[0].type='normal';f.saveRequirements();
 let r=run(f.root).evidence.find(e=>e.gateId==='rtm');
 assert.equal(r.status,'FAIL');
 assert.deepEqual(r.details.requirements[0].missingTypes,['boundary']);
 f.requirements[0].acceptanceCriteria.push({id:'AC-2',type:'boundary',statement:'Boundary parses',codeFiles:['app.mjs'],testGateIds:['build']});f.saveRequirements();
 r=run(f.root).evidence.find(e=>e.gateId==='rtm');
 assert.equal(r.status,'PASS');
 assert.deepEqual(r.details.requirements[0].missingTypes,[]);
});

test('RTM accepts any non-meta gate kind as same-run test evidence',t=>{
 const f=setup(t);
 f.c.claims.push({id:'C3',statement:'Assumptions closed'});
 f.c.gates.push({id:'asm',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C3',file:'assumptions.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'assumptions.json'),JSON.stringify({assumptions:[{id:'A-1',statement:'a',status:'confirmed'}]}));
 f.requirements[0].acceptanceCriteria[0].testGateIds=['build','asm'];f.saveRequirements();
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence.find(e=>e.gateId==='rtm').details.requirements[0].acceptanceCriteria[0].testGates[1].status,'PASS');
 f.c.claims.push({id:'C4',statement:'ready'});
 f.c.gates.push({id:'rdy',kind:'readiness',level:'L5',enabled:false,stages:['close'],claimId:'C4',file:'release.json'});
 f.requirements[0].acceptanceCriteria[0].testGateIds=['rdy'];f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
});

function writeRunner(root,options={}){
 const source=`import {readFileSync} from 'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));
const results=input.criteria.map(c=>({criterionId:c.id,files:c.codeFiles.map(f=>({path:f,covered:${options.covered??true}}))}));
const payload={schemaVersion:'0.1',runId:${options.stale?'"00000000-0000-0000-0000-000000000000"':'input.runId'},source:'test-coverage-runner',results};
process.stdout.write(JSON.stringify(${options.omit?'payload.results.shift(),payload':'payload'}));`;
 fs.writeFileSync(path.join(root,'coverage-runner.mjs'),source);
}

test('coverage protocol marks linked files and fails uncovered or stale output',t=>{
 const f=setup(t);
 writeRunner(f.root);
 f.c.gates.find(g=>g.id==='rtm').coverage={argv:['$NODE','coverage-runner.mjs'],timeoutMs:2000};f.save();
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 let details=result.evidence.find(e=>e.gateId==='rtm').details;
 assert.equal(details.requirements[0].acceptanceCriteria[0].codeFiles[0].covered,true);
 assert.equal(details.coverage.source,'test-coverage-runner');
 writeRunner(f.root,{covered:false});
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(failureReasons(result.evidence.find(e=>e.gateId==='rtm')),['AC-1 文件未被覆盖: app.mjs']);
 writeRunner(f.root,{stale:true});
 assert.equal(run(f.root).status,'ERROR');
 writeRunner(f.root,{omit:true});
 assert.equal(run(f.root).status,'ERROR');
});

test('coverage runner crash errors closed',t=>{
 const f=setup(t);
 fs.writeFileSync(path.join(f.root,'crash-coverage.mjs'),'process.exit(3);');
 f.c.gates.find(g=>g.id==='rtm').coverage={argv:['$NODE','crash-coverage.mjs'],timeoutMs:2000};f.save();
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence.find(e=>e.gateId==='rtm').details,/Coverage runner failed/);
});

test('requirePrdRefs demands a verified prdRef on every requirement',t=>{
 const f=setup(t);
 fs.writeFileSync(path.join(f.root,'PRD.md'),'# PRD\n');
 f.c.gates.find(g=>g.id==='rtm').requirePrdRefs=true;f.save();
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence.find(e=>e.gateId==='rtm');
 assert.equal(evidence.details.requirements[0].missingPrdRef,true);
 assert.deepEqual(failureReasons(evidence),['REQ-1 缺少 PRD 绑定（requirePrdRefs）']);
 f.requirements[0].prdRef={file:'PRD.md',section:'2.1 Payments'};f.saveRequirements();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence.find(e=>e.gateId==='rtm').details.requirements[0].prdRef.status,'FOUND');
 f.requirements[0].prdRef={file:'missing-prd.md',section:'2.1'};f.saveRequirements();
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(failureReasons(result.evidence.find(e=>e.gateId==='rtm')),['REQ-1 PRD 引用文件缺失: missing-prd.md']);
 f.requirements[0].prdRef={file:'../outside.md',section:'x'};f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
});

test('declared prdRef verifies even without requirePrdRefs; malformed shapes error',t=>{
 const f=setup(t);
 f.requirements[0].prdRef={file:'PRD.md'};f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
 delete f.requirements[0].prdRef;f.saveRequirements();
 fs.writeFileSync(path.join(f.root,'PRD.md'),'# PRD\n');
 f.requirements[0].prdRef={file:'missing-prd.md',section:'1'};f.saveRequirements();
 assert.equal(run(f.root).status,'FAIL');
});

test('defaultRequiredTypes applies to requirements without their own set',t=>{
 const f=setup(t);
 f.requirements[0].acceptanceCriteria=[{id:'AC-1',statement:'Module parses',type:'normal',codeFiles:['app.mjs'],testGateIds:['build']}];
 f.saveRequirements();
 f.c.gates.find(g=>g.id==='rtm').defaultRequiredTypes=['normal','negative'];f.save();
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence.find(e=>e.gateId==='rtm');
 assert.deepEqual(evidence.details.requirements[0].missingTypes,['negative']);
 assert.deepEqual(failureReasons(evidence),['REQ-1 缺少类型: negative']);
 f.requirements[0].acceptanceCriteria.push({id:'AC-2',statement:'Rejects bad input',type:'negative',codeFiles:['app.mjs'],testGateIds:['build']});
 f.saveRequirements();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.deepEqual(result.evidence.find(e=>e.gateId==='rtm').details.requirements[0].requiredTypes,['normal','negative']);
 f.c.gates.find(g=>g.id==='rtm').defaultRequiredTypes=['normal','weird'];f.save();
 assert.equal(run(f.root).status,'ERROR');
});
