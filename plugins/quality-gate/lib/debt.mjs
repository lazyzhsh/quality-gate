import fs from 'node:fs';
import {projectFile} from './kernel.mjs';
import {describeReference,resolveReference} from './references.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};

export function runDebt(g,root,config,evidence){
 check(g.level==='L5','debt requires L5');
 const data=JSON.parse(fs.readFileSync(projectFile(root,g.file),'utf8'));
 check(data.none===undefined||typeof data.none==='boolean','Invalid none declaration');
 check(Array.isArray(data.items)&&data.items.length<=100&&data.items.every(x=>text(x.id)&&text(x.description)&&text(x.owner)&&text(x.impact)&&text(x.repayment)&&['low','medium','high','critical'].includes(x.severity)&&['open','resolved'].includes(x.status)&&/^\d{4}-\d{2}-\d{2}$/.test(x.dueDate)),'Invalid debt register');
 check(new Set(data.items.map(x=>x.id)).size===data.items.length,'Duplicate debt ID');
 // resolved 项可选 evidence：结构化引用（{file}/{gateId}）强制核验，纯文本仅登记
 for(const item of data.items)if(item.evidence!==undefined&&item.evidence!==null&&typeof item.evidence==='object'&&!Array.isArray(item.evidence))describeReference(item.evidence);
 const referenceChecks=[];
 for(const item of data.items)if(item.evidence!==undefined&&item.evidence!==null&&typeof item.evidence==='object')referenceChecks.push({itemId:item.id,field:'evidence',...resolveReference(item.evidence,root,config,evidence)});
 const today=new Date().toISOString().slice(0,10);
 const items=data.items.map(x=>{const reasons=[];if(x.status==='open'&&['high','critical'].includes(x.severity))reasons.push('release-blocking-severity');if(x.status==='open'&&x.dueDate<today)reasons.push('overdue');return {...x,reasons,gateStatus:reasons.length?'FAIL':'PASS'};});
 const referencePassed=referenceChecks.every(item=>item.status==='PASS'||item.status==='FOUND');
 // 空登记显式化（W1）：与 assumptions 同语义，裸空数组不放行
 const registerIssues=[];
 if(data.items.length===0&&data.none!==true)registerIssues.push('empty-register-undeclared');
 if(data.none===true&&data.items.length>0)registerIssues.push('none-with-entries');
 return {status:items.every(x=>x.gateStatus==='PASS')&&referencePassed&&registerIssues.length===0?'PASS':'FAIL',details:{asOf:today,none:data.none===true,...(registerIssues.length?{registerIssues}:{}),items,...(referenceChecks.length?{referenceChecks}:{})}};
}
