import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validate,GATE_KINDS} from '../lib/kernel.mjs';

// Repo and unpacked-delivery layouts ship docs/ next to the plugin; a ZCode
// client install contains the plugin directory only, and there is no guide to
// check there — skip explicitly instead of crashing (skip is never PASS).
const guidePath=fileURLToPath(new URL('../../../docs/CONFIG-GUIDE.md',import.meta.url));
const guide=fs.existsSync(guidePath)?fs.readFileSync(guidePath,'utf8'):null;
const skipIfNoGuide=t=>{if(!guide)t.skip('CONFIG-GUIDE.md is not part of this install layout');};

// Validated snippets are the ```jsonc fences: full-line // comments are the
// only annotation form the guide may use inside them.
function snippets(){
 const blocks=[...guide.matchAll(/```jsonc\r?\n([\s\S]*?)```/g)].map(match=>match[1]);
 return blocks.map(block=>JSON.parse(block.split(/\r?\n/).filter(line=>!/^\s*\/\//.test(line)).join('\n')));
}

test('every validated config snippet passes kernel validate',(t)=>{
 skipIfNoGuide(t);
 const configs=snippets();
 assert.equal(configs.length,GATE_KINDS.length+1,'expected one snippet per kind plus the top-level template');
 for(const config of configs)assert.doesNotThrow(()=>validate(config),JSON.stringify(config.gates.map(gate=>gate.kind)));
});

test('snippets cover every gate kind',(t)=>{
 skipIfNoGuide(t);
 const kinds=new Set(snippets().flatMap(config=>config.gates.map(gate=>gate.kind)));
 assert.deepEqual([...kinds].sort(),[...GATE_KINDS].sort());
});

test('every option key used by snippet gates is documented in the guide',(t)=>{
 skipIfNoGuide(t);
 const keys=new Set();
 for(const config of snippets())for(const gate of config.gates){
  for(const key of Object.keys(gate))keys.add(key);
  for(const check of gate.checks??[])for(const key of Object.keys(check))keys.add(key);
  for(const key of Object.keys(gate.coverage??{}))keys.add(key);
 }
 for(const key of keys)assert.ok(guide.includes(`\`${key}\``),`option \`${key}\` appears in a snippet but is not documented in CONFIG-GUIDE`);
});
