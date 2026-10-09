import net from 'node:net';
import {startEventService} from './app.mjs';

let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const server=await startEventService();
try{
 const observed=await new Promise((resolve,reject)=>{
  const socket=net.createConnection({host:'127.0.0.1',port:server.address().port});
  socket.setEncoding('utf8');
  socket.setTimeout(2000,()=>socket.destroy(new Error('event observation timed out')));
  let buffer='';
  socket.on('error',reject);
  socket.on('connect',()=>socket.write(JSON.stringify({headers:{requestId:request.runId},payload:{id:'order-1',amount:1250,currency:'CNY'}})+'\n'));
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>32768)socket.destroy(new Error('event response too large'));});
  socket.on('end',()=>{try{resolve(JSON.parse(buffer));}catch(error){reject(error);}});
 });
 console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,kind:'event',source:'local TCP order application (app.mjs), not a broker certification',mode:'live',items:[observed.received,observed.emitted]}));
}finally{await new Promise(resolve=>server.close(resolve));}
