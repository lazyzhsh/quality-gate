import fs from 'node:fs';
import {projectFile,stageBudget} from './kernel.mjs';

// 统一执行预算（F01，2026-10-06 二轮评审）：门禁顶层声明（timeoutMs/coverage/reasoner/shacl）
// 之外，登记文件内嵌的可执行入口同样按序消耗真实时间——convention-alignment 的 argv 规则
// （单条上限 20000ms、最多 50 条）、change-scope 的 contentCheck。本模块加载登记后汇总，
// run（CLI/Stop 同轨）与 inspect 使用同一结果；登记不可读/不可解析即 fail-closed（预算
// 未知不接受配置进入执行）。engineering/consistency 的子检查不在此列——其门禁级 timeoutMs
// 须覆盖子检查之和（既有 validate 约束），已计入顶层声明。内核内置有界操作（如
// change-scope 的 git 调用，每次 10 秒上限）也不属声明预算面——上限由内核固定约束。
const readRegistry=(root,file)=>{
 let raw;
 try{raw=fs.readFileSync(projectFile(root,file));}
 catch(error){throw new Error(`Cannot load registry ${file} for execution budget: ${error.message}`);}
 try{return JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));}
 catch(error){throw new Error(`Registry ${file} is not valid JSON (execution budget): ${error.message}`);}
};

export function nestedRunnerBudgets(root,c,stage){
 const entries=[];
 for(const g of c.gates??[]){
  if(g?.enabled!==true||!Array.isArray(g.stages)||!g.stages.includes(stage))continue;
  if(g.kind==='convention-alignment'){
   const data=readRegistry(root,g.file);
   const argvRules=(Array.isArray(data?.rules)?data.rules:[]).filter(rule=>rule!==null&&typeof rule==='object'&&rule.type==='argv');
   entries.push({gateId:g.id,kind:g.kind,registry:g.file,runnerCount:argvRules.length,nestedMs:argvRules.reduce((sum,rule)=>sum+(Number.isInteger(rule.timeoutMs)&&rule.timeoutMs>0?rule.timeoutMs:0),0)});
  }else if(g.kind==='change-scope'){
   const contentCheck=(readRegistry(root,g.file)??{}).contentCheck;
   if(contentCheck!==null&&typeof contentCheck==='object'&&!Array.isArray(contentCheck)&&Number.isInteger(contentCheck.timeoutMs)&&contentCheck.timeoutMs>0){
    entries.push({gateId:g.id,kind:g.kind,registry:g.file,runnerCount:1,nestedMs:contentCheck.timeoutMs});
   }
  }
 }
 return entries;
}

export function executionBudget(root,c,stage){
 const declaredMs=stageBudget(c,stage);
 const nested=nestedRunnerBudgets(root,c,stage);
 const nestedMs=nested.reduce((sum,entry)=>sum+entry.nestedMs,0);
 return {stage,declaredMs,nestedMs,totalMs:declaredMs+nestedMs,nested};
}

// 剩余期限守卫（F01）：宿主给出硬期限（Stop budgetMs）时，启动任何新可执行任务前检查
// 「当前时刻＋该任务声明预算」是否超出期限——超出即不再启动（调用方按 ERROR 呈现，
// 不作为 SKIP 放行）。CLI 无 budgetMs 时不设期限，只有声明预算校验。
export function exceedsDeadline(deadline,taskMs){
 if(deadline===undefined||deadline===null)return false;
 return Date.now()+taskMs>deadline;
}
