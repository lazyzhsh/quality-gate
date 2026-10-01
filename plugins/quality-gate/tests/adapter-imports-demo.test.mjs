import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';

const scenario=(name,extraArgs=[])=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../examples/adapter-imports-demo/scenario.mjs',import.meta.url)),name,...extraArgs],{encoding:'utf8',windowsHide:true,timeout:60000});
 return {code:result.status,report:JSON.parse(result.stdout),stderr:result.stderr};
};

test('adapter-imports-demo scenario ok passes with bidirectional coverage',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-adapter-demo-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {code,report,stderr}=scenario('ok');
 assert.equal(code,0,stderr);
 assert.equal(report.status,'PASS');
 const languages=report.evidence[0].details.importObservations.languages;
 assert.deepEqual(languages.java.coverageGaps,[]);
 assert.ok(languages.java.extractedCount>=3);
 if(languages.python){
  assert.deepEqual(languages.python.coverageGaps,[]);
  assert.ok(languages.python.extraReported.length===0);
 }
});

test('adapter-imports-demo scenario ghost fails naming both hallucinated imports',t=>{
 const {code,report,stderr}=scenario('ghost');
 assert.equal(code,1);
 assert.equal(report.status,'FAIL');
 const languages=report.evidence[0].details.importObservations.languages;
 const javaUnresolved=languages.java.unresolved.map(entry=>entry.module);
 assert.deepEqual(javaUnresolved,['com.ghost.Missing']);
 if(languages.python)assert.ok(languages.python.unresolved.some(entry=>entry.module==='ghost_module'),JSON.stringify(languages.python));
});

test('adapter-imports-demo scenario trim fails on the coverage gap (anti-concealment)',t=>{
 const {code,report}=scenario('trim');
 assert.equal(code,1);
 assert.equal(report.status,'FAIL');
 const languages=report.evidence[0].details.importObservations.languages;
 assert.deepEqual(languages.java.coverageGaps,[{module:'com.example.Order',locations:[`src/main/java/com/example/Main.java:4`]}]);
});

test('adapter-imports-demo fails closed when closed without running the adapters',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-adapter-demo-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(fileURLToPath(new URL('../examples/adapter-imports-demo/',import.meta.url)),root,{recursive:true});
 const report=run(root);
 assert.equal(report.status,'ERROR');
 assert.match(String(report.evidence[0].details),/import observation file missing/);
});
