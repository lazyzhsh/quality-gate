import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {suiteExitCode} from '../run-suite-result.mjs';

const runner=fileURLToPath(new URL('../run-suite.mjs',import.meta.url));
test('suite wrapper preserves success and failure codes',()=>{
 assert.equal(suiteExitCode({status:0,signal:null}),0);
 assert.equal(suiteExitCode({status:1,signal:null}),1);
 assert.equal(suiteExitCode({status:2,signal:null}),2);
});
test('signal termination and missing child status always fail',()=>{
 assert.equal(suiteExitCode({status:null,signal:'SIGTERM',error:undefined}),1);
 assert.equal(suiteExitCode({status:0,signal:'SIGTERM',error:undefined}),1);
 assert.equal(suiteExitCode({status:null,signal:null,error:new Error('spawn failed')}),1);
 assert.equal(suiteExitCode({status:null,signal:null,error:undefined}),1);
});
test('actual wrapper returns nonzero when Node cannot load a test file',()=>{
 const result=spawnSync(process.execPath,[runner,'this-test-file-does-not-exist.test.mjs'],{encoding:'utf8',windowsHide:true});
 assert.notEqual(result.status,0,result.stdout+result.stderr);
});
