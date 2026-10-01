import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {run,validate} from '../lib/kernel.mjs';import {failureReasons} from '../lib/summary.mjs';
const source=fileURLToPath(new URL('../examples/shacl-engine-demo',import.meta.url));
const adapter=fileURLToPath(new URL('../adapters/shacl/pyshacl_runner.py',import.meta.url));
// pyshacl 守卫（pytest 先例）：引擎缺席的环境如实 skip 带安装指引——skip 从不是 PASS
const pyshacl=spawnSync('python',['-c','import pyshacl'],{encoding:'utf8',windowsHide:true});
const hasEngine=pyshacl.status===0;
function project(t,nativeOnly=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-shacl-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(source,root,{recursive:true});
 // tmp 副本层级与仓库不同，demo 的相对适配器路径重写为绝对路径（仓库/zip 布局下原路径有效）；
 // nativeOnly=true 时移除 shacl 选项——OD-116 默认零外部依赖腿（无 pyshacl 环境也全程可跑）
 const configPath=path.join(root,'.quality-gate.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(nativeOnly)delete config.gates[0].shacl;else config.gates[0].shacl.argv=['python',adapter];
 fs.writeFileSync(configPath,JSON.stringify(config));
 return root;
}
const gate=result=>result.evidence[0];
const records=root=>JSON.parse(fs.readFileSync(path.join(root,'records.json'),'utf8'));
const saveRecords=(root,data)=>fs.writeFileSync(path.join(root,'records.json'),JSON.stringify(data));

test('eight-component profile conforms natively with deep matching (no engine, no external dependency)',t=>{
 const result=run(project(t,true));
 assert.equal(result.status,'PASS',JSON.stringify(gate(result).details));
 const details=gate(result).details;
 assert.equal(details.shacl,undefined);
 assert.ok(details.deepMatches.some(match=>match.recordId==='contract-001'&&match.via.includes('⊑')));
});

test('eight-component profile conforms under the external engine when the tool is ready',{skip:hasEngine?false:'pyshacl not installed — engine legs skip with guidance (pip install pyshacl)'},t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(gate(result).details));
 const details=gate(result).details;
 assert.equal(details.shacl.conformance,true);
 assert.equal(details.shacl.findingCount,0);
});

test('each component fails named natively when the record violates it (OD-116 default path)',t=>{
 runComponentMutations(t,true);
});

test('each engine component fails named when the record violates it',{skip:hasEngine?false:'pyshacl not installed (pip install pyshacl)'},t=>{
 runComponentMutations(t,false);
});

function runComponentMutations(t,nativeOnly){
 const cases=[
  [{path:'partyIds',value:['only-one']},'MinCountConstraintComponent'],
  [{path:'code',value:'BAD'},'PatternConstraintComponent'],
  [{path:'code',value:'X'},'MinLengthConstraintComponent'],
  [{path:'amount',value:9999},'MaxInclusiveConstraintComponent'],
  [{path:'note',value:'plain'},'LanguageInConstraintComponent'],
  [{path:'extra',value:'undeclared',add:true},'ClosedConstraintComponent']
 ];
 for(const [mutation,component] of cases){
  const root=project(t,nativeOnly),data=records(root),properties={...data.records[0].properties};
  if(mutation.add)properties[mutation.path]=mutation.value;else properties[mutation.path]=mutation.value;
  data.records[0].properties=properties;
  saveRecords(root,data);
  const result=run(root);
  assert.equal(result.status,'FAIL',`${component}: expected FAIL`);
  const rules=gate(result).details.violations.map(violation=>violation.rule);
  const shortName=component.replace('ConstraintComponent','').replace(/^./,c=>c.toLowerCase());
  assert.ok(rules.some(rule=>rule===shortName||rule.includes(component)),`${component}: rules were ${JSON.stringify(rules)}`);
  assert.ok(failureReasons(gate(result)).some(reason=>reason.includes(mutation.path)),`${component}: summary should name the path`);
 }
}

test('engine conformance self-report inconsistency fails closed',{skip:hasEngine?false:'pyshacl not installed (pip install pyshacl)'},t=>{
 const root=project(t);
 // 假引擎：声称 conformance 却回报 findings（自报矛盾——内核不采信任何一侧）
 fs.writeFileSync(path.join(root,'fake-engine.mjs'),`let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'fake',conformance:true,findings:[{recordId:'contract-001',path:'code',component:'sh:PatternConstraintComponent',message:'fake'}]}));
`);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].shacl.argv=['$NODE','fake-engine.mjs'];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(String(gate(result).details),/conformance disagrees with its own findings/);
});

test('engine findings referencing unknown records or components fail closed',{skip:hasEngine?false:'pyshacl not installed (pip install pyshacl)'},t=>{
 for(const [finding,needle] of [
  [{recordId:'ghost-record',path:'code',component:'sh:PatternConstraintComponent'},/unknown record/],
  [{recordId:'contract-001',path:'code',component:'sh:NonsenseComponent'},/unknown component/]
 ]){
  const root=project(t);
  fs.writeFileSync(path.join(root,'fake-engine.mjs'),`let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'fake',conformance:false,findings:[${JSON.stringify(finding)}]}));
`);
  const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
  config.gates[0].shacl.argv=['$NODE','fake-engine.mjs'];
  fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
  const result=run(root);
  assert.equal(result.status,'ERROR');
  assert.match(String(gate(result).details),needle);
 }
});

test('stale engine observation fails closed',{skip:hasEngine?false:'pyshacl not installed (pip install pyshacl)'},t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'fake-engine.mjs'),`console.log(JSON.stringify({schemaVersion:'0.1',runId:'old',source:'fake',conformance:true,findings:[]}));`);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].shacl.argv=['$NODE','fake-engine.mjs'];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});

test('shacl gate option shape is validated',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(source,'.quality-gate.json'),'utf8'));
 const mutate=variant=>{const copy=structuredClone(config);Object.assign(copy.gates[0].shacl,variant);return copy;};
 for(const variant of [{argv:[]},{argv:['x'],timeoutMs:0},{argv:['x'],timeoutMs:60001},{argv:['x'],timeoutMs:'fast'}])
  assert.throws(()=>validate(mutate(variant)),/shacl \(optional\) is exactly \{argv, timeoutMs 1\.\.60000\}/,JSON.stringify(variant));
 const extra=structuredClone(config);extra.gates[0].shacl.note='x';
 assert.throws(()=>validate(extra),/shacl \(optional\) is exactly/);
});
