import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {leanFixture} from './fixture.mjs';
const qgate=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
const runCli=(...a)=>spawnSync(process.execPath,[qgate,...a],{encoding:'utf8'});

test('run-mode stderr is tiered: brief line on PASS, full table on FAIL',t=>{
 const f=leanFixture(t);
 const pass=runCli(f.root,'close');
 assert.equal(pass.status,0,pass.stderr);
 const report=JSON.parse(pass.stdout);
 assert.match(pass.stderr,/✅ \*\*Quality Gate PASS\*\* · close · 1\/1 通过 · 耗时 [\d.]+s · run=/);
 assert.ok(!pass.stderr.includes('| ID |'),'PASS stderr must stay compact');
 f.c.gates[0]={id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000};f.save();
 const fail=runCli(f.root,'close');
 assert.equal(fail.status,1);
 assert.match(fail.stderr,/❌ FAIL/);
 assert.match(fail.stderr,/\| ID \| 域 \| Kind \| 状态 \| 耗时 \| 原因 \| 建议 \|/);
 assert.match(fail.stderr,/按原因修复后重跑/);
 void report;
});

test('report re-renders the latest archived run with an archival marker',t=>{
 const f=leanFixture(t);
 const run=runCli(f.root,'close');
 assert.equal(run.status,0,run.stderr);
 const id=JSON.parse(run.stdout).id;
 const latest=runCli('report',f.root);
 assert.equal(latest.status,0,latest.stderr);
 assert.match(latest.stdout,new RegExp(`（归档运行 · 生成于 .+ · run=${id} · 非当前状态`));
 assert.match(latest.stdout,/\| ID \| 域 \| Kind \| 状态 \| 耗时 \| 原因 \| 建议 \|/);
 assert.match(latest.stdout,/✅ PASS/);
 const explicit=runCli('report',f.root,id);
 assert.equal(explicit.status,0,explicit.stderr);
 assert.match(explicit.stdout,/✅ PASS/);
});

test('report fails closed on unknown run id and empty archives',t=>{
 const f=leanFixture(t);
 assert.equal(runCli(f.root,'close').status,0);
 const unknown=runCli('report',f.root,'00000000-0000-0000-0000-000000000000');
 assert.equal(unknown.status,2);
 assert.match(unknown.stderr,/not found under/);
 const empty=leanFixture(t);
 const none=runCli('report',empty.root);
 assert.equal(none.status,2);
 assert.match(none.stderr,/no archived runs under/);
 assert.match(runCli('report',f.root).stdout,/重跑: node ".*qgate\.mjs" "/);
});

test('report resolves a unique run-id prefix and fails closed on ambiguity',t=>{
 const f=leanFixture(t);
 const id=JSON.parse(runCli(f.root,'close').stdout).id;
 const prefix=runCli('report',f.root,id.slice(0,8));
 assert.equal(prefix.status,0,prefix.stderr);
 assert.match(prefix.stdout,new RegExp(`run=${id}`));
 const short=runCli('report',f.root,id.slice(0,3));
 assert.equal(short.status,2);
 assert.match(short.stderr,/at least 4 characters/);
 const ambiguous=leanFixture(t);
 fs.mkdirSync(path.join(ambiguous.root,'.quality-gate','runs'),{recursive:true});
 const fake=rid=>JSON.stringify({id:rid,status:'PASS',stage:'close',root:ambiguous.root,evidence:[],finishedAt:'2026-01-01T00:00:00.000Z'});
 fs.writeFileSync(path.join(ambiguous.root,'.quality-gate','runs','aaaa1111-0000-0000-0000-000000000001.json'),fake('aaaa1111-0000-0000-0000-000000000001'));
 fs.writeFileSync(path.join(ambiguous.root,'.quality-gate','runs','aaaa2222-0000-0000-0000-000000000002.json'),fake('aaaa2222-0000-0000-0000-000000000002'));
 const multi=runCli('report',ambiguous.root,'aaaa');
 assert.equal(multi.status,2);
 assert.match(multi.stderr,/ambiguous \(2 matches\)/);
 assert.match(multi.stderr,/aaaa1111/);
 assert.match(runCli('report',ambiguous.root,'aaaa1111').stdout,/run=aaaa1111/);
});
