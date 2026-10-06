import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run,validate} from '../lib/kernel.mjs';
import {executionBudget,exceedsDeadline} from '../lib/execution-budget.mjs';
import {runConventionAlignment} from '../lib/convention-alignment.mjs';
import {runChangeScope} from '../lib/change-scope.mjs';

// ---- F01（2026-10-06 二轮评审）：登记内嵌 runner 计入统一执行预算 ----
// 评审反例：三条 argv 规则各 20000ms（声明合计 60000ms）而 stageBudget(close)=0、
// validate 接受、run({budgetMs:50000}) 接受，Stop adapter 55862ms 才返回——预算计算不完整。
function project(t,label){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),`qgate-budget-${label}-`));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}
const write=(root,file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));};
const baseConfig=gates=>({schemaVersion:'0.2',claims:[{id:'C',statement:'budget claim'}],gates,risks:[],exceptions:[]});
const conventionGate=(id,registry)=>({id,claimId:'C',kind:'convention-alignment',level:'L0',enabled:true,stages:['close'],file:registry});
const argvRules=(count,timeoutMs,argv=['$NODE','-e','0'])=>({rules:Array.from({length:count},(_,n)=>({id:`R${n+1}`,type:'argv',source:{file:'rules.md'},argv,timeoutMs}))});
const gitInit=root=>{
 for(const args of [['init','-q'],['config','user.email','t@t'],['config','user.name','t'],['add','-A'],['commit','-q','-m','init']])spawnSync('git',args,{cwd:root,windowsHide:true});
};

test('registry runner budgets are summed into the unified execution budget',t=>{
 const root=project(t,'sum');write(root,'rules.md','source');
 write(root,'registry.json',argvRules(3,20000));
 const c=baseConfig([conventionGate('CONV','registry.json')]);
 // validate 是纯配置校验（无 root）：顶层声明为 0 时仍接受——嵌套预算的核验在 run/inspect
 assert.doesNotThrow(()=>validate(c));
 const budget=executionBudget(root,c,'close');
 assert.equal(budget.declaredMs,0);
 assert.equal(budget.nestedMs,60000);
 assert.equal(budget.totalMs,60000);
 assert.deepEqual(budget.nested,[{gateId:'CONV',kind:'convention-alignment',registry:'registry.json',runnerCount:3,nestedMs:60000}]);
});

test('nested rule sum exceeding the stage limit is rejected before any gate runs',t=>{
 const root=project(t,'stage-limit');write(root,'rules.md','source');
 write(root,'registry.json',argvRules(4,20000));
 write(root,'.quality-gate.json',baseConfig([conventionGate('CONV','registry.json')]));
 const report=run(root);
 assert.equal(report.status,'ERROR');
 assert.match(report.error,/Stage execution budget exceeds 60000ms including registry runners/);
 assert.match(report.error,/CONV=80000ms/);
 assert.equal(report.evidence.length,0,'no gate may execute after the budget rejection');
});

test('nested rule sum within the stage limit but beyond the host budget is rejected (review probe BUDGET-NESTED)',t=>{
 const root=project(t,'host-limit');write(root,'rules.md','source');
 write(root,'registry.json',argvRules(3,20000));
 write(root,'.quality-gate.json',baseConfig([conventionGate('CONV','registry.json')]));
 const report=run(root,'close',path.join(root,'.quality-gate','runs'),{budgetMs:50000});
 assert.equal(report.status,'ERROR');
 assert.match(report.error,/Host execution budget exceeds 50000ms including registry runners \(declared 0ms \+ nested 60000ms\)/);
});

test('contentCheck combines with other runners toward the stage limit',t=>{
 const root=project(t,'contentcheck');gitInit(root);
 write(root,'scope.json',{baseRef:'HEAD',allowedPaths:['**'],contentCheck:{argv:['$NODE','-e','0'],timeoutMs:20000}});
 write(root,'.quality-gate.json',baseConfig([
  {id:'SCOPE',claimId:'C',kind:'change-scope',level:'L0',enabled:true,stages:['close'],file:'scope.json'},
  {id:'CMD',claimId:'C',kind:'command',level:'L1',enabled:true,stages:['close'],argv:['$NODE','-e','0'],timeoutMs:45000},
 ]));
 const report=run(root);
 assert.equal(report.status,'ERROR');
 assert.match(report.error,/Stage execution budget exceeds 60000ms including registry runners \(declared 45000ms \+ nested 20000ms.*SCOPE=20000ms/);
 const budget=executionBudget(root,JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8')),'close');
 assert.deepEqual(budget.nested,[{gateId:'SCOPE',kind:'change-scope',registry:'scope.json',runnerCount:1,nestedMs:20000}]);
});

test('unreadable or unparsable registry fails closed at budget computation',t=>{
 const root=project(t,'corrupt');write(root,'rules.md','source');
 write(root,'registry.json','{not json');
 write(root,'.quality-gate.json',baseConfig([conventionGate('CONV','registry.json')]));
 assert.match(run(root).error,/not valid JSON \(execution budget\)/);
 const root2=project(t,'missing');
 write(root2,'registry.json',argvRules(1,100));
 write(root2,'.quality-gate.json',baseConfig([conventionGate('CONV','registry.json')]));
 fs.rmSync(path.join(root2,'registry.json'));
 assert.match(run(root2).error,/Cannot load registry registry\.json for execution budget/);
});

test('gate-level deadline guard refuses tasks that no longer fit the remaining host budget',t=>{
 const root=project(t,'gate-deadline');
 const marker=path.join(root,'convention-ran');
 write(root,'rules.md','source');
 write(root,'rules-runner.mjs',`const fs=require('node:fs');let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(marker)},'ran');const q=JSON.parse(raw);console.log(JSON.stringify({schemaVersion:'0.1',runId:q.runId,source:'probe',findings:[]}));});`);
 write(root,'scan.json',{rules:[{id:'WORDS',type:'banned-words',source:{file:'rules.md'},words:['zzz-not-present-token'],scope:['*.md']}]});
 write(root,'registry.json',argvRules(2,1000,['$NODE','rules-runner.mjs']));
 write(root,'.quality-gate.json',baseConfig([
  conventionGate('SCAN','scan.json'),
  conventionGate('CONV','registry.json'),
 ]));
 // 宿主预算恰等于声明合计（零余量）：SCAN（banned-words 原生扫描，零 argv 预算）先行执行
 // 耗时 >0 后，CONV 的声明预算 2000ms 不再适配剩余期限——停止启动，ERROR 而非 SKIP 放行
 const report=run(root,'close',path.join(root,'.quality-gate','runs'),{budgetMs:2000});
 assert.equal(report.status,'ERROR');
 const scan=report.evidence.find(e=>e.gateId==='SCAN');
 const conv=report.evidence.find(e=>e.gateId==='CONV');
 assert.equal(scan.status,'PASS');
 assert.equal(conv.status,'ERROR');
 assert.equal(conv.details.reason,'budget-exhausted');
 assert.equal(conv.details.declaredMs,2000);
 assert.equal(conv.details.hostBudgetMs,2000);
 assert.ok(conv.details.remainingMs>=0&&conv.details.remainingMs<2000,`remaining ${conv.details.remainingMs}ms`);
 assert.equal(fs.existsSync(marker),false,'rules must not run after the deadline guard');
 assert.equal(report.executionBudget.hostBudgetMs,2000);
 assert.equal(report.executionBudget.totalMs,2000);
 assert.equal(report.executionBudget.nestedMs,2000);
});

test('rule-level deadline guard refuses to start inside runConventionAlignment',t=>{
 const root=project(t,'rule-deadline');write(root,'rules.md','source');
 write(root,'registry.json',argvRules(2,20000));
 assert.throws(()=>runConventionAlignment(conventionGate('CONV','registry.json'),root,{deadline:Date.now()-1}),/Execution budget exhausted before convention rule R1: remaining 0ms < declared 20000ms/);
});

test('contentCheck refuses to start when the remaining deadline is exhausted',t=>{
 const root=project(t,'content-deadline');
 write(root,'scope.json',{baseRef:'HEAD',allowedPaths:['**'],contentCheck:{argv:['$NODE','-e','0'],timeoutMs:20000}});
 gitInit(root);
 const gate={id:'SCOPE',claimId:'C',kind:'change-scope',level:'L0',enabled:true,stages:['close'],file:'scope.json'};
 assert.throws(()=>runChangeScope(gate,root,{deadline:Date.now()-1}),/Execution budget exhausted before contentCheck: remaining 0ms < declared 20000ms/);
});

test('inspect reports the same unified budget as run',t=>{
 const root=project(t,'inspect');write(root,'rules.md','source');
 write(root,'registry.json',argvRules(2,5000,['$NODE','-e','0']));
 write(root,'.quality-gate.json',baseConfig([conventionGate('CONV','registry.json')]));
 const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url)),'inspect',root],{encoding:'utf8',windowsHide:true});
 assert.equal(cli.status,0,cli.stderr);
 const output=JSON.parse(cli.stdout.slice(0,cli.stdout.indexOf('\n}')+2));
 assert.equal(output.budgets.close.usedMs,10000);
 assert.equal(output.budgets.close.declaredMs,0);
 assert.equal(output.budgets.close.nestedMs,10000);
 assert.equal(output.budgets.close.nested[0].runnerCount,2);
});

test('exceedsDeadline is inert without a host deadline (CLI runs stay budget-validated only)',()=>{
 assert.equal(exceedsDeadline(undefined,60000),false);
 assert.equal(exceedsDeadline(null,60000),false);
 assert.equal(exceedsDeadline(Date.now()+100,0),false);
 assert.equal(exceedsDeadline(Date.now()+100,101),true);
});
