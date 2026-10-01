import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseTAP,parseJUnit,parseRawOutput,RAW_OUTPUT_FORMATS} from '../lib/raw-evidence.mjs';

const fixtureDir=fileURLToPath(new URL('./fixtures/raw/',import.meta.url));
const read=name=>fs.readFileSync(path.join(fixtureDir,name),'utf8');

// 夹具均为真实工具产出（2026-09-27，生成命令见 fixture-provenance.txt）：
// tap-node-flat/nested ← node --test --test-reporter=tap（Node 24，含 SKIP 指令、失败点、describe 嵌套）
// junit-pytest ← python -m pytest --junitxml（临时 venv 隔离安装，含 skip/failure 子元素）

test('parseTAP counts real node --test output with pass/skip/fail',()=>{
 const parsed=parseTAP(read('tap-node-flat.txt'));
 assert.equal(parsed.parser,'tap');
 assert.equal(parsed.total,4);
 assert.equal(parsed.passed,2);
 assert.equal(parsed.failed,1);
 assert.equal(parsed.skipped,1);
 const names=parsed.cases.map(item=>item.name);
 assert.ok(names.includes('fee tier standard'));
 assert.ok(names.includes('cap enforcement'));
 assert.equal(parsed.cases.find(item=>item.name==='legacy rounding').status,'skipped');
 assert.equal(parsed.cases.find(item=>item.name==='cap enforcement').status,'failed');
});

test('parseTAP treats describe blocks as suites and validates per-level plans',()=>{
 const parsed=parseTAP(read('tap-node-nested.txt'));
 // 2 个叶子（describe 内）+ 1 个顶层用例 = 3；describe 容器点与顶层 plan 各自互核
 assert.equal(parsed.total,3);
 assert.equal(parsed.passed,3);
 assert.equal(parsed.failed,0);
 assert.equal(parsed.skipped,0);
});

test('parseTAP rejects structural anomalies fail-closed',()=>{
 assert.throws(()=>parseTAP(''),/empty/);
 assert.throws(()=>parseTAP('# no points at all'),/no test points/);
 assert.throws(()=>parseTAP('TAP version 13\nok 1 - a\nBail out! broken\n'),/Bail out/);
 // plan 与点数矛盾
 assert.throws(()=>parseTAP('1..2\nok 1 - a\n'),/plan 1\.\.2/);
 // 工具自产摘要与逐点计数矛盾（summary 称 5 个实为 1 个）
 assert.throws(()=>parseTAP('ok 1 - a\n1..1\n# tests 5\n'),/disagrees/);
 // TODO 指令计 skipped
 const todo=parseTAP('ok 1 - a\nnot ok 2 - b # TODO known failure\n1..2\n# tests 2\n# pass 1\n# fail 0\n# todo 1\n');
 assert.equal(todo.skipped,1);
 assert.equal(todo.passed,1);
});

test('parseJUnit counts real pytest junitxml with skipped and failure children',()=>{
 const parsed=parseJUnit(read('junit-pytest.xml'));
 assert.equal(parsed.parser,'junit');
 assert.equal(parsed.total,4);
 assert.equal(parsed.passed,2);
 assert.equal(parsed.failed,1);
 assert.equal(parsed.skipped,1);
 const byName=new Map(parsed.cases.map(item=>[item.name,item.status]));
 assert.equal(byName.get('test_sample.test_fee_standard'),'passed');
 assert.equal(byName.get('test_sample.test_legacy_rounding'),'skipped');
 assert.equal(byName.get('test_sample.test_cap_enforcement'),'failed');
});

test('parseJUnit sums multiple testsuites and rejects attribute/count mismatches',()=>{
 const twoSuites='<testsuites><testsuite name="a" tests="1" failures="0" errors="0" skipped="0"><testcase name="t1"/></testsuite><testsuite name="b" tests="3" failures="1" errors="0" skipped="1"><testcase name="t2"/><testcase name="t3"><failure message="x"/></testcase><testcase name="t4"><skipped/></testcase></testsuite></testsuites>';
 const parsed=parseJUnit(twoSuites);
 assert.equal(parsed.total,4);
 assert.equal(parsed.passed,2);
 assert.equal(parsed.failed,1);
 assert.equal(parsed.skipped,1);
 assert.throws(()=>parseJUnit(''),/empty/);
 assert.throws(()=>parseJUnit('<testsuites></testsuites>'),/no <testsuite>/);
 assert.throws(()=>parseJUnit('<testsuite name="a" tests="2"><testcase name="t1"/></testsuite>'),/declares tests=2/);
 assert.throws(()=>parseJUnit('<testsuite name="a" tests="1" failures="1"><testcase name="t1"/></testsuite>'),/failures\+errors=1/);
 assert.throws(()=>parseJUnit('<testsuite name="a"><testcase name="t1"/></testsuite>'),/lacks a valid tests attribute/);
 // <error> 子元素同样计 failed
 const errored=parseJUnit('<testsuite name="a" tests="1" failures="0" errors="1" skipped="0"><testcase name="t1"><error message="boom"/></testcase></testsuite>');
 assert.equal(errored.failed,1);
});

test('parseRawOutput dispatches by format and fails closed on unknown formats',()=>{
 assert.deepEqual(RAW_OUTPUT_FORMATS,['tap','junit']);
 const tap=parseRawOutput('tap',read('tap-node-flat.txt'));
 assert.equal(tap.total,4);
 const junit=parseRawOutput('junit',read('junit-pytest.xml'));
 assert.equal(junit.total,4);
 assert.throws(()=>parseRawOutput('csv','a,b'),/Unknown rawOutput format/);
});

// 原始用例观察记录（v1.13 T1）：behavior/journey 的 raw-transcript。无第三方工具可借，
// 样例即协议形状本身；畸形矩阵覆盖结构反例（解析器 fail-closed）。
import {parseTranscript,TRANSCRIPT_FORMAT} from '../lib/raw-evidence.mjs';

const behaviorTranscript=JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'11111111-2222-3333-4444-555555555555',cases:[
 {id:'normal',actual:{decision:'accept',fee:2},baselineActual:{decision:'accept',fee:2}},
 {id:'zero',actual:{decision:'reject',reason:'amount'}}
]});
const journeyTranscript=JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:'11111111-2222-3333-4444-555555555555',source:'local http service',scenarios:[
 {id:'checkout',steps:[{id:'create',actual:{status:201}},{id:'pay',actual:{status:200}}]}
]});

test('parseTranscript accepts a well-formed behavior transcript and normalizes optional baselineActual',()=>{
 assert.equal(TRANSCRIPT_FORMAT,'qgate-transcript');
 const parsed=parseTranscript(behaviorTranscript,{kind:'behavior'});
 assert.equal(parsed.kind,'behavior');
 assert.equal(parsed.runId,'11111111-2222-3333-4444-555555555555');
 assert.equal(parsed.cases.length,2);
 assert.deepEqual(parsed.cases[0],{id:'normal',actual:{decision:'accept',fee:2},baselineActual:{decision:'accept',fee:2}});
 assert.deepEqual(Object.keys(parsed.cases[1]),['id','actual']);
});

test('parseTranscript accepts a well-formed journey transcript',()=>{
 const parsed=parseTranscript(journeyTranscript,{kind:'journey'});
 assert.equal(parsed.source,'local http service');
 assert.equal(parsed.scenarios.length,1);
 assert.deepEqual(parsed.scenarios[0].steps,[{id:'create',actual:{status:201}},{id:'pay',actual:{status:200}}]);
});

test('parseTranscript fails closed on structural violations',()=>{
 assert.throws(()=>parseTranscript('',{kind:'behavior'}),/text is empty/);
 assert.throws(()=>parseTranscript('not json',{kind:'behavior'}),/not valid JSON/);
 assert.throws(()=>parseTranscript('[]',{kind:'behavior'}),/must be a JSON object/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.2',kind:'behavior',runId:'r',cases:[{id:'a',actual:1}]}),{kind:'behavior'}),/schemaVersion/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:'r',cases:[{id:'a',actual:1}]}),{kind:'behavior'}),/kind must be behavior/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',cases:[{id:'a',actual:1}]}),{kind:'behavior'}),/runId/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',cases:[]}),{kind:'behavior'}),/non-empty/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',cases:[{id:'a',actual:1},{id:'a',actual:2}]}),{kind:'behavior'}),/duplicated/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',cases:[{id:'a'}]}),{kind:'behavior'}),/id and actual/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',cases:[{id:'a',actual:1,input:{}}]}),{kind:'behavior'}),/unexpected keys/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:'r',scenarios:[{id:'s',steps:[{id:'x',actual:1}]}]}),{kind:'journey'}),/source/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:'r',source:'s',scenarios:[{id:'s',steps:[]}]}),{kind:'journey'}),/no steps/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:'r',source:'s',scenarios:[{id:'s',steps:[{id:'x',actual:1},{id:'x',actual:2}]}]}),{kind:'journey'}),/duplicated/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'metrics',runId:'r'}),{}),/behavior or journey/);
});

// ---- 基线声明块（v1.15 T1）：behavior 观察记录顶层可选 baseline，形状与观察 baselineSource 同规 ----

const sha64='a'.repeat(64);
const transcriptWithBaseline=baseline=>JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',baseline,cases:[{id:'a',actual:1}]});
test('parseTranscript behavior baseline block echoes normalized git and embedded declarations',()=>{
 assert.deepEqual(parseTranscript(transcriptWithBaseline({type:'git-commit',ref:'legacy',file:'app.mjs',contentSha256:sha64}),{kind:'behavior'}).baseline,{type:'git-commit',ref:'legacy',file:'app.mjs',contentSha256:sha64});
 assert.deepEqual(parseTranscript(transcriptWithBaseline({type:'git-commit',ref:'legacy'}),{kind:'behavior'}).baseline,{type:'git-commit',ref:'legacy'});
 assert.deepEqual(parseTranscript(transcriptWithBaseline({type:'embedded'}),{kind:'behavior'}).baseline,{type:'embedded'});
 assert.equal(parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',cases:[{id:'a',actual:1}]}),{kind:'behavior'}).baseline,undefined);
});
test('parseTranscript baseline block malformed matrix fails closed',()=>{
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'git-commit'}),{kind:'behavior'}),/baseline is invalid.*Invalid baselineSource$/);
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'git-commit',ref:'legacy',file:'app.mjs'}),{kind:'behavior'}),/must be declared together/);
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'git-commit',ref:'legacy',contentSha256:sha64}),{kind:'behavior'}),/must be declared together/);
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'git-commit',ref:'legacy',file:'app.mjs',contentSha256:'nothex'}),{kind:'behavior'}),/64-hex/);
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'embedded',ref:'legacy'}),{kind:'behavior'}),/embedded carries no other fields/);
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'git-commit',ref:'legacy',tag:'v1'}),{kind:'behavior'}),/baseline is invalid/);
 assert.throws(()=>parseTranscript(transcriptWithBaseline({type:'svn',ref:'x'}),{kind:'behavior'}),/baseline is invalid/);
 // 顶层键白名单：journey 不承载 baseline；未知顶层键拒收
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:'r',source:'s',baseline:{type:'embedded'},scenarios:[{id:'s',steps:[{id:'x',actual:1}]}]}),{kind:'journey'}),/unexpected top-level keys: baseline/);
 assert.throws(()=>parseTranscript(JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:'r',extra:1,cases:[{id:'a',actual:1}]}),{kind:'behavior'}),/unexpected top-level keys: extra/);
});
