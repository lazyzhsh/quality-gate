import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {createProvider} from '../lib/ontology.mjs';

const pin='eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e';
const iri='https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/BilateralAgreement';

function setup(t,ontology={type:'fibo-pinned',expectedCatalogSha256:pin}) {
 const f=leanFixture(t);
 f.c.ontology=ontology;
 f.c.claims.push({id:'C2',statement:'Mapped term is in the selected ontology catalog'});
 f.c.gates.push({id:'ontology',kind:'ontology-map',level:'L2',enabled:true,stages:['close'],claimId:'C2',file:'mappings.json'});
 const mappings=[{id:'contractType',iri}];
 const saveMappings=()=>fs.writeFileSync(path.join(f.root,'mappings.json'),JSON.stringify({mappings}));
 f.save();saveMappings();
 return {...f,mappings,saveMappings};
}

test('pinned FIBO provider resolves its imported Agreements/Contracts set without network',t=>{
 const f=setup(t);
 const p=createProvider(f.c.ontology,f.root);
 assert.equal(p.describe().version,'master_2026Q1');
 assert.equal(p.describe().conceptCount,52);
 assert.ok(p.describe().capabilities.includes('subclasses'),'pinned catalog carries subclass edges');
 assert.equal(p.resolve(iri).concept.label,'bilateral agreement');
 const r=run(f.root);
 assert.equal(r.status,'PASS');
 assert.equal(r.evidence.find(e=>e.gateId==='ontology').details.mappings[0].status,'FOUND');
 assert.ok(fs.existsSync(r.reportPath));
});

test('unknown term fails with recorded mapping; pin mismatch errors closed',t=>{
 const f=setup(t);
 f.mappings[0].iri='urn:unknown:Contract';f.saveMappings();
 let r=run(f.root);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence.find(e=>e.gateId==='ontology').details.mappings[0].status,'UNKNOWN');
 f.c.ontology.expectedCatalogSha256='0'.repeat(64);f.save();
 r=run(f.root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence.find(e=>e.gateId==='ontology').details,/pin mismatch/);
});

test('provider can be replaced by a project local catalog',t=>{
 const f=setup(t,{type:'local-catalog',file:'catalog.json'});
 fs.writeFileSync(path.join(f.root,'catalog.json'),JSON.stringify({id:'custom',version:'1',concepts:[{iri:'urn:custom:Contract',label:'Contract'}]}));
 f.mappings[0].iri='urn:custom:Contract';f.saveMappings();
 const r=run(f.root);
 assert.equal(r.status,'PASS');
 assert.equal(r.evidence.find(e=>e.gateId==='ontology').details.provider.id,'custom');
});

test('skeleton and malformed mapping fail closed',t=>{
 const f=setup(t,{type:'fibo-skeleton'});
 assert.equal(run(f.root).status,'ERROR');
 f.c.ontology={type:'fibo-pinned',expectedCatalogSha256:pin};f.save();
 f.mappings.push({...f.mappings[0]});f.saveMappings();
 assert.equal(run(f.root).status,'ERROR');
});

test('ZCode Stop adapter blocks unknown term and permits corrected mapping',t=>{
 const f=setup(t);
 const hook=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
 const stop=()=>{
  const result=spawnSync(process.execPath,[hook],{input:JSON.stringify({cwd:f.root,hook_event_name:'Stop'})+'\n',encoding:'utf8'});
  assert.equal(result.status,0);
  return JSON.parse(result.stdout);
 };
 f.mappings[0].iri='urn:unknown:Contract';f.saveMappings();
 assert.equal(stop().decision,'block');
 f.mappings[0].iri=iri;f.saveMappings();
 assert.deepEqual(stop(),{});
});

test('pinned provider rejects altered bundled source and catalog bytes',async t=>{
 const f=leanFixture(t);
 const origin=fileURLToPath(new URL('..',import.meta.url));
 const isolated=path.join(f.root,'isolated-plugin');
 fs.cpSync(path.join(origin,'lib'),path.join(isolated,'lib'),{recursive:true});
 fs.cpSync(path.join(origin,'assets'),path.join(isolated,'assets'),{recursive:true});
 const {createProvider:isolatedProvider}=await import(pathToFileURL(path.join(isolated,'lib','ontology.mjs')).href);
 const config={type:'fibo-pinned',expectedCatalogSha256:pin};
 assert.equal(isolatedProvider(config,f.root).resolve(iri).status,'FOUND');
 const source=path.join(isolated,'assets','fibo','2026Q1','Agreements.rdf');
 fs.appendFileSync(source,' ');
 assert.throws(()=>isolatedProvider(config,f.root),/integrity check failed/);
 fs.copyFileSync(path.join(origin,'assets','fibo','2026Q1','Agreements.rdf'),source);
 const catalog=path.join(isolated,'assets','fibo','2026Q1','catalog.json');
 fs.appendFileSync(catalog,' ');
 assert.throws(()=>isolatedProvider(config,f.root),/integrity check failed/);
});
