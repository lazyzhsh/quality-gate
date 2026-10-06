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

// ---- W8（v1.29）：OpenAPI 声明子集提取器 ----
const openapiExtractor=fileURLToPath(new URL('../adapters/openapi/extract-contract.mjs',import.meta.url));
const extract=(cwd,file)=>spawnSync(process.execPath,[openapiExtractor],{cwd,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId:'t',file})+'\n',windowsHide:true});

test('openapi subset extractor reproduces the alignment demo contract exactly (W8)',()=>{
 const demo=fileURLToPath(new URL('../examples/alignment-demo',import.meta.url));
 const result=extract(demo,'openapi.json');
 assert.equal(result.status,0,result.stderr);
 const output=JSON.parse(result.stdout);
 assert.equal(output.runId,'t');
 // F06：输出自带 kind:'api'，可直接作为 alignment.file 期望制品
 assert.equal(output.kind,'api');
 assert.deepEqual(output.items,JSON.parse(fs.readFileSync(path.join(demo,'api.expected.json'),'utf8')).items);
});
test('openapi extractor includes path and query parameters in requestFields (W8)',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-oas-'));
 fs.writeFileSync(path.join(root,'spec.json'),JSON.stringify({openapi:'3.0.1',paths:{'/orders/{id}':{parameters:[{name:'id',in:'path'}],get:{parameters:[{name:'verbose',in:'query'}],responses:{'204':{description:'ok'}}}}}}));
 const result=extract(root,'spec.json');
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout).items,[{method:'GET',path:'/orders/{id}',requestFields:['id','verbose'],responseStatus:204,responseFields:[]}]);
});
test('operation parameters override path-level parameters by name+in, not concatenation (F06)',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-oas-'));
 const operation={responses:{'204':{description:'ok'}}};
 // path 级 q 被 operation 级 q 覆盖（OpenAPI 语义）——一个字段，不是 ['q','q']；op 独有参数追加在后
 fs.writeFileSync(path.join(root,'spec.json'),JSON.stringify({openapi:'3.0.3',paths:{'/ok':{parameters:[{name:'q',in:'query'},{name:'lang',in:'query'}],get:{...operation,parameters:[{name:'q',in:'query'},{name:'cursor',in:'query'}]}}}}));
 const result=extract(root,'spec.json');
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout).items[0].requestFields,['q','lang','cursor']);
});
test('openapi extractor fails closed outside the declared subset (W8)',()=>{
 const cases={
  ref:'{"openapi":"3.0.0","paths":{"/a":{"get":{"responses":{"200":{"$ref":"#/components/responses/ok"}}}}}}',
  yamlOpenapi:'{"openapi":"2.0","paths":{}}',
  nonJson:'{"openapi":"3.0.0","paths":{"/a":{"post":{"requestBody":{"content":{"text/plain":{"schema":{"type":"object"}}}},"responses":{"200":{"description":"ok"}}}}}}',
  no2xx:'{"openapi":"3.0.0","paths":{"/a":{"get":{"responses":{"404":{"description":"no"}}}}}}',
  refBody:'{"openapi":"3.0.0","paths":{"/a":{"post":{"requestBody":{"$ref":"#/x"},"responses":{"200":{"description":"ok"}}}}}}',
  head:'{"openapi":"3.0.0","paths":{"/ok":{"get":{"responses":{"204":{"description":"ok"}}}},"/lost":{"head":{"responses":{"204":{"description":"ok"}}}}}',
  options:'{"openapi":"3.0.0","paths":{"/a":{"options":{"responses":{"204":{"description":"ok"}}}}}}',
  composition:'{"openapi":"3.0.0","paths":{"/a":{"post":{"requestBody":{"content":{"application/json":{"schema":{"allOf":[{"type":"object","properties":{"amount":{"type":"number"}}}]}}}},"responses":{"204":{"description":"ok"}}}}}}',
  nestedRef:'{"openapi":"3.0.0","components":{"schemas":{"Q":{"type":"string"}}},"paths":{"/a":{"get":{"parameters":[{"name":"q","in":"query","schema":{"$ref":"#/components/schemas/Q"}}],"responses":{"204":{"description":"ok"}}}}}}',
  duplicateParam:'{"openapi":"3.0.0","paths":{"/a":{"parameters":[{"name":"q","in":"query"},{"name":"q","in":"query"}],"get":{"responses":{"204":{"description":"ok"}}}}}}',
  duplicateOpParam:'{"openapi":"3.0.0","paths":{"/a":{"get":{"parameters":[{"name":"q","in":"query"},{"name":"q","in":"query"}],"responses":{"204":{"description":"ok"}}}}}}'
 };
 for(const [name,spec] of Object.entries(cases)){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-oas-'));
  fs.writeFileSync(path.join(root,'spec.json'),spec);
  const result=extract(root,'spec.json');
  assert.notEqual(result.status,0,`${name} must fail closed`);
  assert.ok(result.stderr.length>0,`${name} must name the subset boundary`);
 }
});
test('extracted contract is directly consumable by alignment and drift fails named (F06)',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qg-oas-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const spec={openapi:'3.0.3',info:{title:'e2e',version:'1'},paths:{
  '/orders/{id}':{parameters:[{name:'id',in:'path'}],get:{responses:{'200':{description:'ok',content:{'application/json':{schema:{type:'object',properties:{status:{type:'string'}}}}}}}}},
  '/payments':{post:{requestBody:{content:{'application/json':{schema:{type:'object',properties:{amount:{type:'number'},currency:{type:'string'}}}}}},responses:{'204':{description:'ok'}}}}}};
 fs.writeFileSync(path.join(root,'openapi.json'),JSON.stringify(spec));
 const extracted=extract(root,'openapi.json');
 assert.equal(extracted.status,0,extracted.stderr);
 // 提取输出原样作为 alignment 期望制品——不再需要手工补 kind/改形状
 fs.writeFileSync(path.join(root,'expected.json'),extracted.stdout);
 fs.writeFileSync(path.join(root,'runner.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const q=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,kind:'api',source:'provider observation',items:[{method:'GET',path:'/orders/{id}',requestFields:['id'],responseStatus:200,responseFields:['status']},{method:'POST',path:'/payments',requestFields:['amount','currency'],responseStatus:204,responseFields:[]}]}));");
 const config={schemaVersion:'0.2',claims:[{id:'C',statement:'api contract'}],gates:[{id:'api',kind:'alignment',level:'L2',scope:'api',file:'expected.json',argv:['$NODE','runner.mjs'],timeoutMs:5000,stages:['close'],claimId:'C',enabled:true}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 assert.equal(run(root).status,'PASS');
 // 真实声明改名后重新提取（防旧归一化文件继续验证）：观察不再对齐，FAIL 指名差异
 const drifted=JSON.parse(JSON.stringify(spec));
 drifted.paths['/settlements']=drifted.paths['/payments'];
 delete drifted.paths['/payments'];
 fs.writeFileSync(path.join(root,'openapi.json'),JSON.stringify(drifted));
 const reextracted=extract(root,'openapi.json');
 assert.equal(reextracted.status,0,reextracted.stderr);
 fs.writeFileSync(path.join(root,'expected.json'),reextracted.stdout);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.ok(result.evidence[0].details.differences.some(difference=>difference.path.startsWith('/items')));
});
