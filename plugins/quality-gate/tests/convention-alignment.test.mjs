import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {leanFixture} from './fixture.mjs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

function gated(t,rules){
 const f=leanFixture(t);
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'conventions hold'}],gates:[{id:'conv',kind:'convention-alignment',level:'L0',enabled:true,stages:['close'],claimId:'C0',file:'conventions.json'}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(config));
 fs.writeFileSync(path.join(f.root,'conventions.json'),JSON.stringify({rules}));
 return f;
}

const banned=['旧词甲'];

test('banned-words rule passes on clean scope and names hits with path and line',t=>{
 const f=gated(t,[{id:'TERM-x',type:'banned-words',words:banned,scope:['docs/**'],source:{file:'AGENTS.md',section:'术语约定'}}]);
 fs.mkdirSync(path.join(f.root,'docs'));
 fs.writeFileSync(path.join(f.root,'docs','a.md'),'正常内容\n');
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.rules[0].scannedFiles,1);
 fs.writeFileSync(path.join(f.root,'docs','a.md'),'第一行\n这里出现旧词甲一次\n');
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.rules[0].hits,[{path:'docs/a.md',line:2,word:'旧词甲'}]);
 assert.equal(failureReasons(result.evidence[0]).some(r=>r.includes('TERM-x 命中: 旧词甲 @ docs/a.md:2')),true);
});

test('exemptions: mapping notation, line markers, prefix and suffix skips',t=>{
 const f=gated(t,[{id:'TERM-x',type:'banned-words',words:['旧词甲','烟测','随版'],scope:['docs/**'],exemptions:[{word:'旧词甲',lineContains:'盘点'},{word:'烟测',precededBy:'冒'},{word:'随版',followedBy:'发布'}],source:{file:'AGENTS.md'}}]);
 fs.mkdirSync(path.join(f.root,'docs'));
 fs.writeFileSync(path.join(f.root,'docs','a.md'),['对照行：旧词甲→新词甲','盘点：这里提到旧词甲','冒烟测试是保留组合','随版发布不变','裸的旧词甲'].join('\n'));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.rules[0].hits,[{path:'docs/a.md',line:5,word:'旧词甲'}]);
});

test('advisory severity records hits without blocking',t=>{
 const f=gated(t,[{id:'STYLE-x',type:'banned-words',words:banned,scope:['docs/**'],severity:'advisory',source:{file:'AGENTS.md'}}]);
 fs.mkdirSync(path.join(f.root,'docs'));
 fs.writeFileSync(path.join(f.root,'docs','a.md'),'旧词甲 出现\n');
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.advisoryHits,1);
 assert.equal(result.evidence[0].details.blockingHits,0);
});

test('argv rules follow the shared observation protocol and fail closed on stale runId',t=>{
 const f=gated(t,[{id:'CONV-argv',type:'argv',argv:['$NODE','-e','const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>{const req=JSON.parse(chunks.join(""));const out={schemaVersion:"0.1",runId:req.runId+"-stale",source:"inline",findings:[{path:"docs/a.md",detail:"违规词"}]};process.stdout.write(JSON.stringify(out))})'],timeoutMs:5000,source:{file:'scripts/check.mjs'}}]);
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence[0].details,/Invalid or stale convention observation/);
});

test('argv rule findings block with named evidence',t=>{
 const f=gated(t,[{id:'CONV-argv',type:'argv',argv:['$NODE','-e','const chunks=[];process.stdin.on("data",c=>chunks.push(c));process.stdin.on("end",()=>{const req=JSON.parse(chunks.join(""));const out={schemaVersion:"0.1",runId:req.runId,source:"inline",findings:[{path:"src/x.mjs",detail:"import 风格违规",category:"style"}]};process.stdout.write(JSON.stringify(out))})'],timeoutMs:5000,source:{file:'scripts/check.mjs'}}]);
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.rules[0].hits,[{path:'src/x.mjs',line:null,word:'import 风格违规',category:'style'}]);
});

test('registry shape violations fail closed',t=>{
 const f=gated(t,[{id:'bad',type:'prolog',source:{file:'x'}}]);
 assert.equal(run(f.root).status,'ERROR');
 const g2=gated(t,[{id:'a',type:'banned-words',words:[],scope:['docs/**'],source:{file:'x'}}]);
 assert.equal(run(g2.root).status,'ERROR');
 const g3=gated(t,[{id:'a',type:'banned-words',words:['x'],scope:['/abs/**'],source:{file:'x'}}]);
 assert.equal(run(g3.root).status,'ERROR');
 const g4=gated(t,[{id:'a',type:'banned-words',words:['x'],scope:['docs/**'],exemptions:[{word:'x',lineContains:'a',precededBy:'b'}],source:{file:'x'}}]);
 assert.equal(run(g4.root).status,'ERROR');
});

test('gate level is enforced at validation',t=>{
 const f=leanFixture(t);
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'x'}],gates:[{id:'conv',kind:'convention-alignment',level:'L1',enabled:true,stages:['close'],claimId:'C0',file:'conventions.json'}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(config));
 assert.equal(run(f.root).status,'ERROR');
});

const demoDir=fileURLToPath(new URL('../examples/convention-align-demo/',import.meta.url));
test('convention-align-demo passes as shipped and fails on an injected banned word',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-conv-demo-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(demoDir,root,{recursive:true});
 const clean=run(root);
 assert.equal(clean.status,'PASS',JSON.stringify(clean.evidence[0].details).slice(0,300));
 fs.writeFileSync(path.join(root,'docs','usage.md'),'这里出现旧称谓Z\n');
 const dirty=run(root);
 assert.equal(dirty.status,'FAIL');
 assert.equal(dirty.evidence[0].details.rules[0].hits.some(hit=>hit.word==='旧称谓Z'),true);
});
