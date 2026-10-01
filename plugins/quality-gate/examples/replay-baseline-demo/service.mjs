// 确定性结账旅程：无 IO、无时钟入值——同样输入永远走出同样的actual（易变的 requestId
// 由 runner 附加，是否忽略由门禁 ignorePaths 显式决定）。
export class Checkout{
 constructor(){this.session=null;this.order=null;}
 login(){this.session='ok';return {status:200,state:'authenticated'};}
 placeOrder(){
  if(!this.session)throw new Error('not authenticated');
  this.order={id:'ord-042',total:1299};
  return {status:201,state:'created',orderId:this.order.id};
 }
 confirm(){
  if(!this.order)throw new Error('no order');
  this.order.state='confirmed';
  return {status:200,state:'confirmed',total:this.order.total};
 }
}
