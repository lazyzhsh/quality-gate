import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/semantic-state-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-state-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const evidence=r=>r.evidence[0];

test('observed transitions conforming to the lifecycle pass',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.stateCount,4);
 assert.equal(evidence(r).details.declaredTransitionCount,4);
 assert.deepEqual(evidence(r).details.findings,[]);
});

test('skipping a declared state is an illegal transition',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'runner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);const cases=[];for(let n=1;n<=Math.max(q.minCases,3);n++)cases.push({id:`case-${n}`,transitions:[{from:"draft",to:"terminated"}]});console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"fast-path contracts",cases}));');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(f=>f.rule==='illegalTransition');
 assert.equal(finding.from,'draft');
 assert.equal(finding.to,'terminated');
});

test('an undeclared state name is reported as unknownState',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'runner.mjs'),'let i="";for await(const c of process.stdin)i+=c;const q=JSON.parse(i);const cases=[];for(let n=1;n<=Math.max(q.minCases,3);n++)cases.push({id:`case-${n}`,transitions:[{from:"draft",to:"archived"}]});console.log(JSON.stringify({schemaVersion:"0.1",runId:q.runId,source:"fake",cases}));');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings[0].rule,'unknownState');
});

test('unknown concept, lifecycle-less concept and malformed lifecycle fail closed',t=>{
 const root=project(t),c=config(root);
 c.gates[0].concept='urn:demo:Ghost';
 save(root,c);
 assert.match(evidence(run(root)).details.error,/Unknown concept/);
 const root2=project(t),catalog=JSON.parse(fs.readFileSync(path.join(root2,'catalog.json'),'utf8'));
 catalog.concepts.push({iri:'urn:demo:Plain',label:'plain'});
 fs.writeFileSync(path.join(root2,'catalog.json'),JSON.stringify(catalog));
 const c2=config(root2);
 c2.gates[0].concept='urn:demo:Plain';
 save(root2,c2);
 assert.match(evidence(run(root2)).details.error,/no declared lifecycle/);
 const root3=project(t),catalog3=JSON.parse(fs.readFileSync(path.join(root3,'catalog.json'),'utf8'));
 catalog3.concepts[0].lifecycle.transitions.push({from:'draft',to:'nonexistent'});
 fs.writeFileSync(path.join(root3,'catalog.json'),JSON.stringify(catalog3));
 assert.match(evidence(run(root3)).details.error,/Invalid ontology catalog/);
});

test('stale observation fails closed',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",cases:[]}));');
 assert.match(evidence(run(root)).details.error,/Invalid or stale/);
});

test('stale acknowledgedOntology fails the state gate',t=>{
 const root=project(t),c=config(root);
 c.gates[0].acknowledgedOntology={id:'demo-contracts',version:'1',catalogSha256:'0'.repeat(64)};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings.find(f=>f.rule==='staleOntologyAck').fields[0].field,'catalogSha256');
});
