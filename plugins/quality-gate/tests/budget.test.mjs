import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

const source=fileURLToPath(new URL('../examples/budget-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(source,root,{recursive:true});return root;}
const budgetGate=result=>result.evidence.find(e=>e.gateId==='timeout-budget');
const withSpec=(root,mutate)=>{const file=path.join(root,'budget.json');const spec=JSON.parse(fs.readFileSync(file,'utf8'));mutate(spec);fs.writeFileSync(file,JSON.stringify(spec));};

test('budget conservation and retry discipline pass on the declared tree',t=>{
 const result=run(project(t));
 assert.equal(result.status,'PASS',JSON.stringify(budgetGate(result).details));
 const details=budgetGate(result).details;
 assert.equal(details.requiredBudgetMs['order-api'],800*3+300*2);
 assert.equal(details.attempts['order-api→payment-db'],3);
});

test('upstream budget below downstream attempt sum fails with the sum named',t=>{
 const root=project(t);
 withSpec(root,spec=>{spec.budgets['order-api']=2000;});
 const e=budgetGate(run(root));
 assert.equal(e.status,'FAIL');
 assert.deepEqual(e.details.violations,[{rule:'budgetExceeded',service:'order-api',requiredMs:3000,budgetMs:2000}]);
 assert.deepEqual(failureReasons(e),['order-api: 下游超时需求 3000ms > 预算 2000ms']);
});

test('hop without a caller budget and retry budget over 20 percent fail',t=>{
 const root=project(t);
 withSpec(root,spec=>{delete spec.budgets['settlement-batch'];spec.retryPolicies[1].budgetPercent=40;});
 const e=budgetGate(run(root));
 const rules=e.details.violations.map(v=>v.rule);
 assert.deepEqual(rules.sort(),['missingCallerBudget','retryBudgetExceeded']);
});

test('malformed budget specification fails closed',t=>{
 const root=project(t);
 withSpec(root,spec=>{spec.hops[0].timeoutMs='800';});
 assert.equal(budgetGate(run(root)).status,'ERROR');
 fs.writeFileSync(path.join(root,'budget.json'),'{not json');
 assert.equal(budgetGate(run(root)).status,'ERROR');
});

test('concurrent retry storm fails the drill metrics',t=>{
 const root=project(t);
 process.env.QGATE_SCENARIO='storm';
 const result=run(root);
 delete process.env.QGATE_SCENARIO;
 const e=result.evidence.find(e=>e.gateId==='retry-drill');
 assert.equal(e.status,'FAIL');
 assert.ok(e.details.metrics.every(metric=>metric.status==='FAIL'));
 assert.ok(failureReasons(e).some(reason=>reason.includes('retryToTotalRatio')));
});
