import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';

const replica=(region,zone,role='worker')=>({failureDomain:{region,zone},role});

function setup(t,topology){
 const f=leanFixture(t);
 f.c.claims.push({id:'C-T',statement:'The declared topology has no single points and honors the replica thresholds'});
 f.c.gates.push({id:'topology',kind:'topology',level:'L4',enabled:true,stages:['close'],claimId:'C-T',file:'topology.json'});
 f.save();
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(topology));
 return f;
}

const healthy={
 services:[
  {name:'order-api',layer:'realtime',critical:true,replicas:2,stateModel:'stateless',replicaDetails:[replica('r1','z1'),replica('r1','z2')],dependencies:[{name:'payment-db',instances:2},{name:'fraud-check',instances:2}]},
  {name:'payment-db',layer:'realtime',critical:true,replicas:3,stateModel:'consensus',replicaDetails:[replica('r1','z1','voter'),replica('r1','z2','voter'),replica('r2','z1','voter')],dependencies:[]},
  {name:'fraud-check',layer:'realtime',critical:true,replicas:2,stateModel:'stateless',replicaDetails:[replica('r1','z2'),replica('r2','z1')],dependencies:[]},
  {name:'settlement-batch',layer:'batch',critical:true,replicas:2,stateModel:'stateless',replicaDetails:[replica('r2','z1'),replica('r2','z2')],dependencies:[{name:'payment-db',instances:2}]}
 ]
};

test('R1-R4 healthy topology passes with cut-set counts in evidence',t=>{
 const f=setup(t,healthy);
 const result=run(f.root);
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0].details,null,1));
 const details=result.evidence.find(e=>e.gateId==='topology').details;
 assert.deepEqual(details.findings,[]);
 assert.equal(details.minCutOrder1Count,0);
 // 三个 2 副本服务各跨恰两个域——每者对该域对构成一个二阶割集（仅计数，不阻断）；payment-db 跨 3 域不构成
 assert.equal(details.minCutOrder2Count,3);
 assert.deepEqual(details.mustSurvive,['fraud-check','order-api','payment-db','settlement-batch']);
});

test('R1: same-domain replicas, non-diverse dependency and undeclared domains fail by name',t=>{
 const f=setup(t,healthy);
 const doc=JSON.parse(JSON.stringify(healthy));
 // 自身副本同域
 doc.services[0].replicaDetails=[replica('r1','z1'),replica('r1','z1','worker2')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 let result=run(f.root);
 let evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.equal(evidence.status,'FAIL');
 assert.ok(evidence.details.findings.some(x=>x.rule==='domainSpread'&&x.service==='order-api'));
 // 依赖服务副本不跨域（fraud-check 两副本同域）→ 依赖边指名
 doc.services[0].replicaDetails=[replica('r1','z1'),replica('r1','z2')];
 doc.services[2].replicaDetails=[replica('r2','z1'),replica('r2','z1')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='dependencyDomainSpread'&&x.service==='order-api'&&x.dependency==='fraud-check'));
 // 关键服务无域信息且未显式降级 → FAIL 指名
 doc.services[2].replicaDetails=undefined;
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='failureDomainsUndeclared'&&x.service==='fraud-check'));
 // 显式降级：PASS 但降级标注可见
 doc.services[2].domainVerification='unavailable';
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.equal(result.status,'PASS');
 assert.deepEqual(evidence.details.degradations.map(x=>({rule:x.rule,service:x.service})),[{rule:'failureDomainsUnverified',service:'fraud-check'}]);
});

test('R2: stateModel thresholds, consensus even replicas and byzantine quorum',t=>{
 const f=setup(t,healthy);
 const doc=JSON.parse(JSON.stringify(healthy));
 // stateless 单副本低于阈值
 doc.services[0].replicas=1;doc.services[0].replicaDetails=[replica('r1','z1')];
 doc.services[0].dependencies=[{name:'payment-db',instances:2}];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 let result=run(f.root);
 let evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='replicaThreshold'&&x.service==='order-api'&&x.min===2));
 // 2 副本共识集群（Raft majority 误配）：阈值+偶数双违规
 doc.services[1].replicas=2;doc.services[1].replicaDetails=[replica('r1','z1','voter'),replica('r1','z2','voter')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='replicaThreshold'&&x.service==='payment-db'&&x.min===3));
 assert.ok(evidence.details.findings.some(x=>x.rule==='consensusReplicasEven'&&x.service==='payment-db'));
 // byzantine 需要 3f+1
 doc.services[1].replicas=3;doc.services[1].replicaDetails=[replica('r1','z1','voter'),replica('r1','z2','voter'),replica('r2','z1','voter')];
 doc.services[1].faultModel='byzantine';doc.services[1].faultTolerant=1;
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='byzantineQuorum'&&x.required===4));
 doc.services[1].replicas=4;doc.services[1].replicaDetails.push(replica('r2','z2','voter'));
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(!evidence.details.findings.some(x=>x.rule==='byzantineQuorum'));
 // 关键服务未声明 stateModel → FAIL 指名
 doc.services[1].stateModel=undefined;doc.services[1].faultModel=undefined;doc.services[1].faultTolerant=undefined;
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='stateModelUndeclared'&&x.service==='payment-db'));
});

test('R3: single-replica, same-domain and single-instance dependency are order-1 cuts',t=>{
 const f=setup(t,healthy);
 const doc=JSON.parse(JSON.stringify(healthy));
 // settlement-batch 降为单副本 → 节点单点（batch 不豁免）
 doc.services[3].replicas=1;doc.services[3].replicaDetails=[replica('r2','z1')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 let result=run(f.root);
 let evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.equal(evidence.status,'FAIL');
 assert.deepEqual(evidence.details.minCutOrder1,[{service:'settlement-batch',domain:'single-replica'}]);
 assert.ok(failureReasons(evidence).some(reason=>reason.includes('单点: settlement-batch')));
 // 恢复后制造边单点：order-api 对 payment-db 只连一个实例
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(healthy));
 const doc2=JSON.parse(JSON.stringify(healthy));
 doc2.services[0].dependencies=[{name:'payment-db',instances:1},{name:'fraud-check',instances:2}];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc2));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.deepEqual(evidence.details.minCutOrder1,[{service:'order-api',dependency:'payment-db',domain:'single-instance'}]);
 // 二阶割集仅计数不阻断：全部必存活服务落在两个域内
 const doc3=JSON.parse(JSON.stringify(healthy));
 doc3.services[0].replicaDetails=[replica('r1','z1'),replica('r1','z2')];
 doc3.services[1].replicaDetails=[replica('r1','z1','voter'),replica('r1','z2','voter'),replica('r1','z1','voter')];
 doc3.services[1].stateModel='consensus';
 doc3.services[2].replicaDetails=[replica('r1','z1'),replica('r1','z2')];
 doc3.services[3].replicaDetails=[replica('r1','z1'),replica('r1','z2')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc3));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.equal(evidence.details.minCutOrder1Count,0);
 assert.ok(evidence.details.minCutOrder2Count>0);
 assert.equal(result.status,'PASS');
});

test('R4: asymmetric roles fail; leader services require rotation and lease fields',t=>{
 const f=setup(t,healthy);
 const doc=JSON.parse(JSON.stringify(healthy));
 // 非对称且无 leader 语义
 doc.services[0].replicaDetails=[replica('r1','z1','worker'),replica('r1','z2','learner')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc));
 let result=run(f.root);
 let evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='asymmetricRoles'&&x.service==='order-api'));
 // standby 含 primary 语义但未声明轮转 → permanentPrimary 指名缺失字段
 const doc2=JSON.parse(JSON.stringify(healthy));
 doc2.services[0].replicaDetails=[replica('r1','z1','primary'),replica('r1','z2','standby')];
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc2));
 result=run(f.root);
 evidence=result.evidence.find(e=>e.gateId==='topology');
 assert.ok(evidence.details.findings.some(x=>x.rule==='permanentPrimary'&&x.service==='order-api'&&x.missing.includes('transientLeadership')&&x.missing.includes('leaderLeaseSec')));
 // 声明轮转+租约后通过
 doc2.services[0].transientLeadership=true;doc2.services[0].leaderLeaseSec=30;
 fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(doc2));
 result=run(f.root);
 assert.equal(result.status,'PASS');
});

test('malformed topology fails closed',t=>{
 const f=setup(t,healthy);
 const write=topology=>fs.writeFileSync(path.join(f.root,'topology.json'),JSON.stringify(topology));
 // 未知依赖服务
 let doc=JSON.parse(JSON.stringify(healthy));doc.services[0].dependencies.push({name:'ghost',instances:1});write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // instances 超过目标副本数
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].dependencies=[{name:'payment-db',instances:4}];write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // replicaDetails 长度不等于 replicas
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].replicaDetails=[replica('r1','z1')];write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // 自依赖
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].dependencies=[{name:'order-api',instances:1}];write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // 非法 stateModel
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].stateModel='chaos';write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // byzantine 用于非 consensus
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].faultModel='byzantine';doc.services[0].faultTolerant=1;write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // 域声明与降级互斥；非法 domainVerification
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].domainVerification='unavailable';write(doc);
 assert.equal(run(f.root).status,'ERROR');
 doc=JSON.parse(JSON.stringify(healthy));delete doc.services[0].replicaDetails;doc.services[0].domainVerification='derived';write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // 重复服务名
 doc=JSON.parse(JSON.stringify(healthy));doc.services.push({...doc.services[0]});write(doc);
 assert.equal(run(f.root).status,'ERROR');
 // 文件缺失
 fs.rmSync(path.join(f.root,'topology.json'));
 assert.equal(run(f.root).status,'ERROR');
 // 非法 role/域键
 doc=JSON.parse(JSON.stringify(healthy));doc.services[0].replicaDetails=[{failureDomain:{datacenter:'dc1'},role:'worker'},replica('r1','z2')];write(doc);
 assert.equal(run(f.root).status,'ERROR');
});

test('summary extractor names topology findings and degradations downgrade the report',async t=>{
 const {failureReasons,downgradeNotes}=await import('../lib/summary.mjs');
 const reasons=failureReasons({kind:'topology',status:'FAIL',details:{findings:[{rule:'replicaThreshold',service:'a',replicas:1,min:2},{rule:'dependencyDomainSpread',service:'a',dependency:'b',distinctDomains:1}],minCutOrder1:[{service:'c',domain:'single-replica'}]}});
 assert.ok(reasons.some(reason=>reason.includes('a: 副本数低于状态模型阈值（1 < 2）')),JSON.stringify(reasons));
 assert.ok(reasons.some(reason=>reason.includes('a→b: 关键依赖副本故障域不足 2 个')),JSON.stringify(reasons));
 assert.ok(reasons.some(reason=>reason.includes('单点: c')),JSON.stringify(reasons));
 const notes=downgradeNotes({evidence:[{gateId:'topo',kind:'topology',details:{degradations:[{rule:'failureDomainsUnverified',service:'edge-svc'}]}}]});
 assert.ok(notes.some(note=>note.includes('edge-svc')&&note.includes('domainVerification:unavailable')),JSON.stringify(notes));
});
