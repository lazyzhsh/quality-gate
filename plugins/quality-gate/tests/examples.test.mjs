import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validate,GATE_KINDS} from '../lib/kernel.mjs';

const examples=fileURLToPath(new URL('../examples',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(examples,'examples.manifest.json'),'utf8'));
const entries=manifest.entries;
const directories=fs.readdirSync(examples,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
const configOf=id=>JSON.parse(fs.readFileSync(path.join(examples,id,'.quality-gate.json'),'utf8'));
const testSources=fs.readdirSync(fileURLToPath(new URL('../tests',import.meta.url))).filter(name=>name.endsWith('.test.mjs')).map(name=>fs.readFileSync(path.join(fileURLToPath(new URL('../tests',import.meta.url)),name),'utf8')).join('\n');

test('manifest and example directories stay in sync',()=>{
 assert.deepEqual([...new Set(entries.map(entry=>entry.id))].sort(),directories,'manifest ids must match example dirs exactly');
 assert.equal(new Set(entries.map(entry=>entry.id)).size,entries.length,'duplicate manifest id');
});

test('every example config is valid and manifest metadata matches it',()=>{
 for(const entry of entries){
  const config=configOf(entry.id);
  assert.doesNotThrow(()=>validate(config),`${entry.id}: config fails validate`);
  assert.deepEqual([...new Set(config.gates.map(gate=>gate.kind))].sort(),[...entry.kinds].sort(),`${entry.id}: manifest kinds drift`);
  assert.deepEqual([...new Set(config.gates.map(gate=>gate.level))].sort(),[...entry.levels].sort(),`${entry.id}: manifest levels drift`);
 }
});

test('every registered gate kind has at least one example (gaps must be declared)',()=>{
 const declared=new Set(manifest.knownKindsWithoutExamples??[]);
 const covered=new Set(entries.flatMap(entry=>entry.kinds));
 for(const kind of GATE_KINDS)assert.ok(covered.has(kind)||declared.has(kind),`gate kind ${kind} has no example and is not declared as a known gap`);
 for(const kind of declared)assert.ok(!covered.has(kind)&&GATE_KINDS.includes(kind),`declared gap ${kind} is stale`);
});

test('every example has an automated anchor: smoke stage or a test reference',()=>{
 for(const entry of entries){
  const inSmoke=entry.smokeStage!==null;
  const referenced=testSources.includes("examples/"+entry.id+"'")||testSources.includes('/examples/'+entry.id+'/');
  assert.ok(inSmoke||referenced,`${entry.id}: neither in build smoke nor referenced by any test (orphan risk)`);
 }
});

test('smoke stages are valid and enabled in the demo config',()=>{
 for(const entry of entries.filter(item=>item.smokeStage)){
  assert.ok(['close','pr','release','edit'].includes(entry.smokeStage),`${entry.id}: invalid smoke stage`);
  const config=configOf(entry.id);
  assert.ok(config.gates.some(gate=>gate.enabled&&gate.stages.includes(entry.smokeStage)),`${entry.id}: no enabled gate for smoke stage ${entry.smokeStage}`);
 }
});

test('examples README index lists every manifest entry with its anchor',()=>{
 const readme=fs.readFileSync(path.join(examples,'README.md'),'utf8');
 for(const entry of entries){
  const row=new RegExp(`\\| *${entry.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} *\\|`).exec(readme);
  assert.ok(row,`${entry.id}: missing row in examples/README.md index`);
  assert.ok(row.input.slice(row.index).split('\n')[0].includes(entry.smokeStage??'—'),`${entry.id}: README row smoke column drift`);
 }
 assert.ok(readme.includes('examples.manifest.json'),'README must point to the manifest as source of truth');
});
