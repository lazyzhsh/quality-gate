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

// ---- W1（v1.29）：内容级核验——自报 topics/version 不再是唯一依据 ----
const withContentGate=(t,mutate)=>{
 const root=project(t);
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 config.gates[0].requireContentCheck=true;
 config.gates[0].requiredContent=[{id:'orders-endpoint',role:'api',contains:'POST /orders'},{id:'ops-monitor',role:'operator',contains:'Monitor order creation'}];
 mutate?.(root,config);
 fs.writeFileSync(configPath,JSON.stringify(config));
 return root;
};
test('content check passes when topics, version and keys genuinely appear (W1)',t=>{
 const r=run(withContentGate(t),'release');
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence[0].details.artifacts));
 const api=r.evidence[0].details.artifacts.find(a=>a.role==='api');
 assert.equal(api.contentCheck.status,'PASS');
});
test('lying runner is caught: reported topic absent from content fails by name (W1)',t=>{
 const root=withContentGate(t);
 // 撤掉 API.md 中的 topic 标记但保留 runner 自报（runner 从文件提取——改成固定自报的伪 runner）
 fs.writeFileSync(path.join(root,'API.md'),fs.readFileSync(path.join(root,'API.md'),'utf8').replace('topic: create-order\n',''));
 fs.writeFileSync(path.join(root,'liar.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'liar',artifacts:[{role:'api',path:'API.md',version:'2.0.0',topics:['create-order','get-order']},{role:'code',path:'routes.mjs',version:'2.0.0',topics:['create-order','get-order']},{role:'user',path:'USER.md',version:'2.0.0',topics:['create-order','get-order']},{role:'operator',path:'OPERATIONS.md',version:'2.0.0',topics:['create-order','get-order']}]}));");
 const configPath=path.join(root,'.quality-gate.json');const config=JSON.parse(fs.readFileSync(configPath,'utf8'));config.gates[0].argv=['$NODE','liar.mjs'];fs.writeFileSync(configPath,JSON.stringify(config));
 const r=run(root,'release');
 assert.equal(r.status,'FAIL');
 const api=r.evidence[0].details.artifacts.find(a=>a.role==='api');
 assert.equal(api.contentCheck.status,'FAIL');
 assert.deepEqual(api.contentCheck.missingTopicsInContent,['create-order']);
});
test('stale version in content and missing key fail with named reasons (W1)',t=>{
 const root=withContentGate(t,(root2,config)=>{
  fs.writeFileSync(path.join(root2,'API.md'),fs.readFileSync(path.join(root2,'API.md'),'utf8').replace('release: 2.0.0','release: 1.0.0'));
  // runner 从内容提取版本会同步报 1.0.0——改为固定自报 2.0.0 的伪 runner 保持"自报与配置一致但内容陈旧"
  fs.writeFileSync(path.join(root2,'liar.mjs'),"let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,source:'liar',artifacts:[{role:'api',path:'API.md',version:'2.0.0',topics:['create-order','get-order']},{role:'code',path:'routes.mjs',version:'2.0.0',topics:['create-order','get-order']},{role:'user',path:'USER.md',version:'2.0.0',topics:['create-order','get-order']},{role:'operator',path:'OPERATIONS.md',version:'2.0.0',topics:['create-order','get-order']}]}));");
  config.gates[0].argv=['$NODE','liar.mjs'];
  fs.writeFileSync(path.join(root2,'OPERATIONS.md'),fs.readFileSync(path.join(root2,'OPERATIONS.md'),'utf8').replace('Monitor order creation','Supervise order creation'));
 });
 const r=run(root,'release');
 assert.equal(r.status,'FAIL');
 const api=r.evidence[0].details.artifacts.find(a=>a.role==='api');
 assert.equal(api.contentCheck.versionInContent,false);
 const operator=r.evidence[0].details.artifacts.find(a=>a.role==='operator');
 assert.deepEqual(operator.contentCheck.missingKeys,['ops-monitor']);
});
test('content options validate fail-closed (W1)',t=>{
 for(const bad of [{requireContentCheck:'yes'},{requiredContent:[{id:'x',role:'api'}]},{requiredContent:[{id:'x',role:'nope',contains:'y'},{id:'x',role:'api',contains:'y'}]}]){
  const root=withContentGate(t);
  const configPath=path.join(root,'.quality-gate.json');const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  delete config.gates[0].requireContentCheck;delete config.gates[0].requiredContent;Object.assign(config.gates[0],bad);
  fs.writeFileSync(configPath,JSON.stringify(config));
  assert.equal(run(root,'release').status,'ERROR',JSON.stringify(bad));
 }
});
