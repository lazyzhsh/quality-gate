const ALLOWED = new Set([
 ['draft','active'],
 ['active','suspended'],
 ['suspended','active'],
 ['active','terminated'],
].map(([from,to])=>`${from}\0${to}`));

export class Contract {
 constructor(id){this.id=id;this.state='draft';this.history=[];}
 transition(to){
  if(!ALLOWED.has(`${this.state}\0${to}`))throw new Error(`illegal transition ${this.state} -> ${to}`);
  this.history.push({from:this.state,to});
  this.state=to;
  return this.state;
 }
}
