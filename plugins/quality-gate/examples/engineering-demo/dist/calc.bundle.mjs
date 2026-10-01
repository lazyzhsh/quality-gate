// build run 58aed9fb-3af1-440a-aa26-7473334b6133
export function fee(amount){
 if(amount<=0)return null;
 if(amount>=10000)return Math.ceil(amount*0.015);
 return Math.ceil(amount*0.02);
}
