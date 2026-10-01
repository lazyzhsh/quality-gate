import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/documentation-demo',import.meta.url));function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-docs-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('four artifacts match release version and capability topics',t=>{const r=run(project(t),'release');assert.equal(r.status,'PASS',JSON.stringify(r.evidence));assert.equal(r.evidence[0].details.artifacts.length,4);});
test('stale API version and missing user capability fail by artifact',t=>{const root=project(t);fs.writeFileSync(path.join(root,'API.md'),fs.readFileSync(path.join(root,'API.md'),'utf8').replace('2.0.0','1.0.0'));fs.writeFileSync(path.join(root,'USER.md'),fs.readFileSync(path.join(root,'USER.md'),'utf8').replace('topic: get-order',''));const r=run(root,'release');assert.equal(r.status,'FAIL');assert.deepEqual(r.evidence[0].details.artifacts.filter(a=>a.status==='FAIL').map(a=>a.role),['api','user']);});

test('artifact paths are verified on disk and escapes fail closed',t=>{
 const root=project(t);
 const fake=`let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);
const roles=['code','api','user','operator'];
console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'fake',artifacts:roles.map(role=>({role,path:'GONE.md',version:'2.0.0',topics:['create-order','get-order']}))}));`;
 fs.writeFileSync(path.join(root,'fake-runner.mjs'),fake);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].argv=['$NODE','fake-runner.mjs'];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 let result=run(root,'release');
 assert.equal(result.status,'FAIL');
 const artifacts=result.evidence[0].details.artifacts;
 assert.ok(artifacts.every(artifact=>artifact.fileStatus==='MISSING'&&artifact.status==='FAIL'));
 fs.writeFileSync(path.join(root,'fake-runner.mjs'),fake.replace("path:'GONE.md'","path:'../escape.md'"));
 result=run(root,'release');
 assert.equal(result.status,'ERROR');
});
