import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/resilience-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-resilience-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('fault injection checks recovery, deduplication and four signal types',t=>{const r=run(project(t));assert.equal(r.status,'PASS',JSON.stringify(r.evidence));assert.equal(r.evidence[0].details.scenarios.length,4);});
test('lost alert and duplicate write fail named scenarios',t=>{const root=project(t),p=path.join(root,'service.mjs');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace("alert:'db unavailable alert'","alert:''").replace("if(this.payments.has(id))","if(false)"));const r=run(root);assert.equal(r.status,'FAIL');assert.deepEqual(r.evidence[0].details.scenarios.filter(s=>s.status==='FAIL').map(s=>s.id),['db-outage','duplicate-message']);});
test('stale resilience observation fails closed',t=>{const root=project(t);fs.writeFileSync(path.join(root,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",scenarios:[]}));');assert.equal(run(root).status,'ERROR');});

test('unguarded external hang fails the timeout scenario',t=>{
 const root=project(t),p=path.join(root,'service.mjs');
 fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('if(Date.now()-started>budget)','if(false)'));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.scenarios.find(s=>s.id==='external-timeout').status,'FAIL');
});

test('maxAgeDays enforces drill evidence freshness',t=>{
 const root=project(t);
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 config.gates[0].maxAgeDays=365;
 fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'PASS');
 const runner=path.join(root,'runner.mjs');
 fs.writeFileSync(runner,fs.readFileSync(runner,'utf8').replace('observedAt:new Date().toISOString()','observedAt:"2020-01-01T00:00:00.000Z"'));
 const stale=run(root);
 assert.equal(stale.status,'FAIL');
 assert.ok(stale.evidence[0].details.evidenceExpired);
 fs.writeFileSync(runner,fs.readFileSync(runner,'utf8').replace(',observedAt:"2020-01-01T00:00:00.000Z"',''));
 assert.equal(run(root).status,'ERROR');
});

test('breaker drill requires the full state sequence with logged events',t=>{
 const root=project(t);
 let result=run(root);
 assert.equal(result.status,'PASS');
 const breaker=result.evidence[0].details.scenarios.find(s=>s.id==='breaker');
 assert.deepEqual(breaker.transitions,['closed','open','half-open','closed']);
 assert.equal(breaker.breakerEventsLogged,true);
 const runner=path.join(root,'runner.mjs');
 fs.writeFileSync(runner,fs.readFileSync(runner,'utf8').replace("transitions:['closed','open','half-open','closed']","transitions:['closed','open','closed']"));
 result=run(root);
 const failing=result.evidence[0].details.scenarios.find(s=>s.id==='breaker');
 assert.equal(failing.status,'FAIL');
 assert.ok(failing.transitionProblem.includes('状态序列'));
 fs.writeFileSync(runner,fs.readFileSync(runner,'utf8').replace("transitions:['closed','open','closed']","transitions:['closed','open','half-open','closed']").replace('breakerEventsLogged:breaker.events.length===3','breakerEventsLogged:false'));
 result=run(root);
 assert.ok(result.evidence[0].details.scenarios.find(s=>s.id==='breaker').transitionProblem.includes('未记录日志'));
});
