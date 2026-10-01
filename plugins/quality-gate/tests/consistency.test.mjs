import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes} from '../lib/summary.mjs';
import {project,gate,check} from './consistency-helpers.mjs';

test('healthy ledger passes all five consistency checks',t=>{
 const result=run(project(t,null,{contract:false}));
 assert.equal(result.status,'PASS',JSON.stringify(gate(result).details.checks,null,1));
 assert.equal(gate(result).details.checks.length,5);
 assert.equal(check(result,'reconciliation').diffAgeBuckets.p0,0);
 assert.equal(check(result,'audit').eventCount,2);
});

test('unbalanced money order fails zero-sum by name',t=>{
 const result=run(project(t,'unbalanced',{ids:['orders'],contract:false}));
 assert.equal(result.status,'FAIL');
 const zeroSum=check(result,'orders');
 assert.equal(zeroSum.status,'FAIL');
 assert.deepEqual(zeroSum.unbalanced,[{id:'mo-1003',balance:-30}]);
 assert.deepEqual(failureReasons(gate(result)),['orders: 未执行写前零和校验','orders: 账单 mo-1003 借贷不平衡（差额 -30）']);
});

test('ledger rewrite fails append-only with the operation named',t=>{
 const result=run(project(t,'mutated',{ids:['mutations'],contract:false}));
 assert.equal(result.status,'FAIL');
 const mutations=check(result,'mutations');
 assert.equal(mutations.status,'FAIL');
 assert.deepEqual(mutations.mutations,[{orderId:'mo-1001',op:'update'}]);
 assert.deepEqual(failureReasons(gate(result)),['mutations: 账本被改写 update mo-1001']);
});

test('settlement break fails reconciliation with age buckets and SLA breach',t=>{
 const result=run(project(t,'break',{ids:['reconciliation'],contract:false}));
 assert.equal(result.status,'FAIL');
 const reconciliation=check(result,'reconciliation');
 assert.equal(reconciliation.status,'FAIL');
 assert.equal(reconciliation.unreconciledDiffs,1);
 assert.deepEqual(reconciliation.diffAgeBuckets,{p0:0,p1:0,p2:1});
 assert.equal(reconciliation.pairs[0].slaBreached,true);
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('ledger-vs-bank 1 笔差异（超挂账 SLA）')));
});

test('dlq retention below source queue fails as silent data loss',t=>{
 const result=run(project(t,'dlq-short',{ids:['dlq'],contract:false}));
 assert.equal(result.status,'FAIL');
 const dlq=check(result,'dlq');
 assert.deepEqual(dlq.violations,[{queue:'settlement-commands',rule:'silentDataLoss',sourceRetentionSec:1209600,dlqRetentionSec:86400}]);
 assert.deepEqual(failureReasons(gate(result)),['dlq: 队列 settlement-commands DLQ 保留期 86400s < 源队列 1209600s（静默丢数据）']);
});

test('failed poison drill and excessive redelivery fail dlq',t=>{
 let result=run(project(t,'drill-fail',{ids:['dlq'],contract:false}));
 assert.equal(check(result,'dlq').violations[0].rule,'poisonDrillFailed');
 result=run(project(t,'excessive-redelivery',{ids:['dlq'],contract:false}));
 assert.ok(check(result,'dlq').violations.some(v=>v.rule==='excessiveRedelivery'));
});

test('tampered audit event fails kernel-side chain verification',t=>{
 const result=run(project(t,'tamper',{ids:['audit'],contract:false}));
 assert.equal(result.status,'FAIL');
 const audit=check(result,'audit');
 assert.equal(audit.status,'FAIL');
 assert.equal(audit.tamperedEvents[0].seq,2);
 assert.ok(failureReasons(gate(result)).some(reason=>reason.includes('seq=2 处断裂/被篡改')));
});

test('missing audit coverage and short retention fail audit-chain',t=>{
 let result=run(project(t,'uncovered',{ids:['audit'],contract:false}));
 assert.deepEqual(check(result,'audit').operationsWithoutAudit,['appendMoneyOrder']);
 result=run(project(t,'short-retention',{ids:['audit'],contract:false}));
 assert.equal(check(result,'audit').retentionShort,true);
});
