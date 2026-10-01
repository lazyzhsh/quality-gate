import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/semantic-constraint-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-constraint-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const evidence=r=>r.evidence[0];

test('ontology-declared constraints pass over observed live behaviour',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.constraintCount,2);
 assert.ok(evidence(r).details.caseCount>=5);
 assert.deepEqual(evidence(r).details.violations,[]);
});

test('over-capturing domain violates the ontology constraint with counterexample',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'domain.mjs'),'export class PaymentObligation {\n constructor(id,authorized){this.id=id;this.authorized=authorized;this.captured=0;}\n capture(amount){this.captured+=amount;return this.captured;}\n}\n');
 fs.writeFileSync(path.join(root,'runner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);const {PaymentObligation}=await import("./domain.mjs");const cases=[];for(let n=1;n<=Math.max(q.minCases,5);n++){const o=new PaymentObligation(`p${n}`,100);o.capture(120+n);cases.push({id:`case-${n}`,values:{authorizedAmount:o.authorized,capturedAmount:o.captured}});}console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"domain.mjs PaymentObligation instances",cases}));');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const violation=evidence(r).details.violations.find(v=>v.constraintId==='CAPTURE_LIMIT'&&v.status==='FAIL');
 assert.equal(violation.operator,'le');
 assert.ok(violation.left>violation.right,'counterexample must show captured > authorized');
});

test('constraintIds subset restricts the checked constraints',t=>{
 const root=project(t),c=config(root);
 c.gates[0].constraintIds=['NON_NEGATIVE'];
 save(root,c);
 fs.writeFileSync(path.join(root,'domain.mjs'),'export class PaymentObligation {\n constructor(id,authorized){this.id=id;this.authorized=authorized;this.captured=0;}\n capture(amount){this.captured+=amount;return this.captured;}\n}\n');
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.constraintCount,1);
});

test('unknown concept, unknown constraint id and constraint-less concept fail closed',t=>{
 const root=project(t),c=config(root);
 c.gates[0].concept='urn:demo:Ghost';
 save(root,c);
 assert.match(evidence(run(root)).details.error,/Unknown concept/);
 const root2=project(t),c2=config(root2);
 c2.gates[0].constraintIds=['NOPE'];
 save(root2,c2);
 assert.match(evidence(run(root2)).details.error,/Unknown constraint id/);
 const root3=project(t),c3=config(root3);
 c3.gates[0].concept='urn:demo:SomethingElse';
 save(root3,c3);
 const catalog=JSON.parse(fs.readFileSync(path.join(root3,'catalog.json'),'utf8'));
 catalog.concepts.push({iri:'urn:demo:SomethingElse',label:'x'});
 fs.writeFileSync(path.join(root3,'catalog.json'),JSON.stringify(catalog));
 assert.match(evidence(run(root3)).details.error,/no declared constraints/);
});

test('missing operand and stale observation fail closed',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'runner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);const cases=[];for(let n=1;n<=Math.max(q.minCases,5);n++)cases.push({id:`c${n}`,values:{authorizedAmount:5}});console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"fake",cases}));');
 assert.match(evidence(run(root)).details.error,/Missing constraint operand/);
 const root2=project(t);
 fs.writeFileSync(path.join(root2,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",cases:[]}));');
 assert.match(evidence(run(root2)).details.error,/Invalid or stale/);
});

test('malformed constraint in catalog and stale ack fail',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts[0].constraints[0].operator='between';
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 assert.match(evidence(run(root)).details.error,/Invalid ontology catalog/);
 const root2=project(t),c2=config(root2);
 c2.gates[0].acknowledgedOntology={id:'demo-payments',version:'1',catalogSha256:'0'.repeat(64)};
 save(root2,c2);
 const r=run(root2);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence[0].details.ontologyAck.rule,'staleOntologyAck');
});

test('when-condition unmet constraints are skipped not failed',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts[0].constraints.push({id:'REFUND_LIMIT',left:'refundedAmount',operator:'le',right:'capturedAmount',when:{field:'supportsRefund',equals:false}});
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 fs.writeFileSync(path.join(root,'runner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);const cases=[];for(let n=1;n<=5;n++)cases.push({id:`case-${n}`,values:{authorizedAmount:100,capturedAmount:100,supportsRefund:true}});console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"no-refund products",cases}));');
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.ok(evidence(r).details.violations.every(v=>v.status==='SKIP'));
});
