import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathGlob,configSha256,latestRun,modifiedSince,reusableRun,inputSnapshot,changedInputs} from '../lib/freshness.mjs';
import {run} from '../lib/kernel.mjs';
const mkroot=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate fresh '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const write=(root,rel,content)=>{const abs=path.join(root,...rel.split('/'));fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,content);return abs;};
test('pathGlob matches ** segments and rejects unsafe patterns',()=>{
 const g=pathGlob('src/**');
 assert.ok(g.test('src/a/b.mjs')&&!g.test('srcx/a')&&!g.test('build/src/a'));
 assert.ok(pathGlob('*.mjs').test('a.mjs')&&!pathGlob('*.mjs').test('d/a.mjs'));
 assert.ok(pathGlob('**/*.mjs').test('a.mjs')&&pathGlob('**/*.mjs').test('d/a.mjs'));
 assert.throws(()=>pathGlob('/abs/x'));
 assert.throws(()=>pathGlob('../x'));
 assert.throws(()=>pathGlob('a\\b'));
});
test('latestRun picks newest run of the requested stage',t=>{
 const root=mkroot(t),dir=path.join(root,'.quality-gate','runs');fs.mkdirSync(dir,{recursive:true});
 const older=path.join(dir,'a.json'),newer=path.join(dir,'b.json');
 fs.writeFileSync(older,JSON.stringify({id:'a',stage:'close',status:'FAIL',finishedAt:'2026-09-28T00:00:00.000Z',configSha256:'s1'}));
 fs.writeFileSync(newer,JSON.stringify({id:'b',stage:'pr',status:'PASS',finishedAt:'2026-09-28T01:00:00.000Z',configSha256:'s1'}));
 const day=86400000,base=Date.now();
 fs.utimesSync(newer,new Date(base),new Date(base));
 fs.utimesSync(older,new Date(base-2*day),new Date(base-2*day));
 assert.equal(latestRun(root,'close').id,'a'); // 更新的 pr 不匹配阶段，回看更早的 close
 assert.equal(latestRun(root,'pr').id,'b');
});
test('latestRun returns null without runs directory',t=>{assert.equal(latestRun(mkroot(t),'close'),null);});
test('modifiedSince reports only post-cutoff files and ignores runs directory',t=>{
 const root=mkroot(t);
 const stale=write(root,'src/old.mjs','1'),fresh=write(root,'docs/new.md','2'),report=write(root,'.quality-gate/runs/r.json','3');
 const cutoff=new Date('2026-09-28T00:00:00.000Z');
 fs.utimesSync(stale,cutoff,new Date(Date.parse(cutoff)-1000));
 fs.utimesSync(fresh,cutoff,new Date(Date.parse(cutoff)+1000));
 fs.utimesSync(report,cutoff,new Date(Date.parse(cutoff)+5000)); // 报告目录写入不构成输入变更
 assert.deepEqual(modifiedSince(root,'2026-09-28T00:00:00.000Z'),['docs/new.md']);
});
test('modifiedSince returns null when enumeration is truncated',t=>{
 const root=mkroot(t);
 write(root,'a.md','1');write(root,'b.md','2');
 assert.equal(modifiedSince(root,'2026-09-01T00:00:00.000Z',{limit:1}),null); // 无法完整枚举 → fail-safe
});
test('reusableRun requires matching config, verdict and untouched inputs',t=>{
 const root=mkroot(t);
 assert.equal(reusableRun(root,'close'),null); // 无配置
 write(root,'a.json','{"v":1}');write(root,'b.json','{"v":1}');
 const config=write(root,'.quality-gate.json',JSON.stringify({schemaVersion:'0.2',claims:[{id:'C',statement:'s'}],gates:[{id:'G',claimId:'C',kind:'configuration',level:'L5',enabled:true,stages:['close'],files:{a:'a.json',b:'b.json'},allowedDifferences:[]}],risks:[],exceptions:[]}));
 assert.equal(reusableRun(root,'close'),null); // 无归档
 const finished=new Date(Date.now()-5000);
 fs.utimesSync(config,finished,finished); // 配置早于归档结论，不算输入变更
 const runs=path.join(root,'.quality-gate','runs');fs.mkdirSync(runs,{recursive:true});
 const report=run(root);
 assert.equal(reusableRun(root,'close').id,report.id);
 write(root,'late.txt','x'); // 归档之后的输入变更 → 不复用
 assert.equal(reusableRun(root,'close'),null);
});

test('input hashes detect deletion, rename and edits with preserved mtimes',t=>{
 const root=mkroot(t),file=write(root,'a.txt','first'),before=inputSnapshot(root);
 const stat=fs.statSync(file);write(root,'a.txt','other');fs.utimesSync(file,stat.atime,stat.mtime);
 assert.deepEqual(changedInputs(before,inputSnapshot(root)),['a.txt']);
 fs.renameSync(file,path.join(root,'b.txt'));
 assert.deepEqual(changedInputs(before,inputSnapshot(root)),['a.txt','b.txt']);
 fs.unlinkSync(path.join(root,'b.txt'));
 assert.deepEqual(changedInputs(before,inputSnapshot(root)),['a.txt']);
 write(root,'c.txt','limit');
 assert.equal(inputSnapshot(root,{maxEntries:0}),null);
});
