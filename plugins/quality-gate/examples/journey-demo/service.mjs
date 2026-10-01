import http from 'node:http';
export function createServer(){
 const orders=new Map();
 return http.createServer(async(request,response)=>{
  const send=(status,body)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(body));};
  if(request.method==='GET'&&request.url==='/health'){send(200,{state:'ok'});return;}
  if(request.method==='POST'&&request.url==='/orders'){
   let raw='';for await(const part of request)raw+=part;const {id}=JSON.parse(raw);
   orders.set(id,'created');send(201,{state:'created'});return;
  }
  const match=/^\/orders\/([^/]+)(\/pay)?$/.exec(request.url??'');
  if(match&&orders.has(match[1])){
   if(request.method==='POST'&&match[2]){orders.set(match[1],'paid');send(200,{state:orders.get(match[1])});return;}
   if(request.method==='GET'&&!match[2]){send(200,{state:orders.get(match[1])});return;}
  }
  send(404,{state:'missing'});
 });
}
