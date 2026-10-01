export function quote({amount,currency}) {
 if(currency!=='USD')return {decision:'reject',reason:'currency'};
 if(typeof amount!=='number'||amount<=0)return {decision:'reject',reason:'amount'};
 return {decision:'accept',fee:Math.round(amount*0.02)};
}
