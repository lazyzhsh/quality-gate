import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/property-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-property-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
function mode(root,value){const p=path.join(root,'.quality-gate.json'),c=JSON.parse(fs.readFileSync(p,'utf8'));c.gates[0].argv.push(value);fs.writeFileSync(p,JSON.stringify(c));}
test('seeded property cases and state transitions pass',t=>{const r=run(project(t));assert.equal(r.status,'PASS',JSON.stringify(r.evidence));assert.equal(r.evidence[0].details.caseCount,100);assert.equal(r.evidence[0].details.counterexamples.length,0);});
test('amount and transition counterexamples are identified',t=>{const root=project(t);mode(root,'wrong-refund');let r=run(root);assert.equal(r.status,'FAIL');assert.equal(r.evidence[0].details.counterexamples[0].id,'case-8');const c=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json')));c.gates[0].argv[2]='wrong-transition';fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));r=run(root);assert.equal(r.status,'FAIL');assert.equal(r.evidence[0].details.counterexamples[0].id,'case-10');});
test('stale property observation fails closed',t=>{const root=project(t);fs.writeFileSync(path.join(root,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",seed:42,source:"fake",cases:[]}));');assert.equal(run(root).status,'ERROR');});

test('aligned operators and when conditions evaluate per case',t=>{
 const root=project(t);
 const r=run(root);
 assert.equal(r.status,'PASS');
 const first=r.evidence[0].details.counterexamples;
 assert.equal(first.length,0);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].assertions.push({id:'always-fails',left:'authorized',operator:'lt',value:0});
 config.gates[0].assertions.push({id:'always-skipped',when:{field:'authorized','in':['NEVER']},left:'refunded',operator:'gt',right:'captured'});
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const failed=run(root);
 assert.equal(failed.status,'FAIL');
 const counter=failed.evidence[0].details.counterexamples[0];
 assert.ok(counter.assertions.some(a=>a.id==='always-fails'&&a.status==='FAIL'));
 assert.ok(counter.assertions.every(a=>a.id!=='always-skipped'||a.status==='SKIP'));
});
