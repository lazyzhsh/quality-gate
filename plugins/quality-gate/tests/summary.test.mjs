import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
import {run,GATE_KINDS} from '../lib/kernel.mjs';
import {renderSummary,renderBrief,durationText,stripCwd,failureReasons,hasFailureExtractor,evidenceStrength,sourceDistribution} from '../lib/summary.mjs';
const adapter=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
const invoke=input=>{const result=spawnSync(process.execPath,[adapter],{input:JSON.stringify(input)+'\n',encoding:'utf8'});assert.equal(result.status,0);return JSON.parse(result.stdout);};

test('passing run renders table, archive footer and a compact brief',t=>{
 const f=fixture(t);
 const result=run(f.root);
 const summary=renderSummary(result);
 assert.match(summary,/\*\*Quality Gate PASS\*\* · close · 1\/1 通过/);
 // v1.31：PASS 而无任何来源信号的门禁显式显示"无信号"——与非 PASS 的 "—" 分担不同含义
 assert.match(summary,/\| build \| L1 \| command \| ✅ PASS \| 无信号 \| [\d.]+s \| — \| — \|/);
 assert.match(summary,/全部通过；证据已归档。/);
 assert.equal(result.evidence[0].kind,'command');
 assert.equal(result.evidence[0].level,'L1');
});

test('brief keeps pass to headline, domains and evidence pointer without the table',t=>{
 const f=fixture(t);
 const result=run(f.root);
 const brief=renderBrief(result);
 assert.match(brief,/✅ \*\*Quality Gate PASS\*\* · close · 1\/1 通过 · 耗时 [\d.]+s · run=/);
 assert.match(brief,/层级覆盖:.*L1 ✓/);
 assert.match(brief,/完整证据: .+\.quality-gate[\\/]runs[\\/].+ · 全表: node ".*qgate\.mjs" report "[^"]+" [0-9a-f]{8}/);
 assert.ok(!brief.includes('| ID |'),'brief must not carry the full table');
});

test('suggestion column maps status to next action',t=>{
 const f=fixture(t);
 f.c.claims.push({id:'C2',statement:'rtm'});
 f.c.gates[0].argv[2]='process.exit(1)';
 f.c.gates.push({id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'requirements.json'},{id:'later',kind:'command',level:'L1',enabled:true,stages:['release'],argv:[process.execPath,'-e','0'],claimId:'C1',timeoutMs:1000});
 f.save();
 fs.writeFileSync(path.join(f.root,'requirements.json'),JSON.stringify({requirements:[{id:'REQ-1',statement:'x',acceptanceCriteria:[]}]}));
 const result=run(f.root);
 const summary=renderSummary(result);
 assert.match(summary,/❌ FAIL \|.*\| 按原因修复后重跑 \|/);
 assert.match(summary,/⚠️ ERROR \|.*\| 检查 runner\/配置输入 \|/);
 assert.match(summary,/⏭️ SKIP \|.*\| 不在本阶段执行 \|/);
 assert.match(summary,/\| 建议 \|/);
});

test('headline duration formats sub-minute and minute runs',()=>{
 assert.equal(durationText('2026-01-01T00:00:00.000Z','2026-01-01T00:00:18.250Z'),'18.3s');
 assert.equal(durationText('2026-01-01T00:00:00.000Z','2026-01-01T00:01:03.400Z'),'1m 03s');
 assert.equal(durationText('bogus','2026-01-01T00:00:00.000Z'),null);
 assert.equal(durationText('2026-01-01T00:00:05.000Z','2026-01-01T00:00:00.000Z'),null);
});

test('stripCwd relativizes paths under the working directory only',()=>{
 const sub=path.join(process.cwd(),'plugins','x.json');
 assert.equal(stripCwd(sub),path.join('plugins','x.json'));
 assert.equal(stripCwd(process.cwd()),'.');
 assert.equal(stripCwd(os.tmpdir()),os.tmpdir());
 assert.equal(stripCwd(undefined),undefined);
});

test('failing command gate reports exit code and stderr tail',t=>{
 const f=fixture(t);
 f.c.gates[0].argv[2]='console.error("boom | pipe");process.exit(1)';f.save();
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const summary=renderSummary(result);
 assert.match(summary,/\| build \| L1 \| command \| ❌ FAIL \|/);
 assert.match(summary,/退出码 1/);
 assert.match(summary,/boom \\| pipe/);
 assert.match(summary,/重跑: node ".*qgate\.mjs" "[^"]+" close/);
 assert.match(summary,/修复失败项后重跑/);
});

test('gate error surfaces the failure message as reason',t=>{
 const f=fixture(t);
 f.c.claims.push({id:'C2',statement:'rtm'});
 f.c.gates.push({id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'requirements.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'requirements.json'),JSON.stringify({requirements:[{id:'REQ-1',statement:'x',acceptanceCriteria:[]}]}));
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
 const summary=renderSummary(result);
 assert.match(summary,/⚠️ ERROR/);
 assert.match(summary,/Invalid requirement/);
});

test('skipped gates render with skip marker and are counted',t=>{
 const f=fixture(t);
 f.c.gates[0].stages=['pr'];f.save();
 const result=run(f.root);
 const summary=renderSummary(result);
 assert.match(summary,/1\/1 通过 · 1 跳过|0\/0 通过 · 1 跳过/);
 assert.match(summary,/⏭️ SKIP/);
});

test('traceability failures list missing types, missing code and failing linked gate',t=>{
 const f=fixture(t);
 f.c.claims.push({id:'C2',statement:'rtm'});
 f.c.gates[0].argv[2]='process.exit(1)';
 f.c.gates.push({id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'requirements.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'app.mjs'),'export const ready=true;\n');
 fs.writeFileSync(path.join(f.root,'requirements.json'),JSON.stringify({requirements:[{id:'REQ-1',statement:'demo',requiredTypes:['boundary'],acceptanceCriteria:[{id:'AC-1',statement:'parses',type:'normal',codeFiles:['missing.mjs'],testGateIds:['build']}]}]}));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 const reasons=failureReasons(result.evidence.find(e=>e.gateId==='rtm'));
 assert.deepEqual(reasons,['REQ-1 缺少类型: boundary','AC-1 实现缺失: missing.mjs','AC-1 测试 build=FAIL']);
});

test('decision register failure lists unresolved ids',t=>{
 const f=fixture(t);
 f.c.claims.push({id:'C2',statement:'decisions'});
 f.c.gates.push({id:'dec',kind:'decisions',level:'L0',enabled:true,stages:['close'],claimId:'C2',file:'decisions.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'decisions.json'),JSON.stringify({decisions:[{id:'D-1',question:'Q',status:'open',owner:'team',resolution:'pending',evidence:'ADR-1'},{id:'D-2',question:'Q',status:'deferred',owner:'team',resolution:'later',evidence:'ADR-2',revisitBy:'2099-12-31'}]}));
 const result=run(f.root);
 const reasons=failureReasons(result.evidence.find(e=>e.gateId==='dec'));
 assert.deepEqual(reasons,['未闭合决策: D-1、D-2']);
 assert.match(renderSummary(result),/未闭合决策: D-1、D-2/);
});

test('new W1/W2 declarations surface specific summary reasons',()=>{
 const noneCases=[
  ['assumptions',{registerIssues:['empty-register-undeclared']},'空登记未显式声明'],
  ['debt',{registerIssues:['none-with-entries']},'none:true 与非空登记矛盾'],
  ['decisions',{unresolved:['D-9'],decisions:[{id:'D-9',reasons:['provenance-required']}]},'纯文本不再放行'],
  ['decisions',{unresolved:['D-9'],decisions:[{id:'D-9',reasons:['revisit-overdue'],revisitBy:'2000-01-01'}]},'悬置决策已过复审期限'],
  ['change-scope',{selfGuard:{status:'spec-changed',acknowledged:'aaaaaaaa0000',actual:'bbbbbbbb0000'}},'scope spec 已被修改未经重新确认'],
  ['change-scope',{baseAnchor:{status:'base-moved',pinned:'aaaaaaaa0000',baseCommit:'bbbbbbbb0000'}},'基线已前移'],
  ['traceability',{requirements:[{id:'R-9',missingPrdRef:true,acceptanceCriteria:[]}]},'缺少 PRD 绑定'],
  ['traceability',{requirements:[{id:'R-9',prdRef:{file:'gone.md',section:'1',status:'MISSING'},acceptanceCriteria:[]}]},'PRD 引用文件缺失'],
  ['behavior',{baseline:{mode:'git',status:'missing'}},'基线来源缺失'],
  ['behavior',{baseline:{mode:'git',status:'embedded'}},'基线为内嵌声明'],
  ['engineering',{checks:[{id:'unit',type:'test',status:'FAIL',total:3,baseline:{mode:'git',status:'missing',accepted:false}}]},'基线来源缺失'],
  ['alignment',{requireLive:true,differences:[]},'观察为静态读取'],
  ['consistency',{checks:[{id:'mutations',type:'append-only',status:'FAIL',mutations:[],sourceType:'declared',sourceAccepted:false,acceptedSourceTypes:['binlog','wal']}]},'不在接受列表'],
 ];
 for(const [kind,details,needle] of noneCases){
  const reasons=failureReasons({kind,status:'FAIL',details});
  assert.ok(reasons.some(reason=>reason.includes(needle)),`${kind} should mention: ${needle}; got ${JSON.stringify(reasons)}`);
 }
});

test('Stop hook block reason carries the summary table',t=>{
 const f=fixture(t);
 f.c.gates[0].argv[2]='process.exit(1)';f.save();
 const output=invoke({cwd:f.root,hook_event_name:'Stop'});
 assert.equal(output.decision,'block');
 assert.match(output.reason,/\| ID \| 域 \| Kind \| 状态 \| 来源 \| 耗时 \| 原因 \| 建议 \|/);
 assert.match(output.reason,/❌ FAIL/);
 assert.match(output.reason,/退出码 1/);
});

test('failure extractors exist for every registered gate kind',()=>{
 for(const kind of GATE_KINDS)assert.ok(hasFailureExtractor(kind),`no failure extractor for kind ${kind}`);
});

test('per-kind extractors produce specific failure reasons across L0-L5',()=>{
 const cases=[
  ['assumptions',{unresolved:['A-9']},'未闭合假设: A-9'],
  ['decisions',{unresolved:['D-2']},'未闭合决策: D-2'],
  ['change-scope',{overScope:['x/y.ts']},'超范围变更: x/y.ts'],
  ['traceability',{requirements:[{id:'R1',missingTypes:['boundary'],acceptanceCriteria:[]}]},'R1 缺少类型: boundary'],
  ['command',{exitCode:3,stderr:''},'退出码 3'],
  ['engineering',{checks:[{id:'unit',type:'test',status:'FAIL',failed:2,total:5}]},'unit: 2/5 个测试失败'],
  ['persistence',{request:{status:200},httpMatches:false,expectedHttpStatus:201,recordCount:1,fields:[{field:'amount',status:'FAIL',expected:100,actual:99}]},'字段 amount: 期望 100，实际 99'],
  ['alignment',{differences:[{path:'/items/0/path',rule:'missing'}]},'/items/0/path missing'],
  ['invariant',{assertions:[{id:'INV-1',status:'FAIL',left:5,rightField:'ledger',right:4}]},'断言 INV-1 失败: 5 对 ledger'],
  ['ontology-map',{mappings:[{id:'M1',status:'MISSING',iri:'https://example.org/C'}]},'映射 M1 未命中本体'],
  ['semantic-profile',{violations:[{recordId:'r1',path:'status',rule:'allowedValues'}]},'记录 r1 status 违反 allowedValues'],
  ['behavior',{cases:[{id:'b1',status:'FAIL',expected:1,actual:2}]},'用例 b1: 期望 1，实际 2'],
  ['journey',{scenarios:[{id:'smoke',steps:[{id:'health',status:'FAIL',expected:'ok',actual:'down'}]}]},'旅程 smoke 步骤 health 不符'],
  ['visual',{actualFile:'out.svg'},'视觉制品与基线不一致: out.svg'],
  ['property',{seed:7,counterexamples:[{id:'case-9'}]},'反例 case-9（seed=7）'],
  ['semantic-alignment',{findings:[{symbol:'Agreement',status:'FAIL',expectedIri:'https://example.org/Agreement',actualIri:'https://example.org/Commitment'}]},'符号 Agreement: 期望'],
  ['terminology',{findings:[{rule:'duplicateLabel',label:'agreement',concepts:['https://example.org/Agreement','https://example.org/Contract']}]},'标签 agreement 被 2 个概念使用'],
  ['semantic-relation',{findings:[{from:'https://example.org/Contract',predicate:'hasParty',to:'https://example.org/Party',rule:'unsanctionedRelation'}]},'本体未认可该关系'],
  ['semantic-constraint',{violations:[{constraintId:'CAPTURE_LIMIT',caseId:'case-3',operator:'le',left:120,right:100,status:'FAIL'}]},'约束 CAPTURE_LIMIT 在案例 case-3 失败'],
  ['semantic-state',{findings:[{caseId:'case-2',from:'draft',to:'terminated',rule:'illegalTransition'}]},'案例 case-2 非法转换'],
  ['semantic-instance',{findings:[{entityId:'ent-9',typeIris:['urn:a','urn:b'],pair:['urn:a','urn:b'],rule:'disjointInstances'}]},'实体 ent-9 被互斥的多类型标注'],
  ['semantic-exposure',{findings:[{label:'settlement policy',iri:'urn:x',locations:['api.mjs:12'],rule:'internalConceptExposed'}]},'内部概念暴露在公共面'],
  ['semantic-consistency',{reasoner:{status:'DISAGREEMENT',tool:'pyowl@2',claimedOnlyByExternal:[['urn:a','urn:b']],kernelOnly:[]}},'外部 reasoner 与内建推理不一致'],
  ['metrics',{metrics:[{name:'p95ms',actual:900,threshold:{max:500},status:'FAIL'}]},'p95ms=900 超出阈值'],
  ['scan',{findings:[{severity:'high',rule:'SQLi',location:'a.py:3',blocked:true}]},'high SQLi @ a.py:3'],
  ['resilience',{scenarios:[{id:'db-down',status:'FAIL',recoveryMs:9000,maxRecoveryMs:3000,finalState:'degraded',expectedFinalState:'healthy',missingSignals:['alert']}]},'db-down: 恢复 9000ms > 3000ms；最终状态 degraded ≠ healthy；缺少信号 alert'],
  ['trace-continuity',{links:[{call:'gateway->orders',status:'FAIL',problems:[{rule:'trace-id-discontinuity',problem:'child 新开 traceId（parent aaa ≠ child bbb）'}]}]},'断链 gateway->orders（trace-id-discontinuity）'],
  ['consistency',{checks:[{id:'ledger',type:'zero-sum',status:'FAIL',unbalanced:[{id:'mo-1024',balance:-30}]}]},'ledger: 账单 mo-1024 借贷不平衡（差额 -30）'],
  ['budget',{violations:[{rule:'budgetExceeded',service:'order-api',requiredMs:6400,budgetMs:5000}]},'order-api: 下游超时需求 6400ms > 预算 5000ms'],
 ['rerun',{violations:[{rule:'outputDivergence',job:'settlement-batch',hashes:['aa','bb']}]},'任务 settlement-batch: 同 seed 双次运行输出哈希不一致'],
  ['configuration',{findings:[{environment:'prod',path:'db.port',rule:'undeclared-difference'}]},'prod db.port undeclared-difference'],
  ['documentation',{artifacts:[{role:'api',path:'API.md',version:'1.0',expectedVersion:'1.1',missingTopics:[],status:'FAIL'}]},'api 版本 1.0 ≠ 1.1'],
  ['debt',{items:[{id:'TD-1',reasons:['overdue'],gateStatus:'FAIL'}]},'债务 TD-1: overdue'],
  ['topology',{findings:[{rule:'replicaThreshold',service:'order-api',replicas:1,min:2}],minCutOrder1:[{service:'payment-db',domain:'single-replica'}]},'order-api: 副本数低于状态模型阈值（1 < 2）'],
  ['consumer-matrix',{attribution:[{method:'POST',path:'/refunds',field:'amount',rule:'typeChanged',expected:'integer',actual:'decimal',brokenConsumers:['settlement-batch']}],usageFindings:[{consumer:'orders-web',method:'POST',path:'/payments',field:'note'}]},'settlement-batch: POST /refunds amount 类型变更'],
 ['convention-alignment',{rules:[{id:'TERM-x',severity:'fail',source:{file:'AGENTS.md',section:'术语约定'},hits:[{path:'docs/a.md',line:3,word:'旧词'}]}]},'约定 TERM-x 命中: 旧词 @ docs/a.md:3'],
 ['symbol-grounding',{unresolved:[{path:'src/app.ts',specifier:'./ghost.mjs',lines:[3],attempts:['src/ghost.mjs']}]},'src/app.ts:3 说明符 ./ghost.mjs 无法对账'],
 ];
 assert.equal(cases.length,GATE_KINDS.length);
 for(const [kind,details,needle] of cases){
  const reasons=failureReasons({kind,status:'FAIL',details});
  assert.ok(reasons.some(reason=>reason.includes(needle)),`${kind} should mention: ${needle}; got ${JSON.stringify(reasons)}`);
 }
});

// ---- 受控表达第一批（X12，v1.25）：失败建议先修复制品；放松验收属显式变更，不并列成可选修复 ----

test('failure suggestions lead with fixing the artifact and demote acceptance changes (X12)',()=>{
 // AC 结构/类型违规：修复=修正结构；"改回自由文本"不再作为并列修复选项
 const acReasons=failureReasons({kind:'change-scope',status:'FAIL',details:{taskIntent:{acceptanceStructure:{violations:[
  {acceptance:'AC-1',rule:'missing-then',line:4},
  {acceptance:'AC-2',rule:'ac-type-conflict',declared:'normal',derived:['state-transition']}
 ]}}}});
 assert.ok(acReasons.every(reason=>reason.includes('修正 Gherkin/EARS 结构')),JSON.stringify(acReasons));
 assert.ok(acReasons.every(reason=>reason.includes('验收要求变更')&&reason.includes('显式')),JSON.stringify(acReasons));
 assert.ok(acReasons.every(reason=>!reason.includes('或去掉 format')&&!reason.includes('或改回自由文本')),JSON.stringify(acReasons));
 const traceReasons=failureReasons({kind:'traceability',status:'FAIL',details:{requirements:[{id:'R1',acceptanceCriteria:[{id:'AC-1',structureViolations:[{rule:'leading-and',scenario:'退款'}]}]}]}});
 assert.ok(traceReasons.every(reason=>reason.includes('修正 Gherkin/EARS 结构')&&reason.includes('验收要求变更')),JSON.stringify(traceReasons));
 // 约定命中：修复=改制品用词；更新豁免定位为规则调整，不再与修复并列
 const conventionReasons=failureReasons({kind:'convention-alignment',status:'FAIL',details:{rules:[{id:'TERM-x',severity:'fail',source:{file:'AGENTS.md',section:'术语约定'},hits:[{path:'docs/a.md',line:3,word:'旧词'}]}]}});
 assert.ok(conventionReasons.every(reason=>reason.includes('修复制品用词')),JSON.stringify(conventionReasons));
 assert.ok(conventionReasons.every(reason=>reason.includes('属调整规则')&&reason.includes('显式变更登记')),JSON.stringify(conventionReasons));
 assert.ok(conventionReasons.every(reason=>!reason.includes('修复用词或更新豁免')),JSON.stringify(conventionReasons));
 assert.ok(conventionReasons.every(reason=>reason.includes('来源 AGENTS.md §术语约定')),JSON.stringify(conventionReasons));
});

// ---- 受控表达第二批（X13，v1.26）：逐门禁来源/advisory 可见性/例外不隐藏/声明关联 ----

const x13Report=(evidence,extra={})=>({
 status:'PASS',stage:'close',id:'0123456789abcdef0123456789abcdef',root:'.',reportPath:'runs/x.json',
 startedAt:'2026-01-01T00:00:00.000Z',finishedAt:'2026-01-01T00:00:01.000Z',
 evidence,...extra
});

test('mixed sources render per gate and never as all kernel-verified (X13)',()=>{
 const report=x13Report([
  {gateId:'anchored',claimId:'C1',level:'L1',kind:'engineering',status:'PASS',details:{checks:[{id:'unit',type:'test',status:'PASS',total:8,passed:8,failed:0,skipped:0,rawOutput:{crossCheck:'match'}}]}},
  {gateId:'declared',claimId:'C1',level:'L1',kind:'engineering',status:'PASS',details:{checks:[{id:'unit',type:'test',status:'PASS',total:5,passed:5,failed:0,skipped:0}]}},
  {gateId:'downgraded',claimId:'C1',level:'L3',kind:'behavior',status:'PASS',details:{baseline:{status:'embedded'},cases:[{id:'b1'}]}}
 ]);
 const full=renderSummary(report),brief=renderBrief(report);
 // 逐门禁来源列：同一运行内三类来源各自如实呈现
 assert.match(full,/\| anchored \| L1 \| engineering \| ✅ PASS \| 核验（原始输出解析）；声明 \|/);
 assert.match(full,/\| declared \| L1 \| engineering \| ✅ PASS \| 声明 \|/);
 assert.match(full,/\| downgraded \| L3 \| behavior \| ✅ PASS \| 声明；降级（内嵌基线） \|/);
 // 反例：仅声明来源的门禁不得显示为核验
 assert.ok(!/\| declared [^\n]*核验/.test(full),'declared-only gate must not render as 核验');
 // 分布随证据力行：核验 1、声明 1、降级 1
 assert.match(brief,/来源 核验 1、声明 1、降级 1/);
 // 非 PASS 门禁不参与来源标注
 const failing=x13Report([{gateId:'bad',claimId:'C1',level:'L1',kind:'command',status:'ERROR',details:{error:'spawn x ENOENT'}}]);
 assert.match(renderSummary(failing),/\| bad \| L1 \| command \| ⚠️ ERROR \| — \|/);
});

test('kernel recompute and content check anchor sources; unsignaled PASS shows explicitly (v1.31)',()=>{
 const report=x13Report([
  {gateId:'png',claimId:'C1',level:'L3',kind:'visual',status:'PASS',details:{diffSource:'kernel-recompute',diff:{pixels:0,totalPixels:4}}},
  {gateId:'docs',claimId:'C1',level:'L5',kind:'documentation',status:'PASS',details:{artifacts:[{role:'user',path:'README.md',version:'1.31.0',missingTopics:[],status:'PASS',contentCheck:{status:'PASS'}}]}},
  {gateId:'metric',claimId:'C1',level:'L4',kind:'metrics',status:'PASS',details:{metrics:[{name:'cycles',actual:0,threshold:{max:0},status:'PASS'}]}},
  {gateId:'quiet',claimId:'C1',level:'L1',kind:'command',status:'PASS',details:{exitCode:0}},
 ]);
 const full=renderSummary(report),brief=renderBrief(report);
 // 二轮评审缺口：内核已重算像素仍显示零核验——现计入核验信号；内容级核验同理
 assert.match(full,/\| png \| L3 \| visual \| ✅ PASS \| 核验（内核像素重算）/);
 // 字节一致（exact-bytes）＝内核计算两侧 SHA256 相等——同为内核核验信号（v1.31.1）
 const exact=x13Report([{gateId:'svg',claimId:'C1',level:'L3',kind:'visual',status:'PASS',details:{comparison:'exact-bytes'}}]);
 assert.match(renderSummary(exact),/\| svg \| L3 \| visual \| ✅ PASS \| 核验（字节一致）/);
 assert.match(full,/\| docs \| L5 \| documentation \| ✅ PASS \| 核验（内容级核验）/);
 // metrics 自报指标值归入声明（此前无分类）；PASS 无信号门禁显式"无信号"不再与 非 PASS 的 — 混用
 assert.match(full,/\| metric \| L4 \| metrics \| ✅ PASS \| 声明/);
 assert.match(full,/\| quiet \| L1 \| command \| ✅ PASS \| 无信号/);
 assert.match(brief,/来源 核验 2、声明 1、无信号 1/);
 const strength=evidenceStrength(report);
 assert.equal(strength.signals.kernelRecomputes,1);
 assert.equal(strength.signals.contentChecks,1);
 assert.equal(strength.level,'anchored');
 const distribution=sourceDistribution(report);
 assert.deepEqual(distribution,{verified:2,declared:1,downgraded:0,none:1});
 // 未执行内容级核验的 documentation 仍是声明来源（不因 kind 误标核验）
 const declared=x13Report([{gateId:'docs2',claimId:'C1',level:'L5',kind:'documentation',status:'PASS',details:{artifacts:[{role:'user',path:'README.md',version:'1.31.0',missingTopics:[],status:'PASS'}]}}]);
 assert.match(renderSummary(declared),/\| docs2 \| L5 \| documentation \| ✅ PASS \| 无信号/);
});

test('advisory convention hits stay visible without changing the verdict (X13)',()=>{
 const report=x13Report([
  {gateId:'conv',claimId:'C1',level:'L0',kind:'convention-alignment',status:'PASS',details:{ruleCount:2,blockingHits:0,advisoryHits:2,rules:[
   {id:'STYLE-long',severity:'advisory',source:{file:'AGENTS.md'},hits:[{path:'docs/a.md',line:3,word:'长句'},{path:'docs/b.md',line:9,word:'长句'}]},
   {id:'STYLE-vague',severity:'advisory',source:{file:'AGENTS.md'},hits:[{path:'docs/c.md',line:1,word:'适当'}]}
  ]}}
 ]);
 const brief=renderBrief(report),full=renderSummary(report);
 assert.equal(report.status,'PASS');
 for(const text of [brief,full]){
  assert.match(text,/advisory 建议命中: 共 3 项（conv: STYLE-long ×2、STYLE-vague ×1）——不阻断判定/);
 }
 // 无 advisory 命中时不显示该行（不虚报）
 const clean=x13Report([{gateId:'conv',claimId:'C1',level:'L0',kind:'convention-alignment',status:'PASS',details:{ruleCount:1,blockingHits:0,advisoryHits:0,rules:[{id:'R',severity:'fail',source:{file:'a.md'},hits:[]}]}}]);
 assert.ok(!renderBrief(clean).includes('advisory 建议命中'));
});

test('brief does not hide waived exceptions on PASS (X13)',()=>{
 const report=x13Report([
  {gateId:'g',claimId:'C1',level:'L1',kind:'command',status:'PASS',details:{}}
 ],{exceptions:[{id:'EX-1',status:'approved',approvedBy:'owner',approvedAt:'2026-01-01',expiresAt:'2099-12-31',waiver:{status:'waived'}}]});
 const brief=renderBrief(report);
 assert.match(brief,/已豁免例外: EX-1（至 2099-12-31）——不改变门禁判定，仅免于登记阻断/);
 assert.ok(!brief.includes('未决例外'),'waived-only run must not render 未决例外');
 // 未决例外在全表呈现（此时整体必为 FAIL——由内核判定，渲染只如实展示）
 const blocking=x13Report([{gateId:'g',claimId:'C1',level:'L1',kind:'command',status:'PASS',details:{}}],{status:'FAIL',exceptions:[{id:'EX-2',status:'proposed',waiver:{status:'blocking',reason:'not-yet-effective'}}]});
 assert.match(renderSummary(blocking),/未决例外: EX-2（审批未生效）——登记即阻断/);
});

test('claim association lists gate outcomes and flags unverified claims (X13)',()=>{
 const report=x13Report([
  {gateId:'g1',claimId:'C1',level:'L1',kind:'command',status:'PASS',details:{}},
  {gateId:'g2',claimId:'C2',level:'L1',kind:'command',status:'SKIP',details:'stage'}
 ],{claims:[{id:'C1',statement:'regression'},{id:'C2',statement:'perf'},{id:'C3',statement:'security'}]});
 // C2 有关联门禁但全部 SKIP、C3 无关联 → 均未验证但原因不同（v1.28 起区分）；边界句固定随行
 assert.match(renderSummary(report),/声明关联: C1 → g1 PASS · C2 → 未验证（关联门禁未执行或全部不适用） · C3 → 未验证（无关联门禁执行）——门禁 PASS 证明其配置输入与观察，不等于声明全文已被证明/);
 assert.match(renderBrief(report),/未验证声明: C2、C3（关联门禁未执行或全部不适用）/);
 // 旧归档兼容：条目无 claimId（pre-v1.0 形状）时不呈现声明关联、不误报未验证
 const legacy=x13Report([{gateId:'g1',level:'L1',kind:'command',status:'PASS',details:{}}],{claims:[{id:'C1',statement:'x'}]});
 assert.ok(!renderSummary(legacy).includes('声明关联'));
 assert.ok(!renderBrief(legacy).includes('未验证声明'));
});

// ---- v1.28（评审残余收口）：SKIP 原因显式化与不适用跳过审计 ----
test('skip suggestion distinguishes disabled, stage-not-selected and not-applicable (v1.28)',()=>{
 const mk=details=>x13Report([{gateId:'g',claimId:'C1',level:'L1',kind:'invariant',status:'SKIP',details}],{status:'SKIP'});
 assert.match(renderSummary(mk({reason:'disabled'})),/SKIP \|.*\| 未启用.enabled:false. \|/);
 assert.match(renderSummary(mk({reason:'stage-not-selected',stages:['pr']})),/SKIP \|.*\| 不在本阶段执行 \|/);
 assert.match(renderSummary(mk('Disabled or stage not selected')),/SKIP \|.*\| 未执行（未启用或不在本阶段） \|/);
 // 旧形状（无 reason 的对象）按阶段未选中呈现，不误报未启用
 assert.match(renderSummary(mk({})),/SKIP \|.*\| 不在本阶段执行 \|/);
});

test('all-conditions-missed invariant renders as not-applicable audit line, not stage skip (v1.28)',()=>{
 const report=x13Report([
  {gateId:'g-inv',claimId:'C1',level:'L2',kind:'invariant',status:'SKIP',details:{source:'obs',values:{flag:false},assertions:[{id:'A',status:'SKIP',reason:'Condition not met',when:{field:'flag',equals:true}}]}},
  {gateId:'g-ok',claimId:'C1',level:'L1',kind:'command',status:'PASS',details:{}}
 ]);
 const summary=renderSummary(report),brief=renderBrief(report);
 assert.match(summary,/不适用跳过: g-inv（断言条件未命中 1 项）——门禁已执行、断言条件全部未命中；视为必要证据属验收要求调整，须显式决策/);
 assert.match(summary,/invariant \|[^\n]*SKIP \|[^\n]*断言条件未命中（不适用）——视为必要证据属验收要求调整，须显式决策 \|/);
 assert.match(brief,/不适用跳过: g-inv（断言条件未命中 1 项）——门禁已执行、断言条件全部未命中/);
 // 声明 C1 仍有活跃门禁（g-ok PASS），不因 g-inv 不适用而误报未验证
 assert.ok(!brief.includes('未验证声明'),'claim with active PASS gate must not be flagged unverified');
});

test('symbol-grounding all-mode zero-scan surfaces, changed-files zero does not (v1.28)',()=>{
 const mk=details=>x13Report([{gateId:'g-sym',claimId:'C1',level:'L1',kind:'symbol-grounding',status:'PASS',details}],{});
 assert.match(renderSummary(mk({mode:'all',scannedFiles:0,unresolved:[],unresolvedMember:[],unresolvedReference:[]})),/扫描零文件: g-sym（include\/exclude 过滤后零文件）——范围未命中任何文件，零文件不构成检查证据/);
 assert.ok(!renderSummary(mk({mode:'changed-files',baseRef:'HEAD',scannedFiles:0,unresolved:[],unresolvedMember:[],unresolvedReference:[]})).includes('扫描零文件'),'changed-files zero = 没有变更，不提示零文件面');
 // 约定登记零扫描仍呈现（X14 原行为），行文案改为中性措辞
 const conv=x13Report([{gateId:'g-conv',claimId:'C1',level:'L0',kind:'convention-alignment',status:'PASS',details:{rules:[{id:'TERM-x',severity:'fail',scannedFiles:0,hits:[]}]}}],{});
 assert.match(renderSummary(conv),/扫描零文件: TERM-x（g-conv）——范围未命中任何文件，零文件不构成检查证据/);
});

test('symbol-grounding failure reasons cover named members and api references (v1.20)',()=>{
 const reasons=failureReasons({kind:'symbol-grounding',status:'FAIL',details:{
  unresolvedMember:[{path:'src/app.mjs',line:3,target:'src/util.mjs',member:'phantom'}],
  unresolvedReference:[
   {path:'src/client.mjs',line:4,kind:'endpoint',reference:'/ghosts'},
   {path:'src/client.mjs',line:5,kind:'config-key',reference:'GHOST_KEY'}
  ],
  importObservations:{observationGaps:1,observationUnresolved:1,languages:{python:{
   coverageGaps:[{module:'requests',locations:['src/app.py:2']}],
   unresolved:[{module:'ghost',detail:'ModuleNotFoundError'}]
  }}}
 }});
 assert.ok(reasons.some(reason=>reason.includes('成员 phantom 不在目标模块 src/util.mjs 的导出面')),JSON.stringify(reasons));
 assert.ok(reasons.some(reason=>reason.includes('端点 /ghosts 未在任何声明面')),JSON.stringify(reasons));
 assert.ok(reasons.some(reason=>reason.includes('配置键 GHOST_KEY 未在任何声明面')),JSON.stringify(reasons));
 assert.ok(reasons.some(reason=>reason.includes('引用 requests（src/app.py:2）无适配器回报')),JSON.stringify(reasons));
 assert.ok(reasons.some(reason=>reason.includes('python import ghost 无法解析（ModuleNotFoundError）')),JSON.stringify(reasons));
});

// ---- R12 证据力汇聚（v1.10.1）：只读聚合实测信号，不改判定，无信号不虚报 ----

const strengthReport=(evidence,extra={})=>({
 status:'PASS',stage:'close',id:'0123456789abcdef0123456789abcdef',root:'.',reportPath:'runs/x.json',
 startedAt:'2026-01-01T00:00:00.000Z',finishedAt:'2026-01-01T00:00:01.000Z',
 evidence,...extra
});

test('evidenceStrength aggregates anchors and quantities from passing gates only',()=>{
 const report=strengthReport([
  {gateId:'eng',level:'L1',kind:'engineering',status:'PASS',details:{checks:[
   {id:'unit',type:'test',status:'PASS',total:10,passed:9,failed:0,skipped:1,coverage:{tool:'c8',ratio:0.872,total:1000,covered:872},baseline:{status:'verified',mode:'any',accepted:true}},
   {id:'mut',type:'metric',status:'PASS',score:0.72,min:0.6}
  ]}},
  {gateId:'prop',level:'L3',kind:'property',status:'PASS',details:{seed:42,caseCount:40,counterexamples:[],passedCases:40}},
  {gateId:'re',level:'L4',kind:'rerun',status:'PASS',details:{file:'rerun.json',jobs:[
   {id:'settlement',runs:2,seed:7,deterministic:true},
   {id:'fee',runs:2,seed:8,deterministic:false}
  ]}},
  {gateId:'per',level:'L2',kind:'persistence',status:'PASS',details:{requireSnapshots:true,snapshots:{before:{},after:{},delta:[]}}},
  {gateId:'al',level:'L2',kind:'alignment',status:'PASS',details:{sourceFingerprint:{file:'openapi.json',sha256:'a'.repeat(64),actualSha256:'a'.repeat(64),status:'VERIFIED'}}},
  {gateId:'prop2',level:'L3',kind:'property',status:'FAIL',details:{seed:1,caseCount:5,counterexamples:[{id:'case-9'}],passedCases:4}}
 ]);
 const strength=evidenceStrength(report);
 assert.equal(strength.level,'anchored');
 assert.equal(strength.signals.gitBaselines,1);
 assert.equal(strength.signals.fingerprints,1);
 assert.equal(strength.signals.rerunDeterministic,1);
 assert.equal(strength.signals.snapshots,1);
 assert.deepEqual(strength.tests,{total:10,passed:9,failed:0,skipped:1,checks:1});
 assert.equal(strength.coverage.length,1);
 assert.equal(strength.mutation.length,1);
 assert.equal(strength.property.cases,40);
 assert.equal(strength.property.seed,42);
 const brief=renderBrief(report);
 assert.match(brief,/证据力: 核验级 · 信号 git 基线核验 1、来源指纹 1、双次运行一致 1、持久化快照 1/);
 assert.match(brief,/定量 测试 9\/10（跳过 1）、覆盖率 eng\.unit 87\.2%（c8）、变异 eng\.mut 72%、性质 40 例（seed 42）/);
 const full=renderSummary(report);
 assert.match(full,/证据力: 核验级/);
});

test('evidenceStrength grades self-reported quantities as declared when no kernel anchor exists',()=>{
 const report=strengthReport([
  {gateId:'eng',level:'L1',kind:'engineering',status:'PASS',details:{checks:[
   {id:'unit',type:'test',status:'PASS',total:8,passed:8,failed:0,skipped:0}
  ]}},
  {gateId:'beh',level:'L3',kind:'behavior',status:'PASS',details:{cases:[{id:'b1',status:'PASS'},{id:'b2',status:'PASS'},{id:'b3',status:'PASS'}]}}
 ]);
 const strength=evidenceStrength(report);
 assert.equal(strength.level,'declared');
 assert.equal(strength.signals.gitBaselines+strength.signals.fingerprints+strength.signals.rerunDeterministic+strength.signals.snapshots,0);
 assert.equal(strength.behaviorCases,3);
 assert.match(renderBrief(report),/证据力: 声明级 · 定量 测试 8\/8、行为 3 例/);
});

test('evidenceStrength downgrades when downgrade notes exist even with anchors',()=>{
 const report=strengthReport([
  {gateId:'beh',level:'L3',kind:'behavior',status:'PASS',details:{baseline:{status:'embedded',mode:'any',accepted:true},cases:[{id:'b1',status:'PASS'}]}},
  {gateId:'per',level:'L2',kind:'persistence',status:'PASS',details:{requireSnapshots:true,snapshots:{before:{},after:{},delta:[]}}}
 ]);
 const strength=evidenceStrength(report);
 assert.equal(strength.level,'downgraded');
 assert.equal(strength.downgrades,1);
 assert.equal(strength.signals.snapshots,1);
 const brief=renderBrief(report);
 assert.match(brief,/证据降级: beh: 基线为内嵌声明/);
 assert.match(brief,/证据力: 降级 · 信号 持久化快照 1/);
});

test('evidenceStrength reports none and renders no line when nothing measurable passed',()=>{
 const report=strengthReport([
  {gateId:'bud',level:'L4',kind:'budget',status:'PASS',details:{file:'budget.json',violations:[]}},
  {gateId:'later',level:'L4',kind:'budget',status:'SKIP',details:{}}
 ]);
 const strength=evidenceStrength(report);
 assert.equal(strength.level,'none');
 assert.equal(strength.signalTotal,0);
 assert.ok(!renderBrief(report).includes('证据力:'));
 assert.ok(!renderSummary(report).includes('证据力:'));
});
