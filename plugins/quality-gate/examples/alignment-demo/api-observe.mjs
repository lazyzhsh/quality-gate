import {createServer,routes} from './api-server.mjs';
let raw='';for await(const part of process.stdin)raw+=part;
const request=JSON.parse(raw);
const server=createServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const response=await fetch(`http://127.0.0.1:${server.address().port}/quote`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount:100,currency:'USD'})});
 const body=await response.json();
 // serverTime 是易变字段：观察如实上报，是否忽略由门禁配置的 ignorePaths 显式决定
 const items=routes.map(route=>({...route,responseStatus:response.status,responseFields:Object.keys(body).sort(),serverTime:Date.now()}));
 // mode:'live' 如实声明（F02 起 requireLive 要求显式 live——真实发请求的 runner 应声明，
 // 未声明在 requireLive 下按缺证据 FAIL）
 console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,kind:'api',source:'live-http:api-server.mjs',mode:'live',items}));
}finally{await new Promise(resolve=>server.close(resolve));}
