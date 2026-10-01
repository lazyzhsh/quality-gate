import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {run,validate} from '../lib/kernel.mjs';import {failureReasons} from '../lib/summary.mjs';
const replayDemo=fileURLToPath(new URL('../examples/replay-baseline-demo',import.meta.url));
const behaviorDemo=fileURLToPath(new URL('../examples/behavior-demo',import.meta.url));
function copy(t,source,...faults){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-replay-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(source,root,{recursive:true});
 if(faults.length){
  const configPath=path.join(root,'.quality-gate.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  config.gates[0].argv.push(...faults);
  fs.writeFileSync(configPath,JSON.stringify(config));
 }
 return root;
}
const sha256=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const replay=result=>result.evidence[0].details.replay;
const rules=result=>(replay(result).drift??[]).map(item=>item.rule);

test('journey replays the archived baseline step by step with the volatile field ignored',t=>{
 const result=run(copy(t,replayDemo));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0].details));
 assert.equal(replay(result).status,'match');
 assert.equal(replay(result).contentVerified,true);
 assert.equal(replay(result).source,'transcript');
});

test('value drift against the baseline fails with the differing path named',t=>{
 const result=run(copy(t,replayDemo,'drift'));
 assert.equal(result.status,'FAIL');
 assert.equal(replay(result).status,'replay-drift');
 const entry=replay(result).drift.find(item=>item.rule==='replay-drift');
 assert.equal(entry.step,'place-order');
 assert.ok(entry.differences.some(difference=>difference.path==='/orderId'));
 assert.ok(failureReasons(result.evidence[0]).some(reason=>reason.includes('回放漂移: 旅程 checkout 步骤 place-order')),JSON.stringify(failureReasons(result.evidence[0])));
});

test('reordered steps pass id-based expectations but fail the replayed step order',t=>{
 const result=run(copy(t,replayDemo,'reorder'));
 const scenario=result.evidence[0].details.scenarios[0];
 assert.ok(scenario.steps.every(step=>step.status==='PASS'),'id-based expectations should still pass');
 assert.equal(result.status,'FAIL');
 assert.ok(rules(result).includes('replay-sequence-drift'));
 const entry=replay(result).drift.find(item=>item.rule==='replay-sequence-drift');
 assert.match(entry.problem,/基线 login>place-order>confirm ≠ 当次 place-order>login>confirm/);
});

test('a dropped step fails as a missing baseline step',t=>{
 const result=run(copy(t,replayDemo,'drop-step'));
 assert.equal(result.status,'FAIL');
 assert.ok(rules(result).includes('replay-missing'));
});

test('a modified baseline without re-pinning fails content binding',t=>{
 const root=copy(t,replayDemo);
 fs.appendFileSync(path.join(root,'baseline/journey-baseline.transcript.json'),'\n');
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(replay(result).status,'replay-baseline-modified');
 assert.match(replay(result).problem,/须显式重 pin/);
 assert.ok(failureReasons(result.evidence[0]).some(reason=>reason.includes('回放基线内容与配置绑定不符')),JSON.stringify(failureReasons(result.evidence[0])));
});

test('self-reported fallback compares the observation when no transcript is declared',t=>{
 const result=run(copy(t,replayDemo,'no-transcript'));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0].details));
 assert.equal(replay(result).source,'self-reported');
 assert.equal(replay(result).contentVerified,true);
 const drifted=run(copy(t,replayDemo,'no-transcript','drift'));
 assert.equal(drifted.status,'FAIL');
 assert.ok(rules(drifted).includes('replay-drift'));
});

function behaviorBaseline(t){
 const root=copy(t,behaviorDemo);
 const first=run(root);
 assert.equal(first.status,'PASS',JSON.stringify(first.evidence));
 const transcript=JSON.parse(fs.readFileSync(path.join(root,'build/behavior-transcript.json'),'utf8'));
 const baselineFile=path.join(root,'baseline.transcript.json');
 fs.writeFileSync(baselineFile,JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'archived-run',cases:transcript.cases.map(c=>({id:c.id,actual:c.actual}))},null,2));
 const configPath=path.join(root,'.quality-gate.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 config.gates[0].replayBaseline={file:'baseline.transcript.json',contentSha256:sha256(baselineFile)};
 fs.writeFileSync(configPath,JSON.stringify(config));
 return {root,baselineFile,configPath};
}

test('behavior replays a synthesized archived baseline as a match',t=>{
 const {root}=behaviorBaseline(t);
 const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0].details.replay));
 assert.equal(replay(result).status,'match');
 assert.equal(replay(result).source,'transcript');
});

test('a baseline missing one case fails the current run as replay-extra',t=>{
 const {root,baselineFile,configPath}=behaviorBaseline(t);
 const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
 baseline.cases.pop();
 fs.writeFileSync(baselineFile,JSON.stringify(baseline));
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 config.gates[0].replayBaseline.contentSha256=sha256(baselineFile);
 fs.writeFileSync(configPath,JSON.stringify(config));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.ok(rules(result).includes('replay-extra'));
});

test('a re-pinned baseline with different accepted values fails current behavior as drift',t=>{
 const {root,baselineFile,configPath}=behaviorBaseline(t);
 const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
 const repinned=structuredClone(baseline);
 repinned.cases[0].actual=structuredClone(baseline.cases[0].actual);
 // 重 pin 场景：新基线接受了不同的行为（fee 变化），当次执行仍是旧值
 repinned.cases[repinned.cases.length-1].actual={...repinned.cases.at(-1).actual,decision:'accept',fee:999};
 fs.writeFileSync(baselineFile,JSON.stringify(repinned));
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 config.gates[0].replayBaseline.contentSha256=sha256(baselineFile);
 fs.writeFileSync(configPath,JSON.stringify(config));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const entry=replay(result).drift.find(item=>item.rule==='replay-drift');
 assert.ok(entry.differences.length>0);
 assert.ok(failureReasons(result.evidence[0]).some(reason=>reason.includes('回放漂移: 用例')),JSON.stringify(failureReasons(result.evidence[0])));
});

test('malformed replayBaseline fails validation on both kinds',t=>{
 const config=JSON.parse(fs.readFileSync(path.join(replayDemo,'.quality-gate.json'),'utf8'));
 const mutate=variant=>{const copyConfig=structuredClone(config);Object.assign(copyConfig.gates[0].replayBaseline,variant);return copyConfig;};
 assert.throws(()=>validate(mutate({file:''})),/Invalid replayBaseline/);
 assert.throws(()=>validate(mutate({contentSha256:'zz'})),/Invalid replayBaseline/);
 const extra=structuredClone(config);extra.gates[0].replayBaseline.note='extra key';
 assert.throws(()=>validate(extra),/Invalid replayBaseline/);
 delete structuredClone(config).gates[0].replayBaseline;
 const clean=structuredClone(config);delete clean.gates[0].replayBaseline;
 assert.doesNotThrow(()=>validate(clean));
});
