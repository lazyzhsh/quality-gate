import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';import {createProvider} from '../lib/ontology.mjs';
const source=fileURLToPath(new URL('../examples/owl-reasoning-demo',import.meta.url));
function project(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-owl-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(source,root,{recursive:true});
 return root;
}
const catalog=root=>JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const saveCatalog=(root,c)=>fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(c));
const domain=root=>fs.readFileSync(path.join(root,'domain.mjs'),'utf8');
const saveDomain=(root,text)=>fs.writeFileSync(path.join(root,'domain.mjs'),text);
const gate=(result,id)=>result.evidence.find(e=>e.gateId===id);

test('declared relations and bindings hold through the four inference rules',t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence.map(e=>[e.gateId,e.details.findings?.map(f=>f.rule)])));
 const inferred=gate(result,'relation-reasoning').details.inferred;
 assert.ok(inferred.some(x=>x.via==='transitive'&&x.predicate==='partOf'&&x.trail.length===2));
 assert.ok(inferred.some(x=>x.via==='inverse'&&x.predicate==='hasComponent'));
 const binding=gate(result,'binding-reasoning').details.mappings??gate(result,'binding-reasoning').details;
 const subsumed=JSON.stringify(gate(result,'binding-reasoning').details);
 assert.ok(subsumed.includes('subsumedMatches'),'equivalence/union matches should carry chains');
});

test('breaking the transitive chain fails as missingRelation',t=>{
 const root=project(t);
 saveDomain(root,domain(root).replace('// @ontology-relation demo:MasterAgreement partOf demo:Agreement',''));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.ok(gate(result,'relation-reasoning').details.findings.some(f=>f.rule==='missingRelation'&&f.to==='demo:Agreement'));
});

test('renaming the observed inverse predicate fails as missingRelation',t=>{
 const root=project(t);
 saveDomain(root,domain(root).replace('componentOf','unrelatedTo'));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.ok(gate(result,'relation-reasoning').details.findings.some(f=>f.rule==='missingRelation'&&f.predicate==='hasComponent'));
});

test('an extra observed relation is undeclared (chain edges stay covered)',t=>{
 const root=project(t);
 saveDomain(root,domain(root)+'\n// @ontology-relation demo:Clause partOf demo:MasterAgreement\n');
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const undeclared=gate(result,'relation-reasoning').details.findings.filter(f=>f.rule==='undeclaredRelation');
 assert.equal(undeclared.length,1);
 assert.equal(undeclared[0].from,'demo:Clause');
});

test('binding to a non-equivalent concept fails (equivalence is exact, not fuzzy)',t=>{
 const root=project(t);
 saveDomain(root,domain(root).replace('@ontology AgreementRecord demo:Counterparty','@ontology AgreementRecord demo:Guarantor'));
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(gate(result,'binding-reasoning').status,'FAIL');
});

test('union operand binding fails when the annotation leaves the operand set',t=>{
 const root=project(t);
 saveDomain(root,domain(root).replace('@ontology GuarantorRecord demo:Guarantor','@ontology GuarantorRecord demo:Agreement'));
 const result=run(root);
 assert.equal(gate(result,'binding-reasoning').status,'FAIL');
});

test('cyclic subPropertyOf fails closed at catalog build',t=>{
 const root=project(t),c=catalog(root);
 c.properties.push({predicate:'wraps',subPropertyOf:['partOf']});
 c.properties.find(p=>p.predicate==='partOf').subPropertyOf=['wraps'];
 saveCatalog(root,c);
 assert.equal(run(root).status,'ERROR');
});

test('equivalence contradicting disjointness fails closed at build',t=>{
 const root=project(t),c=catalog(root);
 c.concepts.find(x=>x.iri==='demo:Counterparty').disjointWith=['demo:Signatory'];
 saveCatalog(root,c);
 assert.equal(run(root).status,'ERROR');
});

test('unknown equivalence or union targets fail closed at build',t=>{
 for(const field of ['equivalentClass','unionOf']){
  const root=project(t),c=catalog(root);
  c.concepts.find(x=>x.iri==='demo:Party')[field]=['demo:Ghost'];
  saveCatalog(root,c);
  assert.equal(run(root).status,'ERROR',field);
 }
});

test('provider exposes property helpers and extended capabilities',t=>{
 const root=project(t);
 const provider=createProvider({type:'local-catalog',file:'catalog.json'},root);
 const caps=provider.describe().capabilities;
 assert.ok(caps.includes('equivalence')&&caps.includes('union-classes')&&caps.includes('property-hierarchy'));
 assert.ok(provider.superProperties('hasComponent').has('partOf'));
 assert.equal(provider.inverseOf('componentOf'),'hasComponent');
 assert.equal(provider.inverseOf('hasComponent'),'componentOf');
 assert.equal(provider.isTransitiveProperty('partOf'),true);
 assert.equal(provider.isTransitiveProperty('hasComponent'),false);
});
