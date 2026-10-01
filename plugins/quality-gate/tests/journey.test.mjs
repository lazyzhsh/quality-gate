import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/journey-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-journey-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('live smoke, integration and API end-to-end journeys pass with per-step evidence',t=>{
 const result=run(project(t));assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 assert.deepEqual(result.evidence[0].details.scenarios.map(x=>x.level),['smoke','integration','e2e']);
 assert.equal(result.evidence[0].details.scenarios[2].steps.length,3);
});
test('wrong payment state fails at named journey steps',t=>{
 const root=project(t),file=path.join(root,'service.mjs');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace("orders.set(match[1],'paid')","orders.set(match[1],'pending')"));
 const result=run(root);assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.scenarios[2].steps.filter(x=>x.status==='FAIL').map(x=>x.id),['pay','read']);
});
test('stale journey result fails closed',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",scenarios:[]}));');
 assert.equal(run(root).status,'ERROR');
});

test('declared ignorePaths suppress volatile step fields and record evidence',t=>{
 const root=project(t);
 const details=run(root).evidence[0].details;
 const e2e=details.scenarios.find(s=>s.id==='e2e');
 assert.ok(e2e.steps.every(step=>step.status==='PASS'&&(step.differences===undefined||step.differences.length===0)));
 assert.ok(e2e.steps.every(step=>step.ignoredDifferences.some(difference=>difference.path==='/serverTime')));
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 delete config.gates[0].ignorePaths;
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const failed=result.evidence[0].details.scenarios[2].steps.filter(step=>step.status==='FAIL');
 assert.deepEqual(failed.map(step=>step.id),['create','pay','read']);
 assert.deepEqual(failed[0].differences.map(difference=>difference.path),['/serverTime']);
});

// 原始旅程观察记录（v1.13 T3）：声明即核验正反例矩阵（与 behavior 同构）
import {failureReasons,evidenceStrength} from '../lib/summary.mjs';
import {leanFixture} from './fixture.mjs';

function jtSetup(t,{requireRawTranscript}={}){
 const f=leanFixture(t);
 f.c.claims.push({id:'C9',statement:'journey transcript cross-check'});
 const gate={id:'jt',kind:'journey',level:'L3',enabled:true,stages:['close'],claimId:'C9',argv:['$NODE','jt-runner.mjs'],timeoutMs:2000,scenarios:[{id:'scn',level:'smoke',expectedSteps:[{id:'s1',expected:{state:'ok'}}]}]};
 if(requireRawTranscript!==undefined)gate.requireRawTranscript=requireRawTranscript;
 f.c.gates.push(gate);f.save();
 return f;
}
const jtRunner=({tamperActual,tamperRunId,tamperSource,declare=true}={})=>[
 `import fs from 'node:fs';`,
 `let raw='';for await(const part of process.stdin)raw+=part;const request=JSON.parse(raw);`,
 `const scenarios=request.scenarios.map(spec=>({id:spec.id,steps:[{id:'s1',actual:{state:'ok'}}]}));`,
 `const transcriptScenarios=${tamperActual?`scenarios.map(s=>({id:s.id,steps:[{id:'s1',actual:{state:'bad'}}]}))`:'scenarios'};`,
 `fs.mkdirSync('build',{recursive:true});`,
 `fs.writeFileSync('build/t.json',JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:${tamperRunId?'"00000000-0000-0000-0000-000000000000"':'request.runId'},source:${tamperSource?"'other-source'":"'fake'"},scenarios:transcriptScenarios}));`,
 `console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'fake',scenarios${declare?`,rawTranscript:{format:'qgate-transcript',file:'build/t.json'}`:''}}));`
].join('');
test('journey rawTranscript declared-and-verified passes with anchor evidence',t=>{
 const f=jtSetup(t);
 fs.writeFileSync(path.join(f.root,'jt-runner.mjs'),jtRunner());
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const e=result.evidence.find(x=>x.gateId==='jt');
 assert.equal(e.details.rawTranscript.crossCheck,'match');
 assert.equal(e.details.rawTranscript.stepCount,1);
 assert.equal(evidenceStrength(result).signals.rawOutputs,1);
});
test('journey transcript step mismatch, stale runId and source disagreement all error named',t=>{
 const f=jtSetup(t);
 fs.writeFileSync(path.join(f.root,'jt-runner.mjs'),jtRunner({tamperActual:true}));
 let e=run(f.root).evidence.find(x=>x.gateId==='jt');
 assert.equal(e.status,'ERROR');assert.match(String(e.details.error),/scenario scn step s1 actual reported/);
 fs.writeFileSync(path.join(f.root,'jt-runner.mjs'),jtRunner({tamperRunId:true}));
 e=run(f.root).evidence.find(x=>x.gateId==='jt');
 assert.equal(e.status,'ERROR');assert.match(String(e.details.error),/stale transcript/);
 fs.writeFileSync(path.join(f.root,'jt-runner.mjs'),jtRunner({tamperSource:true}));
 e=run(f.root).evidence.find(x=>x.gateId==='jt');
 assert.equal(e.status,'ERROR');assert.match(String(e.details.error),/source disagrees/);
});
test('journey requireRawTranscript missing declaration fails named; explicit false legacy',t=>{
 const f=jtSetup(t,{requireRawTranscript:true});
 fs.writeFileSync(path.join(f.root,'jt-runner.mjs'),jtRunner({declare:false}));
 const e=run(f.root).evidence.find(x=>x.gateId==='jt');
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.missingRawTranscript,true);
 assert.ok(failureReasons(e).includes('缺少原始旅程观察记录（requireRawTranscript）'));
 f.c.gates.find(g=>g.id==='jt').requireRawTranscript=false;f.save();
 assert.equal(run(f.root).status,'PASS');
});
