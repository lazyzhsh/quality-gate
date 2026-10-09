import net from 'node:net';

// Application code owns routing and payloads; it never reads the expected contract.
export async function startEventService(){
 const server=net.createServer(socket=>{
  socket.setEncoding('utf8');
  let buffer='';
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
   buffer+=chunk;
   if(buffer.length>16384){socket.destroy();return;}
   const end=buffer.indexOf('\n');
   if(end<0)return;
   try{
    const message=JSON.parse(buffer.slice(0,end));
    const received={operationId:'receiveOrder',action:'receive',channel:'orders.request',messageId:'submit',contentType:'application/json',headers:message.headers,payload:message.payload};
    const emitted={operationId:'sendAccepted',action:'send',channel:'orders.accepted',messageId:'accepted',contentType:'application/json',headers:message.headers,payload:{order:message.payload,status:'accepted'}};
    socket.end(JSON.stringify({received,emitted})+'\n');
   }catch{socket.destroy();}
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return server;
}
