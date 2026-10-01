// orders-cli 消费者源码（demo）：HTTP 调用面经 adapters/consumer-usage/scan-usage.mjs
// 静态扫描提取为 consumerUsage（scanned 来源，观察层弱来源——边界见适配器头注）。
export async function lookupPayments(){
  const response=await fetch('/payments',{method:'GET'});
  return response.json();
}
