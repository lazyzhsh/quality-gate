import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/ontology_diff.py',import.meta.url));
function pythonExecutable(){
 for(const name of ['python','python3',...(process.platform==='win32'?['py']:[])]){
  const probe=spawnSync(name,['--version'],{encoding:'utf8',windowsHide:true});
  if(!probe.error&&probe.status===0)return name;
 }
 return null;
}
test('ontology diff classifies additive and breaking changes',t=>{
 const exe=pythonExecutable();
 assert.ok(exe,'python is required by the ontology diff devtool and the build pipeline');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-odiff-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const oldCatalog={id:'demo',version:'1',concepts:[
  {iri:'urn:a',label:'a'},
  {iri:'urn:b',label:'b',subClassOf:['urn:a'],disjointWith:['urn:c']},
  {iri:'urn:c',label:'c'}]};
 const newCatalog={id:'demo',version:'2',concepts:[
  {iri:'urn:b',label:'b2'},
  {iri:'urn:c',label:'c'},
  {iri:'urn:d',label:'d',subClassOf:['urn:c']},
  {iri:'urn:e',label:'e',disjointWith:['urn:c']}]};
 fs.writeFileSync(path.join(root,'old.json'),JSON.stringify(oldCatalog));
 fs.writeFileSync(path.join(root,'new.json'),JSON.stringify(newCatalog));
 const result=spawnSync(exe,[script,path.join(root,'old.json'),path.join(root,'new.json')],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,1,'breaking changes must exit non-zero');
 const report=JSON.parse(result.stdout);
 assert.equal(report.changeCount,8);
 assert.equal(report.breakingCount,4);
 const types=Object.fromEntries(report.changes.map(change=>[`${change.type}:${change.iri??change.from}`,change.impact]));
 assert.equal(types['removedConcept:urn:a'],'breaking');
 assert.equal(types['labelChanged:urn:b'],'breaking');
 assert.equal(types['removedSubclassEdge:urn:b'],'breaking');
 assert.equal(types['addedDisjointEdge:urn:e'],'breaking');
 assert.equal(types['addedConcept:urn:d'],'additive');
 assert.equal(types['addedSubclassEdge:urn:d'],'additive');
 assert.equal(types['removedDisjointEdge:urn:b'],'additive');
 assert.equal(report.new.version,'2');
});
test('identical catalogs report no changes and exit zero',t=>{
 const exe=pythonExecutable();
 assert.ok(exe,'python is required by the ontology diff devtool and the build pipeline');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-odiff-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const catalog={id:'demo',version:'1',concepts:[{iri:'urn:a',label:'a',subClassOf:[],disjointWith:[]}]};
 fs.writeFileSync(path.join(root,'a.json'),JSON.stringify(catalog));
 fs.writeFileSync(path.join(root,'b.json'),JSON.stringify(catalog));
 const result=spawnSync(exe,[script,path.join(root,'a.json'),path.join(root,'b.json')],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0);
 assert.equal(JSON.parse(result.stdout).changeCount,0);
});
