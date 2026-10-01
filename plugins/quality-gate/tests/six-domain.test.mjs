import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run} from '../lib/kernel.mjs';

const source=fileURLToPath(new URL('../examples/six-domain-demo',import.meta.url));
function project(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-six-domains-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(source,root,{recursive:true});
 return root;
}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const write=(root,file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data));

test('release stage records PASS evidence in each of L0-L5',t=>{
 const root=project(t);const result=run(root,'release');
 assert.equal(result.status,'PASS');
 assert.deepEqual(result.levelCoverage.map(x=>x.status),Array(6).fill('PASS'));
 assert.equal(result.evidence.length,7);
 assert.equal(result.riskEvidence.length,7);
 assert.deepEqual(result.unmetRequiredLevels,[]);
});

test('each domain has an independently detectable negative case',t=>{
 const cases=[
  ['L0',root=>{const x=JSON.parse(fs.readFileSync(path.join(root,'requirements.json'),'utf8'));x.requirements[0].acceptanceCriteria[0].codeFiles=['missing.mjs'];write(root,'requirements.json',x);}],
  ['L1',root=>{fs.writeFileSync(path.join(root,'business.mjs'),'export const = ;');}],
  ['L2',root=>{const x=JSON.parse(fs.readFileSync(path.join(root,'records.json'),'utf8'));delete x.records[0].properties.partyIds;write(root,'records.json',x);}],
  ['L3',root=>{const x=config(root);x.gates.find(g=>g.id==='behavior').cases[0].expected.fee=99;write(root,'.quality-gate.json',x);}],
  ['L4',root=>{const x=config(root);x.gates.find(g=>g.id==='metrics').thresholds.sampleLatencyMs.max=-1;write(root,'.quality-gate.json',x);}],
  ['L5',root=>{const x=JSON.parse(fs.readFileSync(path.join(root,'debt.json'),'utf8'));x.items[0].severity='critical';write(root,'debt.json',x);}]
 ];
 for(const [domain,mutate] of cases){
  const root=project(t);mutate(root);
  const result=run(root,'release');
  assert.notEqual(result.status,'PASS',domain);
  assert.notEqual(result.levelCoverage.find(x=>x.level===domain).status,'PASS',domain);
 }
});

test('disabled required domain cannot be hidden by other passing gates',t=>{
 const root=project(t);const x=config(root);x.gates.find(g=>g.level==='L2').enabled=false;write(root,'.quality-gate.json',x);
 const result=run(root,'release');
 assert.equal(result.status,'FAIL');assert.deepEqual(result.missingRequiredLevels,['L2']);
});

test('ZCode Stop adapter blocks a six-domain defect and permits repair',t=>{
 const root=project(t);
 const hook=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
 const stop=()=>{
  const result=spawnSync(process.execPath,[hook],{input:JSON.stringify({cwd:root,hook_event_name:'Stop'})+'\n',encoding:'utf8'});
  assert.equal(result.status,0);
  return JSON.parse(result.stdout);
 };
 const file=path.join(root,'records.json');
 const original=fs.readFileSync(file,'utf8');
 const broken=JSON.parse(original);delete broken.records[0].properties.partyIds;write(root,'records.json',broken);
 assert.equal(stop().decision,'block');
 fs.writeFileSync(file,original);
 assert.deepEqual(stop(),{});
});
