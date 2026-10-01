import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes} from '../lib/summary.mjs';

function setup(t){
 const f=leanFixture(t);
 f.c.claims.push({id:'C2',statement:'The demo order policy handles configured cases'});
 f.c.gates.push({id:'behavior',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C2',argv:['$NODE','runner.mjs'],timeoutMs:2000,cases:[{id:'normal',input:{amount:10},expected:{decision:'accept'}},{id:'boundary',input:{amount:0},expected:{decision:'reject'}}]});f.save();
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const chunk of process.stdin)raw+=chunk;const request=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,cases:request.cases.map(x=>({id:x.id,actual:{decision:x.input.amount>0?'accept':'reject'}}))}));`);
 return f;
}
test('L3 behavior compares normal and boundary cases with fresh run correlation',t=>{
 const f=setup(t);const result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence.find(e=>e.gateId==='behavior').details.cases.length,2);
});
test('wrong business outcome fails with case evidence',t=>{
 const f=setup(t);f.c.gates.find(g=>g.id==='behavior').cases[1].expected={decision:'accept'};f.save();
 const e=run(f.root).evidence.find(e=>e.gateId==='behavior');
 assert.equal(e.status,'FAIL');assert.equal(e.details.cases[1].status,'FAIL');
});
test('stale or malformed runner output cannot pass',t=>{
 const f=setup(t);
 fs.writeFileSync(path.join(f.root,'runner.mjs'),`console.log(JSON.stringify({schemaVersion:'0.1',runId:'stale',cases:[]}));`);
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='behavior').status,'ERROR');
 f.c.gates.find(g=>g.id==='behavior').cases.push({id:'normal',input:{},expected:{}});f.save();
 assert.equal(run(f.root).status,'ERROR');
});

test('ignorePaths exempts volatile output fields per case',t=>{
 const f=leanFixture(t);
 f.c.claims.push({id:'C3',statement:'volatile outputs'});
 f.c.gates.push({id:'vol',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C3',argv:['$NODE','volatile-runner.mjs'],timeoutMs:2000,ignorePaths:['/evaluatedAt'],cases:[{id:'c1',input:{amount:1},expected:{decision:'accept'}}]});
 f.save();
 fs.writeFileSync(path.join(f.root,'volatile-runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,cases:r.cases.map(x=>({id:x.id,actual:{decision:'accept',evaluatedAt:Date.now()}}))}));`);
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 const gate=f.c.gates.find(g=>g.id==='vol');
 delete gate.ignorePaths;f.save();
 result=run(f.root);
 assert.equal(result.evidence.find(e=>e.gateId==='vol').status,'FAIL');
 assert.deepEqual(result.evidence.find(e=>e.gateId==='vol').details.cases[0].differences.map(d=>d.path),['/evaluatedAt']);
});

function expectedSetup(t,runnerBody){
 const f=leanFixture(t);
 f.c.claims.push({id:'C4',statement:'f2p/p2p cases'});
 f.c.gates.push({id:'f2p2p',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C4',argv:['$NODE','baseline-runner.mjs'],timeoutMs:2000,
  cases:[{id:'normal',input:{amount:10},expected:{decision:'accept'}},{id:'boundary',input:{amount:0},expected:{decision:'reject'}},{id:'newcase',input:{amount:42},expected:{decision:'accept'}}]});
 f.save();
 fs.writeFileSync(path.join(f.root,'baseline-runner.mjs'),runnerBody);
 return f;
}
const defaultBaselineRunner=`let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);
const decide=(a,legacy)=>a>0&&(a!==42||!legacy)?{decision:'accept'}:{decision:'reject'};
console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,cases:r.cases.map(x=>({id:x.id,actual:decide(x.input.amount,false),baselineActual:decide(x.input.amount,true)}))}));`;

test('expected f2p/p2p passes with baseline evidence and names cases',t=>{
 const f=expectedSetup(t,defaultBaselineRunner);
 f.c.gates.find(g=>g.id==='f2p2p').expected={f2p:['newcase'],p2p:['normal','boundary']};f.save();
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const cases=result.evidence.find(e=>e.gateId==='f2p2p').details.cases;
 assert.equal(cases.find(c=>c.id==='newcase').baselineStatus,'fail');
 assert.equal(cases.find(c=>c.id==='normal').baselineStatus,'pass');
});
test('f2p case passing on baseline is flagged as false fix',t=>{
 const f=expectedSetup(t,defaultBaselineRunner);
 f.c.gates.find(g=>g.id==='f2p2p').expected={f2p:['normal']};f.save();
 const e=run(f.root).evidence.find(e=>e.gateId==='f2p2p');
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.expectedViolations[0].rule,'f2pPassedOnBaseline');
 assert.deepEqual(failureReasons(e),['用例 normal: f2p 基线已通过（测试未绑定新行为，疑似伪修复）']);
});
test('p2p regression and p2p baseline failure are named',t=>{
 const f=expectedSetup(t,defaultBaselineRunner);
 const gate=f.c.gates.find(g=>g.id==='f2p2p');
 gate.cases.find(c=>c.id==='normal').expected={decision:'reject'};
 gate.expected={p2p:['normal','newcase']};f.save();
 const e=run(f.root).evidence.find(e=>e.gateId==='f2p2p');
 const rules=e.details.expectedViolations.map(v=>v.rule);
 assert.ok(rules.includes('p2pRegressed'));
 assert.ok(rules.includes('p2pFailedOnBaseline'));
});
test('missing baselineActual for declared case fails',t=>{
 const f=expectedSetup(t,`let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);
console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId,cases:r.cases.map(x=>({id:x.id,actual:{decision:x.input.amount>0?'accept':'reject'},...(x.id!=='newcase'?{baselineActual:{decision:x.input.amount>0?'accept':'reject'}}:{})}))}));`);
 f.c.gates.find(g=>g.id==='f2p2p').expected={f2p:['newcase']};f.save();
 const e=run(f.root).evidence.find(e=>e.gateId==='f2p2p');
 assert.equal(e.status,'FAIL');
 assert.deepEqual(e.details.expectedViolations,[{direction:'f2p',name:'newcase',rule:'missingBaseline'}]);
});
test('expected referencing unknown case or overlapping directions is rejected',t=>{
 const f=expectedSetup(t,defaultBaselineRunner);
 f.c.gates.find(g=>g.id==='f2p2p').expected={f2p:['nope']};f.save();
 assert.equal(run(f.root).status,'ERROR');
 f.c.gates.find(g=>g.id==='f2p2p').expected={f2p:['normal'],p2p:['normal']};f.save();
 assert.equal(run(f.root).status,'ERROR');
});

const git=(root,...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
test('baselineSource protocol: git ref verified, embedded downgraded, git-mode strict, fabricated ref errors',t=>{
 const f=leanFixture(t);
 f.c.claims.push({id:'C4',statement:'F2P/P2P with a real baseline'});
 f.c.gates.push({id:'f2p2p',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C4',argv:['$NODE','runner.mjs'],timeoutMs:3000,expected:{f2p:['newcase'],p2p:['normal']},cases:[{id:'normal',input:{amount:10},expected:{decision:'accept'}},{id:'newcase',input:{amount:42},expected:{decision:'accept'}}]});
 f.save();
 // runner 自带 baselineActual（legacy 拒绝大额）；baselineSource 由参数注入观察输出
 const writeRunner=baselineSourceLiteral=>fs.writeFileSync(path.join(f.root,'runner.mjs'),`let raw='';for await(const c of process.stdin)raw+=c;const r=JSON.parse(raw);const decide=(a,legacy)=>legacy&&a>20?{decision:'reject'}:{decision:a>0?'accept':'reject'};console.log(JSON.stringify({schemaVersion:'0.1',runId:r.runId${baselineSourceLiteral?`,baselineSource:${baselineSourceLiteral}`:''},cases:r.cases.map(x=>({id:x.id,actual:decide(x.input.amount,false),baselineActual:decide(x.input.amount,true)}))}));`);
 git(f.root,'init','-q');git(f.root,'config','user.email','test@example.invalid');git(f.root,'config','user.name','Test');
 fs.writeFileSync(path.join(f.root,'seed.txt'),'baseline seed\n');git(f.root,'add','.');git(f.root,'commit','-qm','seed');
 const sha=git(f.root,'rev-parse','HEAD');
 writeRunner(`{type:'git-commit',ref:'${sha}'}`);
 let result=run(f.root);
 assert.equal(result.status,'PASS');
 const baseline=result.evidence.find(e=>e.gateId==='f2p2p').details.baseline;
 assert.equal(baseline.status,'verified');assert.equal(baseline.resolvedCommit,sha);
 // baselineMode:git 下已核验的 git 基线同样通过
 f.c.gates.find(g=>g.id==='f2p2p').baselineMode='git';f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 // git 模式 + 缺失 baselineSource → FAIL 指名
 writeRunner(null);
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(failureReasons(result.evidence.find(e=>e.gateId==='f2p2p'))[0],'基线来源缺失（baselineMode:git）');
 // git 模式 + embedded → FAIL 指名
 writeRunner(`{type:'embedded'}`);
 result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.equal(failureReasons(result.evidence.find(e=>e.gateId==='f2p2p'))[0],'基线为内嵌声明（embedded），baselineMode:git 不接受');
 // any 模式 + embedded → 放行但摘要降级标注
 f.c.gates.find(g=>g.id==='f2p2p').baselineMode='any';f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.ok(downgradeNotes(result).some(note=>note.includes('基线为内嵌声明（embedded，非真实历史）')),JSON.stringify(downgradeNotes(result)));
 // 捏造 ref → ERROR fail-closed；非法 baselineMode → 配置 ERROR
 writeRunner(`{type:'git-commit',ref:'1234567890abcdef'}`);
 assert.equal(run(f.root).status,'ERROR');
 f.c.gates.find(g=>g.id==='f2p2p').baselineMode='both';f.save();
 assert.equal(run(f.root).status,'ERROR');
});

// 原始用例观察记录（v1.13 T2）：声明即核验正反例矩阵
import {evidenceStrength} from '../lib/summary.mjs';

function transcriptSetup(t,{requireRawTranscript}={}){
 const f=leanFixture(t);
 f.c.claims.push({id:'C4',statement:'transcript cross-check'});
 const gate={id:'bt',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C4',argv:['$NODE','bt-runner.mjs'],timeoutMs:2000,cases:[{id:'normal',input:{amount:10},expected:{decision:'accept'}},{id:'boundary',input:{amount:0},expected:{decision:'reject'}}]};
 if(requireRawTranscript!==undefined)gate.requireRawTranscript=requireRawTranscript;
 f.c.gates.push(gate);f.save();
 return f;
}
const btRunner=({tamperActual,tamperRunId,omitBaseline,declare=true}={})=>{
 const lines=[
  `import fs from 'node:fs';`,
  `let raw='';for await(const chunk of process.stdin)raw+=chunk;const request=JSON.parse(raw);`,
  `const cases=request.cases.map(x=>({id:x.id,actual:{decision:x.input.amount>0?'accept':'reject'},baselineActual:{decision:x.input.amount>0?'accept':'reject'}}));`,
  `const transcriptCases=${tamperActual?'cases.map(c=>c.id==="boundary"?{...c,actual:{decision:"accept"}}:c)':'cases'}`,
  `.map(c=>(${omitBaseline?'{id:c.id,actual:c.actual}':'c'}));`,
  `fs.mkdirSync('build',{recursive:true});`,
  `fs.writeFileSync('build/t.json',JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:${tamperRunId?'"00000000-0000-0000-0000-000000000000"':'request.runId'},cases:transcriptCases}));`,
  `console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,cases${declare?`,rawTranscript:{format:'qgate-transcript',file:'build/t.json'}`:''}}));`
 ].join('');
 return lines;
};
test('rawTranscript declared-and-verified passes with crossCheck evidence and anchor',t=>{
 const f=transcriptSetup(t);
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner());
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const e=result.evidence.find(x=>x.gateId==='bt');
 assert.equal(e.details.rawTranscript.crossCheck,'match');
 assert.equal(e.details.rawTranscript.caseCount,2);
 const strength=evidenceStrength(result);
 assert.equal(strength.signals.rawOutputs,1);
 assert.equal(strength.level,'anchored');
});
test('rawTranscript disagreeing with self-reported actual errors naming the case',t=>{
 const f=transcriptSetup(t);
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner({tamperActual:true}));
 const e=run(f.root).evidence.find(x=>x.gateId==='bt');
 assert.equal(e.status,'ERROR');
 assert.match(String(e.details.error),/case boundary actual reported/);
});
test('stale transcript runId cannot replay a previous run',t=>{
 const f=transcriptSetup(t);
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner({tamperRunId:true}));
 const e=run(f.root).evidence.find(x=>x.gateId==='bt');
 assert.equal(e.status,'ERROR');
 assert.match(String(e.details.error),/stale transcript/);
});
test('baselineActual presence disagreement between transcript and report errors',t=>{
 const f=transcriptSetup(t);
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner({omitBaseline:true}));
 const e=run(f.root).evidence.find(x=>x.gateId==='bt');
 assert.equal(e.status,'ERROR');
 assert.match(String(e.details.error),/baselineActual presence disagrees/);
});
test('requireRawTranscript without declaration fails named; explicit false keeps legacy semantics',t=>{
 const f=transcriptSetup(t,{requireRawTranscript:true});
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner({declare:false}));
 const result=run(f.root);
 const e=result.evidence.find(x=>x.gateId==='bt');
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.missingRawTranscript,true);
 assert.ok(failureReasons(e).includes('缺少原始用例观察记录（requireRawTranscript）'));
 f.c.gates.find(g=>g.id==='bt').requireRawTranscript=false;f.save();
 assert.equal(run(f.root).status,'PASS');
});
test('malformed rawTranscript declarations error fail-closed',t=>{
 const f=transcriptSetup(t);
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner().replace('file:\'build/t.json\'','file:\'build/t.json\',extra:1'));
 assert.equal(run(f.root).evidence.find(x=>x.gateId==='bt').status,'ERROR');
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner().replace('qgate-transcript','other-format'));
 const e=run(f.root).evidence.find(x=>x.gateId==='bt');
 assert.equal(e.status,'ERROR');
 assert.match(String(e.details.error),/Invalid behavior rawTranscript/);
 fs.writeFileSync(path.join(f.root,'bt-runner.mjs'),btRunner().replace("'build/t.json'","'build/absent.json'"));
 const missing=run(f.root).evidence.find(x=>x.gateId==='bt');
 assert.equal(missing.status,'ERROR');
 f.c.gates.find(g=>g.id==='bt').requireRawTranscript='yes';f.save();
 assert.equal(run(f.root).status,'ERROR');
});

// ---- 基线内容核验（v1.15 T2）：观察记录 baseline 块两源一致 + git show 内容内容比对 + 强制开关 ----
import {createHash} from 'node:crypto';

// runner 生成器：f2p newcase（大额）当前接受/基线拒绝，p2p normal 两代皆过；可选在观察记录与
// 观察中声明同形/异形 baseline 块（经字面量注入），或不写观察记录（omitTranscriptBaseline）。
const btBaselineRunner=({baselineLiteral,transcriptBaselineLiteral,omitTranscriptBaseline,omitBaselineSource}={})=>{
 const effectiveTranscript=transcriptBaselineLiteral!==undefined?transcriptBaselineLiteral:baselineLiteral;
 const lines=[
  `import fs from 'node:fs';`,
  `let raw='';for await(const chunk of process.stdin)raw+=chunk;const request=JSON.parse(raw);`,
  `const decide=(a,legacy)=>legacy&&a>20?{decision:'reject'}:{decision:a>0?'accept':'reject'};`,
  `const cases=request.cases.map(x=>({id:x.id,actual:decide(x.input.amount,false),baselineActual:decide(x.input.amount,true)}));`,
  `fs.mkdirSync('build',{recursive:true});`,
  `fs.writeFileSync('build/t.json',JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:request.runId${omitTranscriptBaseline?'':`,baseline:${JSON.stringify(effectiveTranscript)}`},cases}));`,
  `console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId${omitBaselineSource?'':`,baselineSource:${JSON.stringify(baselineLiteral)}`},cases,rawTranscript:{format:'qgate-transcript',file:'build/t.json'}}));`
 ].join('');
 return lines;
};
function baselineTranscriptFixture(t,{requireBaselineTranscript}={}){
 const f=leanFixture(t);
 f.c.claims.push({id:'C5',statement:'baseline content replay'});
 const gate={id:'bb',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'C5',argv:['$NODE','bb-runner.mjs'],timeoutMs:3000,expected:{f2p:['newcase'],p2p:['normal']},cases:[{id:'normal',input:{amount:10},expected:{decision:'accept'}},{id:'newcase',input:{amount:42},expected:{decision:'accept'}}]};
 if(requireBaselineTranscript!==undefined)gate.requireBaselineTranscript=requireBaselineTranscript;
 f.c.gates.push(gate);f.save();
 git(f.root,'init','-q');git(f.root,'config','user.email','test@example.invalid');git(f.root,'config','user.name','Test');
 fs.writeFileSync(path.join(f.root,'legacy.mjs'),"export const decide=(amount,legacy)=>legacy&&amount>20?{decision:'reject'}:{decision:amount>0?'accept':'reject'};\n");
 git(f.root,'add','.');git(f.root,'commit','-qm','baseline seed');
 const sha=git(f.root,'rev-parse','HEAD');
 const contentSha256=createHash('sha256').update(fs.readFileSync(path.join(f.root,'legacy.mjs'))).digest('hex');
 return {f,sha,contentSha256};
}
test('baseline content binding verifies via git show and anchors evidence strength',t=>{
 const {f,sha,contentSha256}=baselineTranscriptFixture(t);
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha,file:'legacy.mjs',contentSha256}}));
 const result=run(f.root);
 assert.equal(result.status,'PASS');
 const e=result.evidence.find(x=>x.gateId==='bb');
 assert.equal(e.details.baseline.status,'verified');
 assert.equal(e.details.baseline.contentVerified,true);
 assert.equal(e.details.baseline.source.file,'legacy.mjs');
 const strength=evidenceStrength(result);
 assert.equal(strength.signals.gitBaselines,1);
 assert.equal(strength.signals.baselineContents,1);
 assert.equal(strength.signals.rawOutputs,1);
 // 仅声明 ref（无内容绑定）同样放行，但无内容信号（W3 语义不变，内容绑定为升级路径）
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha}}));
 const weaker=run(f.root);
 assert.equal(weaker.status,'PASS');
 assert.equal(evidenceStrength(weaker).signals.baselineContents,0);
});
test('baseline content sha mismatch errors fail-closed naming the ref and file',t=>{
 const {f,sha}=baselineTranscriptFixture(t);
 const wrongSha='b'.repeat(64);
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha,file:'legacy.mjs',contentSha256:wrongSha}}));
 const e=run(f.root).evidence.find(x=>x.gateId==='bb');
 assert.equal(e.status,'ERROR');
 assert.match(String(e.details.error),/content sha256 mismatch/);
 assert.match(String(e.details.error),/legacy\.mjs hashes to/);
 // ref 树中不存在的文件路径同样 ERROR 指名
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha,file:'absent.mjs',contentSha256:wrongSha}}));
 const missing=run(f.root).evidence.find(x=>x.gateId==='bb');
 assert.equal(missing.status,'ERROR');
 assert.match(String(missing.details.error),/file not found in ref tree/);
});
test('transcript baseline disagreeing with observation baselineSource errors',t=>{
 const {f,sha,contentSha256}=baselineTranscriptFixture(t);
 // 观察记录与观察声明不同的 ref → 两源不一致 ERROR
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha,file:'legacy.mjs',contentSha256},transcriptBaselineLiteral:{type:'git-commit',ref:'legacy',file:'legacy.mjs',contentSha256}}));
 const e=run(f.root).evidence.find(x=>x.gateId==='bb');
 assert.equal(e.status,'ERROR');
 assert.match(String(e.details.error),/rawTranscript baseline disagrees with observation baselineSource/);
 // 观察记录声明基线而观察缺失 baselineSource → ERROR
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha,file:'legacy.mjs',contentSha256},omitBaselineSource:true}));
 const orphan=run(f.root).evidence.find(x=>x.gateId==='bb');
 assert.equal(orphan.status,'ERROR');
 assert.match(String(orphan.details.error),/observation has no baselineSource/);
});
test('requireBaselineTranscript fails named without baseline block; explicit false keeps legacy semantics',t=>{
 const {f,sha,contentSha256}=baselineTranscriptFixture(t,{requireBaselineTranscript:true});
 // 观察记录缺 baseline 块 → FAIL 指名（内容核验的失败路径此前已 ERROR）
 fs.writeFileSync(path.join(f.root,'bb-runner.mjs'),btBaselineRunner({baselineLiteral:{type:'git-commit',ref:sha,file:'legacy.mjs',contentSha256},omitTranscriptBaseline:true}));
 let result=run(f.root);
 let e=result.evidence.find(x=>x.gateId==='bb');
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.missingBaselineTranscript,true);
 assert.ok(failureReasons(e).includes('缺少基线观察记录声明（requireBaselineTranscript）——观察记录未承载 baseline 块'),JSON.stringify(failureReasons(e)));
 // 显式 false 保留旧语义（缺块放行）
 f.c.gates.find(g=>g.id==='bb').requireBaselineTranscript=false;f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
 // 无 expected 的门禁声明 requireBaselineTranscript → validate ERROR
 f.c.gates.find(g=>g.id==='bb').expected=undefined;f.c.gates.find(g=>g.id==='bb').requireBaselineTranscript=true;f.save();
 assert.equal(run(f.root).status,'ERROR');
 // 开关类型校验
 f.c.gates.find(g=>g.id==='bb').expected={f2p:['newcase']};f.c.gates.find(g=>g.id==='bb').requireBaselineTranscript='yes';f.save();
 assert.equal(run(f.root).status,'ERROR');
});
