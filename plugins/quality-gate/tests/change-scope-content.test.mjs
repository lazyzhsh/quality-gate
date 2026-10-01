import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {git,project} from './change-scope-helpers.mjs';


function writeContentRunner(root,options={}){
 const source=`import {readFileSync} from 'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));
const findings=${JSON.stringify(options.findings??[])};
process.stdout.write(JSON.stringify({schemaVersion:'0.1',runId:${options.stale?'"00000000-0000-0000-0000-000000000000"':'input.runId'},source:'test-content-runner',findings}));`;
 fs.writeFileSync(path.join(root,'content-runner.mjs'),source);
}

test('content findings block unless explicitly accepted; stale output errors',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json','package.json','content-runner.mjs');f.spec.protectedPaths[0].acknowledged=true;
 f.spec.contentCheck={argv:['$NODE','content-runner.mjs'],timeoutMs:5000};f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');fs.writeFileSync(path.join(f.root,'package.json'),'{"dependencies":{"left-pad":"1.0.0"}}');
 writeContentRunner(f.root);
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 writeContentRunner(f.root,{findings:[{path:'package.json',category:'dependency',detail:'added left-pad'}]});
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.contentCheck.unaccepted,[{path:'package.json',category:'dependency',detail:'added left-pad'}]);
 f.spec.acceptedFindings=[{path:'package.json',category:'dependency',reason:'demo intentionally adds left-pad'}];f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 writeContentRunner(f.root,{findings:[{path:'package.json',category:'dependency',detail:'added left-pad'}],stale:true});
 assert.equal(run(f.root).status,'ERROR');
});

test('contentCheck runner crash errors closed',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json');f.save();
 fs.writeFileSync(path.join(f.root,'crash-content.mjs'),'process.exit(3);');
 f.spec.contentCheck={argv:['$NODE','crash-content.mjs'],timeoutMs:2000};f.save();
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
});

test('selfGuard anchors the spec content; silent edits fail as spec-changed',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json');
 f.spec.selfGuard={acknowledgedSpecSha256:'0'.repeat(64)};
 const {selfGuard:declaration,...anchored}=f.spec;
 f.spec.selfGuard.acknowledgedSpecSha256=createHash('sha256').update(JSON.stringify(anchored)).digest('hex');
 f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.selfGuard.status,'verified');
 f.spec.allowedPaths.push('docs/**');f.save();
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence[0];
 assert.equal(evidence.details.selfGuard.status,'spec-changed');
 assert.match(failureReasons(evidence)[0],/scope spec 已被修改未经重新确认/);
 f.spec.selfGuard={acknowledgedSpecSha256:'nothex'};f.save();
 assert.equal(run(f.root).status,'ERROR');
});

test('pinnedBase anchors the baseline commit; a moved base fails as base-moved',t=>{
 const f=project(t);
 const head=git(f.root,'rev-parse','HEAD');
 f.spec.allowedPaths.push('scope.json');
 f.spec.pinnedBase={commit:head};f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.baseAnchor.status,'verified');
 git(f.root,'add','src/app.mjs');git(f.root,'commit','-qm','advance base');
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=3;\n');
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence[0];
 assert.equal(evidence.details.baseAnchor.status,'base-moved');
 assert.match(failureReasons(evidence)[0],/基线已前移/);
});

test('rename source paths join the change set and protected judgement',t=>{
 const f=project(t);
 fs.mkdirSync(path.join(f.root,'legacy'));
 fs.writeFileSync(path.join(f.root,'legacy','notes.md'),'tracked content stays identical for rename detection\n');
 git(f.root,'add','legacy');git(f.root,'commit','-qm','add legacy notes');
 f.spec.allowedPaths.push('scope.json','**');
 f.spec.protectedPaths.push({id:'legacy-doc',patterns:['legacy/**'],acknowledged:false});
 f.save();
 git(f.root,'mv','legacy/notes.md','src/notes.md');
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence[0];
 assert.deepEqual(evidence.details.unacknowledgedProtected,[{path:'legacy/notes.md',ruleId:'legacy-doc',reason:'not-acknowledged'}]);
 f.spec.protectedPaths[1].acknowledged=true;f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 const byPath=new Map(result.evidence[0].details.files.map(x=>[x.path,x.changeType]));
 assert.equal(byPath.get('legacy/notes.md'),'R-source');
 assert.equal(byPath.get('src/notes.md'),'R');
});

test('requireContentCheck blocks protected-path changes without a content check',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json','package.json','content-runner.mjs');
 f.spec.protectedPaths[0].acknowledged=true;
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.writeFileSync(path.join(f.root,'package.json'),'{"dependencies":{"left-pad":"1.0.0"}}');
 // 未开启：确认后的受保护变更无内容级检查照旧放行（旧语义不变）
 f.save();
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 // 开启且未配置 contentCheck：受保护路径变更即 FAIL 指名
 f.spec.requireContentCheck=true;f.save();
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 const evidence=result.evidence[0];
 assert.deepEqual(evidence.details.protectedChangedWithoutContentCheck,['package.json']);
 assert.deepEqual(failureReasons(evidence).some(reason=>reason.includes('缺少内容级检查')),true);
 // 配置 contentCheck 后：内容级协议接管（无 finding 放行）
 writeContentRunner(f.root);
 f.spec.contentCheck={argv:['$NODE','content-runner.mjs'],timeoutMs:5000};f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 // 无受保护路径变更时开启 requireContentCheck 不阻断
 f.spec.allowedPaths.push('notes.txt');f.save();
 fs.writeFileSync(path.join(f.root,'notes.txt'),'extra\n');
 result=run(f.root);
 assert.equal(result.status,'PASS');
 // 非布尔声明 ERROR
 f.spec.requireContentCheck='yes';f.save();
 assert.equal(run(f.root).status,'ERROR');
});
