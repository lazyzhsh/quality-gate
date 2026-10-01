export function quote({amount,currency}) {
 if(!['USD','EUR'].includes(currency))return {decision:'reject',reason:'currency'};
 if(typeof amount!=='number'||amount<=0)return {decision:'reject',reason:'amount'};
 return {decision:'accept',fee:Math.round(amount*0.02)};
}
