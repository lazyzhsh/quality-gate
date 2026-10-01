import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {outputSha256} from '../examples/rerun-demo/settlement.mjs';

const source=fileURLToPath(new URL('../examples/rerun-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-rerun-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const rerunGate=result=>result.evidence.find(e=>e.gateId==='rerun-determinism');
const withSpec=(root,mutate)=>{const file=path.join(root,'rerun.json');const spec=JSON.parse(fs.readFileSync(file,'utf8'));mutate(spec);fs.writeFileSync(file,JSON.stringify(spec));};

test('same-seed double run with identical hashes and balanced totals passes',t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(rerunGate(result).details));
 const details=rerunGate(result).details;
 assert.equal(details.jobs[0].runs,2);
 assert.equal(details.jobs[0].deterministic,true);
 assert.equal(details.jobs[0].doubleEntry.debits,details.jobs[0].doubleEntry.credits);
});

test('shipped spec hashes match a fresh deterministic double run of the demo job',()=>{
 const expected=outputSha256('fixture-2026-09-25');
 assert.equal(expected,outputSha256('fixture-2026-09-25'));
 const spec=JSON.parse(fs.readFileSync(path.join(source,'rerun.json'),'utf8'));
 assert.ok(spec.jobs[0].runs.every(run=>run.outputSha256===expected),'spec hashes must come from real double runs');
 assert.equal(spec.jobs[0].doubleEntry.debits,spec.jobs[0].doubleEntry.credits);
});

test('diverging output hashes across runs fail with the job named',t=>{
 const root=project(t);
 withSpec(root,spec=>{spec.jobs[0].runs[1].outputSha256='0'.repeat(64);});
 const e=rerunGate(run(root));
 assert.equal(e.status,'FAIL');
 assert.equal(e.details.violations[0].rule,'outputDivergence');
 assert.equal(e.details.violations[0].job,'settlement-batch');
 assert.equal(e.details.violations[0].hashes.length,2);
 assert.match(failureReasons(e).join('\n'),/任务 settlement-batch: 同 seed 双次运行输出哈希不一致/);
});

test('unbalanced double-entry totals fail with both sides named',t=>{
 const root=project(t);
 withSpec(root,spec=>{spec.jobs[0].doubleEntry.credits+=1;});
 const e=rerunGate(run(root));
 assert.equal(e.status,'FAIL');
 assert.deepEqual(e.details.violations,[{rule:'unbalancedDoubleEntry',job:'settlement-batch',debits:2290548,credits:2290549}]);
 assert.match(failureReasons(e).join('\n'),/复式恒等式不成立（借 2290548 ≠ 贷 2290549）/);
});

test('single run, mixed seeds and missing algorithm fail closed as ERROR',t=>{
 const root=project(t);
 withSpec(root,spec=>{spec.jobs[0].runs.pop();});
 assert.equal(rerunGate(run(root)).status,'ERROR');
 withSpec(root,spec=>{spec.jobs[0].runs.push({seed:'fixture-2026-09-26',outputSha256:spec.jobs[0].runs[0].outputSha256});});
 assert.equal(rerunGate(run(root)).status,'ERROR');
 const root2=project(t);
 withSpec(root2,spec=>{delete spec.jobs[0].hashAlgorithm;});
 assert.equal(rerunGate(run(root2)).status,'ERROR');
 const root3=project(t);
 withSpec(root3,spec=>{spec.jobs[0].runs[0].outputSha256='not-hex';});
 assert.equal(rerunGate(run(root3)).status,'ERROR');
});

test('rerun requires L4 domain and a spec file',t=>{
 const root=project(t);
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 config.gates[0].level='L3';
 fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});
