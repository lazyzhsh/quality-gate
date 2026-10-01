import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';

const demoDir=fileURLToPath(new URL('../examples/api-surface-demo/',import.meta.url));

const copy=t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-api-demo-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(demoDir,root,{recursive:true});
 return root;
};

test('api-surface-demo passes as shipped with both faces inventoried',t=>{
 const root=copy(t);
 const report=run(root);
 assert.equal(report.status,'PASS');
 const details=report.evidence[0].details;
 assert.equal(details.apiSurface.surfaces.length,2);
 assert.equal(details.apiSurface.endpointReferenceCount,2);
 assert.equal(details.apiSurface.configKeyReferenceCount,2);
 assert.equal(details.memberOpaqueTargets,0);
});

test('api-surface-demo fails naming ghost endpoint, config key and member on injection',t=>{
 const root=copy(t);
 fs.writeFileSync(path.join(root,'src','client.mjs'),[
  "import {listUsers, ghostMember} from './api.mjs';",
  "const host=process.env.GHOST_KEY;",
  "export async function call(){ await fetch('/ghosts'); return listUsers(); }"
 ].join('\n'));
 const report=run(root);
 assert.equal(report.status,'FAIL');
 const details=report.evidence[0].details;
 assert.deepEqual(details.unresolvedReference.map(entry=>`${entry.kind}:${entry.reference}`),['endpoint:/ghosts','config-key:GHOST_KEY']);
 assert.deepEqual(details.unresolvedMember,[{path:'src/client.mjs',line:1,target:'src/api.mjs',member:'ghostMember'}]);
});

test('api-surface-demo accepts a YAML face after adapter normalization (guarded)',t=>{
 let python=null;
 for(const candidate of ['python','python3'])if(spawnSync(candidate,['-c','print(1)'],{windowsHide:true}).status===0)python=candidate;
 if(python===null)return t.skip('python interpreter not available');
 if(spawnSync(python,['-c','import yaml'],{windowsHide:true}).status!==0)return t.skip('pyyaml not installed');
 const root=copy(t);
 const normalized=spawnSync(python,[fileURLToPath(new URL('../adapters/python/import_probe.py',import.meta.url)),'--normalize-openapi','openapi.yaml','openapi.normalized.json'],{cwd:root,windowsHide:true,encoding:'utf8'});
 assert.equal(normalized.status,0,normalized.stderr);
 const registryPath=path.join(root,'api-surface.json');
 const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
 registry.surfaces.push({id:'api-orders',type:'openapi-yaml',file:'openapi.yaml',normalizedFile:'openapi.normalized.json',source:{file:'package.json',section:'description'}});
 fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
 fs.writeFileSync(path.join(root,'src','client.mjs'),[
  "import {listUsers} from './api.mjs';",
  'const host=process.env.HOST;',
  "export async function refresh(){ await fetch('/orders'); return listUsers(); }"
 ].join('\n'));
 const report=run(root);
 assert.equal(report.status,'PASS');
 assert.equal(report.evidence[0].details.apiSurface.surfaces.length,3);
});
