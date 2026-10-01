import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {loadApiSurfaces} from '../lib/api-surface.mjs';

const adapterDir=fileURLToPath(new URL('../adapters/',import.meta.url));

const pythonCommand=()=>{
 for(const candidate of ['python','python3']){
  const probe=spawnSync(candidate,['-c','print(1)'],{encoding:'utf8',windowsHide:true});
  if(probe.status===0)return candidate;
 }
 return null;
};

const writeConfig=(root,gateExtra)=>{
 const gate={id:'ground',kind:'symbol-grounding',level:'L1',enabled:true,stages:['close'],claimId:'C0',check:'all',...gateExtra};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify({schemaVersion:'0.2',claims:[{id:'C0',statement:'Imports resolve'}],gates:[gate],risks:[],exceptions:[]}));
};

test('python reference adapter probes with the running interpreter and round-trips through the kernel',t=>{
 const python=pythonCommand();
 if(python===null)return t.skip('python interpreter not available');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-py-adapter-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'pkg'),{recursive:true});
 fs.writeFileSync(path.join(root,'pkg','__init__.py'),'');
 fs.writeFileSync(path.join(root,'pkg','helpers.py'),'def parse():\n    return 1\n');
 fs.writeFileSync(path.join(root,'pkg','app.py'),'import os\nimport ghost_module\nfrom .helpers import parse\n');
 const observation=path.join(root,'.quality-gate','observations','py.json');
 const probe=spawnSync(python,[path.join(adapterDir,'python','import_probe.py'),'--output',observation,'pkg/app.py'],{cwd:root,encoding:'utf8',windowsHide:true});
 assert.equal(probe.status,0,probe.stderr);
 const entries=JSON.parse(fs.readFileSync(observation,'utf8')).entries;
 const byModule=Object.fromEntries(entries.map(entry=>[entry.module,entry.resolution]));
 assert.equal(byModule.os,'stdlib');
 assert.equal(byModule.ghost_module,'unresolved');
 assert.equal(byModule['.helpers'],'project');
 writeConfig(root,{importObservations:[{language:'python',file:'.quality-gate/observations/py.json'}]});
 const failing=run(root);
 assert.equal(failing.status,'FAIL');
 const languages=failing.evidence[0].details.importObservations.languages;
 assert.deepEqual(languages.python.coverageGaps,[]);
 assert.deepEqual(languages.python.unresolved.map(entry=>entry.module),['ghost_module']);
 fs.writeFileSync(path.join(root,'pkg','app.py'),'import os\nfrom .helpers import parse\n');
 assert.equal(spawnSync(python,[path.join(adapterDir,'python','import_probe.py'),'--output',observation,'pkg/app.py'],{cwd:root,encoding:'utf8',windowsHide:true}).status,0);
 assert.equal(run(root).status,'PASS');
});

test('python reference adapter normalizes OpenAPI YAML into a fresh JSON declaration face',t=>{
 const python=pythonCommand();
 if(python===null)return t.skip('python interpreter not available');
 const probe=spawnSync(python,['-c','import yaml'],{encoding:'utf8',windowsHide:true});
 if(probe.status!==0)return t.skip('pyyaml not installed');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-yaml-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'openapi.yaml'),'openapi: 3.1.0\npaths:\n  /users:\n    get: {}\n    post: {}\n');
 const normalized=path.join(root,'openapi.normalized.json');
 const result=spawnSync(python,[path.join(adapterDir,'python','import_probe.py'),'--normalize-openapi','openapi.yaml',normalized],{cwd:root,encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);
 fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify({surfaces:[{id:'api',type:'openapi-yaml',file:'openapi.yaml',normalizedFile:'openapi.normalized.json',source:{file:'docs/api.md'}}]}));
 const loaded=loadApiSurfaces(root,'registry.json');
 assert.equal(loaded.surfaces[0].endpoints.length,2);
});

test('java reference adapter reconciles imports against the manifest and scanned sources, round-trips through the kernel',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-java-adapter-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'src','main','java','com','example'),{recursive:true});
 fs.writeFileSync(path.join(root,'pom.xml'),'<project><dependencies><dependency><groupId>org.apache.commons</groupId><artifactId>commons-lang3</artifactId></dependency></dependencies></project>');
 fs.writeFileSync(path.join(root,'src','main','java','com','example','Order.java'),'package com.example;\npublic class Order {}\n');
 fs.writeFileSync(path.join(root,'src','main','java','com','example','Main.java'),[
  'package com.example;',
  'import java.util.List;',
  'import com.example.Order;',
  'import org.apache.commons.lang3.StringUtils;',
  'import com.ghost.Missing;'
 ].join('\n'));
 const observation=path.join(root,'.quality-gate','observations','java.json');
 const scan=spawnSync(process.execPath,[path.join(adapterDir,'java','import_scan.mjs'),'--output',observation,'src/main/java/com/example/Main.java','src/main/java/com/example/Order.java'],{cwd:root,encoding:'utf8',windowsHide:true});
 assert.equal(scan.status,0,scan.stderr);
 const entries=JSON.parse(fs.readFileSync(observation,'utf8')).entries;
 const byModule=Object.fromEntries(entries.map(entry=>[entry.module,entry.resolution]));
 assert.equal(byModule['java.util.List'],'stdlib');
 assert.equal(byModule['com.example.Order'],'project');
 assert.equal(byModule['org.apache.commons.lang3.StringUtils'],'third-party');
 assert.equal(byModule['com.ghost.Missing'],'unresolved');
 writeConfig(root,{importObservations:[{language:'java',file:'.quality-gate/observations/java.json'}]});
 const failing=run(root);
 assert.equal(failing.status,'FAIL');
 const languages=failing.evidence[0].details.importObservations.languages;
 assert.deepEqual(languages.java.coverageGaps,[]);
 assert.deepEqual(languages.java.unresolved.map(entry=>entry.module),['com.ghost.Missing']);
 fs.writeFileSync(path.join(root,'src','main','java','com','example','Main.java'),[
  'package com.example;',
  'import java.util.List;',
  'import com.example.Order;',
  'import org.apache.commons.lang3.StringUtils;'
 ].join('\n'));
 assert.equal(spawnSync(process.execPath,[path.join(adapterDir,'java','import_scan.mjs'),'--output',observation,'src/main/java/com/example/Main.java','src/main/java/com/example/Order.java'],{cwd:root,encoding:'utf8',windowsHide:true}).status,0);
 assert.equal(run(root).status,'PASS');
});
