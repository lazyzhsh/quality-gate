import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/semantic-exposure-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-exposure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const evidence=r=>r.evidence[0];

test('public-only surface passes with exposure policy declared',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.exposedCount,1);
 assert.deepEqual(evidence(r).details.findings,[]);
 assert.match(evidence(r).details.source,/api\.mjs exported symbols/);
});

test('exporting an internal concept on the public surface fails with location',t=>{
 const root=project(t);
 fs.copyFileSync(path.join(root,'internal.mjs'),path.join(root,'api.mjs'));
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(f=>f.rule==='internalConceptExposed');
 assert.equal(finding.iri,'urn:demo:SettlementPolicy');
 assert.equal(finding.label,'settlement policy');
 assert.match(finding.locations[0],/api\.mjs:\d+/);
});

test('unknown concept on the surface fails as unknownExposedConcept',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'api.mjs'),'// @ontology ghost urn:demo:Ghost\nexport const ghost=1;\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings[0].rule,'unknownExposedConcept');
});

test('catalog without any exposure policy fails closed',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 for(const concept of catalog.concepts)delete concept.exposure;
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(evidence(r).details.error,/no exposure policy/);
});

test('malformed exposure value in catalog and stale observation fail closed',t=>{
 const root=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts[0].exposure='secret';
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 assert.match(evidence(run(root)).details.error,/Invalid ontology catalog/);
 const root2=project(t);
 fs.writeFileSync(path.join(root2,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",exposed:[]}));');
 assert.match(evidence(run(root2)).details.error,/Invalid or stale/);
});

test('stale acknowledgedOntology fails the exposure gate',t=>{
 const root=project(t),c=config(root);
 c.gates[0].acknowledgedOntology={id:'demo-api',version:'1',catalogSha256:'0'.repeat(64)};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings.find(f=>f.rule==='staleOntologyAck').rule,'staleOntologyAck');
});
