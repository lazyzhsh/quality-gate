import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {operators,validateCondition,conditionsMet,evaluateOperator} from './assertions.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export function validateInvariant(g){
 check(['L2','L3'].includes(g.level),'invariant requires L2 or L3');
 check(Array.isArray(g.assertions)&&g.assertions.length>0&&g.assertions.length<=50,'Expected 1..50 invariant assertions');
 check(g.assertions.every(a=>text(a.id)&&text(a.left)&&operators.includes(a.operator)&&((text(a.right)&&!Object.hasOwn(a,'value'))||(!Object.hasOwn(a,'right')&&Object.hasOwn(a,'value')))&&(!a.when||(Array.isArray(a.when)?a.when.every(condition=>{validateCondition(condition);return true;}):(validateCondition(a.when),true)))),'Invalid invariant assertion');
 check(new Set(g.assertions.map(a=>a.id)).size===g.assertions.length,'Duplicate invariant assertion');
}

export function runInvariant(g,root){
 const runId=randomUUID();const argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Invariant runner failed'}};
 try{
  const observation=JSON.parse(result.stdout);
  check(object(observation)&&observation.schemaVersion==='0.1'&&observation.runId===runId&&text(observation.source)&&object(observation.values),'Invalid or stale invariant observation');
  const assertions=g.assertions.map(a=>{
   if(a.when&&!conditionsMet(a.when,observation.values))return {id:a.id,status:'SKIP',reason:'Condition not met',...(a.when?{when:a.when}:{})};
   check(Object.hasOwn(observation.values,a.left),`Missing invariant operand: ${a.left}`);
   if(a.right)check(Object.hasOwn(observation.values,a.right),`Missing invariant operand: ${a.right}`);
   const left=observation.values[a.left],right=a.right?observation.values[a.right]:a.value;
   const pass=evaluateOperator(left,a.operator,right);
   return {id:a.id,operator:a.operator,leftField:a.left,rightField:a.right??null,left,right,status:pass?'PASS':'FAIL',...(a.when?{when:a.when}:{})};
  });
  return {status:assertions.some(a=>a.status==='FAIL')?'FAIL':assertions.some(a=>a.status==='PASS')?'PASS':'SKIP',details:{...execution,source:observation.source,values:observation.values,assertions}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
