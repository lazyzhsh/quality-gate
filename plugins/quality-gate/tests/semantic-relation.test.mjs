import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/semantic-relation-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-relation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const evidence=r=>r.evidence[0];

test('declared relations observed in code and sanctioned by catalog pass',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.expectedCount,2);
 assert.equal(evidence(r).details.observedCount,2);
 assert.deepEqual(evidence(r).details.findings,[]);
});

test('relation missing from code fails with the expected triple',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology-relation urn:demo:Contract hasParty urn:demo:ContractParty\nexport class ContractRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings[0];
 assert.equal(finding.rule,'missingRelation');
 assert.equal(finding.predicate,'creates');
});

test('relation absent from the catalog is unsanctioned',t=>{
 const root=project(t),c=config(root);
 c.gates[0].relations.push({from:'urn:demo:ContractParty',predicate:'assigns',to:'urn:demo:Obligation'});
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.ok(evidence(r).details.findings.some(f=>f.rule==='unsanctionedRelation'&&f.predicate==='assigns'));
});

test('same-predicate reverse catalog edge does not sanction the forward expectation (F03)',t=>{
 const root=project(t),c=config(root),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 // 目录只在 to 概念上声明同谓词反向边（B—assigns→A），无 inverseOf：期望 A—assigns→B 不被认可。
 // 观察侧补注解使满足判定通过——隔离认可面，唯一 finding 须是 unsanctionedRelation。
 c.gates[0].relations.push({from:'urn:demo:Contract',predicate:'assigns',to:'urn:demo:ContractParty'});
 save(root,c);
 catalog.concepts.find(x=>x.iri==='urn:demo:ContractParty').relations=[{predicate:'assigns',to:'urn:demo:Contract'}];
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 fs.appendFileSync(path.join(root,'domain.mjs'),'\n// @ontology-relation urn:demo:Contract assigns urn:demo:ContractParty\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.deepEqual(evidence(r).details.findings.map(f=>f.rule),['unsanctionedRelation']);
 assert.equal(evidence(r).details.findings[0].predicate,'assigns');
});

test('reverse sanction holds only with a declared inverse predicate (F03)',t=>{
 const root=project(t),c=config(root),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 // 显式互逆：assigns inverseOf assignedBy，目录在 to 概念上以 assignedBy 声明反向关系——认可成立
 c.gates[0].relations.push({from:'urn:demo:Contract',predicate:'assigns',to:'urn:demo:ContractParty'});
 save(root,c);
 catalog.properties=[{predicate:'assigns',inverseOf:'assignedBy'}];
 catalog.concepts.find(x=>x.iri==='urn:demo:ContractParty').relations=[{predicate:'assignedBy',to:'urn:demo:Contract'}];
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 fs.appendFileSync(path.join(root,'domain.mjs'),'\n// @ontology-relation urn:demo:Contract assigns urn:demo:ContractParty\n');
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(evidence(r).details.findings));
});

test('relation annotated in code but not declared fails as undeclared',t=>{
 const root=project(t);
 fs.appendFileSync(path.join(root,'domain.mjs'),'\n// @ontology-relation urn:demo:Obligation settles urn:demo:ContractParty\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(f=>f.rule==='undeclaredRelation');
 assert.equal(finding.from,'urn:demo:Obligation');
 assert.match(finding.location,/domain\.mjs:\d+/);
});

test('expected relation referencing an unknown concept fails',t=>{
 const root=project(t),c=config(root);
 c.gates[0].relations.push({from:'urn:demo:Ghost',predicate:'hasParty',to:'urn:demo:ContractParty'});
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings.find(f=>f.rule==='unknownConcept').from,'urn:demo:Ghost');
});

test('stale runId and malformed observations fail closed',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",relations:[]}));');
 assert.equal(run(root).status,'ERROR');
 const root2=project(t);
 fs.writeFileSync(path.join(root2,'runner.mjs'),'let i="";for await(const c of process.stdin)i+=c;console.log(JSON.stringify({schemaVersion:"0.1",runId:JSON.parse(i).runId,source:"fake",relations:[{from:"x"}]}));');
 assert.equal(run(root2).status,'ERROR');
});

test('dangling catalog relation target and duplicate triples fail at validation',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts[0].relations.push({predicate:'mentions',to:'urn:demo:Missing'});
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(evidence(r).details.error,/Unknown relation target/);
 const root2=project(t),c2=config(root2);
 c2.gates[0].relations.push(c2.gates[0].relations[0]);
 save(root2,c2);
 assert.match(run(root2).error,/Duplicate semantic relation/);
});

test('stale acknowledgedOntology fails the relation gate',t=>{
 const root=project(t),c=config(root);
 c.gates[0].acknowledgedOntology={id:'demo-contracts',version:'99',catalogSha256:'0'.repeat(64)};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings.find(f=>f.rule==='staleOntologyAck').fields[0].field,'version');
});
