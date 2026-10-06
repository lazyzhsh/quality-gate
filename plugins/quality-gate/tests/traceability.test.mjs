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

// ---- 证明链补齐（v1.31，二轮评审 AC-UNBOUND）：AC→真实用例身份与当轮结果绑定 ----
// 用例绑定 runner：behavior 观察回显输入（期望=输入 → 用例全过）；unit 检查回报逐用例
// 状态（expected 声明后逐用例身份入证据）
function caseSetup(t){
 const f=setup(t);
 fs.writeFileSync(path.join(f.root,'behavior-runner.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const q=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'case fixture',cases:q.cases.map(c=>({id:c.id,actual:c.input}))}));");
 fs.writeFileSync(path.join(f.root,'unit-runner.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const q=JSON.parse(raw);const cases=[{name:'transfer-once',status:'pass',baselineStatus:'pass'}];console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'unit fixture',total:cases.length,passed:cases.length,failed:0,skipped:0,cases}));");
 f.c.gates.push(
  {id:'behavior',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C2',argv:['$NODE','behavior-runner.mjs'],timeoutMs:2000,cases:[{id:'transfer-once',input:{settled:1},expected:{settled:1}}]},
  {id:'unit',kind:'engineering',level:'L1',enabled:true,stages:['close'],claimId:'C1',timeoutMs:5000,requiredChecks:['unit'],checks:[{id:'unit',type:'test',argv:['$NODE','unit-runner.mjs'],timeoutMs:2000,expected:{p2p:['transfer-once']}}]},
 );
 f.save();
 f.requirements[0].acceptanceCriteria[0].testGateIds=['build','behavior','unit'];
 f.saveRequirements();
 return f;
}
const rtmOf=result=>result.evidence.find(e=>e.gateId==='rtm');
const acOf=(result,id='AC-1')=>rtmOf(result).details.requirements[0].acceptanceCriteria.find(a=>a.id===id);

test('AC case bindings verify per-case identity in the same run (positive)',t=>{
 const f=caseSetup(t);
 f.requirements[0].acceptanceCriteria[0].cases=[{gateId:'behavior',caseIds:['transfer-once']},{gateId:'unit',caseIds:['transfer-once']}];
 f.saveRequirements();
 const result=run(f.root);
 assert.equal(result.status,'PASS',JSON.stringify(rtmOf(result).details.requirements));
 const ac=acOf(result);
 assert.deepEqual(ac.caseBindings,[{gateId:'behavior',cases:[{id:'transfer-once',status:'pass'}]},{gateId:'unit',cases:[{id:'transfer-once',status:'pass'}]}]);
 assert.equal(ac.caseFindings,undefined);
});

test('AC bound to an unrelated passing gate cannot pass: case identity missing (review probe AC-UNBOUND)',t=>{
 const f=caseSetup(t);
 // 评审反例形态：AC 声称"转账恰好一次"，所连门禁是只退出 0 的 command——门禁 PASS 但
 // 无逐用例身份，绑定用例缺失即 FAIL，AC 不得凭无关成功门禁放行
 f.c.gates.push({id:'noop',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(0)'],timeoutMs:1000});
 f.save();
 f.requirements[0].acceptanceCriteria[0].testGateIds=['noop'];
 f.requirements[0].acceptanceCriteria[0].cases=[{gateId:'noop',caseIds:['transfer-once']}];
 f.saveRequirements();
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const ac=acOf(result);
 assert.equal(ac.testGates[0].status,'PASS');
 assert.deepEqual(ac.caseFindings,[{gateId:'noop',caseId:'transfer-once',rule:'acCaseMissing'}]);
 assert.ok(failureReasons(rtmOf(result)).some(reason=>reason.includes('AC-1 绑定用例 transfer-once（noop）不在当轮证据中')));
});

test('skipped and failed bound cases cannot satisfy the AC',t=>{
 const f=caseSetup(t);
 // unit runner 回报 skip：expected 绑定下 check 本身 FAIL（skippedCase）——AC 侧同时得到
 // acCaseSkipped finding（被跳过不是通过）
 fs.writeFileSync(path.join(f.root,'unit-runner.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const q=JSON.parse(raw);const cases=[{name:'transfer-once',status:'skip',baselineStatus:'pass'}];console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'unit fixture',total:1,passed:0,failed:0,skipped:1,cases}));");
 f.requirements[0].acceptanceCriteria[0].cases=[{gateId:'unit',caseIds:['transfer-once']}];
 f.saveRequirements();
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.ok(acOf(result).caseFindings.some(finding=>finding.rule==='acCaseSkipped'&&finding.caseId==='transfer-once'));
 assert.ok(failureReasons(rtmOf(result)).some(reason=>reason.includes('被跳过——跳过不是通过')));
 // 行为用例未通过：期望改值 → behavior 门禁 FAIL，AC 侧 acCaseFailed finding 并存
 fs.writeFileSync(path.join(f.root,'unit-runner.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const q=JSON.parse(raw);const cases=[{name:'transfer-once',status:'pass',baselineStatus:'pass'}];console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'unit fixture',total:1,passed:1,failed:0,skipped:0,cases}));");
 f.c.gates.find(g=>g.id==='behavior').cases[0].expected={settled:2};
 f.save();
 f.requirements[0].acceptanceCriteria[0].cases=[{gateId:'behavior',caseIds:['transfer-once']}];
 f.saveRequirements();
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.ok(acOf(result).caseFindings.some(finding=>finding.rule==='acCaseFailed'&&finding.gateId==='behavior'));
});

test('requireCaseBinding demands a binding on every AC; default keeps legacy semantics',t=>{
 const f=caseSetup(t);
 // 未开启：AC 无 cases 仍按既有门禁关联语义 PASS
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 // 开启：同一登记 FAIL 指名未绑定
 f.c.gates.find(g=>g.id==='rtm').requireCaseBinding=true;f.save();
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(acOf(result).caseUnbound,true);
 assert.ok(failureReasons(rtmOf(result)).some(reason=>reason.includes('AC-1 未声明用例绑定')));
 // 补上绑定即恢复 PASS
 f.requirements[0].acceptanceCriteria[0].cases=[{gateId:'behavior',caseIds:['transfer-once']}];
 f.saveRequirements();
 assert.equal(run(f.root).status,'PASS');
});

test('case binding shapes fail closed at registry validation',t=>{
 const f=caseSetup(t);
 const ac=f.requirements[0].acceptanceCriteria[0];
 const shapes=[
  {gateId:'ghost',caseIds:['transfer-once']},          // gateId 不在该 AC 的 testGateIds 内
  {gateId:'behavior',caseIds:[]},                      // 空用例表
  {gateId:'behavior',caseIds:['a','a']},               // 用例重复
 ];
 for(const [index,cases] of shapes.entries()){
  ac.cases=[cases];
  f.saveRequirements();
  assert.equal(run(f.root).status,'ERROR',`shape ${index} must fail validation`);
 }
 // 同一 gateId 重复绑定也拒绝
 ac.cases=[{gateId:'behavior',caseIds:['transfer-once']},{gateId:'behavior',caseIds:['reject-dup']}];
 f.saveRequirements();
 assert.equal(run(f.root).status,'ERROR');
 // requireCaseBinding 非布尔 → 配置 ERROR
 ac.cases=undefined;f.saveRequirements();
 f.c.gates.find(g=>g.id==='rtm').requireCaseBinding='yes';f.save();
 assert.equal(run(f.root).status,'ERROR');
});
