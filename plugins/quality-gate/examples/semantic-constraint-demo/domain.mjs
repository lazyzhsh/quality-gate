export class PaymentObligation {
 constructor(id, authorized){this.id=id;this.authorized=authorized;this.captured=0;}
 capture(amount){
  if(amount<0)throw new Error('negative capture');
  if(this.captured+amount>this.authorized)throw new Error('over-capture');
  this.captured+=amount;
  return this.captured;
 }
}
