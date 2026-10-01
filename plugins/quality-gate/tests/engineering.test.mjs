import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes,evidenceStrength} from '../lib/summary.mjs';
import {project,engineering,configOf,saveConfig,unitCheck,declareExpected,focusChecks} from './engineering-helpers.mjs';

test('L1 engineering executes all six actual checks and records structured evidence',t=>{
 const root=project(t);const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(engineering(result),null,2));
 const evidence=engineering(result).details;
 assert.deepEqual(evidence.requiredChecks.map(x=>x.status),Array(6).fill('PASS'));
 assert.equal(evidence.checks.find(x=>x.id==='unit').total,4);
 assert.deepEqual(evidence.checks.find(x=>x.id==='mutation').score,1);
 assert.deepEqual(evidence.checks.find(x=>x.id==='mutation').survivors,[]);
 assert.equal(evidence.checks.find(x=>x.id==='build').artifact.sha256.length,64);
 assert.deepEqual(evidence.checks.find(x=>x.id==='convention').severityCounts,{low:0,medium:0,high:0});
});

test('RTM links all five acceptance types to same-run engineering evidence',t=>{
 const root=project(t);const result=run(root);
 const rtm=result.evidence.find(evidence=>evidence.gateId==='requirements');
 assert.equal(rtm.status,'PASS');
 assert.equal(rtm.details.requirements[0].missingTypes.length,0);
 assert.equal(rtm.details.criterionCount,5);
 assert.deepEqual(rtm.details.requirements[0].acceptanceCriteria.map(criterion=>criterion.testGates[0].status),Array(5).fill('PASS'));
});

test('surviving mutation fails, lists the survivor and keeps unit passing',t=>{
 const root=project(t);const file=path.join(root,'calc.test.mjs');
 focusChecks(root,['unit','mutation']);
 const raw=fs.readFileSync(file,'utf8');fs.writeFileSync(file,raw.replace("test('zero is invalid',()=>assert.equal(fee(0),null));\n",''));
 const config=configOf(root);const unit=unitCheck(config);unit.minTotal=2;delete unit.expected;saveConfig(root,config);
 const result=run(root);assert.equal(result.status,'FAIL');
 const checks=engineering(result).details.checks;
 assert.equal(checks.find(x=>x.id==='unit').status,'PASS');
 const mutation=checks.find(x=>x.id==='mutation');
 assert.equal(mutation.status,'FAIL');
 assert.equal(mutation.score,0.5);
 assert.equal(mutation.survivors.length,1);
 assert.match(mutation.survivors[0].description,/boundary condition/);
});

test('architecture and convention findings identify specific rules and files',t=>{
 const root=project(t);focusChecks(root,['structure','convention']);
 const file=path.join(root,'calc.mjs');
 fs.appendFileSync(file,"\n// import from '../legacy/db.mjs'\nconsole.log('debug');\n");
 const result=run(root);assert.equal(result.status,'FAIL');
 const checks=engineering(result).details.checks;
 assert.equal(checks.find(x=>x.id==='structure').findings[0].rule,'no-legacy-import');
 assert.equal(checks.find(x=>x.id==='convention').findings[0].rule,'no-console-log');
});

test('malformed tool observation cannot pass',t=>{
 const root=project(t);focusChecks(root,['build']);const file=path.join(root,'scripts','check.mjs');
 fs.writeFileSync(file,'console.log(JSON.stringify({schemaVersion:"0.1",runId:"stale",source:"fake",artifact:{path:"calc.mjs",sha256:"0"}}));');
 const result=run(root);assert.equal(result.status,'ERROR');
 assert.equal(engineering(result).details.checks.find(x=>x.id==='build').status,'ERROR');
});

test('blockOnSkipped fails skipped tests and stays compatible when disabled',t=>{
 const root=project(t);focusChecks(root,['unit']);
 fs.appendFileSync(path.join(root,'calc.test.mjs'),"\ntest('conditionally skipped',{skip:true},()=>{});\n");
 let result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unit.skipped,1);
 assert.deepEqual(failureReasons(engineering(result)),['unit: 1 个测试被跳过（blockOnSkipped）']);
 const config=configOf(root);unitCheck(config).blockOnSkipped=false;saveConfig(root,config);
 result=run(root);
 assert.equal(engineering(result).details.checks.find(x=>x.id==='unit').status,'PASS');
 assert.equal(result.status,'PASS');
});

test('minTotal requires a minimum number of executed tests',t=>{
 const root=project(t);focusChecks(root,['unit']);
 const config=configOf(root);unitCheck(config).minTotal=99;saveConfig(root,config);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const unit=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unit.minTotal,99);
 assert.deepEqual(failureReasons(engineering(result)),['unit: 测试数 4 < 最小要求 99']);
});

test('per-severity thresholds block medium findings while count alone would pass',t=>{
 const root=project(t);focusChecks(root,['convention']);
 fs.appendFileSync(path.join(root,'calc.mjs'),"\nconsole.log('debug');\n");
 const config=configOf(root);
 const convention=config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='convention');
 convention.maxFindings=5;convention.maxBySeverity={medium:0};
 saveConfig(root,config);
 let result=run(root);
 assert.equal(result.status,'FAIL');
 const check=engineering(result).details.checks.find(x=>x.id==='convention');
 assert.deepEqual(check.severityCounts,{low:0,medium:1,high:0});
 assert.deepEqual(check.severityBreaches,['medium']);
 assert.deepEqual(failureReasons(engineering(result)),['convention: medium 1 项 > 上限 0']);
 convention.maxBySeverity={medium:1};saveConfig(root,config);
 result=run(root);
 assert.equal(result.status,'PASS');
});

test('inconsistent survivor arithmetic fails closed',t=>{
 const root=project(t);focusChecks(root,['mutation']);
 fs.writeFileSync(path.join(root,'fake-mutation.mjs'),`import {readFileSync} from 'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:'fake',killed:1,total:2,score:0.5,survivors:[{id:'a',description:'x'},{id:'b',description:'y'}]}));`);
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='mutation').argv=['$NODE','fake-mutation.mjs'];
 saveConfig(root,config);
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.equal(engineering(result).details.checks.find(x=>x.id==='mutation').status,'ERROR');
});

test('build artifact hash lie fails and empty artifact errors',t=>{
 const root=project(t);focusChecks(root,['build']);
 const liar=`import fs from 'node:fs';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/calc.bundle.mjs',${'`'}// content${'`'});
console.log(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:'liar-build',artifact:{path:'dist/calc.bundle.mjs',sha256:'0'.repeat(64)}}));`;
 fs.writeFileSync(path.join(root,'liar-build.mjs'),liar);
 const config=configOf(root);
 config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='build').argv=['$NODE','liar-build.mjs'];
 saveConfig(root,config);
 let result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(engineering(result).details.checks.find(x=>x.id==='build').status,'FAIL');
 const empty=`import fs from 'node:fs';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/calc.bundle.mjs','');
console.log(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:'liar-build',artifact:{path:'dist/calc.bundle.mjs',sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}}));`;
 fs.writeFileSync(path.join(root,'liar-build.mjs'),empty);
 result=run(root);
 assert.equal(engineering(result).details.checks.find(x=>x.id==='build').status,'ERROR');
});

test('failing advisory check is recorded but only required checks gate',t=>{
 const root=project(t);focusChecks(root,['static','unit']);
 const config=configOf(root);
 const gate=config.gates.find(item=>item.id==='engineering');
 gate.checks.find(check=>check.id==='static').argv=['$NODE','-e','process.exit(1)'];
 gate.requiredChecks=gate.requiredChecks.filter(id=>id!=='static');
 saveConfig(root,config);
 // W2：既未 required 也未显式 excluded 的 check 是白名单空转，配置直接 ERROR
 assert.equal(run(root).status,'ERROR');
 gate.excludedChecks=[{id:'static',reason:'static is advisory during the migration window'}];
 saveConfig(root,config);
 let result=run(root);
 assert.equal(result.status,'PASS');
 const staticCheck=engineering(result).details.checks.find(x=>x.id==='static');
 assert.equal(staticCheck.status,'FAIL');
 gate.excludedChecks=[{id:'static'}];
 saveConfig(root,config);
 assert.equal(run(root).status,'ERROR');
 gate.excludedChecks=undefined;
 gate.requiredChecks.push('static');
 saveConfig(root,config);
 result=run(root);
 assert.equal(result.status,'FAIL');
});
