import fs from 'node:fs';
import {projectFile} from './kernel.mjs';

const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};

export function validateRerun(g){
 check(g.level==='L4'&&text(g.file),'rerun requires L4 and file');
}

// 纯内核校验:重跑确定性证据(R6)——同 seed 双次运行输出哈希一致 + 幂等键策略 + (账务)复式恒等式。
// 内核不执行任务本身,只做证据的结构与一致性核验;runs<2、seed 不一致、算法未声明即 ERROR(fail-closed)。
// `rerunnable/parallelizable` 布尔(metrics 拓扑)保留为最低档,本门禁为结构化高档证据。
export function runRerun(g,root){
 try{
  const raw=fs.readFileSync(projectFile(root,g.file));
  check(raw.length<=65536,'Rerun specification too large');
  const spec=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
  check(object(spec)&&Array.isArray(spec.jobs)&&spec.jobs.length>0&&spec.jobs.length<=50,'Invalid rerun jobs');
  check(new Set(spec.jobs.map(job=>job.id)).size===spec.jobs.length,'Duplicate rerun job id');
  const jobs=[];const violations=[];
  for(const job of spec.jobs){
   check(object(job)&&text(job.id)&&job.hashAlgorithm==='sha256'&&text(job.idempotencyKeyStrategy)&&job.idempotencyKeyStrategy.length<=200,'Invalid rerun job declaration (sha256 hashAlgorithm and idempotencyKeyStrategy required)');
   check(Array.isArray(job.runs)&&job.runs.length>=2&&job.runs.length<=10,'Rerun job needs at least two same-seed runs');
   for(const run of job.runs)check(object(run)&&text(run.seed)&&run.seed.length<=100&&/^[0-9a-f]{64}$/.test(run.outputSha256),'Invalid rerun run (64-hex outputSha256 required)');
   check(new Set(job.runs.map(run=>run.seed)).size===1,'Rerun runs must share one seed — different seeds are not a same-seed rerun proof');
   const hashes=[...new Set(job.runs.map(run=>run.outputSha256))];
   if(hashes.length>1)violations.push({rule:'outputDivergence',job:job.id,hashes});
   let doubleEntry;
   if(job.doubleEntry!==undefined){
    const d=job.doubleEntry;
    check(object(d)&&Number.isInteger(d.debits)&&d.debits>0&&Number.isInteger(d.credits)&&d.credits>0,'Invalid double entry totals');
    doubleEntry={debits:d.debits,credits:d.credits};
    if(d.debits!==d.credits)violations.push({rule:'unbalancedDoubleEntry',job:job.id,debits:d.debits,credits:d.credits});
   }
   jobs.push({id:job.id,runs:job.runs.length,seed:job.runs[0].seed,hashAlgorithm:job.hashAlgorithm,deterministic:hashes.length===1,idempotencyKeyStrategy:job.idempotencyKeyStrategy,...(doubleEntry?{doubleEntry}:{})});
  }
  return {status:violations.length?'FAIL':'PASS',details:{file:g.file,jobs,...(violations.length?{violations}:{})}};
 }catch(error){return {status:'ERROR',details:{file:g.file,error:error.message}};}
}
