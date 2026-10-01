import fs from 'node:fs';
import path from 'node:path';
import {projectFile} from './kernel.mjs';
import {resolveReference,filledReference} from './references.mjs';

// ADR frontmatter（v1.19 轨道 B）：MADR/Nygard 兼容的平面 YAML 子集（key: value 行，
// 已知键 status/date/deciders/supersedes/superseded-by；非完整 YAML 解析器——嵌套/引号
// 结构不支持，如实边界）。声明即核验：文件存在+防逃逸+frontmatter 可解析+状态映射对账。
const ADR_KEYS=['status','date','deciders','supersedes','superseded-by'];
const ADR_STATUS_BY_REGISTER={open:'proposed',resolved:'accepted',deferred:'deferred'};
function parseAdrFrontmatter(content,file){
 const lines=content.split(/\r?\n/);
 check(lines[0]?.trim()==='---',`ADR frontmatter must open with --- : ${file}`);
 const end=lines.findIndex((line,index)=>index>0&&line.trim()==='---');
 check(end!==-1,`ADR frontmatter never closes : ${file}`);
 const fields={};
 for(const line of lines.slice(1,end)){
  if(line.trim()==='')continue;
  const match=/^([A-Za-z-]+):\s*(.*)$/.exec(line);
  check(match!==null,`ADR frontmatter line is not key: value : ${file}: ${line.slice(0,40)}`);
  const [,key,value]=match;
  check(ADR_KEYS.includes(key),`ADR frontmatter unknown key "${key}" : ${file}`);
  check(text(value),`ADR frontmatter empty value for "${key}" : ${file}`);
  fields[key]=value;
 }
 check(fields.status!==undefined&&['proposed','accepted','deferred','deprecated','superseded'].includes(fields.status),`ADR frontmatter requires status: proposed|accepted|deferred|deprecated|superseded : ${file}`);
 return fields;
}

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export function runDecisions(g,root,config,evidence){
 check(['L0','L5'].includes(g.level),'decisions requires L0 or L5');
 const data=JSON.parse(fs.readFileSync(projectFile(root,g.file),'utf8').replace(/^\uFEFF/,''));
 check(Array.isArray(data.decisions)&&data.decisions.length>0&&data.decisions.length<=100,'Expected 1..100 decisions');
 check(data.decisions.every(d=>text(d.id)&&text(d.question)&&['resolved','open','deferred'].includes(d.status)&&text(d.owner)&&text(d.resolution)&&filledReference(d.evidence)),'Invalid decision register');
 // deferred 闭合期限（W1）：悬置决策必须带 revisitBy 期限，缺期限即 ERROR fail-closed
 check(data.decisions.every(d=>d.status!=='deferred'||/^\d{4}-\d{2}-\d{2}$/.test(d.revisitBy??'')),'Deferred decision requires revisitBy (YYYY-MM-DD)');
 check(new Set(data.decisions.map(d=>d.id)).size===data.decisions.length,'Duplicate decision');
 for(const decision of data.decisions){
  check(decision.affectsPaths===undefined||Array.isArray(decision.affectsPaths)&&decision.affectsPaths.length<=50&&decision.affectsPaths.every(text)&&new Set(decision.affectsPaths).size===decision.affectsPaths.length,'Invalid decision affectsPaths');
  check(decision.affectsGateIds===undefined||Array.isArray(decision.affectsGateIds)&&decision.affectsGateIds.length<=50&&decision.affectsGateIds.every(text)&&new Set(decision.affectsGateIds).size===decision.affectsGateIds.length,'Invalid decision affectsGateIds');
  check(decision.adrRef===undefined||decision.adrRef!==null&&typeof decision.adrRef==='object'&&!Array.isArray(decision.adrRef)&&Object.keys(decision.adrRef).length===1&&text(decision.adrRef.file)&&!path.isAbsolute(decision.adrRef.file),'Invalid decision adrRef');
 }
 const referenceChecks=[],affectsChecks=[];
 for(const decision of data.decisions){
  if(decision.evidence&&typeof decision.evidence==='object')referenceChecks.push({decisionId:decision.id,field:'evidence',...resolveReference(decision.evidence,root,config,evidence)});
  for(const target of decision.affectsPaths??[]){
   const relative=path.relative(root,path.resolve(root,target));
   check(text(target)&&!path.isAbsolute(target)&&relative!=='..'&&!relative.startsWith('..'+path.sep),'Decision affectsPath escapes project');
   let status='MISSING';
   try{status=fs.statSync(projectFile(root,target)).isFile()?'FOUND':'MISSING';}
   catch(error){if(error.code!=='ENOENT')throw error;}
   affectsChecks.push({decisionId:decision.id,type:'path',target,status});
  }
  for(const id of decision.affectsGateIds??[]){
   check(config.gates.some(item=>item.id===id),`Unknown decision affectsGateId: ${id}`);
   affectsChecks.push({decisionId:decision.id,type:'gate',target:id,status:evidence.find(item=>item.gateId===id)?.status??'SKIP'});
  }
 }
 const allowDeferred=g.level==='L0'&&g.allowDeferred===true;
 const requireProvenance=g.requireProvenance===true;
 const requireAdrRefs=g.requireAdrRefs===true;
 // ADR 绑定核验（声明即核验）：存在+防逃逸+frontmatter 解析（畸形 ERROR fail-closed）+
 // 状态映射对账（不符 FAIL）+ supersedes/superseded-by 存在性与互指核验
 const adrChecks=[];
 const adrFields=new Map();
 for(const decision of data.decisions){
  if(decision.adrRef===undefined)continue;
  const relative=path.relative(root,path.resolve(root,decision.adrRef.file));
  check(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Decision adrRef escapes project');
  let entry;
  try{entry={decisionId:decision.id,file:decision.adrRef.file,status:'MISSING'};}
  catch(error){throw error;}
  let content=null;
  try{content=fs.readFileSync(projectFile(root,decision.adrRef.file),'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(content===null){adrChecks.push(entry);continue;}
  const fields=parseAdrFrontmatter(content,decision.adrRef.file);
  adrFields.set(decision.id,fields);
  entry={decisionId:decision.id,file:decision.adrRef.file,status:'verified',adrStatus:fields.status,...(fields.supersedes!==undefined?{supersedes:fields.supersedes}:{}),...(fields['superseded-by']!==undefined?{supersededBy:fields['superseded-by']}:{})};
  const chainRefs=[...(fields.supersedes??'').split(/[，,\s]+/).filter(Boolean).map(ref=>({ref,from:'supersedes'})),...(fields['superseded-by']??'').split(/[，,\s]+/).filter(Boolean).map(ref=>({ref,from:'superseded-by'}))];
  for(const {ref,from} of chainRefs){
   const chainRelative=path.relative(root,path.resolve(path.dirname(path.join(root,decision.adrRef.file)),ref));
   check(chainRelative!=='..'&&!chainRelative.startsWith('..'+path.sep)&&!path.isAbsolute(chainRelative),'ADR chain reference escapes project');
   let chainContent=null;
   try{chainContent=fs.readFileSync(projectFile(root,chainRelative),'utf8');}
   catch(error){if(error.code!=='ENOENT')throw error;}
   if(chainContent===null){entry.status='chain-missing';continue;}
   // 互指核验（按文件基名）：A.superseded-by=B ⇒ B.supersedes 含 A；A.supersedes=B ⇒ B.superseded-by 含 A
   const other=parseAdrFrontmatter(chainContent,chainRelative);
   const selfBase=path.basename(decision.adrRef.file);
   const otherField=from==='supersedes'?other['superseded-by']??'':other.supersedes??'';
   if(!otherField.split(/[，,\s]+/).some(name=>path.basename(name)===selfBase))entry.status='chain-mismatch';
  }
  adrChecks.push(entry);
 }
 const today=new Date().toISOString().slice(0,10);
 const decisions=data.decisions.map(d=>{
  const reasons=[];
  // 证据强化（W1）：requireProvenance 下 evidence 必须是可核验的结构化引用，纯文本不再放行
  if(requireProvenance&&!(d.evidence&&typeof d.evidence==='object'))reasons.push('provenance-required');
  if(requireAdrRefs&&d.adrRef===undefined)reasons.push('adr-ref-required');
  const adrEntry=adrChecks.find(item=>item.decisionId===d.id);
  if(adrEntry?.status==='MISSING')reasons.push('adr-ref-missing');
  if(adrEntry?.status==='chain-missing')reasons.push('adr-chain-missing');
  if(adrEntry?.status==='chain-mismatch')reasons.push('adr-chain-mismatch');
  const adrFieldsForDecision=adrFields.get(d.id);
  if(adrFieldsForDecision&&adrFieldsForDecision.status!==ADR_STATUS_BY_REGISTER[d.status])reasons.push('adr-status-mismatch');
  // 悬置决策逾期未复审（W1）：revisitBy 已过即该项 FAIL
  if(d.status==='deferred'&&d.revisitBy<today)reasons.push('revisit-overdue');
  const gateStatus=(d.status==='resolved'||(d.status==='deferred'&&allowDeferred))&&reasons.length===0?'PASS':'FAIL';
  return {id:d.id,question:d.question,status:d.status,owner:d.owner,resolution:d.resolution,evidence:d.evidence,...(d.revisitBy!==undefined?{revisitBy:d.revisitBy}:{}),...(d.adrRef!==undefined?{adrRef:d.adrRef}:{}),...(adrFieldsForDecision?{adrStatus:adrFieldsForDecision.status}:{}),...(reasons.length?{reasons}:{}),gateStatus};
 });
 const unresolved=decisions.filter(d=>d.gateStatus!=='PASS').map(d=>d.id);
 const passed=unresolved.length===0
  &&referenceChecks.every(item=>item.status==='PASS'||item.status==='FOUND')
  &&affectsChecks.every(item=>item.type!=='path'||item.status==='FOUND');
 return {status:passed?'PASS':'FAIL',details:{decisionCount:decisions.length,allowDeferred,requireProvenance,requireAdrRefs,asOf:today,decisions,unresolved,referenceChecks,affectsChecks,...(adrChecks.length?{adrChecks}:{})}};
}
