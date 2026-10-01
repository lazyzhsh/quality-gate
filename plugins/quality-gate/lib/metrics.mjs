import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};

export function validateMetrics(g){
 check(g.level==='L4','metrics requires L4');
 check(object(g.thresholds)&&Object.keys(g.thresholds).length>0&&Object.keys(g.thresholds).length<=20,'Expected 1..20 thresholds');
 for(const [name,limit] of Object.entries(g.thresholds)){
  check(text(name)&&object(limit)&&('min'in limit||'max'in limit),'Invalid metric threshold');
  check(!('min'in limit)||Number.isFinite(limit.min),'Invalid metric minimum');
  check(!('max'in limit)||Number.isFinite(limit.max),'Invalid metric maximum');
  check(!('min'in limit)||!('max'in limit)||limit.min<=limit.max,'Invalid metric range');
 }
}

export function runMetrics(g,root){
 const runId=randomUUID();const argv=g.argv.map(v=>v==='$NODE'?process.execPath:v);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Metrics runner did not exit successfully'}};
 try {
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&object(observed.metrics),'Invalid or stale metrics observation');
  const metrics=Object.entries(g.thresholds).map(([name,limit])=>{
   const actual=observed.metrics[name];
   check(Number.isFinite(actual),`Missing or non-numeric metric: ${name}`);
   const status=(!('min'in limit)||actual>=limit.min)&&(!('max'in limit)||actual<=limit.max)?'PASS':'FAIL';
   return {name,actual,threshold:limit,status};
  });
  return {status:metrics.some(m=>m.status==='FAIL')?'FAIL':'PASS',details:{...execution,source:observed.source,metrics}};
 } catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}
