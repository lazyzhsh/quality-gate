import fs from 'node:fs';
import {Checkout} from './service.mjs';
let raw='';for await(const part of process.stdin)raw+=part;
const request=JSON.parse(raw);
const faults=new Set(process.argv.slice(2));
const source='deterministic-checkout-journey';
const scenarios=[];
for(const spec of request.scenarios){
 if(spec.id!=='checkout')throw new Error(`Unknown scenario ${spec.id}`);
 const checkout=new Checkout(),requestId=`req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
 const withVolatile=actual=>({...actual,requestId});
 let steps=[
  {id:'login',actual:withVolatile(checkout.login())},
  {id:'place-order',actual:withVolatile(checkout.placeOrder())},
  {id:'confirm',actual:withVolatile(checkout.confirm())}
 ];
 if(faults.has('drift'))steps=steps.map(step=>step.id==='place-order'?{id:step.id,actual:{...step.actual,orderId:'ord-999'}}:step);
 if(faults.has('reorder'))steps=[steps[1],steps[0],steps[2]];
 if(faults.has('drop-step'))steps=steps.filter(step=>step.id!=='confirm');
 scenarios.push({id:spec.id,steps});
}
const observation={schemaVersion:'0.1',runId:request.runId,source,scenarios};
if(!faults.has('no-transcript')){
 // 当次观察记录（runId 绑定当次运行）：与回放基线同格式——归档即录制，回放即对照。
 // 归档一份当次记录并把内容哈希写进配置，它就成为下一轮的回放基线。
 const transcriptFile='build/journey-transcript.json';
 fs.mkdirSync('build',{recursive:true});
 fs.writeFileSync(transcriptFile,JSON.stringify({schemaVersion:'0.1',kind:'journey',runId:request.runId,source,scenarios},null,2));
 observation.rawTranscript={format:'qgate-transcript',file:transcriptFile};
}
console.log(JSON.stringify(observation));
