import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/scan-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-scan-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('the configured sast scan executes with fresh evidence',t=>{const r=run(project(t));assert.equal(r.status,'PASS',JSON.stringify(r.evidence));assert.equal(r.evidence.filter(e=>e.status==='PASS').length,1);});
test('removed scan categories fail closed at validation',t=>{const root=project(t);const config=path.join(root,'.quality-gate.json');const c=JSON.parse(fs.readFileSync(config,'utf8'));for(const category of ['dependency','secret','iac','dast']){c.gates[0].category=category;fs.writeFileSync(config,JSON.stringify(c));assert.equal(run(root).status,'ERROR',category);}});
test('source findings block by severity',t=>{const root=project(t);fs.appendFileSync(path.join(root,'app.mjs'),'\neval("1")');const r=run(root);assert.equal(r.status,'FAIL');assert.deepEqual(r.evidence.filter(e=>e.status==='FAIL').map(e=>e.gateId),['sast']);});

test('accepted findings pass with reason and expired acceptance re-blocks',t=>{
 const root=project(t);
 fs.appendFileSync(path.join(root,'app.mjs'),'\neval("1")');
 const config=path.join(root,'.quality-gate.json');
 const read=()=>JSON.parse(fs.readFileSync(config,'utf8'));
 const write=next=>fs.writeFileSync(config,JSON.stringify(next));
 const config0=read();
 config0.gates.find(item=>item.id==='sast').acceptedFindings=[{rule:'no-eval',location:'app.mjs',reason:'Audited demo exception',expiresAt:'2099-01-01'}];
 write(config0);
 let result=run(root);
 let finding=result.evidence.find(e=>e.gateId==='sast').details.findings[0];
 assert.equal(finding.blocked,false);
 assert.equal(finding.acceptedBy.reason,'Audited demo exception');
 // 错误 location 的豁免不生效
 const wrong=read();
 wrong.gates.find(item=>item.id==='sast').acceptedFindings=[{rule:'no-eval',location:'other.mjs',reason:'wrong match',expiresAt:'2099-01-01'}];
 write(wrong);
 assert.equal(run(root).evidence.find(e=>e.gateId==='sast').status,'FAIL');
 // 过期豁免恢复阻断并标注
 const expired=read();
 expired.gates.find(item=>item.id==='sast').acceptedFindings=[{rule:'no-eval',location:'app.mjs',reason:'expired demo exception',expiresAt:'2000-01-01'}];
 write(expired);
 result=run(root);
 finding=result.evidence.find(e=>e.gateId==='sast').details.findings[0];
 assert.equal(finding.blocked,true);
 assert.equal(finding.acceptanceExpired,true);
});

test('stale and malformed scan observations fail closed',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'stale-runner.mjs'),`import fs from 'node:fs';console.log(JSON.stringify({schemaVersion:'0.1',runId:'old',tool:'fake',version:'1',category:JSON.parse(fs.readFileSync(0,'utf8')).category,target:'x',findings:[]}));`);
 const config=path.join(root,'.quality-gate.json');
 const original=fs.readFileSync(config,'utf8');
 const parsed=JSON.parse(original);
 parsed.gates.find(item=>item.id==='sast').argv=['$NODE','stale-runner.mjs'];
 fs.writeFileSync(config,JSON.stringify(parsed));
 let result=run(root);
 assert.equal(result.status,'ERROR');
 assert.equal(result.evidence.find(e=>e.gateId==='sast').status,'ERROR');
 fs.writeFileSync(path.join(root,'stale-runner.mjs'),`import fs from 'node:fs';const r=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,tool:'fake',version:'1',category:r.category,target:'x',findings:[{id:'1',rule:'x',severity:'extreme',location:'a',description:'b'}]}));`);
 result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='sast').status,'ERROR');
 const invalid=JSON.parse(original);
 invalid.gates.find(item=>item.id==='sast').acceptedFindings=[{rule:'x',location:'y',reason:'r',expiresAt:'not-a-date'}];
 fs.writeFileSync(config,JSON.stringify(invalid));
 assert.equal(run(root).status,'ERROR');
});
