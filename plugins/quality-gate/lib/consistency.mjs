import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const types=new Set(['zero-sum','append-only','reconciliation','dlq','audit-chain']);
export const APPEND_ONLY_SOURCE_TYPES=['binlog','wal','audit-log','declared'];

export function validateConsistency(g){
 check(g.level==='L2','consistency requires L2');
 check(Array.isArray(g.checks)&&g.checks.length>0&&g.checks.length<=6,'Expected 1..6 consistency checks');
 check(g.checks.every(c=>text(c.id)&&types.has(c.type)&&Array.isArray(c.argv)&&c.argv.length>0&&c.argv.every(text)&&Number.isInteger(c.timeoutMs)&&c.timeoutMs>0&&c.timeoutMs<=20000),'Invalid consistency check');
 check(new Set(g.checks.map(c=>c.id)).size===g.checks.length,'Duplicate consistency check');
 check(Array.isArray(g.requiredChecks)&&g.requiredChecks.length>0&&g.requiredChecks.every(id=>g.checks.some(c=>c.id===id))&&new Set(g.requiredChecks).size===g.requiredChecks.length,'Invalid required consistency checks');
 // 全覆盖或显式排除（W2）：与 engineering 同语义
 check(g.excludedChecks===undefined||(Array.isArray(g.excludedChecks)&&g.excludedChecks.length>0&&g.excludedChecks.every(item=>text(item.id)&&text(item.reason))&&new Set(g.excludedChecks.map(item=>item.id)).size===g.excludedChecks.length&&g.excludedChecks.every(item=>g.checks.some(c=>c.id===item.id))),'Invalid excludedChecks');
 check(g.excludedChecks===undefined||g.excludedChecks.every(item=>!g.requiredChecks.includes(item.id)),'Check cannot be both required and excluded');
 check(g.checks.every(c=>g.requiredChecks.includes(c.id)||(g.excludedChecks??[]).some(item=>item.id===c.id)),'Every consistency check must be required or explicitly excluded with a reason');
 check(Number.isInteger(g.timeoutMs)&&g.timeoutMs>0&&g.timeoutMs<=60000&&g.checks.reduce((sum,c)=>sum+c.timeoutMs,0)<=g.timeoutMs,'Invalid consistency timeout budget');
 for(const c of g.checks){
  if(c.type==='zero-sum')check(c.requirePreCommitCheck===undefined||c.requirePreCommitCheck===true,'requirePreCommitCheck can only be true');
  if(c.type==='append-only')check(c.acceptedSourceTypes===undefined||(Array.isArray(c.acceptedSourceTypes)&&c.acceptedSourceTypes.length>0&&c.acceptedSourceTypes.length<=4&&c.acceptedSourceTypes.every(t=>APPEND_ONLY_SOURCE_TYPES.includes(t))&&new Set(c.acceptedSourceTypes).size===c.acceptedSourceTypes.length),'Invalid acceptedSourceTypes');
  if(c.type==='reconciliation'){
   check(Array.isArray(c.pairs)&&c.pairs.length>0&&c.pairs.length<=20&&c.pairs.every(p=>object(p)&&text(p.id))&&new Set(c.pairs.map(p=>p.id)).size===c.pairs.length,'Invalid reconciliation pairs');
   check(c.breakSlaHours===undefined||(Number.isInteger(c.breakSlaHours)&&c.breakSlaHours>0),'Invalid breakSlaHours');
  }
  if(c.type==='dlq')check(Number.isInteger(c.maxReceiveCount)&&c.maxReceiveCount>0&&c.maxReceiveCount<=100,'Invalid maxReceiveCount');
  if(c.type==='audit-chain'){
   check(Array.isArray(c.stateChangingOperations)&&c.stateChangingOperations.length>0&&c.stateChangingOperations.length<=50&&c.stateChangingOperations.every(text)&&new Set(c.stateChangingOperations).size===c.stateChangingOperations.length,'Invalid stateChangingOperations');
   check(c.minRetentionDays===undefined||(Number.isInteger(c.minRetentionDays)&&c.minRetentionDays>0),'Invalid minRetentionDays');
  }
 }
}

const observe=(spec,root)=>{
 const runId=randomUUID();
 const argv=spec.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId,checkId:spec.id})+'\n',timeout:spec.timeoutMs,maxBuffer:65536,windowsHide:true});
 const base={id:spec.id,type:spec.type,runId,argv,startedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {...base,status:'ERROR',error:result.error?.message??'Consistency runner did not exit successfully'};
 try{
  const observed=JSON.parse(result.stdout);
  check(object(observed)&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source),'Invalid or stale consistency observation');
  const details={...base,source:observed.source};
  if(spec.type==='zero-sum'){
   check(Array.isArray(observed.orders)&&observed.orders.length>0&&observed.orders.every(o=>object(o)&&text(o.id)&&Array.isArray(o.entries)&&o.entries.length>0&&o.entries.every(e=>object(e)&&['debit','credit'].includes(e.direction)&&Number.isSafeInteger(e.amount)&&e.amount>0))&&new Set(observed.orders.map(o=>o.id)).size===observed.orders.length,'Invalid ledger orders: amounts must be positive safe integers');
   if(spec.requirePreCommitCheck===true)check(typeof observed.preCommitValidated==='boolean','requirePreCommitCheck declared but runner did not report preCommitValidated');
   const preCommitValidated=spec.requirePreCommitCheck===true?observed.preCommitValidated===true:null;
   const unbalanced=observed.orders.map(o=>({id:o.id,balance:o.entries.reduce((sum,e)=>sum+(e.direction==='credit'?1n:-1n)*BigInt(e.amount),0n)})).filter(o=>o.balance!==0n).map(o=>({id:o.id,balance:o.balance>=BigInt(Number.MIN_SAFE_INTEGER)&&o.balance<=BigInt(Number.MAX_SAFE_INTEGER)?Number(o.balance):o.balance.toString()}));
   return {...details,orders:observed.orders.length,...(preCommitValidated!==null?{preCommitValidated}:{}),...(unbalanced.length?{unbalanced}:{}),status:(preCommitValidated!==false&&unbalanced.length===0)?'PASS':'FAIL'};
  }
  if(spec.type==='append-only'){
   check(Array.isArray(observed.mutations)&&observed.mutations.every(m=>object(m)&&text(m.orderId)&&['update','delete'].includes(m.op)),'Invalid ledger mutations');
   // 观察来源枚举（W3）：append-only 须回报 sourceType（binlog/wal/audit-log/declared）；
   // declared=runner 自报无外部日志佐证（摘要降级）；不在接受列表即 FAIL
   check(text(observed.sourceType)&&APPEND_ONLY_SOURCE_TYPES.includes(observed.sourceType),'Invalid append-only sourceType');
   const acceptedSourceTypes=spec.acceptedSourceTypes??APPEND_ONLY_SOURCE_TYPES;
   const sourceAccepted=acceptedSourceTypes.includes(observed.sourceType);
   return {...details,mutations:observed.mutations,sourceType:observed.sourceType,sourceAccepted,...(spec.acceptedSourceTypes!==undefined?{acceptedSourceTypes}:{}),status:(observed.mutations.length||!sourceAccepted)?'FAIL':'PASS'};
  }
  if(spec.type==='reconciliation'){
   check(Array.isArray(observed.pairs)&&observed.pairs.length>0&&observed.pairs.every(p=>object(p)&&text(p.id)&&Number.isInteger(p.compared)&&Number.isInteger(p.matched)&&p.compared>0&&p.matched>=0&&p.matched<=p.compared&&Array.isArray(p.diffs)&&p.diffs.every(d=>object(d)&&text(d.key)&&Number.isFinite(d.ageHours)&&d.ageHours>=0)),'Invalid reconciliation pairs');
   const expected=new Map(spec.pairs.map(p=>[p.id,p]));
   check(observed.pairs.every(p=>expected.has(p.id)),'Reconciliation observation declares unconfigured pairs');
   const missing=spec.pairs.filter(p=>!observed.pairs.some(o=>o.id===p.id)).map(p=>p.id);
   check(missing.length===0,`Missing reconciliation pairs: ${missing.join(',')}`);
   const bucket=ageHours=>ageHours<24?'p0':ageHours<72?'p1':'p2';
   const diffAgeBuckets={p0:0,p1:0,p2:0};
   const pairResults=observed.pairs.map(p=>{
    for(const d of p.diffs)diffAgeBuckets[bucket(d.ageHours)]++;
    return {id:p.id,compared:p.compared,matched:p.matched,unreconciledDiffs:p.diffs.length,...(p.diffs.length?{diffs:p.diffs,...(spec.breakSlaHours&&p.diffs.some(d=>d.ageHours>spec.breakSlaHours)?{slaBreached:true}:{})}:{})};
   });
   return {...details,pairs:pairResults,unreconciledDiffs:pairResults.reduce((s,p)=>s+p.unreconciledDiffs,0),diffAgeBuckets,...(spec.breakSlaHours?{breakSlaHours:spec.breakSlaHours}:{}),status:pairResults.some(p=>p.unreconciledDiffs>0)?'FAIL':'PASS'};
  }
  if(spec.type==='dlq'){
   check(Array.isArray(observed.queues)&&observed.queues.length>0&&observed.queues.every(q=>object(q)&&text(q.id)&&Number.isInteger(q.sourceRetentionSec)&&q.sourceRetentionSec>0&&Number.isInteger(q.dlqRetentionSec)&&q.dlqRetentionSec>0&&Number.isInteger(q.maxReceiveCount)&&q.maxReceiveCount>0&&Number.isInteger(q.dlqDepth)&&q.dlqDepth>=0&&Number.isFinite(q.dlqOldestAgeSec)&&q.dlqOldestAgeSec>=0)&&new Set(observed.queues.map(q=>q.id)).size===observed.queues.length,'Invalid dlq observation');
   const violations=[];
   for(const q of observed.queues){
    if(q.dlqRetentionSec<q.sourceRetentionSec)violations.push({queue:q.id,rule:'silentDataLoss',sourceRetentionSec:q.sourceRetentionSec,dlqRetentionSec:q.dlqRetentionSec});
    if(q.maxReceiveCount>spec.maxReceiveCount)violations.push({queue:q.id,rule:'excessiveRedelivery',maxReceiveCount:q.maxReceiveCount,limit:spec.maxReceiveCount});
   }
   let drill;
   if(spec.requireDrill){
    check(object(observed.drill)&&Number.isInteger(observed.drill.redeliveries)&&observed.drill.redeliveries>=0&&typeof observed.drill.landedInDlq==='boolean'&&typeof observed.drill.mainQueueRecovered==='boolean'&&typeof observed.drill.alertFired==='boolean','Invalid poison drill observation');
    drill=observed.drill;
    if(!(drill.landedInDlq&&drill.mainQueueRecovered&&drill.alertFired))violations.push({queue:'drill',rule:'poisonDrillFailed',...drill});
   }
   return {...details,queues:observed.queues,maxReceiveCount:spec.maxReceiveCount,...(drill?{drill}:{}),...(violations.length?{violations}:{}),status:violations.length?'FAIL':'PASS'};
  }
  // audit-chain：内核重算哈希链，runner 无法伪造"已验证"结论
  check(Array.isArray(observed.events)&&observed.events.length>0&&observed.events.every(e=>object(e)&&Number.isInteger(e.seq)&&e.seq>0&&text(e.actor)&&text(e.action)&&/^[0-9a-f]{64}$/.test(e.prev)&&/^[0-9a-f]{64}$/.test(e.hash)),'Invalid audit events');
  check(Number.isInteger(observed.retentionDays)&&observed.retentionDays>0,'Invalid audit retentionDays');
  const audited=new Set((Array.isArray(observed.auditedOperations)?observed.auditedOperations:[]).filter(text));
  const uncovered=spec.stateChangingOperations.filter(op=>!audited.has(op));
  let prev='0'.repeat(64);
  const tampered=[];
  for(const event of observed.events){
   const digest=createHash('sha256').update(`${prev}:${event.seq}:${event.actor}:${event.action}`).digest('hex');
   if(event.prev!==prev||event.hash!==digest)tampered.push({seq:event.seq,expectedPrev:prev,actualPrev:event.prev});
   prev=event.hash;
  }
  const retentionShort=spec.minRetentionDays!==undefined&&observed.retentionDays<spec.minRetentionDays;
  return {...details,eventCount:observed.events.length,retentionDays:observed.retentionDays,...(spec.minRetentionDays?{minRetentionDays:spec.minRetentionDays}:{}),...(uncovered.length?{operationsWithoutAudit:uncovered}:{}),...(tampered.length?{tamperedEvents:tampered}:{}),...(retentionShort?{retentionShort:true}:{}),status:uncovered.length||tampered.length||retentionShort?'FAIL':'PASS'};
 }catch(error){return {...base,status:'ERROR',error:error.message};}
};

export function runConsistency(g,root){
 const checks=g.checks.map(spec=>observe(spec,root));
 const required=g.requiredChecks.map(id=>({id,status:checks.find(check=>check.id===id)?.status??'ERROR'}));
 return {status:required.some(item=>item.status==='ERROR')?'ERROR':required.some(item=>item.status==='FAIL')?'FAIL':'PASS',details:{requiredChecks:required,checks}};
}
