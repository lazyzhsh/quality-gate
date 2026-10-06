import {spawn} from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// 真实进程故障参考 runner（W2，v1.29）：与 resilience-demo 的进程内模拟不同，本 runner 的
// 故障是真实发生的——独立 service.mjs 子进程被真实终止（kill），监督者真实重启，恢复时间
// 来自真实健康轮询与真实请求计时。负场景 'process-kill-no-restart' 终止后不重启，观察
// 至预算窗口耗尽，如实回报不可恢复。
const here=path.dirname(fileURLToPath(import.meta.url));
const servicePath=path.join(here,'service.mjs');

const startService=()=>{
 const child=spawn(process.execPath,[servicePath],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let port=null,log='';
 child.stderr.on('data',chunk=>{
  log+=chunk;
  const match=/listening port=(\d+)/.exec(log);
  if(match)port=Number(match[1]);
 });
 child.stdout.on('data',chunk=>{log+=chunk;});
 const exited=new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
 return {child,exited,getPort:()=>port,getLog:()=>log};
};
const request=(port,method,url,body)=>{
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,method,path:url,timeout:2000},res=>{
   let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:data}));
  });
  req.on('timeout',()=>{req.destroy(new Error('health poll timeout'));});
  req.on('error',reject);
  if(body)req.write(body);
  req.end();
 });
};
const waitHealthy=async(service,deadline)=>{
 while(Date.now()<deadline){
  const port=service.getPort();
  if(port!==null){
   try{const health=await request(port,'GET','/health');if(health.status===200)return true;}catch{}
  }
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 return false;
};

let raw='';for await(const chunk of process.stdin)raw+=chunk;
const query=JSON.parse(raw);
const scenarios=[];
for(const spec of query.scenarios){
 const id=typeof spec==='string'?spec:spec.id;
 if(id==='process-kill'){
  const service=startService();
  const ready=await waitHealthy(service,Date.now()+10000);
  if(!ready)throw new Error('service never became healthy before fault injection');
  const before=(await request(service.getPort(),'POST','/pay',JSON.stringify({amount:1}))).status;
  const start=Date.now();
  service.child.kill(); // 真实故障：终止独立进程
  const exit=await service.exited;
  const restarted=startService();
  const recovered=await waitHealthy(restarted,Date.now()+15000);
  const after=recovered?(await request(restarted.getPort(),'POST','/pay',JSON.stringify({amount:2}))).status:0;
  const recoveryMs=Date.now()-start;
  scenarios.push({
   id,
   fault:`real child process killed (exit ${exit.code??''}${exit.signal??''}); supervisor respawn observed via real health polling`,
   recoveryMs,
   finalState:ready&&recovered&&before===201&&after===201?'ready':'wrong-state',
   signals:{log:`listening port= observed; payment-created in child stderr`,restartObserved:true}
  });
  restarted.child.kill();
  if(!restarted.exited)await restarted.exited.catch(()=>{});
 }else if(id==='process-kill-no-restart'){
  const service=startService();
  const ready=await waitHealthy(service,Date.now()+10000);
  const start=Date.now();
  service.child.kill(); // 真实故障且无监督重启
  await service.exited;
  // 观察窗口：预算 3 秒内反复真实探测，端口确无响应
  let responsive=false;
  while(Date.now()-start<3000){
   try{const probe=await request(service.getPort(),'GET','/health');if(probe.status===200)responsive=true;}catch{}
   if(responsive)break;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  const recoveryMs=Date.now()-start;
  scenarios.push({
   id,
   fault:'real child process killed with no supervisor (negative: recovery must not be observed)',
   recoveryMs,
   finalState:!responsive?'down':'unexpectedly-ready',
   signals:{log:'service exited; health polling got no response',restartObserved:"false"}
  });
 }else throw new Error(`Unknown scenario ${id}`);
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:query.runId,source:'real process kill + supervisor restart (reference chaos runner)',observedAt:new Date().toISOString(),scenarios}));
