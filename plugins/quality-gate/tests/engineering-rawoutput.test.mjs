import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes,evidenceStrength} from '../lib/summary.mjs';
import {project,engineering,configOf,saveConfig,unitCheck,focusChecks} from './engineering-helpers.mjs';


// ---- B1 rawOutput 声明即核验（v1.11.0）：unit 计数不再无条件信任 runner 自报 ----

const fakeUnitScript=observation=>`let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'fake-unit',...${JSON.stringify(observation)}}));
`;
const useFakeUnit=(root,observation)=>{
 fs.writeFileSync(path.join(root,'fake-unit.mjs'),fakeUnitScript(observation));
 const config=configOf(root);const gate=config.gates.find(gate=>gate.id==='engineering');
 const unit=gate.checks.find(check=>check.id==='unit');
 unit.argv=[process.execPath,'fake-unit.mjs'];
 delete unit.expected;delete unit.minTotal;delete unit.minCoverageRatio;delete unit.blockOnSkipped;
 gate.checks=[unit];gate.requiredChecks=['unit'];gate.timeoutMs=unit.timeoutMs;
 saveConfig(root,config);
};
const unitEvidence=result=>result.evidence.find(evidence=>evidence.gateId==='engineering').details.checks.find(check=>check.id==='unit');
const flatTap=fileURLToPath(new URL('./fixtures/raw/tap-node-flat.txt',import.meta.url));
const pytestXml=fileURLToPath(new URL('./fixtures/raw/junit-pytest.xml',import.meta.url));

test('declared rawOutput is kernel-parsed and cross-checked against self-reported counts',t=>{
 const root=project(t);focusChecks(root,['unit']);
 fs.copyFileSync(flatTap,path.join(root,'unit.tap'));
 useFakeUnit(root,{total:4,passed:2,failed:1,skipped:1,rawOutput:{format:'tap',file:'unit.tap'}});
 const result=run(root);
 const unit=unitEvidence(result);
 assert.equal(unit.status,'FAIL'); // 原始输出里有 1 个失败用例——判定以内核重算值为准
 assert.equal(unit.rawOutput.crossCheck,'match');
 assert.equal(unit.rawOutput.parser,'tap');
 assert.equal(unit.rawOutput.total,4);
 assert.equal(unit.rawOutput.caseCount,4);
 assert.equal(result.status,'FAIL');
});

test('junit rawOutput verifies too and real failures surface through kernel parsing',t=>{
 const root=project(t);focusChecks(root,['unit']);
 fs.copyFileSync(pytestXml,path.join(root,'junit.xml'));
 useFakeUnit(root,{total:4,passed:2,failed:1,skipped:1,rawOutput:{format:'junit',file:'junit.xml'}});
 const result=run(root);
 const unit=unitEvidence(result);
 assert.equal(unit.status,'FAIL');
 assert.equal(unit.rawOutput.parser,'junit');
 assert.equal(unit.rawOutput.crossCheck,'match');
});

test('rawOutput count mismatch fails closed as ERROR naming the disagreement',t=>{
 const root=project(t);focusChecks(root,['unit']);
 fs.copyFileSync(flatTap,path.join(root,'unit.tap'));
 useFakeUnit(root,{total:4,passed:4,failed:0,skipped:0,rawOutput:{format:'tap',file:'unit.tap'}});
 const result=run(root);
 const unit=unitEvidence(result);
 assert.equal(unit.status,'ERROR');
 assert.match(unit.error,/disagree with self-reported/);
 assert.match(unit.error,/passed reported 4 but raw file says 2/);
 assert.equal(unit.rawOutput,undefined);
});

test('requireRawOutput fails named when the observation declares no raw output',t=>{
 const root=project(t);focusChecks(root,['unit']);
 useFakeUnit(root,{total:2,passed:2,failed:0,skipped:0});
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').requireRawOutput=true;
 saveConfig(root,config);
 const result=run(root);
 const unit=unitEvidence(result);
 assert.equal(unit.status,'FAIL');
 assert.equal(unit.missingRawOutput,true);
 assert.equal(unit.requireRawOutput,true);
 const reasons=failureReasons(result.evidence.find(evidence=>evidence.gateId==='engineering'));
 assert.ok(reasons.some(reason=>reason.includes('缺少原始测试输出（requireRawOutput）')),JSON.stringify(reasons));
});

test('requireRawOutput false keeps legacy no-declaration semantics',t=>{
 const root=project(t);focusChecks(root,['unit']);
 useFakeUnit(root,{total:2,passed:2,failed:0,skipped:0});
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').requireRawOutput=false;
 saveConfig(root,config);
 const result=run(root);
 const unit=unitEvidence(result);
 assert.equal(unit.status,'PASS');
 assert.equal(unit.missingRawOutput,undefined);
});

test('malformed rawOutput declarations fail closed',t=>{
 const root=project(t);focusChecks(root,['unit']);
 fs.copyFileSync(flatTap,path.join(root,'unit.tap'));
 // 未知格式
 useFakeUnit(root,{total:4,passed:2,failed:1,skipped:1,rawOutput:{format:'csv',file:'unit.tap'}});
 assert.match(unitEvidence(run(root)).error,/Invalid unit rawOutput/);
 // 多余字段
 useFakeUnit(root,{total:4,passed:2,failed:1,skipped:1,rawOutput:{format:'tap',file:'unit.tap',extra:1}});
 assert.match(unitEvidence(run(root)).error,/Invalid unit rawOutput/);
 // 文件缺失（projectFile 的 realpath fail-closed，消息指名文件）
 useFakeUnit(root,{total:4,passed:2,failed:1,skipped:1,rawOutput:{format:'tap',file:'nope.tap'}});
 assert.match(unitEvidence(run(root)).error,/nope\.tap/);
 // 路径逃逸（目标须真实存在才会走到 realpath 之后的逃逸判定）
 const outside=path.join(os.tmpdir(),'qg-escape-unit.tap');
 fs.writeFileSync(outside,'ok 1 - a\n1..1\n# tests 1\n# pass 1\n# fail 0\n');
 t.after(()=>fs.rmSync(outside,{force:true}));
 useFakeUnit(root,{total:4,passed:2,failed:1,skipped:1,rawOutput:{format:'tap',file:'../qg-escape-unit.tap'}});
 assert.match(unitEvidence(run(root)).error,/escapes project/);
 // 原始文件本身畸形（TAP 结构矛盾）
 fs.writeFileSync(path.join(root,'broken.tap'),'ok 1 - only\n1..2\n# tests 2\n');
 useFakeUnit(root,{total:2,passed:2,failed:0,skipped:0,rawOutput:{format:'tap',file:'broken.tap'}});
 assert.match(unitEvidence(run(root)).error,/plan 1\.\.2/);
 // 非布尔 requireRawOutput 在 validate 层拒绝（运行级 ERROR，不产生证据条目）
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').requireRawOutput='yes';
 saveConfig(root,config);
 const broken=run(root);
 assert.equal(broken.status,'ERROR');
 assert.match(broken.error,/Invalid requireRawOutput/);
});

test('real demo runner round-trips raw TAP through kernel parsing (positive integration)',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const result=run(root);
 assert.equal(result.status,'PASS');
 const unit=unitEvidence(result);
 assert.equal(unit.status,'PASS');
 assert.equal(unit.rawOutput.crossCheck,'match');
 assert.equal(unit.rawOutput.file,'dist/unit-run.tap');
 assert.equal(unit.rawOutput.total,4);
 assert.equal(unit.requireRawOutput,true);
});

// ---- 基线原始输出声明即核验（v1.15 T3）：F2P/P2P 基线侧不再凭 runner 自报 ----

// 伪造带 expected 的 unit runner：写基线 TAP/JUnit 落盘并在观察中声明 baselineRawOutput，
// cases 自报 current+baseline 状态（可注入谎言以验证交叉核验）。
const useBaselineFakeUnit=(root,{cases,format='tap',baselineFile='build/baseline.tap',baselineText,declareBaselineRawOutput=true}={})=>{
 fs.writeFileSync(path.join(root,'fake-baseline-unit.mjs'),`import fs from 'node:fs';
import os from 'node:os';
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync(${JSON.stringify(baselineFile)},${JSON.stringify(baselineText)});
const passed=${JSON.stringify(cases.filter(item=>item.status==='pass').length)};
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'fake-baseline-unit',total:${JSON.stringify(cases.length)},passed,failed:0,skipped:0,cases:${JSON.stringify(cases)}${declareBaselineRawOutput?`,baselineRawOutput:{format:${JSON.stringify(format)},file:${JSON.stringify(baselineFile)}}`:''}}));
`);
 const config=configOf(root);const gate=config.gates.find(gate=>gate.id==='engineering');
 const unit=gate.checks.find(check=>check.id==='unit');
 unit.argv=[process.execPath,'fake-baseline-unit.mjs'];
 unit.expected={f2p:['new-feature'],p2p:['legacy-a']};
 delete unit.minTotal;delete unit.minCoverageRatio;delete unit.blockOnSkipped;
 gate.checks=[unit];gate.requiredChecks=['unit'];gate.timeoutMs=unit.timeoutMs;
 delete gate.requireRawOutput;
 saveConfig(root,config);
};
const consistentCases=[
 {name:'new-feature',status:'pass',baselineStatus:'fail'},
 {name:'legacy-a',status:'pass',baselineStatus:'pass'},
 {name:'extra-c',status:'pass',baselineStatus:'pass'}
];
const consistentTap='TAP version 13\n1..3\nnot ok 1 - new-feature\nok 2 - legacy-a\nok 3 - extra-c\n';

test('declared baselineRawOutput is kernel-parsed and cross-checked per case',t=>{
 const root=project(t);focusChecks(root,['unit']);
 useBaselineFakeUnit(root,{cases:consistentCases,baselineText:consistentTap});
 const result=run(root);
 assert.equal(result.status,'PASS');
 const unit=unitEvidence(result);
 assert.equal(unit.baselineRawOutput.crossCheck,'match');
 assert.equal(unit.baselineRawOutput.parser,'tap');
 assert.equal(unit.baselineRawOutput.total,3);
 assert.equal(unit.baselineRawOutput.failed,1);
 assert.equal(unit.baselineRawOutput.caseCount,3);
 const strength=evidenceStrength(result);
 assert.equal(strength.signals.rawOutputs,1);
 // junit 形状同样核验
 useBaselineFakeUnit(root,{cases:consistentCases,format:'junit',baselineFile:'build/baseline.xml',baselineText:'<testsuite name="s" tests="3" failures="1" errors="0" skipped="0"><testcase name="new-feature"><failure message="x"/></testcase><testcase name="legacy-a"/><testcase name="extra-c"/></testsuite>'});
 const junitResult=run(root);
 assert.equal(junitResult.status,'PASS');
 assert.equal(unitEvidence(junitResult).baselineRawOutput.parser,'junit');
});
test('baselineStatus disagreeing with baseline raw output errors naming the case',t=>{
 const root=project(t);focusChecks(root,['unit']);
 // 自报 new-feature 基线失败、TAP 亦失败——但 legacy-a 自报基线失败而 TAP 通过 → ERROR 指名
 const lying=consistentCases.map(item=>item.name==='legacy-a'?{...item,baselineStatus:'fail'}:item);
 useBaselineFakeUnit(root,{cases:lying,baselineText:consistentTap});
 const unit=unitEvidence(run(root));
 assert.equal(unit.status,'ERROR');
 assert.match(unit.error,/case legacy-a baselineStatus reported fail but baseline raw output says pass/);
 // 基线原始输出缺该用例 → ERROR 指名
 useBaselineFakeUnit(root,{cases:consistentCases,baselineText:'TAP version 13\n1..2\nnot ok 1 - new-feature\nok 2 - legacy-a\n'});
 const missing=unitEvidence(run(root));
 assert.equal(missing.status,'ERROR');
 assert.match(missing.error,/case extra-c missing from baseline raw output/);
 // 基线原始输出内重名 → 歧义 fail-closed
 useBaselineFakeUnit(root,{cases:consistentCases,baselineText:'TAP version 13\n1..4\nnot ok 1 - new-feature\nnot ok 2 - new-feature\nok 3 - legacy-a\nok 4 - extra-c\n'});
 const duplicate=unitEvidence(run(root));
 assert.equal(duplicate.status,'ERROR');
 assert.match(duplicate.error,/duplicate case name in baseline raw output: new-feature/);
 // 声明形状畸形（未知格式/多余字段）→ ERROR
 useBaselineFakeUnit(root,{cases:consistentCases,format:'csv',baselineText:consistentTap});
 assert.match(unitEvidence(run(root)).error,/Invalid unit baselineRawOutput/);
});
test('kernel-consistent baseline raw output still drives the false-fix guard',t=>{
 const root=project(t);focusChecks(root,['unit']);
 // 基线原始输出与自报一致地显示 f2p 用例在基线已通过 → f2pPassedOnBaseline 违规照常触发
 const passedOnBaseline=consistentCases.map(item=>item.name==='new-feature'?{...item,baselineStatus:'pass'}:item);
 useBaselineFakeUnit(root,{cases:passedOnBaseline,baselineText:'TAP version 13\n1..3\nok 1 - new-feature\nok 2 - legacy-a\nok 3 - extra-c\n'});
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const reasons=failureReasons(result.evidence.find(evidence=>evidence.gateId==='engineering'));
 assert.ok(reasons.some(reason=>reason.includes('new-feature')&&reason.includes('基线已通过')),JSON.stringify(reasons));
});
test('requireBaselineRawOutput fails named without declaration; validate requires expected',t=>{
 const root=project(t);focusChecks(root,['unit']);
 useBaselineFakeUnit(root,{cases:consistentCases,baselineText:consistentTap,declareBaselineRawOutput:false});
 let config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').requireBaselineRawOutput=true;
 saveConfig(root,config);
 let result=run(root);
 let unit=unitEvidence(result);
 assert.equal(unit.status,'FAIL');
 assert.equal(unit.missingBaselineRawOutput,true);
 let reasons=failureReasons(result.evidence.find(evidence=>evidence.gateId==='engineering'));
 assert.ok(reasons.some(reason=>reason.includes('缺少基线原始输出（requireBaselineRawOutput）')),JSON.stringify(reasons));
 // 显式 false 保留旧语义
 config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').requireBaselineRawOutput=false;
 saveConfig(root,config);
 result=run(root);
 assert.equal(result.status,'PASS');
 // 开启 + test 检查无 expected → validate ERROR
 config=configOf(root);
 const gate=config.gates.find(g=>g.id==='engineering');
 gate.requireBaselineRawOutput=true;
 gate.checks.find(c=>c.id==='unit').expected=undefined;
 saveConfig(root,config);
 const broken=run(root);
 assert.equal(broken.status,'ERROR');
 assert.match(broken.error,/requireBaselineRawOutput requires expected/);
 // 非布尔 → validate ERROR
 config=configOf(root);
 config.gates.find(g=>g.id==='engineering').requireBaselineRawOutput='yes';
 saveConfig(root,config);
 assert.match(run(root).error,/Invalid requireBaselineRawOutput/);
});
