import fs from 'node:fs';
import {projectFile} from './kernel.mjs';

const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};

export function validateBudget(g){
 check(g.level==='L4'&&text(g.file),'budget requires L4 and file');
}

// 纯内核算术校验:超时预算守恒(上游预算 ≥ 各跳超时×尝试次数之和)与重试预算纪律。
// 声明文件由项目从真实调用配置生成;内核不信任任何 runner 的自我评估。
export function runBudget(g,root){
 try{
  const raw=fs.readFileSync(projectFile(root,g.file));
  check(raw.length<=65536,'Budget specification too large');
  const spec=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
  check(object(spec)&&Array.isArray(spec.hops)&&spec.hops.length>0&&spec.hops.every(h=>object(h)&&text(h.caller)&&text(h.callee)&&Number.isInteger(h.timeoutMs)&&h.timeoutMs>0&&(h.retries===undefined||Number.isInteger(h.retries)&&h.retries>=0&&h.retries<=10))&&new Set(spec.hops.map(h=>`${h.caller}\0${h.callee}`)).size===spec.hops.length,'Invalid budget hops');
  check(object(spec.budgets)&&Object.entries(spec.budgets).length>0&&Object.entries(spec.budgets).every(([service,budgetMs])=>text(service)&&Number.isInteger(budgetMs)&&budgetMs>0),'Invalid budget declarations');
  check(spec.retryPolicies===undefined||Array.isArray(spec.retryPolicies)&&spec.retryPolicies.every(p=>object(p)&&text(p.client)&&Number.isFinite(p.budgetPercent)&&p.budgetPercent>0&&['full','equal','decorrelated'].includes(p.jitterMode)&&Number.isInteger(p.backoffBaseMs)&&p.backoffBaseMs>0&&Number.isInteger(p.backoffCapMs)&&p.backoffCapMs>=p.backoffBaseMs),'Invalid retry policies');
  const violations=[];
  const required={};
  for(const hop of spec.hops){
   const budgetMs=spec.budgets[hop.caller];
   if(budgetMs===undefined){violations.push({rule:'missingCallerBudget',service:hop.caller,callee:hop.callee});continue;}
   required[hop.caller]=(required[hop.caller]??0)+hop.timeoutMs*((hop.retries??0)+1);
  }
  for(const [service,requiredMs] of Object.entries(required))if(requiredMs>spec.budgets[service])violations.push({rule:'budgetExceeded',service,requiredMs,budgetMs:spec.budgets[service]});
  for(const policy of spec.retryPolicies??[]){
   if(policy.budgetPercent>20)violations.push({rule:'retryBudgetExceeded',client:policy.client,budgetPercent:policy.budgetPercent});
  }
  const attempts={};
  for(const hop of spec.hops)attempts[`${hop.caller}→${hop.callee}`]=(hop.retries??0)+1;
  return {status:violations.length?'FAIL':'PASS',details:{file:g.file,hops:spec.hops.map(h=>({caller:h.caller,callee:h.callee,timeoutMs:h.timeoutMs,retries:h.retries??0})),budgets:spec.budgets,requiredBudgetMs:required,attempts,...(spec.retryPolicies?{retryPolicies:spec.retryPolicies}:{}),...(violations.length?{violations}:{})}};
 }catch(error){return {status:'ERROR',details:{file:g.file,error:error.message}};}
}
