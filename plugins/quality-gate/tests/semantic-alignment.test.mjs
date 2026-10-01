import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {run} from '../lib/kernel.mjs';
import {loadPinnedFiboCatalog} from '../lib/ontology.mjs';
import {failureReasons} from '../lib/summary.mjs';
const source=fileURLToPath(new URL('../examples/semantic-alignment-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-semantic-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('pinned FIBO concept matches live code annotation',t=>{const r=run(project(t));assert.equal(r.status,'PASS',JSON.stringify(r.evidence));assert.equal(r.evidence[0].details.findings[0].status,'PASS');});
test('concept confusion reports expected and actual IRIs',t=>{const root=project(t),p=path.join(root,'domain.mjs');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('/Agreement\n','/Commitment\n'));const r=run(root);assert.equal(r.status,'FAIL');assert.ok(r.evidence[0].details.findings[0].actualIris.some(iri=>/Commitment$/.test(iri)));});
test('stale semantic observation fails closed',t=>{const root=project(t);fs.writeFileSync(path.join(root,'runner.mjs'),'console.log(JSON.stringify({schemaVersion:"0.1",runId:"old",source:"fake",mappings:[]}));');assert.equal(run(root).status,'ERROR');});

const conflictDemo=fileURLToPath(new URL('../examples/semantic-conflict-demo',import.meta.url));
function conflictProject(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-semantic-conflict-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(conflictDemo,root,{recursive:true});return root;}

test('disjoint catalog accepts distinct symbols and clean annotations',t=>{
 const result=run(conflictProject(t));
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 assert.equal(result.evidence[0].details.findings.length,2);
 assert.ok(result.evidence[0].details.findings.every(finding=>finding.status==='PASS'));
});

test('conflicting annotation on one symbol fails with disjoint pair evidence',t=>{
 const root=conflictProject(t);
 fs.appendFileSync(path.join(root,'domain.mjs'),'\n// @ontology AgreementRecord urn:demo:Commitment\n');
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const finding=result.evidence[0].details.findings.find(f=>f.symbol==='AgreementRecord');
 assert.equal(finding.status,'FAIL');
 assert.deepEqual(finding.disjointPairs,[['urn:demo:Agreement','urn:demo:Commitment']]);
});

test('malformed disjointWith in catalog fails closed',t=>{
 const root=conflictProject(t);
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
 catalog.concepts[0].disjointWith='oops';
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 assert.equal(run(root).status,'ERROR');
});

const subsumptionDemo=fileURLToPath(new URL('../examples/semantic-subsumption-demo',import.meta.url));
function subsumptionProject(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-subsumption-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(subsumptionDemo,root,{recursive:true});return root;}
const subsumptionConfig=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const saveConfig=(root,c)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
const subsumptionCatalog=root=>JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const saveCatalog=(root,c)=>fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(c));

test('subsumed matchMode accepts subclass annotation with evidence chain',t=>{
 const r=run(subsumptionProject(t));
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 const finding=r.evidence[0].details.findings[0];
 assert.equal(finding.status,'PASS');
 assert.equal(finding.matchMode,'subsumed');
 assert.deepEqual(finding.subsumedMatches,[{iri:'urn:demo:BilateralAgreement',chain:['urn:demo:BilateralAgreement','urn:demo:Agreement']}]);
});

test('transitive subClassOf chains resolve through intermediate concepts',t=>{
 const root=subsumptionProject(t),c=subsumptionCatalog(root);
 c.concepts.push({iri:'urn:demo:MutualContract',label:'mutual contract',subClassOf:['urn:demo:BilateralAgreement']});
 saveCatalog(root,c);
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology ContractRecord urn:demo:MutualContract\nexport class ContractRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 assert.deepEqual(r.evidence[0].details.findings[0].subsumedMatches,[{iri:'urn:demo:MutualContract',chain:['urn:demo:MutualContract','urn:demo:BilateralAgreement','urn:demo:Agreement']}]);
});

test('strict matchMode rejects subclass annotation',t=>{
 const root=subsumptionProject(t),c=subsumptionConfig(root);
 delete c.gates[0].matchMode;
 saveConfig(root,c);
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=r.evidence[0].details.findings[0];
 assert.equal(finding.matchMode,'strict');
 assert.equal(finding.status,'FAIL');
});

test('subsumed matchMode still fails disjoint candidates',t=>{
 const root=subsumptionProject(t);
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology ContractRecord urn:demo:Commitment\nexport class ContractRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=r.evidence[0].details.findings[0];
 assert.deepEqual(finding.disjointPairs,[['urn:demo:Agreement','urn:demo:Commitment']]);
 assert.equal(finding.subsumedMatches,undefined);
});

test('cyclic subClassOf catalog fails closed',t=>{
 const root=subsumptionProject(t),c=subsumptionCatalog(root);
 c.concepts[0].subClassOf=['urn:demo:BilateralAgreement'];
 saveCatalog(root,c);
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence[0].details.error,/Cyclic subClassOf/);
});

test('dangling subClassOf target fails closed',t=>{
 const root=subsumptionProject(t),c=subsumptionCatalog(root);
 c.concepts[1].subClassOf=['urn:demo:Missing'];
 saveCatalog(root,c);
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence[0].details.error,/Unknown subClassOf target/);
});

test('invalid matchMode is rejected at validation',t=>{
 const root=subsumptionProject(t),c=subsumptionConfig(root);
 c.gates[0].matchMode='fuzzy';
 saveConfig(root,c);
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(r.error,/Invalid semantic matchMode/);
});

test('declared disjointness propagates to subclasses across both sides',t=>{
 const root=subsumptionProject(t);
 saveCatalog(root,{id:'demo',version:'1',concepts:[
  {iri:'urn:demo:A',label:'a',disjointWith:['urn:demo:B']},
  {iri:'urn:demo:B',label:'b'},
  {iri:'urn:demo:C',label:'c',subClassOf:['urn:demo:A']},
  {iri:'urn:demo:D',label:'d',subClassOf:['urn:demo:B']}
 ]});
 const c=subsumptionConfig(root);
 c.gates[0].mappings=[{symbol:'ContractRecord',expectedIri:'urn:demo:A'}];
 c.gates[0].matchMode='subsumed';
 saveConfig(root,c);
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology ContractRecord urn:demo:D\nexport class ContractRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=r.evidence[0].details.findings[0];
 assert.deepEqual(finding.disjointPairs,[['urn:demo:A','urn:demo:D']],'A⊥B 且 D⊆B 应推断 A⊥D');
});

test('pinned FIBO inferred conflict: MultilateralContract vs BilateralContract',t=>{
 const root=project(t),p=path.join(root,'.quality-gate.json');
 const c=JSON.parse(fs.readFileSync(p,'utf8'));
 c.gates[0].mappings=[{symbol:'AgreementRecord',expectedIri:'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/MultilateralContract'}];
 fs.writeFileSync(p,JSON.stringify(c));
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology AgreementRecord https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/BilateralContract\nexport class AgreementRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=r.evidence[0].details.findings[0];
 assert.deepEqual(finding.disjointPairs,[['https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/MultilateralContract','https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/BilateralContract']],'推断互斥经 Agreements 模块的 Multilateral⊥Bilateral 传播');
 assert.ok(r.evidence[0].details.provider.capabilities.includes('disjoint-inference'));
});

test('catalog declaring a class disjoint with its own ancestor fails closed',t=>{
 const root=subsumptionProject(t);
 saveCatalog(root,{id:'demo',version:'1',concepts:[
  {iri:'urn:demo:X',label:'x',subClassOf:['urn:demo:Y'],disjointWith:['urn:demo:Y']},
  {iri:'urn:demo:Y',label:'y'}
 ]});
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence[0].details.error,/Inconsistent ontology catalog/);
});

test('concept under two disjoint parents fails closed as self-disjoint',t=>{
 const root=subsumptionProject(t);
 saveCatalog(root,{id:'demo',version:'1',concepts:[
  {iri:'urn:demo:A',label:'a',disjointWith:['urn:demo:B']},
  {iri:'urn:demo:B',label:'b'},
  {iri:'urn:demo:C',label:'c',subClassOf:['urn:demo:A','urn:demo:B']}
 ]});
 const r=run(root);
 assert.equal(r.status,'ERROR');
 assert.match(r.evidence[0].details.error,/Inconsistent ontology catalog/);
});

test('pinned FIBO two-hop subclass chain passes subsumed mode',t=>{
 const root=project(t),c=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 c.gates[0].matchMode='subsumed';
 c.gates[0].mappings=[{symbol:'AgreementRecord',expectedIri:'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/Agreement'}];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology AgreementRecord https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/WrittenContract\nexport class AgreementRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence));
 const finding=r.evidence[0].details.findings[0];
 assert.deepEqual(finding.subsumedMatches,[{iri:'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/WrittenContract',chain:['https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/WrittenContract','https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/Contract','https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/Agreement']}]);
});

test('pinned FIBO verbal/written contract disjoint pair fails even subsumed',t=>{
 const root=project(t),c=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 c.gates[0].matchMode='subsumed';
 c.gates[0].mappings=[{symbol:'AgreementRecord',expectedIri:'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/WrittenContract'}];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));
 fs.writeFileSync(path.join(root,'domain.mjs'),'// @ontology AgreementRecord https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/VerbalContract\nexport class AgreementRecord {}\n');
 const r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=r.evidence[0].details.findings[0];
 assert.deepEqual(finding.disjointPairs,[['https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/WrittenContract','https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/VerbalContract']]);
});

test('tampered vendored FIBO source fails catalog integrity check',t=>{
 // 在临时副本上复现篡改（曾直接改写共享内核资产再还原——node --test 按文件并行多进程，
 // terminology 进程在篡改窗口读到脏文件即哈希失配，2026-10-01 根因修复）
 const copy=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-fibo-tamper-'));
 t.after(()=>fs.rmSync(copy,{recursive:true,force:true}));
 fs.cpSync(fileURLToPath(new URL('../assets/fibo/2026Q1',import.meta.url)),copy,{recursive:true});
 fs.appendFileSync(path.join(copy,'Contracts.rdf'),'\n<!-- tamper -->\n');
 assert.throws(()=>loadPinnedFiboCatalog(copy),/FIBO source integrity check failed: Contracts\.rdf/);
 // 生产路径的内核资产目录完好
 assert.doesNotThrow(()=>loadPinnedFiboCatalog());
});

test('stale acknowledgedOntology fails an otherwise passing mapping',t=>{
 const root=project(t),p=path.join(root,'.quality-gate.json');
 const c=JSON.parse(fs.readFileSync(p,'utf8'));
 c.gates[0].acknowledgedOntology={id:'fibo-fnd-agreements',version:'master_2026Q1',catalogSha256:'0'.repeat(64)};
 fs.writeFileSync(p,JSON.stringify(c));
 const r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence[0].details.findings[0].status,'PASS');
 const ack=r.evidence[0].details.ontologyAck;
 assert.equal(ack.rule,'staleOntologyAck');
 assert.deepEqual(ack.fields,[{field:'catalogSha256',expected:'0'.repeat(64),actual:'eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e'}]);
});

test('requireRuntimeOrigin demands a runtime binding consistent with the declaration',t=>{
 const root=project(t);
 const configPath=path.join(root,'.quality-gate.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 // demo runner 现回报 annotation+runtime 双来源一致：默认与 requireRuntimeOrigin 下均 PASS
 let r=run(root);
 assert.equal(r.status,'PASS');
 assert.deepEqual(r.evidence[0].details.findings[0].origins,{annotation:1,runtime:1});
 config.gates[0].requireRuntimeOrigin=true;fs.writeFileSync(configPath,JSON.stringify(config));
 r=run(root);
 assert.equal(r.status,'PASS',JSON.stringify(r.evidence[0].details.findings));
 // 仅注解来源（无 runtime 回报）：requireRuntimeOrigin 下 FAIL 指名 runtime-unbound
 fs.writeFileSync(path.join(root,'runner.mjs'),"import fs from 'node:fs';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input),source=fs.readFileSync('domain.mjs','utf8');const mappings=[...source.matchAll(/^\\/\\/ @ontology (\\S+) (\\S+)$/gm)].map(m=>({symbol:m[1],iri:m[2],location:'domain.mjs',origin:'annotation'}));console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'annotations only',mappings}));");
 r=run(root);
 assert.equal(r.status,'FAIL');
 const finding=r.evidence[0].details.findings[0];
 assert.equal(finding.runtimeUnbound,true);
 assert.deepEqual(finding.origins,{annotation:1,runtime:0});
 assert.deepEqual(failureReasons(r.evidence[0]),['符号 AgreementRecord: 无运行时来源绑定（requireRuntimeOrigin，注解≠运行时行为）']);
 // runtime 来源与声明不一致（混淆到 Commitment）：FAIL 且 runtime-unbound 同样指名
 fs.writeFileSync(path.join(root,'runner.mjs'),"import fs from 'node:fs';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input),source=fs.readFileSync('domain.mjs','utf8');const mappings=[...source.matchAll(/^\\/\\/ @ontology (\\S+) (\\S+)$/gm)].map(m=>({symbol:m[1],iri:m[2],location:'domain.mjs',origin:'annotation'}));mappings.push({symbol:'AgreementRecord',iri:'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/Commitment',location:'runtime:use case',origin:'runtime'});console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'annotation + confused runtime',mappings}));");
 r=run(root);
 assert.equal(r.status,'FAIL');
 assert.equal(r.evidence[0].details.findings[0].runtimeUnbound,true);
 // 非法 origin 枚举 ERROR；requireRuntimeOrigin 非布尔 ERROR
 fs.writeFileSync(path.join(root,'runner.mjs'),"import fs from 'node:fs';let input='';for await(const chunk of process.stdin)input+=chunk;const request=JSON.parse(input);console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'bad origin',mappings:[{symbol:'AgreementRecord',iri:'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/Agreement',location:'x',origin:'guess'}]}));");
 assert.equal(run(root).status,'ERROR');
 config.gates[0].requireRuntimeOrigin='yes';fs.writeFileSync(configPath,JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
});
