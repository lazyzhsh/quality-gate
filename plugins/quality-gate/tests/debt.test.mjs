import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';import {failureReasons} from '../lib/summary.mjs';
const source=fileURLToPath(new URL('../examples/debt-demo',import.meta.url));function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-debt-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('assigned low debt with future repayment date is visible and allowed',t=>{const r=run(project(t),'release');assert.equal(r.status,'PASS',JSON.stringify(r.evidence));assert.equal(r.evidence[0].details.items[0].id,'DEBT-1');});
test('high or overdue open debt blocks release',t=>{const root=project(t),p=path.join(root,'debt.json'),d=JSON.parse(fs.readFileSync(p));d.items[0].severity='high';d.items[0].dueDate='2000-01-01';fs.writeFileSync(p,JSON.stringify(d));const r=run(root,'release');assert.equal(r.status,'FAIL');assert.deepEqual(r.evidence[0].details.items[0].reasons,['release-blocking-severity','overdue']);});
test('missing owner is an error',t=>{const root=project(t),p=path.join(root,'debt.json'),d=JSON.parse(fs.readFileSync(p));delete d.items[0].owner;fs.writeFileSync(p,JSON.stringify(d));assert.equal(run(root,'release').status,'ERROR');});

test('resolved debt evidence references verify; missing file or unknown gate fails',t=>{
 const root=project(t);
 let result=run(root,'release');
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0].details));
 const check=result.evidence[0].details.referenceChecks[0];
 assert.equal(check.itemId,'DEBT-2');
 assert.equal(check.status,'FOUND');
 fs.rmSync(path.join(root,'repayment-note.md'));
 result=run(root,'release');
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.referenceChecks[0].status,'MISSING');
 const debt=JSON.parse(fs.readFileSync(path.join(root,'debt.json'),'utf8'));
 debt.items[1].evidence={gateId:'nope'};
 fs.writeFileSync(path.join(root,'debt.json'),JSON.stringify(debt));
 assert.equal(run(root,'release').status,'ERROR');
});

test('empty debt register passes only with an explicit none declaration',t=>{
 const root=project(t),p=path.join(root,'debt.json');
 fs.writeFileSync(p,JSON.stringify({items:[],none:true}));
 let r=run(root,'release');
 assert.equal(r.status,'PASS');
 assert.equal(r.evidence[0].details.none,true);
 fs.writeFileSync(p,JSON.stringify({items:[]}));
 r=run(root,'release');
 assert.equal(r.status,'FAIL');
 assert.deepEqual(r.evidence[0].details.registerIssues,['empty-register-undeclared']);
 assert.deepEqual(failureReasons(r.evidence[0]),['空登记未显式声明: 需要 "none": true']);
});

test('none declaration contradicting debt entries fails; non-boolean none errors',t=>{
 const root=project(t),p=path.join(root,'debt.json'),d=JSON.parse(fs.readFileSync(p));
 d.none=true;fs.writeFileSync(p,JSON.stringify(d));
 let r=run(root,'release');
 assert.equal(r.status,'FAIL');
 assert.deepEqual(r.evidence[0].details.registerIssues,['none-with-entries']);
 assert.deepEqual(failureReasons(r.evidence[0]),['none:true 与非空登记矛盾']);
 fs.writeFileSync(p,JSON.stringify({items:[],none:1}));
 r=run(root,'release');
 assert.equal(r.status,'ERROR');
});
