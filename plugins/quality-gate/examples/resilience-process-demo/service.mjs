import http from 'node:http';
// 真实被测服务（W2）：独立进程的 HTTP 支付服务——健康端点＋支付端点，启动即打印监听端口。
// 它不知道任何门禁协议；故障由外部真实终止注入，恢复由监督者真实重启观测。
const port=Number(process.env.PORT??0);
const payments=new Map();
const server=http.createServer((request,response)=>{
 if(request.method==='GET'&&request.url==='/health'){
  response.writeHead(200,{'content-type':'application/json'});
  return response.end(JSON.stringify({status:'ready',payments:payments.size}));
 }
 if(request.method==='POST'&&request.url==='/pay'){
  let body='';
  request.on('data',chunk=>body+=chunk);
  request.on('end',()=>{
   const id=`p${payments.size+1}`;
   payments.set(id,{id});
   console.error(`event=payment-created id=${id}`);
   response.writeHead(201,{'content-type':'application/json'});
   response.end(JSON.stringify({id}));
  });
  return;
 }
 response.writeHead(404);response.end();
});
server.listen(port,()=>console.error(`listening port=${server.address().port}`));
