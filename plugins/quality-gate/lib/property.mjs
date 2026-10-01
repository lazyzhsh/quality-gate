import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {operators,validateCondition,conditionsMet,evaluateOperator} from './assertions.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export function validateProperty(g){
 check(g.level==='L3'&&Number.isInteger(g.seed)&&Number.isInteger(g.minCases)&&g.minCases>0&&g.minCases<=500,'property requires L3, seed and 1..500 minCases');
 check(Array.isArray(g.assertions)&&g.assertions.length>0&&g.assertions.length<=20&&g.assertions.every(a=>text(a.id)&&text(a.left)&&operators.includes(a.operator)&&((text(a.right)&&!Object.hasOwn(a,'value'))||(!Object.hasOwn(a,'right')&&Object.hasOwn(a,'value')))&&(!a.when||(Array.isArray(a.when)?a.when.every(condition=>{validateCondition(condition);return true;}):(validateCondition(a.when),true)))),'Invalid property assertions');
 check(new Set(g.assertions.map(a=>a.id)).size===g.assertions.length,'Duplicate property assertion');
 check(Array.isArray(g.allowedTransitions)&&g.allowedTransitions.length>0&&g.allowedTransitions.length<=50&&g.allowedTransitions.every(t=>text(t.from)&&text(t.to)),'Invalid allowedTransitions');
}

export function runProperty(g,root){
 const runId=randomUUID(),argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,seed:g.seed,minCases:g.minCases})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Property runner failed'}};
 try{
  const observation=JSON.parse(result.stdout);
  check(object(observation)&&observation.schemaVersion==='0.1'&&observation.runId===runId&&observation.seed===g.seed&&text(observation.source)&&Array.isArray(observation.cases)&&observation.cases.length>=g.minCases&&observation.cases.length<=500,'Invalid or stale property observation');
  check(observation.cases.every(c=>text(c.id)&&object(c.values)&&Array.isArray(c.transitions))&&new Set(observation.cases.map(c=>c.id)).size===observation.cases.length,'Invalid property cases');
  const allowed=new Set(g.allowedTransitions.map(t=>`${t.from}\0${t.to}`));
  const cases=observation.cases.map(c=>{
   const assertions=g.assertions.map(a=>{
    if(a.when&&!conditionsMet(a.when,c.values))return {id:a.id,status:'SKIP',reason:'Condition not met',when:a.when};
    check(Object.hasOwn(c.values,a.left),`Missing property operand: ${a.id}`);
    if(a.right)check(Object.hasOwn(c.values,a.right),`Missing property operand: ${a.id}`);
    const left=c.values[a.left],right=a.right?c.values[a.right]:a.value;
    const pass=evaluateOperator(left,a.operator,right);
    return {id:a.id,operator:a.operator,left,right,status:pass?'PASS':'FAIL',...(a.when?{when:a.when}:{})};
   });
   const transitions=c.transitions.map(t=>{check(text(t.from)&&text(t.to),'Invalid transition');return {from:t.from,to:t.to,status:allowed.has(`${t.from}\0${t.to}`)?'PASS':'FAIL'};});
   return {id:c.id,input:c.input??null,assertions,transitions,status:assertions.every(a=>a.status==='PASS')&&transitions.every(t=>t.status==='PASS')?'PASS':'FAIL'};
  });
  const counterexamples=cases.filter(c=>c.status==='FAIL');
  return {status:counterexamples.length?'FAIL':'PASS',details:{...execution,source:observation.source,seed:g.seed,caseCount:cases.length,counterexamples,passedCases:cases.length-counterexamples.length}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
