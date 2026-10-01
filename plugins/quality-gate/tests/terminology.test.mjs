import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/terminology-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-terminology-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const save=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const catalog=root=>JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const saveCatalog=(root,c)=>fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(c));
const evidence=r=>r.evidence[0];

test('terms resolve uniquely by prefLabel and altLabel',t=>{
 const r=run(project(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.conceptCount,2);
 assert.equal(evidence(r).details.termCount,4);
 assert.deepEqual(evidence(r).details.findings,[]);
});

test('duplicate prefLabel across concepts fails with both IRIs',t=>{
 const root=project(t),c=catalog(root);
 c.concepts[1].label=c.concepts[0].label;
 saveCatalog(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings[0];
 assert.equal(finding.rule,'duplicateLabel');
 assert.equal(finding.label,'agreement');
 assert.deepEqual(finding.concepts,['urn:demo:Agreement','urn:demo:Commitment']);
});

test('term matching a prefLabel and a foreign altLabel is ambiguous',t=>{
 const root=project(t),c=catalog(root);
 c.concepts[1].altLabels=['agreement'];
 saveCatalog(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(x=>x.rule==='ambiguousTerm');
 assert.equal(finding.term,'agreement');
 assert.deepEqual(finding.matches,['urn:demo:Agreement','urn:demo:Commitment']);
});

test('term with no concept match is reported unmatched',t=>{
 const root=project(t),c=config(root);
 c.gates[0].terms.push({term:'refund'});
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(x=>x.rule==='unmatchedTerm');
 assert.equal(finding.term,'refund');
 assert.deepEqual(finding.matches,[]);
});

test('catalog-only integrity check runs without declared terms',t=>{
 const root=project(t),c=config(root);
 delete c.gates[0].terms;
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.termCount,0);
});

test('skeleton provider fails closed as ERROR',t=>{
 const root=project(t),c=config(root);
 c.ontology={type:'fibo-skeleton'};
 save(root,c);
 assert.equal(run(root).status,'ERROR');
});

test('malformed altLabels in catalog fails closed',t=>{
 const root=project(t),c=catalog(root);
 c.concepts[0].altLabels='oops';
 saveCatalog(root,c);
 assert.equal(run(root).status,'ERROR');
});

test('duplicate or empty declared terms are rejected at validation',t=>{
 const root=project(t),c=config(root);
 c.gates[0].terms.push({term:'agreement'});
 save(root,c);
 const duplicated=run(root);
 assert.equal(duplicated.status,'ERROR');
 assert.match(duplicated.error,/Duplicate terminology term/);
 const root2=project(t),c2=config(root2);
 c2.gates[0].terms.push({term:' '});
 save(root2,c2);
 assert.match(run(root2).error,/Invalid terminology terms/);
});

test('pinned FIBO vocabulary resolves terms without ambiguity',t=>{
 const root=project(t),c=config(root);
 c.gates[0].terms=[{term:'agreement'},{term:'written contract'},{term:'verbal contract'}];
 c.ontology={type:'fibo-pinned',expectedCatalogSha256:'eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e'};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.conceptCount,52);
 assert.equal(evidence(r).details.termCount,3);
 const root2=project(t),c2=config(root2);
 c2.gates[0].terms=[{term:'refund'}];
 c2.ontology={type:'fibo-pinned',expectedCatalogSha256:'eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e'};
 save(root2,c2);
 const r2=run(root2);
 assert.equal(r2.status,'FAIL');
 assert.equal(evidence(r2).details.findings[0].rule,'unmatchedTerm');
});

test('matching acknowledgedOntology confirmation passes',t=>{
 const root=project(t),c=config(root);
 const digest=createHash('sha256').update(fs.readFileSync(path.join(root,'catalog.json'))).digest('hex');
 c.gates[0].acknowledgedOntology={id:'demo-agreements',version:'1',catalogSha256:digest};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.equal(evidence(r).details.findings.length,0);
});

test('stale acknowledgedOntology confirmation fails and names the drifted fields',t=>{
 const root=project(t),c=config(root);
 const digest=createHash('sha256').update(fs.readFileSync(path.join(root,'catalog.json'))).digest('hex');
 c.gates[0].acknowledgedOntology={id:'demo-agreements',version:'2',catalogSha256:digest};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(x=>x.rule==='staleOntologyAck');
 assert.deepEqual(finding.fields,[{field:'version',expected:'2',actual:'1'}]);
});

test('malformed acknowledgedOntology is rejected at validation',t=>{
 const root=project(t),c=config(root);
 c.gates[0].acknowledgedOntology={id:'demo-agreements',version:'1'};
 save(root,c);
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(r.error,/Invalid acknowledgedOntology/);
});

test('v1.22 multilingual terms match by language tag and expose cross-language ambiguity',t=>{
 const root=project(t),c=catalog(root);
 // 中文 altLabel 与英文 label 同形（"agreement"）：跨语言重名——不带 lang 的术语命中两概念即歧义
 c.concepts[1].altLabels.push({value:'agreement',lang:'zh'});
 saveCatalog(root,c);
 const base=config(root);
 base.gates[0].terms=[{term:'agreement'}];
 save(root,base);
 let r=run(root);
 assert.equal(r.status,'FAIL');
 let finding=evidence(r).details.findings.find(x=>x.rule==='ambiguousTerm');
 assert.deepEqual(finding.matches.sort(),['urn:demo:Agreement','urn:demo:Commitment']);
 // 带 lang 限定即无歧义：zh 命中 Commitment（其 zh altLabel）；严格制——en 未标注条目不命中（语言未定标签由不带 lang 的术语查询）
 base.gates[0].terms=[{term:'agreement',lang:'zh'}];
 save(root,base);
 r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(evidence(r).details.findings));
 base.gates[0].terms=[{term:'agreement',lang:'en'}];
 save(root,base);
 r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings.find(x=>x.rule==='unmatchedTerm').lang,'en');
 // 语言限定找不到（法语音译缺失）即 unmatched
 base.gates[0].terms=[{term:'agreement',lang:'fr'}];
 save(root,base);
 r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(evidence(r).details.findings.find(x=>x.rule==='unmatchedTerm').term,'agreement');
});

test('v1.22 S14 duplicate labels are scoped per language (cross-language homonyms legal)',t=>{
 const root=project(t),c=catalog(root);
 // 目录完整性口径（清空术语）：同一 "agreement" 在未定语言（label）与 zh（altLabel）——不同语言不冲突
 const base=config(root);delete base.gates[0].terms;save(root,base);
 c.concepts[1].altLabels.push({value:'agreement',lang:'zh'});
 saveCatalog(root,c);
 let r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(evidence(r).details.findings));
 // 再给 Agreement 加 zh altLabel 同形——同语言两概念重名即 S14 违规
 c.concepts[0].altLabels.push({value:'agreement',lang:'zh'});
 saveCatalog(root,c);
 r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=evidence(r).details.findings.find(x=>x.rule==='duplicateLabel');
 assert.equal(finding.label,'agreement');
 assert.equal(finding.lang,'zh');
 assert.deepEqual(finding.concepts.sort(),['urn:demo:Agreement','urn:demo:Commitment']);
});

test('v1.22 malformed language-tagged altLabels fail closed',t=>{
 const root=project(t),c=catalog(root);
 c.concepts[0].altLabels.push({value:'协议',lang:'zh-CN-x-非法'});
 saveCatalog(root,c);
 assert.equal(run(root).status,'ERROR');
});
