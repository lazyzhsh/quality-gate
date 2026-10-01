import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';

function setup(t){
 const f=leanFixture(t);
 f.c.ontology={type:'local-catalog',file:'ontology.json'};
 f.c.claims.push({id:'C2',statement:'Sample contracts satisfy the declared domain profile'});
 f.c.gates.push({id:'profile',kind:'semantic-profile',level:'L2',enabled:true,stages:['close'],claimId:'C2',file:'profile.json',dataFile:'records.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'ontology.json'),JSON.stringify({id:'contracts',version:'1',concepts:[{iri:'urn:contract:Agreement',label:'Agreement'}]}));
 const profile={shapes:[{id:'AgreementShape',targetClass:'urn:contract:Agreement',properties:[{path:'parties',minCount:2,maxCount:2,valueType:'string'},{path:'amount',minCount:1,maxCount:1,valueType:'number'}]}]};
 const records={records:[{id:'one',typeIri:'urn:contract:Agreement',properties:{parties:['A','B'],amount:12}}]};
 const save=()=>{fs.writeFileSync(path.join(f.root,'profile.json'),JSON.stringify(profile));fs.writeFileSync(path.join(f.root,'records.json'),JSON.stringify(records));};save();
 return {...f,profile,records,save};
}

test('profile validates sample values against a replaceable ontology concept',t=>{
 const f=setup(t);const r=run(f.root);
 assert.equal(r.status,'PASS');
 assert.equal(r.evidence.find(e=>e.gateId==='profile').details.recordCount,1);
});
test('missing and wrong typed values fail with path evidence',t=>{
 const f=setup(t);delete f.records.records[0].properties.amount;f.records.records[0].properties.parties=['A',42];f.save();
 const e=run(f.root).evidence.find(x=>x.gateId==='profile');
 assert.equal(e.status,'FAIL');
 assert.ok(e.details.violations.some(v=>v.path==='amount'&&v.rule==='minCount'));
 assert.ok(e.details.violations.some(v=>v.path==='parties'&&v.rule==='valueType'));
});
test('violations carry SHACL Core component equivalents',t=>{
 const f=setup(t);
 f.profile.shapes[0].properties[0].allowedValues=['A','B'];
 f.profile.shapes[0].properties.push({path:'note',minCount:1,maxCount:1,valueType:'string'});
 f.profile.shapes[0].properties.push({path:'tags',minCount:0,maxCount:1,valueType:'string'});
 f.records.records[0].properties.parties=['C','D'];
 f.records.records[0].properties.tags=['x','y'];
 f.save();
 const e=run(f.root).evidence.find(x=>x.gateId==='profile');
 assert.equal(e.status,'FAIL');
 const byRule=Object.fromEntries(e.details.violations.map(v=>[v.rule,v]));
 assert.equal(byRule.minCount.shacl,'sh:MinCountConstraintComponent');
 assert.equal(byRule.maxCount.shacl,'sh:MaxCountConstraintComponent');
 assert.equal(byRule.allowedValues.shacl,'sh:InConstraintComponent');
 const f2=setup(t);
 f2.records.records[0].properties.parties=['A',42];f2.save();
 const valueType=run(f2.root).evidence.find(x=>x.gateId==='profile').details.violations.find(v=>v.rule==='valueType');
 assert.equal(valueType.expected,'string');
 assert.equal(valueType.shacl,'sh:datatype=xsd:string');
});
test('unknown target, missing shape and malformed profile fail closed',t=>{
 const f=setup(t);f.records.records[0].typeIri='urn:unknown';f.save();
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='profile').status,'FAIL');
 f.profile.shapes[0].targetClass='urn:unknown';f.save();
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='profile').status,'ERROR');
 f.profile.shapes[0].properties=[];f.save();
 assert.equal(run(f.root).evidence.find(e=>e.gateId==='profile').status,'ERROR');
});

test('allowedValues violations fail with rule evidence',t=>{
 const f=setup(t);
 f.profile.shapes[0].properties[0].allowedValues=['A','B'];
 f.records.records[0].properties.parties=['A','C'];f.save();
 const evidence=run(f.root).evidence.find(e=>e.gateId==='profile');
 assert.equal(evidence.status,'FAIL');
 assert.ok(evidence.details.violations.some(violation=>violation.path==='parties'&&violation.rule==='allowedValues'));
});

test('v1.22 deep matching applies shapes to subclass records (both directions)',t=>{
 const f=setup(t);
 // 目录加子类链：WrittenContract ⊑ Agreement（记录类型为子类也套用 shape——旧精确匹配为缺陷面）
 const catalog=JSON.parse(fs.readFileSync(path.join(f.root,'ontology.json'),'utf8'));
 catalog.concepts.push({iri:'urn:contract:WrittenContract',label:'Written contract',subClassOf:['urn:contract:Agreement']});
 fs.writeFileSync(path.join(f.root,'ontology.json'),JSON.stringify(catalog));
 f.records.records.push({id:'sub',typeIri:'urn:contract:WrittenContract',properties:{parties:['A','B'],amount:5}});f.save();
 let evidence=run(f.root).evidence.find(e=>e.gateId==='profile');
 assert.equal(evidence.status,'PASS',JSON.stringify(evidence.details));
 assert.ok(evidence.details.deepMatches.some(match=>match.recordId==='sub'&&match.via.includes('⊑')));
 // 子类记录违规即 FAIL（深度路由的负例）
 f.records.records[1].properties.parties=['only'];f.save();
 evidence=run(f.root).evidence.find(e=>e.gateId==='profile');
 assert.equal(evidence.status,'FAIL');
 assert.ok(evidence.details.violations.some(violation=>violation.recordId==='sub'&&violation.rule==='minCount'));
});

test('v1.22.1 new components are judged natively without any engine (OD-116: zero external dependency by default)',t=>{
 const f=setup(t);
 f.profile.shapes[0].properties.push({path:'code',minCount:1,maxCount:1,valueType:'string',pattern:'C-\\d+',minLength:2,maxLength:8});f.save();
 f.records.records[0].properties.code='C-42';f.save();
 let evidence=run(f.root).evidence.find(e=>e.gateId==='profile');
 assert.equal(evidence.status,'PASS',JSON.stringify(evidence.details));
 f.records.records[0].properties.code='X';f.save();
 evidence=run(f.root).evidence.find(e=>e.gateId==='profile');
 assert.equal(evidence.status,'FAIL');
 const rules=evidence.details.violations.map(v=>v.rule);
 assert.ok(rules.includes('pattern'),'pattern judged natively');
 assert.ok(rules.includes('minLength'),'minLength judged natively');
});

test('v1.22 malformed new-component declarations fail closed',t=>{
 const f=setup(t);
 f.profile.shapes[0].properties.push({path:'code',minCount:1,maxCount:1,valueType:'string',pattern:'[unclosed'});f.save();
 const evidence=run(f.root).evidence.find(e=>e.gateId==='profile');
 assert.equal(evidence.status,'ERROR');
 assert.match(String(evidence.details),/Invalid properties/);
});
