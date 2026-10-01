import http from 'node:http';
export const routes=[{method:'POST',path:'/quote',requestFields:['amount','currency'],responseStatus:200,responseFields:['decision','fee']}];
export function createServer(){
 return http.createServer(async(request,response)=>{
  if(request.method!=='POST'||request.url!=='/quote'){response.writeHead(404);response.end();return;}
  let raw='';for await(const part of request)raw+=part;
  const body=JSON.parse(raw);
  const result={decision:body.amount>0?'accept':'reject',fee:body.amount>0?2:0};
  response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(result));
 });
}
