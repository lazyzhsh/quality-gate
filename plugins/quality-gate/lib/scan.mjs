import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const categories=['sast','api-authz','credential'];
const rank={info:0,low:1,medium:2,high:3,critical:4};
export function validateScan(g){
 check(g.level==='L4'&&categories.includes(g.category)&&Object.hasOwn(rank,g.blockAt),'scan requires L4, category and blockAt');
 check(g.acceptedFindings===undefined||Array.isArray(g.acceptedFindings)&&g.acceptedFindings.length<=200&&g.acceptedFindings.every(item=>text(item.rule)&&text(item.location)&&text(item.reason)&&(item.expiresAt===undefined||/^\d{4}-\d{2}-\d{2}$/.test(item.expiresAt)))&&new Set(g.acceptedFindings.map(item=>`${item.rule}\0${item.location}`)).size===g.acceptedFindings.length,'Invalid acceptedFindings');
}
export function runScan(g,root){
 const runId=randomUUID(),argv=g.argv.map(x=>x==='$NODE'?process.execPath:x);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,category:g.category})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Scan runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.tool)&&text(observed.version)&&observed.category===g.category&&text(observed.target)&&Array.isArray(observed.findings),'Invalid or stale scan observation');
  check(observed.findings.length<=100&&observed.findings.every(f=>text(f.id)&&text(f.rule)&&Object.hasOwn(rank,f.severity)&&text(f.location)&&text(f.description)),'Invalid scan findings');
  // 豁免按 rule+location 精确匹配；expiresAt 过期后 finding 自动恢复阻断
  const asOf=new Date().toISOString().slice(0,10);
  const acceptedFindings=g.acceptedFindings??[];
  const findings=observed.findings.map(f=>{
   const blocking=rank[f.severity]>=rank[g.blockAt];
   const acceptance=blocking?acceptedFindings.find(item=>item.rule===f.rule&&item.location===f.location):undefined;
   const expired=acceptance!==undefined&&acceptance.expiresAt!==undefined&&acceptance.expiresAt<asOf;
   return {...f,blocked:acceptance!==undefined&&!expired?false:blocking,...(acceptance!==undefined?{acceptedBy:{reason:acceptance.reason,expiresAt:acceptance.expiresAt??null}}:{}),...(expired?{acceptanceExpired:true}:{})};
  });
  return {status:findings.some(f=>f.blocked)?'FAIL':'PASS',details:{...execution,tool:observed.tool,version:observed.version,category:g.category,target:observed.target,blockAt:g.blockAt,asOf,...(acceptedFindings.length?{acceptedFindings}:{}),findings}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
