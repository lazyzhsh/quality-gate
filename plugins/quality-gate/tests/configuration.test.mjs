import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/configuration-demo',import.meta.url));function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-config-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('environment keys, types and declared differences pass',t=>{const r=run(project(t),'release');assert.equal(r.status,'PASS',JSON.stringify(r.evidence));});
test('missing key, undeclared drift and literal secret fail without leaking value',t=>{const root=project(t),p=path.join(root,'production.json'),c=JSON.parse(fs.readFileSync(p));delete c.retry;c.database.port=15432;c.auth.token='sensitive-demo-value';fs.writeFileSync(p,JSON.stringify(c));const r=run(root,'release');assert.equal(r.status,'FAIL');const f=r.evidence[0].details.findings;assert.deepEqual(f.map(x=>x.rule).sort(),['literal-secret','missing-key','undeclared-difference'].sort());assert.equal(JSON.stringify(r).includes('sensitive-demo-value'),false);});

test('wildcard allowedDifferences match segment patterns only',t=>{
 const root=project(t);
 const staging=JSON.parse(fs.readFileSync(path.join(root,'staging.json'),'utf8'));
 const production=JSON.parse(fs.readFileSync(path.join(root,'production.json'),'utf8'));
 production.database.port=9999;
 fs.writeFileSync(path.join(root,'production.json'),JSON.stringify(production));
 let result=run(root,'release');
 const findings=result.evidence[0].details.findings;
 assert.equal(result.status,'FAIL');
 assert.deepEqual(findings.map(finding=>finding.path),['database.port']);
 // features.canary.enabled 已由通配声明；database.port 未声明仍阻断
 void staging;
});
