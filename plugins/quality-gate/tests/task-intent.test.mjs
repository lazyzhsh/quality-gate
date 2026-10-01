import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {renderSummary,failureReasons} from '../lib/summary.mjs';
import {parseTaskIntent,taskIntentSha256,writeTaskIntent,readTaskIntentStatus} from '../lib/task-intent.mjs';
import {git,project} from './change-scope-helpers.mjs';

const intent={taskId:'refund-cap',statement:'为退款增加可退余额上限校验',scope:['src/**'],acceptance:[{text:'退款金额超过可退余额时拒绝并返回 REFUND_EXCEEDED',type:'negative'}],constraints:['no-new-dependencies'],source:{kind:'user-prompt',ref:'任务首轮'},createdAt:'2026-10-01T09:00:00.000Z',confirmedBy:'user'};

// 场景基座：意图登记与 scope.json 绑定；spec/登记均落盘后再由各用例改动
function armed(t,{acknowledged=true,requireTaskIntent=false,writeIntent=true,scopePatterns=['src/**','scope.json','package.json']}={}){
 const f=project(t);
 f.spec.allowedPaths.push('scope.json','package.json');
 f.spec.requireTaskIntent=requireTaskIntent;
 const register={...intent,scope:scopePatterns};
 const sha=acknowledged?taskIntentSha256(register):undefined;
 f.spec.taskIntent={file:'.quality-gate/registries/task-intent.json',...(sha?{acknowledgedSha256:sha}:{})};
 f.save();
 if(writeIntent){
  fs.mkdirSync(path.join(f.root,'.quality-gate','registries'),{recursive:true});
  fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify(register));
 }
 return {f,register};
}

test('parseTaskIntent accepts the minimal shape and validates optional blocks',()=>{
 const minimal={taskId:'t1',statement:'做一件事',scope:['src/**'],createdAt:'2026-10-01T00:00:00.000Z',confirmedBy:'user'};
 assert.equal(parseTaskIntent(JSON.stringify(minimal)).taskId,'t1');
 const full=parseTaskIntent(JSON.stringify({...minimal,acceptance:[{text:'a'},{text:'b',type:'boundary'}],constraints:['不引入新依赖'],source:{kind:'plan',ref:'PLAN §2'},revisions:[{revisedAt:'2026-10-01T01:00:00.000Z',reason:'扩一个目录',confirmedBy:'user',previousSha256:'a'.repeat(64)}]}));
 assert.equal(full.acceptance[1].type,'boundary');
 assert.equal(full.revisions.length,1);
});

test('parseTaskIntent fails closed on shape violations',()=>{
 const base={taskId:'t1',statement:'做一件事',scope:['src/**'],createdAt:'2026-10-01T00:00:00.000Z',confirmedBy:'user'};
 const bad=[
  [null,'not JSON object'],
  [{...base,taskId:''},'empty taskId'],
  [{...base,scope:[]},'empty scope'],
  [{...base,scope:['C:/abs']},'absolute scope'],
  [{...base,scope:['../escape']},'escaping scope'],
  [{...base,scope:['src/**','src/**']},'duplicate scope'],
  [{...base,acceptance:[{text:'x',type:'wish'}]},'unknown acceptance type'],
  [{...base,acceptance:[{text:'x'},{text:'x'}]},'duplicate acceptance'],
  [{...base,confirmedBy:''},'missing confirmedBy'],
  [{...base,createdAt:'yesterday'},'non-ISO createdAt'],
  [{...base,revisions:[{revisedAt:'2026-10-01T02:00:00.000Z',reason:'r',confirmedBy:'u',previousSha256:'z'}]},'non-hex previousSha256'],
  [{...base,revisions:[{revisedAt:'2026-09-30T00:00:00.000Z',reason:'r',confirmedBy:'u',previousSha256:'a'.repeat(64)}]},'revision before registration'],
  [{...base,revisions:[
    {revisedAt:'2026-10-02T00:00:00.000Z',reason:'r',confirmedBy:'u',previousSha256:'a'.repeat(64)},
    {revisedAt:'2026-10-01T12:00:00.000Z',reason:'r2',confirmedBy:'u',previousSha256:'b'.repeat(64)}]},'revisions out of order'],
  [{...base,revisions:[
    {revisedAt:'2026-10-01T12:00:00.000Z',reason:'r',confirmedBy:'u',previousSha256:'a'.repeat(64)},
    {revisedAt:'2026-10-02T00:00:00.000Z',reason:'r2',confirmedBy:'u',previousSha256:'a'.repeat(64)}]},'revision chain broken: duplicate anchor'],
 ];
 for(const [spec,label] of bad)assert.throws(()=>parseTaskIntent(JSON.stringify(spec)),null,label);
 assert.throws(()=>parseTaskIntent('not json at all'));
});

test('taskIntentSha256 is content-level: whitespace insensitive, content sensitive',()=>{
 const a=taskIntentSha256(intent);
 const reformatted=JSON.stringify(intent,null,4);
 assert.equal(taskIntentSha256(parseTaskIntent(reformatted)),a);
 assert.notEqual(taskIntentSha256({...intent,statement:'改了'}),a);
});

test('changes inside the intent scope pass with the anchor verified',t=>{
 const {f}=armed(t);
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const detail=result.evidence[0].details.taskIntent;
 assert.equal(detail.taskId,'refund-cap');
 assert.equal(detail.status,'verified');
 assert.equal(detail.revisionsCount,0);
 assert.deepEqual(detail.constraintChecks,[{constraint:'no-new-dependencies',newDependencies:[],status:'verified'}]);
});

test('changes outside the intent scope fail naming outside-task-scope',t=>{
 const {f}=armed(t);
 f.spec.allowedPaths.push('docs/**');f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.mkdirSync(path.join(f.root,'docs'));
 fs.writeFileSync(path.join(f.root,'docs','note.md'),'顺带改的\n');
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.taskIntent.outsideTaskScope,['docs/note.md']);
 const reasons=failureReasons(result.evidence[0]);
 assert.equal(reasons.some(reason=>reason.includes('超任务范围变更')&&reason.includes('docs/note.md')),true);
});

test('silently modifying the intent register fails as intent-file-modified',t=>{
 const {f,register}=armed(t);
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify({...register,scope:['src/**','docs/**']}));
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.taskIntent.status,'intent-file-modified');
 const reasons=failureReasons(result.evidence[0]);
 assert.equal(reasons.some(reason=>reason.includes('任务意图登记已被修改')&&reason.includes('revisions')),true);
});

test('explicit revision with anchor re-binding passes and keeps the chain visible',t=>{
 const {f,register}=armed(t);
 f.spec.allowedPaths.push('docs/**');f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.mkdirSync(path.join(f.root,'docs'));
 fs.writeFileSync(path.join(f.root,'docs','note.md'),'本次任务需要补充的说明\n');
 const previousSha256=taskIntentSha256(register);
 const revised={...register,scope:['src/**','docs/**','scope.json','package.json'],revisions:[{revisedAt:'2026-10-01T10:00:00.000Z',reason:'验收需要补充 docs/note.md',confirmedBy:'user',previousSha256}]};
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify(revised));
 f.spec.taskIntent.acknowledgedSha256=taskIntentSha256(revised);
 f.save();
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const detail=result.evidence[0].details.taskIntent;
 assert.equal(detail.status,'verified');
 assert.equal(detail.revisionsCount,1);
});

test('requireTaskIntent fails without a registration instead of erroring',t=>{
 const {f}=armed(t,{requireTaskIntent:true,writeIntent:false});
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 const result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.taskIntent.status,'no-task-intent');
 const reasons=failureReasons(result.evidence[0]);
 assert.equal(reasons.some(reason=>reason.includes('缺少任务意图登记')),true);
});

test('a bound register that disappears stays fail-closed ERROR without requireTaskIntent',t=>{
 const {f}=armed(t,{requireTaskIntent:false,writeIntent:false});
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence[0].details,/task intent file missing/);
});

test('a malformed intent register errors fail-closed, never passes',t=>{
 const {f}=armed(t);
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify({taskId:'broken'}));
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
});

test('no-new-dependencies constraint fails on a new dependency key and passes on version bumps',t=>{
 const {f}=armed(t);
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.writeFileSync(path.join(f.root,'package.json'),JSON.stringify({dependencies:{leftpad:'^1.0.0'}}));
 f.spec.protectedPaths[0].acknowledged=true;
 f.save();
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.taskIntent.constraintChecks,[{constraint:'no-new-dependencies',newDependencies:['leftpad'],status:'violated'}]);
 const reasons=failureReasons(result.evidence[0]);
 assert.equal(reasons.some(reason=>reason.includes('no-new-dependencies')&&reason.includes('leftpad')),true);
 // 版本变化不是新依赖：把 leftpad 提交进基准后仅改版本号，约束回到 verified
 git(f.root,'add','.');git(f.root,'commit','-qm','add dependency');
 fs.writeFileSync(path.join(f.root,'package.json'),JSON.stringify({dependencies:{leftpad:'^2.0.0'}}));
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=3;\n');
 f.spec.baseRef='HEAD';f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.taskIntent.constraintChecks[0].status,'verified');
});

test('specs without taskIntent keys keep their existing behaviour',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json');f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal('taskIntent' in result.evidence[0].details,false);
});

test('invalid taskIntent binding shapes fail closed at validation',t=>{
 const f=project(t);
 f.spec.taskIntent={file:'.quality-gate/registries/task-intent.json',acknowledgedSha256:'not-hex'};
 f.save();
 const result=run(f.root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence[0].details,/Invalid taskIntent binding/);
});

const qgate=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
const runCli=(...a)=>spawnSync(process.execPath,[qgate,...a],{encoding:'utf8'});

test('writeTaskIntent registers deterministically, re-binds declared specs and refuses silent overwrite',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json');
 f.spec.taskIntent={file:'.quality-gate/registries/task-intent.json'};
 f.save();
 const answers={taskId:'intent-cli',statement:'登记写入通道',scope:['src/**','scope.json'],confirmedBy:'user'};
 const result=writeTaskIntent(f.root,answers);
 assert.equal(result.revisionsCount,0);
 assert.equal(result.reboundSpecs.length,1);
 assert.equal(result.reboundSpecs[0].gateId,'scope');
 const onDisk=JSON.parse(fs.readFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),'utf8'));
 assert.equal(taskIntentSha256(onDisk),result.contentSha256);
 const spec=JSON.parse(fs.readFileSync(path.join(f.root,'scope.json'),'utf8'));
 assert.equal(spec.taskIntent.acknowledgedSha256,result.contentSha256);
 // 登记后立即跑 close：绑定一致、src 内变更 PASS（意图基准行出现在摘要）
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=9;\n');
 const report=run(f.root);
 assert.equal(report.status,'PASS');
 assert.match(renderSummary(report),/任务意图基准: intent-cli（内容哈希绑定一致 · scope 2 项 · 对账通过）/);
 // 静默覆写被拒绝：既有活跃意图必须走显式修订
 assert.throws(()=>writeTaskIntent(f.root,{...answers,scope:['**']}),/already exists/);
});

test('writeTaskIntent revision appends the chain, keeps createdAt and re-binds the new hash',t=>{
 const f=project(t);
 f.spec.taskIntent={file:'.quality-gate/registries/task-intent.json'};
 f.save();
 const first=writeTaskIntent(f.root,{taskId:'rev-task',statement:'第一版',scope:['src/**'],confirmedBy:'user'});
 const createdAtAtRegistration=parseTaskIntent(fs.readFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),'utf8')).createdAt;
 const second=writeTaskIntent(f.root,{taskId:'rev-task',statement:'第一版',scope:['src/**','docs/**'],confirmedBy:'user',reason:'验收需要补充 docs'}, {revise:true});
 assert.equal(second.revisionsCount,1);
 const onDisk=parseTaskIntent(fs.readFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),'utf8'));
 assert.equal(onDisk.createdAt,createdAtAtRegistration);
 assert.equal(onDisk.revisions[0].previousSha256,first.contentSha256);
 assert.equal(onDisk.revisions[0].reason,'验收需要补充 docs');
 const spec=JSON.parse(fs.readFileSync(path.join(f.root,'scope.json'),'utf8'));
 assert.equal(spec.taskIntent.acknowledgedSha256,second.contentSha256);
 assert.throws(()=>writeTaskIntent(f.root,{taskId:'rev-task',statement:'x',scope:['src/**'],confirmedBy:'user',reason:''},{revise:true}),/reason/);
});

test('qgate intent CLI renders read-only and writes through the deterministic channel',t=>{
 const f=project(t);
 const bare=runCli('intent',f.root);
 assert.equal(bare.status,0);
 assert.equal(JSON.parse(bare.stdout).registered,false);
 const answersFile=path.join(f.root,'answers.json');
 fs.writeFileSync(answersFile,JSON.stringify({taskId:'cli-task',statement:'CLI 登记',scope:['src/**'],constraints:['no-new-dependencies'],confirmedBy:'user'}));
 const write=runCli('intent',f.root,answersFile);
 assert.equal(write.status,0);
 const status=JSON.parse(runCli('intent',f.root).stdout);
 assert.equal(status.registered,true);
 assert.equal(status.taskId,'cli-task');
 assert.deepEqual(status.scope,['src/**']);
 const rewrite=runCli('intent',f.root,answersFile);
 assert.equal(rewrite.status,2);
 assert.match(rewrite.stderr,/already exists/);
 fs.writeFileSync(answersFile,JSON.stringify({taskId:'cli-task',statement:'CLI 登记',scope:['src/**','docs/**'],confirmedBy:'user',reason:'补 docs'}));
 const revise=runCli('intent',f.root,answersFile,'--revise');
 assert.equal(revise.status,0);
 assert.equal(JSON.parse(revise.stdout).revisionsCount,1);
});
