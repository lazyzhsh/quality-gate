import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const source=fileURLToPath(new URL('../examples/engineering-demo',import.meta.url));
export function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-engineering-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
export const engineering=result=>result.evidence.find(evidence=>evidence.gateId==='engineering');
export const configOf=root=>JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
export const saveConfig=(root,config)=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
export const unitCheck=config=>config.gates.find(gate=>gate.id==='engineering').checks.find(check=>check.id==='unit');
export const declareExpected=(root,expected)=>{
 const config=configOf(root);
 const gate=config.gates.find(gate=>gate.id==='engineering');
 const unit=gate.checks.find(check=>check.id==='unit');
 gate.checks=[unit];gate.requiredChecks=['unit'];
 unit.expected=expected;saveConfig(root,config);
};
export const focusChecks=(root,ids)=>{
 const config=configOf(root);
 const gate=config.gates.find(gate=>gate.id==='engineering');
 gate.checks=gate.checks.filter(check=>ids.includes(check.id));
 gate.requiredChecks=[...ids];saveConfig(root,config);
};
