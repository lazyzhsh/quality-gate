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
 console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,kind:'api',source:'live-http:api-server.mjs',items}));
}finally{await new Promise(resolve=>server.close(resolve));}
