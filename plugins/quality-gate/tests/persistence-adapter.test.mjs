import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setup} from './persistence-helpers.mjs';
const demo=fileURLToPath(new URL('../examples/persistence-demo/',import.meta.url));
test('ZCode adapter blocks real persistence mismatch and permits repaired case',t=>{
 const f=setup(t,'wrong-value'),hook=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
 const invoke=()=>{const r=spawnSync(process.execPath,[hook],{encoding:'utf8',input:JSON.stringify({cwd:f.root,hook_event_name:'Stop'}),env:{...process.env,ZCODE_PLUGIN_DATA:path.join(f.root,'hook-data')}});assert.equal(r.status,0);return JSON.parse(r.stdout);};
 assert.equal(invoke().decision,'block');f.c.gates[0].argv[2]='normal';fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(f.c));assert.deepEqual(invoke(),{});
});
test('real CLI exit codes: persistence PASS=0, mismatch=1',t=>{
 const f=setup(t,'normal'),cli=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
 const invoke=()=>spawnSync(process.execPath,[cli,f.root,'close'],{encoding:'utf8'});
 const pass=invoke();assert.equal(pass.status,0);assert.equal(JSON.parse(pass.stdout).status,'PASS');
 f.c.gates[0].argv[2]='wrong-value';fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(f.c));
 const fail=invoke();assert.equal(fail.status,1);assert.equal(JSON.parse(fail.stdout).status,'FAIL');
});
