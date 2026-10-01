import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const demo=fileURLToPath(new URL('../examples/intent-drift-demo',import.meta.url));
const runScenario=name=>spawnSync(process.execPath,[path.join(demo,'scenario.mjs'),name],{encoding:'utf8',windowsHide:true});

test('intent-drift demo passes when changes stay inside the registered task scope',()=>{
 const result=runScenario('ok');
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/Quality Gate PASS/);
 assert.match(result.stderr,/drift-check.*PASS/s);
 assert.match(result.stderr,/任务意图基准: refund-cap（内容哈希绑定一致 · scope 3 项 · 对账通过）/);
});

test('out-of-task-scope edit fails naming outside-task-scope',()=>{
 const result=runScenario('outside');
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/超任务范围变更（须还原，或显式修订意图 scope）: README\.md/);
 assert.match(result.stderr,/任务意图基准: refund-cap（内容哈希绑定一致 · scope 3 项 · 越界 1 项）/);
});

test('silently tampered intent register fails as intent-file-modified',()=>{
 const result=runScenario('tamper');
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/任务意图登记已被修改且未重新绑定/);
});

test('explicit revision with re-binding passes and keeps the revision chain',()=>{
 const result=runScenario('revise');
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/任务意图基准: refund-cap（内容哈希绑定一致 · scope 4 项 · 对账通过）/);
});

test('a structurally invalid Gherkin acceptance criterion fails naming the rule',()=>{
 const result=runScenario('bad-ac');
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/AC\[0\] 结构无效（gherkin:missing-then/);
});

test('unknown scenario name exits with usage',()=>{
 const result=runScenario('nope');
 assert.equal(result.status,2);
 assert.match(result.stderr,/Usage: node scenario\.mjs/);
});
