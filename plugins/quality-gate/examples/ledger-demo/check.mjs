import {createHash} from 'node:crypto';
import {Ledger,poisonDrill} from './ledger.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const scenario=process.env.QGATE_SCENARIO??'healthy';
const base={schemaVersion:'0.1',runId:request.runId,source:'ledger-demo/check.mjs'};
const output=value=>console.log(JSON.stringify({...base,...value}));
const buildLedger=()=>{
 const ledger=new Ledger();
 ledger.writeOrder('mo-1001',[{direction:'debit',amount:5000},{direction:'credit',amount:5000}]);
 ledger.writeOrder('mo-1002',[{direction:'debit',amount:12000},{direction:'credit',amount:7000},{direction:'credit',amount:5000}]);
 if(scenario==='mutated')ledger.updateOrder('mo-1001',[{direction:'debit',amount:1},{direction:'credit',amount:1}]);
 return ledger;
};
const task=request.checkId;
if(task==='orders'){
 const ledger=buildLedger();
 if(scenario==='unbalanced'){
  // 绕过写前校验直接落账（负例：账本出现借贷不平的账单）
  ledger.writeOrder('mo-1003',[{direction:'debit',amount:300},{direction:'credit',amount:270}],{validate:false});
 }
 output({orders:ledger.orders.map(o=>({id:o.id,entries:o.entries})),preCommitValidated:scenario!=='unbalanced'});
}else if(task==='mutations'){
 // 观察来源枚举（W3）：本 demo 的账本是进程内 JSON 实现，无 binlog/wal/审计日志佐证，
 // 如实声明 declared（摘要降权标注）；生产接入应回报真实日志类型并可用 acceptedSourceTypes 收紧
 output({mutations:buildLedger().mutations,sourceType:'declared'});
}else if(task==='reconciliation'){
 const ledger=buildLedger();
 // 外部银行结算文件：与账本逐单核对（compared/matched/diffs 由真实比对产生）
 const bankFile=new Set(['mo-1001','mo-1002']);
 if(scenario==='break')bankFile.delete('mo-1002');
 const pairs=[{id:'ledger-vs-bank',compared:ledger.orders.length,matched:0,diffs:[]}];
 for(const order of ledger.orders)bankFile.has(order.id)?pairs[0].matched++:pairs[0].diffs.push({key:order.id,ageHours:scenario==='break'?80:0});
 output({pairs});
}else if(task==='dlq'){
 const queue={id:'settlement-commands',sourceRetentionSec:1209600,dlqRetentionSec:scenario==='dlq-short'?86400:1209600,maxReceiveCount:scenario==='excessive-redelivery'?10:3,dlqDepth:0,dlqOldestAgeSec:0};
 const drill=scenario==='drill-fail'?{redeliveries:1,landedInDlq:false,mainQueueRecovered:true,alertFired:false}:poisonDrill(queue.maxReceiveCount);
 output({queues:[queue],drill});
}else if(task==='audit'){
 const ledger=buildLedger();
 const auditedOperations=['appendMoneyOrder'];
 if(scenario==='uncovered')auditedOperations.length=0;
 const events=ledger.events.map(event=>({...event}));
 if(scenario==='tamper')events[1].action='appendMoneyOrder ';
 output({auditedOperations,retentionDays:scenario==='short-retention'?30:400,events});
}else throw new Error(`Unknown consistency task: ${task}`);
