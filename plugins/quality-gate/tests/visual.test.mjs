import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/visual-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-visual-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('fresh rendered SVG exactly matches approved baseline',t=>{
 const result=run(project(t));assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 assert.equal(result.evidence[0].details.comparison,'exact-bytes');
});
test('rendered color change fails with distinct artifact hashes',t=>{
 const root=project(t),file=path.join(root,'ui.mjs');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('#0a6','#a00'));
 const result=run(root);assert.equal(result.status,'FAIL');
 assert.notEqual(result.evidence[0].details.baselineSha256,result.evidence[0].details.actualSha256);
});
test('visual artifact path escape fails closed',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'runner.mjs'),'import fs from "node:fs";console.log(JSON.stringify({schemaVersion:"0.1",runId:JSON.parse(fs.readFileSync(0,"utf8")).runId,source:"fake",actualFile:"../escape.svg"}));');
 assert.equal(run(root).status,'ERROR');
});

test('pixel tolerance passes minor drift within budget and fails beyond it',t=>{
 const root=project(t),file=path.join(root,'ui.mjs');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('#0a6','#a00'));
 let result=run(root);
 assert.equal(result.status,'FAIL');
 const gates=new Map(result.evidence.map(evidence=>[evidence.gateId,evidence]));
 assert.equal(gates.get('visual').status,'FAIL');
 const tolerance=gates.get('visual-tolerance');
 assert.equal(tolerance.status,'PASS');
 assert.equal(tolerance.details.comparison,'pixel-diff');
 assert.equal(tolerance.details.maxDiffPixels,10);
 assert.ok(tolerance.details.diff.pixels<=10&&tolerance.details.diff.pixels>0);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates.find(g=>g.id==='visual-tolerance').maxDiffPixels=0;
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='visual-tolerance').status,'FAIL');
});

test('configured tolerance requires diff metrics from the runner',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'no-diff-runner.mjs'),`import fs from 'node:fs';console.log(JSON.stringify({schemaVersion:'0.1',runId:JSON.parse(fs.readFileSync(0,'utf8')).runId,source:'fake',actualFile:'baseline.svg'}));`);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 const gate=config.gates.find(g=>g.id==='visual-tolerance');
 gate.argv=['$NODE','no-diff-runner.mjs'];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='visual-tolerance').status,'ERROR');
 assert.match(result.evidence.find(e=>e.gateId==='visual-tolerance').details.error,/diff metrics required/i);
});

test('missing baseline file fails closed',t=>{
 const root=project(t);
 fs.rmSync(path.join(root,'baseline.svg'));
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(String(result.evidence[0].details),/baseline/i);
});
