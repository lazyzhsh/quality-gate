import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/semantic-instance-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-instance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const records=root=>JSON.parse(fs.readFileSync(path.join(root,'records.json'),'utf8'));
const saveRecords=(root,r)=>fs.writeFileSync(path.join(root,'records.json'),JSON.stringify(r));
const evidence=r=>r.evidence[0];

test('consistent typings pass, including specialization along the subclass chain',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.recordCount,4);
 assert.equal(evidence(r).details.declaredEntityCount,2);
 assert.deepEqual(evidence(r).details.findings,[]);
});

test('same entity typed with disjoint concepts conflicts at instance level',t=>{
 const root=project(t),r=records(root);
 r.records.push({id:'r-5',entityId:'contract-2',typeIri:'urn:demo:TermSheet'});
 saveRecords(root,r);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const finding=evidence(result).details.findings.find(f=>f.rule==='disjointInstances');
 assert.equal(finding.entityId,'contract-2');
 assert.deepEqual(finding.pair,['urn:demo:Contract','urn:demo:TermSheet']);
});

test('disjointness inherited from ancestors still conflicts at instance level',t=>{
 const root=project(t),r=records(root);
 r.records.push({id:'r-5',entityId:'sheet-1',typeIri:'urn:demo:WrittenContract'});
 saveRecords(root,r);
 const result=run(root);
 const finding=evidence(result).details.findings.find(f=>f.rule==='disjointInstances');
 assert.equal(finding.entityId,'sheet-1','TermSheet ⊥ Contract 应沿继承传播到 WrittenContract');
});

test('incomparable sibling typings are ambiguous',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts.push({iri:'urn:demo:Sister',label:'sister',subClassOf:['urn:demo:Contract']});
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 const r=records(root);
 r.records.push({id:'r-5',entityId:'contract-1',typeIri:'urn:demo:Sister'});
 saveRecords(root,r);
 const result=run(root);
 const finding=evidence(result).details.findings.find(f=>f.rule==='ambiguousInstanceType');
 assert.equal(finding.entityId,'contract-1');
});

test('declared entity without observation and type mismatch fail',t=>{
 const root=project(t),c=config(root);
 c.gates[0].entityTypes.push({entityId:'ghost-1',typeIri:'urn:demo:Contract'});
 save(root,c);
 let result=run(root);
 assert.ok(evidence(result).details.findings.some(f=>f.rule==='missingEntity'&&f.entityId==='ghost-1'));
 const root2=project(t),c2=config(root2);
 c2.gates[0].entityTypes[0].typeIri='urn:demo:TermSheet';
 save(root2,c2);
 result=run(root2);
 const mismatch=evidence(result).details.findings.find(f=>f.rule==='typeMismatch');
 assert.equal(mismatch.entityId,'contract-1');
 assert.deepEqual([...mismatch.actualIris].sort(),['urn:demo:Contract','urn:demo:WrittenContract']);
});

test('unresolved record type and malformed samples fail',t=>{
 const root=project(t),r=records(root);
 r.records.push({id:'r-6',typeIri:'urn:demo:Ghost'});
 saveRecords(root,r);
 const result=run(root);
 assert.ok(evidence(result).details.findings.some(f=>f.rule==='unknownConcept'&&f.recordId==='r-6'));
 const root2=project(t);
 saveRecords(root2,{records:[{id:'dup',typeIri:'urn:demo:Contract'},{id:'dup',typeIri:'urn:demo:Contract'}]});
 assert.match(String(evidence(run(root2)).details),/Duplicate instance record/);
 const root3=project(t);
 saveRecords(root3,{records:[]});
 assert.match(String(evidence(run(root3)).details),/Expected 1\.\.100 records/);
});

test('stale acknowledgedOntology fails the instance gate',t=>{
 const root=project(t),c=config(root);
 c.gates[0].acknowledgedOntology={id:'demo-ledger',version:'1',catalogSha256:'0'.repeat(64)};
 save(root,c);
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(evidence(result).details.findings.find(f=>f.rule==='staleOntologyAck').rule,'staleOntologyAck');
});
