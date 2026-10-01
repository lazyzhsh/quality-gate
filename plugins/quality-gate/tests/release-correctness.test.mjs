import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {leanFixture} from './fixture.mjs';
import {run,validate,stageBudget} from '../lib/kernel.mjs';
import {reusableRun} from '../lib/freshness.mjs';

const write=(root,name,data)=>fs.writeFileSync(path.join(root,name),typeof data==='string'?data:JSON.stringify(data));
function project(t,gate,{catalog}={}){
 const f=leanFixture(t);f.c.gates=[{id:'G',claimId:'C1',enabled:true,stages:['close'],...gate}];
 if(catalog){f.c.ontology={type:'local-catalog',file:'catalog.json'};write(f.root,'catalog.json',catalog);}
 f.save();return f;
}
const observe=(f,payload)=>write(f.root,'runner.mjs',`let s='';for await(const x of process.stdin)s+=x;const q=JSON.parse(s);console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'isolated regression observation',...${JSON.stringify(payload)}}));`);
const catalog={id:'test',version:'1',concepts:[{iri:'urn:A',label:'A'}]};
function shapeProject(t,property,value){
 const f=project(t,{kind:'semantic-profile',level:'L2',file:'profile.json',dataFile:'data.json'},{catalog});
 write(f.root,'profile.json',{shapes:[{id:'S',targetClass:'urn:A',properties:[{path:'name',minCount:1,maxCount:1,valueType:'string',...property}]}]});
 write(f.root,'data.json',{records:[{id:'R',typeIri:'urn:A',properties:{name:value}}]});return f;
}

test('Stop reruns command observations after input deletion',t=>{
 const f=project(t,{kind:'command',level:'L1',argv:['$NODE','-e',"process.exit(require('fs').existsSync('input.txt')?0:1)"],timeoutMs:1000});
 write(f.root,'input.txt','good');assert.equal(run(f.root).status,'PASS');fs.unlinkSync(path.join(f.root,'input.txt'));
 assert.equal(reusableRun(f.root),null);
 const hook=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
 const out=spawnSync(process.execPath,[hook],{input:JSON.stringify({cwd:f.root,hook_event_name:'Stop'}),encoding:'utf8',windowsHide:true});
 assert.equal(out.status,0);assert.equal(JSON.parse(out.stdout).decision,'block');
});
test('input drift during a runner prevents reuse of its archived verdict',t=>{
 const f=project(t,{kind:'command',level:'L1',argv:['$NODE','-e',"const fs=require('fs');const ok=fs.readFileSync('input.txt','utf8')==='good';fs.writeFileSync('input.txt','bad');process.exit(ok?0:1)"],timeoutMs:1000});
 write(f.root,'input.txt','good');const first=run(f.root);assert.equal(first.status,'PASS');assert.equal(first.inputsStable,false);
 assert.equal(reusableRun(f.root),null);assert.equal(run(f.root).status,'FAIL');
});
test('time-dependent observations are never cached even without file changes',t=>{
 const f=project(t,{kind:'resilience',level:'L4',argv:['$NODE','runner.mjs'],timeoutMs:1000,maxAgeDays:1,scenarios:[{id:'S',maxRecoveryMs:5,expectedFinalState:'ready',requiredSignals:['log']}]});
 observe(f,{observedAt:new Date().toISOString(),scenarios:[{id:'S',fault:'synthetic event',recoveryMs:1,finalState:'ready',signals:{log:'event'}}]});
 assert.equal(run(f.root).status,'PASS');assert.equal(reusableRun(f.root),null);
});
test('transitive parent facts cannot prove a narrower property, while child chains can prove a parent',t=>{
 const ontology={id:'test',version:'1',properties:[{predicate:'broad',transitive:true},{predicate:'narrow',subPropertyOf:['broad']}],concepts:[{iri:'urn:A',label:'A',relations:[{predicate:'narrow',to:'urn:C'}]},{iri:'urn:B',label:'B'},{iri:'urn:C',label:'C'}]};
 const f=project(t,{kind:'semantic-relation',level:'L3',argv:['$NODE','runner.mjs'],timeoutMs:1000,relations:[{from:'urn:A',predicate:'narrow',to:'urn:C'}]},{catalog:ontology});
 const chain=p=>({relations:[{from:'urn:A',predicate:p,to:'urn:B',location:'A-B'},{from:'urn:B',predicate:p,to:'urn:C',location:'B-C'}]});
 observe(f,chain('broad'));let r=run(f.root);assert.equal(r.status,'FAIL');assert.ok(r.evidence[0].details.findings.some(x=>x.rule==='missingRelation'));
 ontology.concepts[0].relations=[{predicate:'broad',to:'urn:C'}];write(f.root,'catalog.json',ontology);f.c.gates[0].relations[0].predicate='broad';f.save();observe(f,chain('narrow'));
 assert.equal(run(f.root).status,'PASS');
 ontology.properties[0].transitive=false;ontology.properties[1].transitive=true;write(f.root,'catalog.json',ontology);
 assert.equal(run(f.root).status,'PASS');
});
test('ledger rejects rounded unsafe inputs and sums safe entries exactly past the Number range',t=>{
 const f=project(t,{kind:'consistency',level:'L2',timeoutMs:1000,requiredChecks:['ledger'],checks:[{id:'ledger',type:'zero-sum',argv:['$NODE','runner.mjs'],timeoutMs:1000}]});
 const order=entries=>({orders:[{id:'O',entries}]});
 observe(f,order([{direction:'debit',amount:9007199254740992},{direction:'credit',amount:9007199254740993}]));assert.equal(run(f.root).status,'ERROR');
 const m=Number.MAX_SAFE_INTEGER;
 observe(f,order([{direction:'debit',amount:m},{direction:'debit',amount:2},{direction:'credit',amount:m},{direction:'credit',amount:1}]));
 let r=run(f.root);assert.equal(r.status,'FAIL');assert.deepEqual(r.evidence[0].details.checks[0].unbalanced,[{id:'O',balance:-1}]);
 observe(f,order([{direction:'debit',amount:m},{direction:'debit',amount:2},{direction:'credit',amount:m},{direction:'credit',amount:2}]));assert.equal(run(f.root).status,'PASS');
});
test('default symbol scan covers root and nested files and validates full builtin specifiers',t=>{
 const f=project(t,{kind:'symbol-grounding',level:'L1',check:'all'});
 write(f.root,'main.mjs',"import './missing.mjs';");let r=run(f.root);assert.equal(r.status,'FAIL');assert.equal(r.evidence[0].details.scannedFiles,1);
 write(f.root,'main.mjs',"import 'node:test'; import 'fs/promises';");assert.equal(run(f.root).status,'PASS');
 write(f.root,'main.mjs',"import 'node:fs/not-a-module';");assert.equal(run(f.root).status,'FAIL');
 fs.mkdirSync(path.join(f.root,'src'));write(f.root,'src/entry.mjs',"import './absent.mjs';");write(f.root,'main.mjs','');
 r=run(f.root);assert.equal(r.status,'FAIL');assert.equal(r.evidence[0].details.scannedFiles,2);
});
test('single SHACL bounds validate individually and Unicode length counts code points',t=>{
 for(const property of [{minLength:'bad'},{maxLength:-1},{minLength:0.5},{minInclusive:'bad'},{maxInclusive:'bad'}])assert.equal(run(shapeProject(t,property,'').root).status,'ERROR');
 assert.equal(run(shapeProject(t,{minLength:2},'😀').root).status,'FAIL');
 assert.equal(run(shapeProject(t,{minLength:1,maxLength:1},'😀').root).status,'PASS');
 assert.equal(run(shapeProject(t,{maxLength:1},'ab').root).status,'FAIL');
});
test('standard SHACL datatype findings are data failures rather than unknown-component errors',t=>{
 const f=shapeProject(t,{valueType:'number'},'wrong');
 f.c.gates[0].shacl={argv:['$NODE','runner.mjs'],timeoutMs:1000};f.save();
 observe(f,{conformance:false,findings:[{recordId:'R',shapeId:'S',path:'name',component:'http://www.w3.org/ns/shacl#DatatypeConstraintComponent',message:'wrong datatype'}]});
 assert.equal(run(f.root).status,'FAIL');
});
test('independent reasoner receives equivalence and union facts',t=>{
 const c={id:'test',version:'1',concepts:[{iri:'urn:X',label:'X',disjointWith:['urn:A']},{iri:'urn:A',label:'A',equivalentClass:['urn:B']},{iri:'urn:B',label:'B',unionOf:['urn:C']},{iri:'urn:C',label:'C'}]};
 const reasoner=fileURLToPath(new URL('../examples/semantic-consistency-demo/reasoner.mjs',import.meta.url));
 const f=project(t,{kind:'semantic-consistency',level:'L3',reasoner:{argv:['$NODE',reasoner],timeoutMs:1000}},{catalog:c});
 const r=run(f.root);assert.equal(r.status,'PASS',JSON.stringify(r));assert.equal(r.evidence[0].details.reasoner.status,'AGREED');
});
test('configuration arrays compare JSON values, including object key order, null and empty objects',t=>{
 const f=project(t,{kind:'configuration',level:'L5',files:{a:'a.json',b:'b.json'},allowedDifferences:[]});
 write(f.root,'a.json',{features:[{a:1,b:2},null],empty:{}});write(f.root,'b.json',{features:[{b:2,a:1},null],empty:{}});assert.equal(run(f.root).status,'PASS');
 write(f.root,'b.json',{features:[null,{b:2,a:1}],empty:{}});assert.equal(run(f.root).status,'FAIL');
 write(f.root,'b.json',{features:[{b:2,a:1},null]});assert.equal(run(f.root).status,'FAIL');
});
test('deferred ADR passes only at L0 with permission and an unexpired revisit date',t=>{
 const f=project(t,{kind:'decisions',level:'L0',file:'decisions.json',allowDeferred:true,requireAdrRefs:true});
 write(f.root,'adr.md','---\nstatus: deferred\n---\n');
 write(f.root,'decisions.json',{decisions:[{id:'D',question:'Proceed?',status:'deferred',owner:'user',resolution:'Later',evidence:'declaration',revisitBy:'2099-01-01',adrRef:{file:'adr.md'}}]});
 assert.equal(run(f.root).status,'PASS');f.c.gates[0].level='L5';f.save();assert.equal(run(f.root).status,'FAIL');
});
test('long command checks use pr/release budgets and Stop rejects over-budget close before running',t=>{
 const f=project(t,{kind:'command',level:'L1',argv:['$NODE','-e','process.exit(0)'],timeoutMs:180000,stages:['pr','release']});
 assert.doesNotThrow(()=>validate(f.c));assert.equal(stageBudget(f.c,'release'),180000);assert.equal(run(f.root,'release').status,'PASS');
 f.c.gates[0].stages=['close'];f.c.gates[0].timeoutMs=60000;f.save();
 const r=run(f.root,'close',path.join(f.root,'.quality-gate','runs'),{budgetMs:50000});assert.equal(r.status,'ERROR');assert.match(r.error,/Host execution budget/);assert.equal(r.evidence.length,0);
});
