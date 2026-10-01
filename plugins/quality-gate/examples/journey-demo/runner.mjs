import {createServer} from './service.mjs';
import fs from 'node:fs';
let raw='';for await(const part of process.stdin)raw+=part;
const request=JSON.parse(raw);
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const base=`http://127.0.0.1:${server.address().port}`;
 // serverTime 是易变字段：如实上报，是否忽略由门禁配置的 ignorePaths 显式决定
 const call=async(method,url,body)=>{const response=await fetch(base+url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,state:(await response.json()).state,serverTime:Date.now()};};
 const scenarios=[];
 for(const spec of request.scenarios){
  const id=`${request.runId}-${spec.id}`;
  if(spec.id==='smoke')scenarios.push({id:spec.id,steps:[{id:'health',actual:await call('GET','/health')} ]});
  else if(spec.id==='integration')scenarios.push({id:spec.id,steps:[{id:'create',actual:await call('POST','/orders',{id})},{id:'read',actual:await call('GET',`/orders/${id}`)}]});
  else if(spec.id==='e2e')scenarios.push({id:spec.id,steps:[{id:'create',actual:await call('POST','/orders',{id})},{id:'pay',actual:await call('POST',`/orders/${id}/pay`)},{id:'read',actual:await call('GET',`/orders/${id}`)}]});
  else throw new Error(`Unknown scenario ${spec.id}`);
 }
 // 原始旅程观察记录（v1.13 T3）：当次逐场景逐步骤观察原样落盘（runId 绑定当次运行）并在观察中
 // 声明——内核解析观察记录与自报逐步骤交叉核验（source 一并核验），核验一致计入证据力证据信号。
 const source='live-http:journey-demo/service.mjs';
 const transcriptFile='build/journey-transcript.json';
 fs.mkdirSync('build',{recursive:true});
 fs.writeFileSync(transcriptFile,JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:request.runId,source,scenarios:scenarios.map(s=>({id:s.id,steps:s.steps.map(step=>({id:step.id,actual:step.actual}))}))},null,2));
 console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source,scenarios,rawTranscript:{format:'qgate-transcript',file:transcriptFile}}));
}finally{await new Promise(resolve=>server.close(resolve));}
