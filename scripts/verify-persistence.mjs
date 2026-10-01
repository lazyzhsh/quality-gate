import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../plugins/quality-gate/lib/kernel.mjs';
const base=fileURLToPath(new URL('../',import.meta.url));
const demo=path.join(base,'plugins/quality-gate/examples/persistence-demo');
const evidence=path.join(base,'evidence/v0.2');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-verification-'));
const summary=[];
try {
 fs.copyFileSync(path.join(demo,'runner.py'),path.join(tmp,'runner.py'));
 const config=JSON.parse(fs.readFileSync(path.join(demo,'.quality-gate.json'),'utf8'));
 for(const [mode,expected] of [['normal','PASS'],['wrong-value','FAIL'],['missing-row','FAIL']]) {
  config.gates[0].argv=[process.env.QGATE_PYTHON??'python','runner.py',mode];
  fs.writeFileSync(path.join(tmp,'.quality-gate.json'),JSON.stringify(config));
  const result=run(tmp,'close',evidence);
  summary.push({mode,expected,actual:result.status,report:result.reportPath});
  console.log(`${mode}: ${result.status} (expected ${expected}) ${result.reportPath}`);
 }
 fs.writeFileSync(path.join(evidence,'matrix.json'),JSON.stringify(summary,null,2));
 if(summary.some(x=>x.expected!==x.actual))process.exitCode=1;
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
