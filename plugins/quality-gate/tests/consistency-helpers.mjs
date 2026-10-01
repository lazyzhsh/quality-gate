import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../examples/ledger-demo',import.meta.url));
export function project(t,scenario,opts){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-consistency-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(source,root,{recursive:true});
 if(scenario)process.env.QGATE_SCENARIO=scenario;else delete process.env.QGATE_SCENARIO;
 if(opts)focusConsistency(root,opts.ids??null,opts);
 return root;
}
export const gate=result=>result.evidence.find(e=>e.gateId==='ledger-consistency');
export const check=(result,id)=>gate(result).details.checks.find(c=>c.id===id);

// 聚焦助手：只保留被断言的 check/门禁（停用侧级联清 risk 与孤儿 claim）——每次 run 少付未被断言 check 的 argv spawn
export function focusConsistency(root,ids,{consistency=true,contract=true}={}){
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 if(!consistency){
  config.gates=config.gates.filter(g=>g.id!=='ledger-consistency');
  config.risks=(config.risks||[]).filter(r=>r.gateId!=='ledger-consistency');
 }else if(ids){
  const gate=config.gates.find(g=>g.id==='ledger-consistency');
  gate.checks=gate.checks.filter(c=>ids.includes(c.id));
  gate.requiredChecks=[...ids];
 }
 if(!contract){
  config.gates=config.gates.filter(g=>g.id!=='contract-compat');
  config.risks=(config.risks||[]).filter(r=>r.gateId!=='contract-compat');
 }
 config.claims=config.claims.filter(c=>config.gates.some(g=>g.claimId===c.id));
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
}
