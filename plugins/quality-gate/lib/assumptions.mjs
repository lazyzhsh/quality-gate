import fs from 'node:fs';
import {projectFile} from './kernel.mjs';
import {describeReference,resolveReference,filledReference} from './references.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const referenceFields=['source','evidence'];

export function runAssumptions(g,root,config,evidence){
 const data=JSON.parse(fs.readFileSync(projectFile(root,g.file),'utf8').replace(/^\uFEFF/,''));
 check(data.none===undefined||typeof data.none==='boolean','Invalid none declaration');
 check(Array.isArray(data.assumptions),'assumptions array required');
 check(data.assumptions.every(x=>text(x.id)&&text(x.statement)&&['confirmed','open','rejected'].includes(x.status)),'Invalid assumption');
 check(new Set(data.assumptions.map(x=>x.id)).size===data.assumptions.length,'Duplicate assumption');
 for(const assumption of data.assumptions)for(const field of referenceFields){
  const value=assumption[field];
  if(value!==undefined&&value!==null&&typeof value==='object'&&!Array.isArray(value))describeReference(value);
 }
 if(g.requireProvenance)check(data.assumptions.every(x=>filledReference(x.source)&&filledReference(x.evidence)&&text(x.impact)&&text(x.risk)&&text(x.resolution)),'Assumption provenance required');
 const referenceChecks=[];
 for(const assumption of data.assumptions)for(const field of referenceFields){
  const value=assumption[field];
  if(value!==undefined&&value!==null&&typeof value==='object')referenceChecks.push({assumptionId:assumption.id,field,...resolveReference(value,root,config,evidence)});
 }
 const unresolved=data.assumptions.filter(x=>x.status!=='confirmed').map(x=>x.id);
 const referencePassed=referenceChecks.every(item=>item.status==='PASS'||item.status==='FOUND');
 // 空登记显式化（W1）：裸空数组是 vacuous PASS，须 "none": true 声明才放行；none:true 与非空条目自相矛盾
 const registerIssues=[];
 if(data.assumptions.length===0&&data.none!==true)registerIssues.push('empty-register-undeclared');
 if(data.none===true&&data.assumptions.length>0)registerIssues.push('none-with-entries');
 return {status:unresolved.length===0&&referencePassed&&registerIssues.length===0?'PASS':'FAIL',details:{count:data.assumptions.length,requireProvenance:g.requireProvenance===true,none:data.none===true,...(registerIssues.length?{registerIssues}:{}),assumptions:data.assumptions,unresolved,referenceChecks}};
}
