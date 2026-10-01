import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes,evidenceStrength} from '../lib/summary.mjs';
import {project,engineering,configOf,saveConfig,unitCheck,declareExpected,focusChecks} from './engineering-helpers.mjs';

test('expected f2p/p2p pass when new behavior is anchored and old behavior holds',t=>{
 const root=project(t);
 declareExpected(root,{f2p:['large amount discount rate'],p2p:['normal fee','zero is invalid','rounding boundary']});
 const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(engineering(result).details,null,1));
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.deepEqual(unit.expected.f2p,['large amount discount rate']);
 assert.equal(unit.cases.length,4);
 const f2p=unit.cases.find(item=>item.name==='large amount discount rate');
 assert.equal(f2p.status,'pass');
 assert.equal(f2p.baselineStatus,'fail');
 assert.equal(unit.expectedViolations,undefined);
});

test('f2p case that already passes on baseline is flagged as false fix',t=>{
 const root=project(t);
 declareExpected(root,{f2p:['normal fee'],p2p:['zero is invalid']});
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unit.status,'FAIL');
 assert.equal(unit.expectedViolations.length,1);
 assert.equal(unit.expectedViolations[0].rule,'f2pPassedOnBaseline');
 assert.equal(unit.expectedViolations[0].name,'normal fee');
 assert.equal(unit.expectedViolations[0].baselineStatus,'pass');
 assert.deepEqual(failureReasons(engineering(result)),['unit: f2p normal fee 基线已通过（测试未绑定新行为，疑似伪修复）']);
});

test('p2p regression names the broken case',t=>{
 const root=project(t);
 declareExpected(root,{f2p:['large amount discount rate'],p2p:['normal fee','rounding boundary']});
 const file=path.join(root,'calc.test.mjs');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('assert.equal(fee(101),3)','assert.equal(fee(101),4)'));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 const regressed=unit.expectedViolations.filter(violation=>violation.rule==='p2pRegressed').map(violation=>violation.name);
 assert.deepEqual(regressed,['rounding boundary']);
});

test('p2p case failing on baseline cannot serve as regression guard',t=>{
 const root=project(t);
 declareExpected(root,{p2p:['large amount discount rate']});
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unit.status,'FAIL');
 assert.equal(unit.expectedViolations.length,1);
 assert.equal(unit.expectedViolations[0].rule,'p2pFailedOnBaseline');
 assert.equal(unit.expectedViolations[0].name,'large amount discount rate');
});

test('declared case reported as skipped fails and is named',t=>{
 const root=project(t);
 fs.appendFileSync(path.join(root,'calc.test.mjs'),"\ntest('conditionally skipped',{skip:true},()=>{});\n");
 declareExpected(root,{f2p:['large amount discount rate'],p2p:['normal fee','conditionally skipped']});
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 const skippedViolation=unit.expectedViolations.find(violation=>violation.rule==='skippedCase');
 assert.equal(skippedViolation.name,'conditionally skipped');
 assert.equal(skippedViolation.direction,'p2p');
 assert.equal(skippedViolation.currentStatus,'skip');
});

test('declared case missing from observation fails with missingCase',t=>{
 const root=project(t);
 declareExpected(root,{f2p:['no such case']});
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.deepEqual(unit.expectedViolations,[{direction:'f2p',name:'no such case',rule:'missingCase'}]);
});

test('overlapping or empty expected declarations are rejected',t=>{
 const root=project(t);
 declareExpected(root,{f2p:['same case'],p2p:['same case']});
 let result=run(root);
 assert.equal(result.status,'ERROR');
 declareExpected(root,{f2p:[]});
 result=run(root);
 assert.equal(result.status,'ERROR');
});

test('expected without case observation fails closed',t=>{
 const root=project(t);
 declareExpected(root,{f2p:['normal fee']});
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='unit').argv=['$NODE','scripts/unit-no-cases.mjs'];
 saveConfig(root,config);
 fs.writeFileSync(path.join(root,'scripts','unit-no-cases.mjs'),"import fs from 'node:fs';\nconst input=JSON.parse(fs.readFileSync(0,'utf8'));\nconsole.log(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:'no-cases',total:4,passed:4,failed:0,skipped:0}));");
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.equal(engineering(result).details.checks.find(x=>x.id==='unit').status,'ERROR');
});

test('unit coverage evidence is reported and enforced at minCoverageRatio 1',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(engineering(result),null,2));
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unit.coverage.tool,'node:test --experimental-test-coverage (all files)');
 assert.equal(unit.coverage.ratio,1);
 assert.equal(unit.minCoverageRatio,1);
});

test('unexecuted line drops coverage below threshold and fails with the gap named',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const file=path.join(root,'calc.test.mjs');
 const raw=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,raw.replace("test('normal fee',()=>assert.equal(fee(100),2));\n",'').replace("test('rounding boundary',()=>assert.equal(fee(101),3));\n",''));
 const config=configOf(root);const unit=unitCheck(config);
 unit.minTotal=2;delete unit.expected;saveConfig(root,config);
 const result=run(root);assert.equal(result.status,'FAIL');
 const unitEvidence=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unitEvidence.status,'FAIL');
 assert.equal(unitEvidence.coverageViolation.minCoverageRatio,1);
 assert.ok(unitEvidence.coverageViolation.ratio<1);
 assert.match(failureReasons(engineering(result)).join('\n'),/覆盖率 [\d.]+ < 最低要求 1/);
});

test('declared threshold without coverage evidence fails closed as ERROR',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='unit').argv=['$NODE','scripts/unit-no-cov.mjs'];
 saveConfig(root,config);
 fs.writeFileSync(path.join(root,'scripts','unit-no-cov.mjs'),"import fs from 'node:fs';\nconst input=JSON.parse(fs.readFileSync(0,'utf8'));\nconsole.log(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:'no-cov',total:4,passed:4,failed:0,skipped:0}));");
 const result=run(root);
 assert.equal(engineering(result).details.checks.find(x=>x.id==='unit').status,'ERROR');
});

test('coverage counts disagreeing with the ratio fail closed as ERROR',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='unit').argv=['$NODE','scripts/unit-cov-mismatch.mjs'];
 saveConfig(root,config);
 fs.writeFileSync(path.join(root,'scripts','unit-cov-mismatch.mjs'),"import fs from 'node:fs';\nconst input=JSON.parse(fs.readFileSync(0,'utf8'));\nconsole.log(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:'cov-mismatch',total:4,passed:4,failed:0,skipped:0,coverage:{tool:'stub',ratio:0.5,total:10,covered:9}}));");
 const result=run(root);
 assert.equal(engineering(result).details.checks.find(x=>x.id==='unit').status,'ERROR');
});

test('invalid minCoverageRatio value is rejected by validate',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const config=configOf(root);unitCheck(config).minCoverageRatio=0;saveConfig(root,config);
 assert.equal(run(root).status,'ERROR');
});
