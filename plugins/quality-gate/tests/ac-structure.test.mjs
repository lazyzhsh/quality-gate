import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {validateGherkin,validateEars,evaluateAc,acTypeConflict} from '../lib/ac-structure.mjs';
import {git,project} from './change-scope-helpers.mjs';
import {taskIntentSha256} from '../lib/task-intent.mjs';

test('Gherkin validator accepts bilingual single and multi scenario texts with type tags',()=>{
 const single=validateGherkin(['@negative','场景: 退款超限','假如 可退余额 100','当 提交退款 150','那么 拒绝并返回 REFUND_EXCEEDED'].join('\n'));
 assert.deepEqual(single.violations,[]);
 assert.deepEqual(single.types,['negative']);
 const multi=validateGherkin(['Feature: refund','@normal','Scenario: refund within balance','Given balance 100','When refund 80','Then approve','@state-transition','场景: 冻结账户退款','假如 账户已冻结','当 提交退款','而且 金额大于 0','那么 返回账户状态错误'].join('\n'));
 assert.deepEqual(multi.violations,[]);
 assert.deepEqual(multi.types,['normal','state-transition']);
 assert.equal(multi.scenarios.length,2);
});

test('Gherkin validator names structural violations per scenario',()=>{
 const missingThen=validateGherkin(['场景: 只做准备','假如 x','当 y'].join('\n'));
 assert.equal(missingThen.violations.some(v=>v.rule==='missing-then'),true);
 const leadingAnd=validateGherkin(['场景: 起手 And','而且 继续'].join('\n'));
 assert.equal(leadingAnd.violations.some(v=>v.rule==='leading-and-but'),true);
 const outside=validateGherkin(['假如 尚无场景'].join('\n'));
 assert.equal(outside.violations.some(v=>v.rule==='steps-outside-scenario'),true);
 assert.equal(outside.violations.some(v=>v.rule==='no-scenario'),true);
 const empty=validateGherkin(['场景: 空场景'].join('\n'));
 assert.equal(empty.violations.some(v=>v.rule==='empty-scenario'),true);
 const noise=validateGherkin(['场景: x','当 y','那么 z','这是一行没人认识的文本'].join('\n'));
 assert.equal(noise.violations.some(v=>v.rule==='unrecognized-line'),true);
 const examples=validateGherkin(['场景大纲: 边界','当 提交 <金额>','那么 <结果>','示例:','  | 金额 | 结果 |','  | 0 | 拒绝 |'].join('\n'));
 assert.deepEqual(examples.violations,[]);
 assert.equal(examples.exampleRows,2);
});

test('EARS validator matches all five templates in both languages and derives type sets',()=>{
 const cases=[
  ['The payment service shall return a receipt id.','ubiquitous',['normal']],
  ['When a refund exceeds the balance, the system shall reject it.','event-driven',['normal']],
  ['While the account is frozen, the system shall reject withdrawals.','state-driven',['state-transition']],
  ['If the amount is negative, then the system shall reject the request.','unwanted-behavior',['negative','exception']],
  ['Where multi-currency is included, the system shall convert at the posted rate.','optional-feature',['normal']],
  ['支付服务应当返回受理编号。','ubiquitous',['normal']],
  ['当退款超过可退余额时，支付系统应当拒绝并返回错误。','event-driven',['normal']],
  ['在账户冻结期间，支付系统应当拒绝提现。','state-driven',['state-transition']],
  ['如果金额为负，则支付系统应当拒绝该请求。','unwanted-behavior',['negative','exception']],
  ['其中多币种已开通，支付系统应当按挂牌汇率折算。','optional-feature',['normal']]
 ];
 for(const [text,template,types] of cases){
  const result=validateEars(text);
  assert.deepEqual(result.violations,[],text);
  assert.equal(result.statements[0].template,template,text);
  assert.deepEqual(result.types,types,text);
 }
 const multi=validateEars('当退款超过可退余额时，系统应当拒绝。\n在账户冻结期间，系统应当拒绝提现。');
 assert.deepEqual(multi.types,['normal','state-transition']);
 assert.deepEqual(validateEars('这句话不是 EARS').violations,[{rule:'unmatched-statement',line:'这句话不是 EARS'}]);
 assert.equal(validateEars('').violations.some(v=>v.rule==='no-statement'),true);
});

test('evaluateAc keeps free text untouched and routes by format',()=>{
 assert.deepEqual(evaluateAc({text:'自由文本'}),{format:null,violations:[],types:[]});
 assert.equal(evaluateAc({text:'x',format:'prolog'}).violations[0].rule,'unknown-format');
 const gherkin=evaluateAc({format:'gherkin',text:'@negative\n场景: t\n当 x\n那么 y'});
 assert.deepEqual(gherkin.types,['negative']);
 assert.equal(gherkin.scenarios,1);
 const ears=evaluateAc({format:'ears',text:'系统应当返回编号。'});
 assert.deepEqual(ears.types,['normal']);
 assert.equal(acTypeConflict({type:'state-transition'},ears),true);
 assert.equal(acTypeConflict({type:'normal'},ears),false);
 assert.equal(acTypeConflict({type:'normal'},evaluateAc({text:'自由文本'})),false);
});

const intentWithAc={taskId:'ac-task',statement:'带结构化验收条件的任务',scope:['src/**','scope.json'],acceptance:[{text:'@negative\n场景: 退款超限\n假如 余额 100\n当 退款 150\n那么 拒绝',format:'gherkin'},{text:'如果金额为负，则系统应当拒绝。',format:'ears',type:'negative'}],createdAt:'2026-10-01T00:00:00.000Z',confirmedBy:'user'};

test('change-scope judges declared AC structures and passes valid ones',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json');
 fs.mkdirSync(path.join(f.root,'.quality-gate','registries'),{recursive:true});
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify(intentWithAc));
 f.spec.taskIntent={file:'.quality-gate/registries/task-intent.json',acknowledgedSha256:taskIntentSha256(intentWithAc)};
 f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.deepEqual(result.evidence[0].details.taskIntent.acceptanceStructure.violations,[]);
 assert.equal(result.evidence[0].details.taskIntent.acceptanceStructure.structured,2);
});

test('change-scope fails naming ac-structure-invalid and ac-type-conflict',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json');
 fs.mkdirSync(path.join(f.root,'.quality-gate','registries'),{recursive:true});
 const broken={...intentWithAc,acceptance:[{text:'场景: 缺 Then\n当 只有前置',format:'gherkin'},{text:'系统应当返回编号。',format:'ears',type:'state-transition'}]};
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify(broken));
 f.spec.taskIntent={file:'.quality-gate/registries/task-intent.json',acknowledgedSha256:taskIntentSha256(broken)};
 f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const violations=result.evidence[0].details.taskIntent.acceptanceStructure.violations;
 assert.equal(violations.some(v=>v.rule==='gherkin:missing-then'),true);
 assert.equal(violations.some(v=>v.rule==='ac-type-conflict'&&v.declared==='state-transition'),true);
 const reasons=failureReasons(result.evidence[0]);
 assert.equal(reasons.some(r=>r.includes('AC[0]')&&r.includes('gherkin:missing-then')),true);
 assert.equal(reasons.some(r=>r.includes('AC[1]')&&r.includes('声明类型 state-transition')),true);
});

test('traceability accepts gherkin-tagged and ears-typed criteria and covers requiredTypes',t=>{
 const f=project(t);
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'AC 结构化'}],gates:[{id:'probe',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C0',argv:['$NODE','-e','0'],timeoutMs:1000},{id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close'],claimId:'C0',file:'requirements.json',defaultRequiredTypes:['normal','negative']}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(config));
 fs.writeFileSync(path.join(f.root,'src','impl.mjs'),'export const n=1;\n');
 fs.writeFileSync(path.join(f.root,'requirements.json'),JSON.stringify({requirements:[{id:'R1',statement:'退款上限',acceptanceCriteria:[
  {id:'AC1',statement:'@normal\n场景: 正常退款\n当 退款 50\n那么 通过',format:'gherkin',codeFiles:['src/impl.mjs'],testGateIds:['probe']},
  {id:'AC2',statement:'如果金额为负，则系统应当拒绝。',format:'ears',type:'negative',codeFiles:['src/impl.mjs'],testGateIds:['probe']}
 ]}]}));
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const rtm=result.evidence.find(e=>e.gateId==='rtm');
 const criterion=rtm.details.requirements[0].acceptanceCriteria;
 assert.deepEqual(criterion[0].types,['normal']);
 assert.deepEqual(criterion[1].types,['negative']);
 assert.deepEqual(rtm.details.requirements[0].missingTypes,[]);
});

test('traceability fails on structure violations while tags still satisfy requiredTypes',t=>{
 const f=project(t);
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'AC 结构化'}],gates:[{id:'probe',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C0',argv:['$NODE','-e','0'],timeoutMs:1000},{id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close'],claimId:'C0',file:'requirements.json',defaultRequiredTypes:['negative']}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(config));
 fs.writeFileSync(path.join(f.root,'src','impl.mjs'),'export const n=1;\n');
 fs.writeFileSync(path.join(f.root,'requirements.json'),JSON.stringify({requirements:[{id:'R1',statement:'退款上限',acceptanceCriteria:[
  {id:'AC1',statement:'@negative\n场景: 结构坏了\n当 缺少结果',format:'gherkin',codeFiles:['src/impl.mjs'],testGateIds:['probe']}
 ]}]}));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const rtm=result.evidence.find(e=>e.gateId==='rtm');
 const criterion=rtm.details.requirements[0].acceptanceCriteria[0];
 assert.equal(criterion.status,'FAIL');
 assert.equal(criterion.structureViolations.some(v=>v.rule==='gherkin:missing-then'),true);
 assert.deepEqual(rtm.details.requirements[0].missingTypes,[]);
 const reasons=failureReasons(rtm);
 assert.equal(reasons.some(r=>r.includes('AC1 结构无效（gherkin:missing-then')),true);
});
