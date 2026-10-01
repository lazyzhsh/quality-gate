import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {proposalReport,validateProposals} from '../lib/proposals.mjs';
const cli=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
const demo=fileURLToPath(new URL('../examples/semantic-conflict-demo',import.meta.url));
function project(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-proposals-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(demo,root,{recursive:true});
 return root;
}
const config=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
const writeProposals=(root,proposals)=>fs.writeFileSync(path.join(root,'ontology-proposals.json'),JSON.stringify({schemaVersion:'0.1',proposals}));
const invoke=root=>spawnSync(process.execPath,[cli,'proposals',root],{encoding:'utf8',windowsHide:true});

test('accepted-and-pinned proposals report no drift',t=>{
 const root=project(t);
 writeProposals(root,[
  {id:'P-1',symbol:'AgreementRecord',candidateIri:'urn:demo:Agreement',confidence:0.91,source:'llm:demo-matcher',status:'accepted',note:'label match'},
  {id:'P-2',symbol:'CommitmentRecord',candidateIri:'urn:demo:Something',confidence:0.4,source:'llm:demo-matcher',status:'rejected'},
  {id:'P-3',symbol:'RefundRecord',candidateIri:'urn:demo:Refund',confidence:0.55,source:'llm:demo-matcher',status:'proposed'}
 ]);
 const result=invoke(root);
 assert.equal(result.status,0);
 const report=JSON.parse(result.stdout);
 assert.deepEqual(report.drift,[]);
 assert.deepEqual(report.byStatus,{proposed:1,accepted:1,rejected:1});
 assert.equal(report.pinnedMappingCount,2);
});

test('accepted-but-unpinned proposal exits non-zero with drift evidence',t=>{
 const root=project(t);
 writeProposals(root,[
  {id:'P-1',symbol:'AgreementRecord',candidateIri:'urn:demo:MutualAgreement',confidence:0.88,source:'llm:demo-matcher',status:'accepted'}
 ]);
 const result=invoke(root);
 assert.equal(result.status,1);
 const report=JSON.parse(result.stdout);
 assert.deepEqual(report.drift,[{proposalId:'P-1',symbol:'AgreementRecord',candidateIri:'urn:demo:MutualAgreement',reason:'accepted-not-pinned'}]);
 assert.match(result.stderr,/accepted-not-pinned/);
});

test('malformed registry fails closed at the CLI',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'ontology-proposals.json'),JSON.stringify({schemaVersion:'0.1',proposals:[{id:'P-1',symbol:'X',candidateIri:'urn:x',confidence:2,source:'llm',status:'proposed'}]}));
 const result=invoke(root);
 assert.equal(result.status,2);
 assert.match(result.stderr,/Invalid proposal entry/);
 const root2=project(t);
 writeProposals(root2,[{id:'P-1',symbol:'X',candidateIri:'urn:x',confidence:0.5,source:'llm',status:'proposed'},{id:'P-1',symbol:'Y',candidateIri:'urn:y',confidence:0.5,source:'llm',status:'proposed'}]);
 const duplicate=invoke(root2);
 assert.equal(duplicate.status,2);
 assert.match(duplicate.stderr,/Duplicate proposal id/);
});

test('pure report ignores pending proposals and maps only against semantic-alignment gates',t=>{
 const c=config(project(t));
 c.gates.push({id:'terms',kind:'terminology',level:'L3',enabled:true,stages:['close'],claimId:c.gates[0].claimId,terms:[{term:'agreement'}]});
 const report=proposalReport(c,validateProposals({schemaVersion:'0.1',proposals:[{id:'P-9',symbol:'anything',candidateIri:'urn:demo:Agreement',confidence:0.9,source:'llm',status:'accepted'}]}));
 assert.equal(report.pinnedMappingCount,2,'terminology gates contribute no pinned mappings');
 assert.equal(report.drift.length,1);
});
