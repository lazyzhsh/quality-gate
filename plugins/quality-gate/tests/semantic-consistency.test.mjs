import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/semantic-consistency-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-consistency-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const evidence=r=>r.evidence[0];

test('native consistency reports counts and the demo reasoner agrees',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 const details=evidence(r).details;
 assert.equal(details.conceptCount,4);
 assert.equal(details.subclassEdgeCount,2);
 assert.equal(details.declaredDisjointPairCount,1);
 assert.ok(details.inferredDisjointPairCount>=4,'互斥沿继承传播应产生跨后代对');
 assert.equal(details.reasoner.status,'AGREED');
 assert.equal(details.reasoner.agreedPairCount,details.inferredDisjointPairCount);
 assert.match(details.reasoner.tool,/demo-reasoner@1/);
});

test('pinned FIBO catalog passes native consistency with inferred pairs beyond declared',t=>{
 const root=project(t),c=config(root);
 delete c.gates[0].reasoner;
 c.ontology={type:'fibo-pinned',expectedCatalogSha256:'eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e'};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 const details=evidence(r).details;
 assert.ok(details.inferredDisjointPairCount>details.declaredDisjointPairCount,'FIBO 继承结构应传播出超出声明对的推断互斥');
});

test('reasoner disagreement on claimed pairs blocks as ERROR',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'reasoner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"lying reasoner",tool:"liar@1",entailedDisjointPairs:[["urn:demo:A","urn:demo:B"]]}));');
 const r=run(root);
 assert.equal(r.status,'ERROR');
 const reasoner=evidence(r).details.reasoner;
 assert.equal(reasoner.status,'DISAGREEMENT');
 assert.deepEqual(reasoner.claimedOnlyByExternal,[['urn:demo:A','urn:demo:B']]);
 assert.ok(reasoner.kernelOnly.length>0,'内核算出的对集合外部未声称');
});

test('reasoner missing a kernel-derived pair also blocks',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'reasoner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"incomplete reasoner",tool:"lazy@1",entailedDisjointPairs:[]}));');
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.equal(evidence(r).details.reasoner.kernelOnly.length>0,true);
});

test('crashed or stale reasoner and malformed config fail closed',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'reasoner.mjs'),'process.exit(3);');
 assert.equal(run(root).status,'ERROR');
 const root2=project(t);
 fs.writeFileSync(path.join(root2,'reasoner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"x",tool:"x",entailedDisjointPairs:[]}));');
 assert.match(evidence(run(root2)).details.reasoner.error,/Invalid or stale/);
 const root3=project(t),c3=config(root3);
 c3.gates[0].reasoner={argv:['$NODE','reasoner.mjs']};
 save(root3,c3);
 assert.match(run(root3).error,/Invalid semantic-consistency reasoner/);
});

test('inconsistent catalog fails at provider build even for this gate',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts.push({iri:'urn:demo:Broken',label:'broken',subClassOf:['urn:demo:Agreement'],disjointWith:['urn:demo:Agreement']});
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(String(evidence(r).details),/Inconsistent ontology catalog/);
});

test('stale acknowledgedOntology fails the consistency gate',t=>{
 const root=project(t),c=config(root);
 c.gates[0].acknowledgedOntology={id:'demo-agreements',version:'1',catalogSha256:'0'.repeat(64)};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence[0].details.ontologyAck.rule,'staleOntologyAck');
});
