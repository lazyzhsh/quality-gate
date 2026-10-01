import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {createProvider} from '../lib/ontology.mjs';
test('P3 open assumptions fail; confirmation passes',t=>{const f=leanFixture(t);f.c.gates.push({id:'assumptions',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C1',file:'assumptions.json'});f.save();const save=status=>fs.writeFileSync(path.join(f.root,'assumptions.json'),JSON.stringify({assumptions:[{id:'A1',statement:'Business assumption',status}]}));save('open');assert.equal(run(f.root).status,'FAIL');save('confirmed');assert.equal(run(f.root).status,'PASS');});
test('P3 traversal and missing assumptions fail',t=>{const f=leanFixture(t);Object.assign(f.c.gates[0],{kind:'assumptions',file:'../outside.json'});f.save();assert.equal(run(f.root).status,'ERROR');});
test('P3 exception cannot waive failure',t=>{const f=leanFixture(t);f.c.exceptions=[{id:'E1'}];f.save();assert.equal(run(f.root).status,'ERROR');});
test('P3 FIBO skeleton is explicit; replace with custom ontology',t=>{const f=leanFixture(t);assert.equal(createProvider({type:'fibo-skeleton'},f.root).resolve('anything').status,'NOT_IMPLEMENTED');fs.writeFileSync(path.join(f.root,'ontology.json'),JSON.stringify({id:'other-business',version:'1',concepts:[{iri:'urn:domain:Order',label:'Order'}]}));const p=createProvider({type:'local-catalog',file:'ontology.json'},f.root);assert.equal(p.resolve('urn:domain:Order').status,'FOUND');assert.equal(p.resolve('urn:missing').status,'UNKNOWN');assert.equal(p.describe().id,'other-business');assert.throws(()=>createProvider({type:'unknown'},f.root));});

test('proposed exception blocks an otherwise passing run',t=>{
 const f=leanFixture(t);
 f.c.risks=[{id:'R1',gateId:'build',description:'Syntax risk'}];
 f.c.exceptions=[{id:'X1',gateId:'build',riskId:'R1',reason:'Demo waiver request',owner:'team',expiresAt:'2099-01-01',status:'proposed'}];
 f.save();
 let result=run(f.root);
 assert.equal(result.evidence[0].status,'PASS');
 assert.equal(result.status,'FAIL','A proposed exception must block even when every gate passes');
 f.c.exceptions=[];f.save();
 result=run(f.root);
 assert.equal(result.status,'PASS');
});
