import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const demo=fileURLToPath(new URL('../examples/change-scope-demo',import.meta.url));
const runScenario=name=>spawnSync(process.execPath,[path.join(demo,'scenario.mjs'),name],{encoding:'utf8',windowsHide:true});

test('change-scope demo passes when the increment stays inside the declared scope',()=>{
 const result=runScenario('ok');
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/Quality Gate PASS/);
 assert.match(result.stderr,/increment-scope.*PASS/s);
});

test('out-of-scope file edit fails with the path named',()=>{
 const result=runScenario('over-scope');
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/超范围变更: README\.md/);
});

test('protected dependency change without acknowledgement fails',()=>{
 const result=runScenario('protected');
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/受保护路径未确认: package\.json \(dependency-lock:not-acknowledged\)/);
});

test('content discipline finding blocks the increment',()=>{
 const result=runScenario('content');
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stderr,/内容变更未接受: debugger-statement src\/app\.mjs/);
});

test('unknown scenario name exits with usage',()=>{
 const result=runScenario('nope');
 assert.equal(result.status,2);
 assert.match(result.stderr,/Usage: node scenario\.mjs/);
});
