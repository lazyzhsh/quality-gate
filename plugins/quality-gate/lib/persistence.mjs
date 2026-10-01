import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const check = (ok,msg) => {if(!ok)throw new Error(msg);};
export function validatePersistence(g) {
 check(g.level==='L2','persistence requires domain L2');
 check(Number.isInteger(g.expectedHttpStatus)&&g.expectedHttpStatus>=100&&g.expectedHttpStatus<=599,'expectedHttpStatus must be an HTTP status');
 check((g.expectedRecordCount??1)===0||g.expectedHttpStatus>=200&&g.expectedHttpStatus<=299,'expectedHttpStatus must be a success status unless expectedRecordCount is 0');
 check(typeof g.correlationField==='string'&&g.correlationField.length>0,'correlationField required');
 check(object(g.expected)&&Object.keys(g.expected).length>0,'expected record required');
 check(Object.hasOwn(g.expected,g.correlationField)&&g.expected[g.correlationField]==='$RUN_ID','expected correlationField must equal $RUN_ID');
 check(!('requireSnapshots'in g)||typeof g.requireSnapshots==='boolean','requireSnapshots must be boolean');
 check(!('expectedRecordCount'in g)||Number.isInteger(g.expectedRecordCount)&&g.expectedRecordCount>=0&&g.expectedRecordCount<=1000,'Invalid expectedRecordCount');
 // E3（1.10.0）：快照默认强制——退出须显式 "requireSnapshots": false（可见声明）；
 // 批量（expectedRecordCount>1）与快照互斥，故批量必须显式退出
 check(!(g.expectedRecordCount>1&&g.requireSnapshots!==false),'requireSnapshots only supports single-record expectations; batch (expectedRecordCount>1) must explicitly set "requireSnapshots": false');
}
export function runPersistence(g,root) {
 const runId=randomUUID();
 const argv=g.argv.map(v=>v==='$NODE'?process.execPath:v);
 const r=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:r.status,signal:r.signal,stderr:r.stderr};
 if(r.error||r.signal||r.status!==0)return {status:'ERROR',details:{...execution,error:r.error?.message??'Persistence runner did not exit successfully'}};
 try {
  const o=JSON.parse(r.stdout);
  check(object(o)&&o.schemaVersion==='0.1'&&o.runId===runId,'Invalid or stale persistence observation');
  check(object(o.request)&&typeof o.request.method==='string'&&o.request.method.length>0&&typeof o.request.url==='string'&&Number.isInteger(o.request.status)&&o.request.status>=100&&o.request.status<=599,'Invalid request observation');
  check(object(o.persistence)&&typeof o.persistence.source==='string'&&o.persistence.source.length>0&&Number.isInteger(o.persistence.recordCount)&&o.persistence.recordCount>=0,'Invalid persistence observation');
  const expectedCount=g.expectedRecordCount??1;
  const {recordCount}=o.persistence;
  let record=null,records=null;
  if(expectedCount>1){
   check(Array.isArray(o.persistence.records)&&o.persistence.records.length===recordCount&&o.persistence.records.every(item=>object(item)),'Batch persistence requires a records array matching recordCount');
   records=o.persistence.records;
  }else{
   record=o.persistence.record??null;
   check(recordCount===0?record===null:object(record),'Invalid persisted record');
  }
  let snapshots;
  const requireSnapshots=g.requireSnapshots!==false;
  if(requireSnapshots){
   check(object(o.snapshots)&&object(o.snapshots.before)&&object(o.snapshots.after),'Before and after snapshots required (persistence snapshots are mandatory by default; opt out with "requireSnapshots": false)');
   const {before,after}=o.snapshots;
   check(Number.isInteger(before.recordCount)&&before.recordCount>=0&&Number.isInteger(after.recordCount)&&after.recordCount>=0,'Invalid snapshot counts');
   check(before.recordCount===0?before.record===null:object(before.record),'Invalid before snapshot record');
   check(after.recordCount===recordCount&&isDeepStrictEqual(after.record,record),'After snapshot differs from independent persistence observation');
   const beforeRecord=before.record??{},afterRecord=after.record??{};
   const delta=[...new Set([...Object.keys(beforeRecord),...Object.keys(afterRecord)])].sort().filter(field=>!isDeepStrictEqual(beforeRecord[field],afterRecord[field])||Object.hasOwn(beforeRecord,field)!==Object.hasOwn(afterRecord,field)).map(field=>({field,beforePresent:Object.hasOwn(beforeRecord,field),afterPresent:Object.hasOwn(afterRecord,field),before:beforeRecord[field],after:afterRecord[field]}));
   snapshots={before,after,delta};
  }
  const compareFields=(actualRecord,assertAbsence)=>{
   const fields=[];
   for(const field of new Set([...Object.keys(g.expected),...Object.keys(actualRecord??{})])) {
    const expectedPresent=Object.hasOwn(g.expected,field),actualPresent=actualRecord!==null&&Object.hasOwn(actualRecord,field);
    const expected=g.expected[field]==='$RUN_ID'?runId:g.expected[field];
    const status=assertAbsence?(actualPresent?'FAIL':'PASS'):expectedPresent&&actualPresent&&isDeepStrictEqual(expected,actualRecord[field])?'PASS':'FAIL';
    fields.push({field,expectedPresent,actualPresent,expected,actual:actualRecord?.[field],status});
   }
   return fields;
  };
  const httpMatches=o.request.status===g.expectedHttpStatus;
  let fields=[],recordResults;
  let pass;
  if(expectedCount===0){
   fields=compareFields(record,true);
   pass=httpMatches&&recordCount===0&&record===null;
  }else if(expectedCount>1){
   recordResults=records.map((actualRecord,index)=>{const itemFields=compareFields(actualRecord,false);return {index,fields:itemFields,status:itemFields.every(field=>field.status==='PASS')?'PASS':'FAIL'};});
   pass=httpMatches&&recordCount===expectedCount&&recordResults.every(item=>item.status==='PASS');
  }else{
   fields=compareFields(record,false);
   pass=httpMatches&&recordCount===1&&fields.every(field=>field.status==='PASS');
  }
  return {status:pass?'PASS':'FAIL',details:{...execution,request:o.request,expectedHttpStatus:g.expectedHttpStatus,httpMatches,persistenceSource:o.persistence.source,recordCount,requireSnapshots,...(g.expectedRecordCount!==undefined?{expectedRecordCount:g.expectedRecordCount}:{}),fields,...(recordResults?{recordResults}:{}),...(snapshots?{snapshots}:{})}};
 } catch(err) {return {status:'ERROR',details:{...execution,error:err.message}};}
}
