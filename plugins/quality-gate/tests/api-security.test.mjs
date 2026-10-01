import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

const source=fileURLToPath(new URL('../examples/api-security-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-apisec-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const gate=(result,id)=>result.evidence.find(e=>e.gateId===id);

test('healthy API security demo passes authz declarations, credentials and fail-secure behavior',t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence.map(e=>[e.gateId,e.status,failureReasons(e)])));
 assert.equal(gate(result,'api-authz').details.findings.length,0);
});

test('operation without explicit security declaration fails api-authz by name',t=>{
 const root=project(t);
 const specPath=path.join(root,'openapi.json');
 const spec=JSON.parse(fs.readFileSync(specPath,'utf8'));
 delete spec.paths['/orders/{id}'].get.security;
 fs.writeFileSync(specPath,JSON.stringify(spec));
 const result=run(root);
 const e=gate(result,'api-authz');
 assert.equal(e.status,'FAIL');
 assert.deepEqual(e.details.findings.map(f=>f.rule),['missing-security-declaration']);
 assert.deepEqual(failureReasons(e),['high missing-security-declaration @ get /orders/{id}']);
});

test('stale or non-vault credential fails the credential scan',t=>{
 const root=project(t);
 const registryPath=path.join(root,'credentials.json');
 const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
 registry.credentials[0].issuedAt='2025-01-01';
 delete registry.credentials[1].vaultPath;
 fs.writeFileSync(registryPath,JSON.stringify(registry));
 const result=run(root);
 const e=gate(result,'credentials');
 assert.equal(e.status,'FAIL');
 assert.deepEqual(e.details.findings.map(f=>f.rule).sort(),['not-vault-sourced','stale-credential']);
});

test('BOLA bypass and fail-open both fail the behavior gate',t=>{
 const root=project(t);
 const app=path.join(root,'app.mjs');
 let source=fs.readFileSync(app,'utf8').replace('return token===`user-${match[1]}`?{status:200}:{status:403};','return {status:200};');
 fs.writeFileSync(app,source);
 let result=run(root);
 assert.equal(gate(result,'authz-behavior').status,'FAIL');
 assert.ok(failureReasons(gate(result,'authz-behavior')).some(reason=>reason.includes('bola-cross-tenant')));
 source=fs.readFileSync(app,'utf8').replace('if(authzDown)return {status:403};','if(authzDown)return {status:200};');
 fs.writeFileSync(app,source);
 result=run(root);
 assert.ok(failureReasons(gate(result,'authz-behavior')).some(reason=>reason.includes('fail-secure-on-authz-down')));
});
