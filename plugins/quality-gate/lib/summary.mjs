const symbol={PASS:'✅',FAIL:'❌',ERROR:'⚠️',SKIP:'⏭️'};
const domainMark={PASS:'✓',FAIL:'✗',ERROR:'⚠',SKIP:'–'};
const maxReasons=3;
// 分级呈现：PASS 只占一行（对话内不刷屏），非 PASS 展示全表；建议列按状态给出下一步动作
const suggestions={PASS:'—',FAIL:'按原因修复后重跑',ERROR:'检查 runner/配置输入',SKIP:'不在本阶段执行'};
// 对话内呈现：绝对路径会撑出横向滚动，展示层按当前工作目录相对化（仅显示，不影响证据本身）
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// 重跑提示按本插件内 qgate.mjs 的绝对路径渲染（v1.14）：Stop 反馈在任意 cwd 下复制即用，
// 不再依赖恰好在插件根执行
const qgateCli=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
export const stripCwd=p=>{
 if(typeof p!=='string')return p;
 const cwd=process.cwd();
 if(p===cwd)return '.';
 return p.startsWith(cwd+path.sep)?p.slice(cwd.length+1):p;
};
const id8=report=>typeof report.id==='string'?report.id.slice(0,8):'';

const clip=(value,limit)=>{
 const text=value===null||value===undefined?'null':typeof value==='string'?value:JSON.stringify(value);
 return text.length>limit?text.slice(0,limit-1)+'…':text;
};
const json=value=>clip(value,40);
const list=(values,limit)=>values.length>limit?`${values.slice(0,limit).join('、')}（+${values.length-limit} 项）`:values.join('、');
const tail=value=>typeof value==='string'?value.trim().split(/\r?\n/).filter(Boolean).pop()??'':'';

const knownTools={git:'https://git-scm.com/downloads',python:'https://www.python.org/downloads/',python3:'https://www.python.org/downloads/',py:'https://www.python.org/downloads/'};

function runnerFailure(details){
 if(typeof details==='string')return [details];
 const reasons=[];
 if(details?.error)reasons.push(String(details.error));
 const enoent=typeof details?.error==='string'?/spawnSync (\S+) ENOENT/.exec(details.error):null;
 if(enoent&&knownTools[enoent[1]])reasons.push(`安装指引: ${knownTools[enoent[1]]}`);
 const stderrTail=tail(details?.stderr);
 if(stderrTail)reasons.push(clip(stderrTail,90));
 if(details?.exitCode!==undefined&&details?.exitCode!==null&&details.exitCode!==0)reasons.push(`退出码 ${details.exitCode}`);
 return reasons;
}

const extractors={
 command:details=>runnerFailure(details),
 assumptions:details=>{
  const reasons=[];
  if(details.registerIssues?.includes('empty-register-undeclared'))reasons.push('空登记未显式声明: 需要 "none": true');
  if(details.registerIssues?.includes('none-with-entries'))reasons.push('none:true 与非空登记矛盾');
  if(details.unresolved?.length)reasons.push(`未闭合假设: ${list(details.unresolved,5)}`);
  for(const item of details.referenceChecks??[])if(item.status!=='PASS'&&item.status!=='FOUND')reasons.push(`${item.assumptionId}.${item.field} 引用未通过: ${item.type} ${item.target} → ${item.gateStatus??item.status}`);
  return reasons;
 },
 decisions:details=>{
  const reasons=[];
  if(details.unresolved?.length)reasons.push(`未闭合决策: ${list(details.unresolved,5)}`);
  for(const item of details.referenceChecks??[])if(item.status!=='PASS'&&item.status!=='FOUND')reasons.push(`${item.decisionId}.evidence 引用未通过: ${item.type} ${item.target} → ${item.gateStatus??item.status}`);
  for(const item of details.affectsChecks??[])if(item.type==='path'&&item.status!=='FOUND')reasons.push(`${item.decisionId} 影响路径缺失: ${item.target}`);
  for(const item of details.decisions??[]){
   if(item.reasons?.includes('provenance-required'))reasons.push(`${item.id} evidence 需结构化引用（{file}/{gateId}），纯文本不再放行`);
   if(item.reasons?.includes('revisit-overdue'))reasons.push(`${item.id} 悬置决策已过复审期限（revisitBy ${item.revisitBy}）`);
   if(item.reasons?.includes('adr-ref-required'))reasons.push(`${item.id} 缺少 ADR 绑定（requireAdrRefs）——决策史须一处事实一处索引`);
   if(item.reasons?.includes('adr-ref-missing'))reasons.push(`${item.id} adrRef 指向的 ADR 文件缺失: ${item.adrRef?.file}`);
   if(item.reasons?.includes('adr-status-mismatch'))reasons.push(`${item.id} 登记状态 ${item.status} 与 ADR status ${item.adrStatus} 不一致（open↔proposed、resolved↔accepted、deferred↔deferred）`);
   if(item.reasons?.includes('adr-chain-missing'))reasons.push(`${item.id} supersedes/superseded-by 引用的 ADR 缺失`);
   if(item.reasons?.includes('adr-chain-mismatch'))reasons.push(`${item.id} supersedes/superseded-by 链不互指（双向定位核对）`);
  }
  return reasons;
 },
 change_scope:details=>{
  const reasons=[];
  if(details.selfGuard?.status==='spec-changed')reasons.push(`scope spec 已被修改未经重新确认（selfGuard 哈希不符，期望 ${details.selfGuard.acknowledged.slice(0,8)}…，实际 ${details.selfGuard.actual.slice(0,8)}…）`);
  if(details.baseAnchor?.status==='base-moved')reasons.push(`基线已前移（pinnedBase ${details.baseAnchor.pinned.slice(0,8)}… ≠ 当前 ${details.baseAnchor.baseCommit.slice(0,8)}…），须重新确认`);
  if(details.overScope?.length)reasons.push(`超范围变更: ${list(details.overScope,3)}`);
  if(details.missingRequired?.length)reasons.push(`缺少必需变更: ${list(details.missingRequired,3)}`);
  if(details.unacknowledgedProtected?.length)reasons.push(`受保护路径未确认: ${list(details.unacknowledgedProtected.map(x=>`${x.path} (${x.ruleId}:${x.reason??'not-acknowledged'})`),3)}`);
  if(details.protectedChangedWithoutContentCheck?.length)reasons.push(`受保护路径变更缺少内容级检查（requireContentCheck）: ${list(details.protectedChangedWithoutContentCheck,3)}`);
  if(details.contentCheck?.unaccepted?.length)reasons.push(`内容变更未接受: ${list(details.contentCheck.unaccepted.map(x=>`${x.category} ${x.path}`),3)}`);
  if(details.taskIntent?.status==='intent-file-modified')reasons.push(`任务意图登记已被修改且未重新绑定（期望 ${details.taskIntent.acknowledgedSha256.slice(0,8)}…，实际 ${details.taskIntent.contentSha256.slice(0,8)}…）: 修订须显式——补 revisions 留痕并更新 acknowledgedSha256`);
  if(details.taskIntent?.status==='no-task-intent')reasons.push('缺少任务意图登记（requireTaskIntent）: 没有意图基准的"完成"只是 agent 自述，先登记 .quality-gate/registries/task-intent.json 再收尾');
  if(details.taskIntent?.outsideTaskScope?.length)reasons.push(`超任务范围变更（须还原，或显式修订意图 scope）: ${list(details.taskIntent.outsideTaskScope,3)}`);
  for(const item of details.taskIntent?.constraintChecks??[])if(item.status==='violated')reasons.push(`任务约束 ${item.constraint} 被违反: 新增依赖 ${list(item.newDependencies,3)}`);
  for(const item of details.taskIntent?.acceptanceStructure?.violations??[])reasons.push(`验收条件 AC[${item.acceptance}] ${item.rule==='ac-type-conflict'?`声明类型 ${item.declared} 与结构派生类型（${item.derived.join('/')}）不一致`:`结构无效（${item.rule}${item.line!==undefined?` @ ${item.line}`:item.scenario!==undefined?` @ ${item.scenario}`:''}）`}——修正 Gherkin/EARS 结构，或去掉 format 改回自由文本`);
  return reasons;
 },
 traceability:details=>{
  const reasons=[];
  for(const requirement of details.requirements??[]){
   if(requirement.missingTypes?.length)reasons.push(`${requirement.id} 缺少类型: ${requirement.missingTypes.join('/')}`);
   if(requirement.missingPrdRef)reasons.push(`${requirement.id} 缺少 PRD 绑定（requirePrdRefs）`);
   if(requirement.prdRef?.status==='MISSING')reasons.push(`${requirement.id} PRD 引用文件缺失: ${requirement.prdRef.file}`);
   for(const criterion of requirement.acceptanceCriteria??[]){
    for(const file of criterion.codeFiles??[]){
     if(file.status!=='FOUND')reasons.push(`${criterion.id} 实现缺失: ${file.path}`);
     else if(file.covered===false)reasons.push(`${criterion.id} 文件未被覆盖: ${file.path}`);
    }
    for(const gate of criterion.testGates??[])if(gate.status!=='PASS')reasons.push(`${criterion.id} 测试 ${gate.id}=${gate.status}`);
    for(const violation of criterion.structureViolations??[])reasons.push(`${criterion.id} 结构无效（${violation.rule}${violation.line!==undefined?` @ ${violation.line}`:violation.scenario!==undefined?` @ ${violation.scenario}`:''}）——修正 Gherkin/EARS 结构或改回自由文本`);
    if(criterion.typeConflict)reasons.push(`${criterion.id} 声明类型 ${criterion.typeConflict.declared} 与 ${criterion.format} 派生类型（${criterion.typeConflict.derived.join('/')}）不一致`);
   }
  }
  return reasons;
 },
 engineering:details=>(details.checks??[]).filter(check=>check.status!=='PASS').flatMap(check=>{
  const baselineReasons=[];
  if(check.baseline?.mode==='git'&&check.baseline.accepted===false)baselineReasons.push(check.baseline.status==='missing'?`${check.id}: 基线来源缺失（baselineMode:git）`:`${check.id}: 基线为内嵌声明（embedded），baselineMode:git 不接受`);
  if(check.status==='ERROR')return [...baselineReasons,`${check.id}(${check.type}): ${clip(check.error,80)}`];
  if(check.type==='test'){
   const ruleText={missingCase:'用例缺失',skippedCase:'用例被跳过',f2pStillFailing:'新行为未交付（当前仍失败）',f2pPassedOnBaseline:'基线已通过（测试未绑定新行为，疑似伪修复）',p2pRegressed:'回归（当前失败）',p2pFailedOnBaseline:'基线即失败或被跳过（不能作防回归证据）'};
   const expected=(check.expectedViolations??[]).map(violation=>`${violation.direction} ${violation.name} ${ruleText[violation.rule]??violation.rule}`).join('；');
   if(expected)return [...baselineReasons,`${check.id}: ${expected}`];
   if(check.failed>0)return [...baselineReasons,`${check.id}: ${check.failed}/${check.total} 个测试失败`];
   if(check.blockOnSkipped===true&&check.skipped>0)return [...baselineReasons,`${check.id}: ${check.skipped} 个测试被跳过（blockOnSkipped）`];
   if(check.minTotal!==undefined&&check.total<check.minTotal)return [...baselineReasons,`${check.id}: 测试数 ${check.total} < 最小要求 ${check.minTotal}`];
   if(check.missingRawOutput)return [...baselineReasons,`${check.id}: 缺少原始测试输出（requireRawOutput）——自报计数未经内核解析`];
   if(check.missingBaselineRawOutput)return [...baselineReasons,`${check.id}: 缺少基线原始输出（requireBaselineRawOutput）——基线状态未经内核解析`];
   if(check.coverageViolation)return [...baselineReasons,`${check.id}: 覆盖率 ${check.coverageViolation.ratio} < 最低要求 ${check.coverageViolation.minCoverageRatio}（${check.coverage?.tool}）`];
   if(baselineReasons.length)return baselineReasons;
   return `${check.id}(${check.type}) 未通过`;
  }
  if(check.type==='metric')return `${check.id}: 变异分数 ${check.score} < ${check.min}${check.survivors?.length?`，存活: ${list(check.survivors.map(survivor=>survivor.id),3)}`:''}`;
  if(check.type==='findings'){
   if(check.severityBreaches?.length)return `${check.id}: ${check.severityBreaches.map(severity=>`${severity} ${check.severityCounts[severity]} 项 > 上限 ${check.maxBySeverity[severity]}`).join('，')}`;
   if(check.findings.length>check.maxFindings)return `${check.id}: ${check.findings.length} 项违规 > 上限 ${check.maxFindings}`;
   return `${check.id}: 存在违规 finding`;
  }
  if(check.type==='artifact')return `${check.id}: 制品哈希不符 (${check.artifact.path})`;
  return `${check.id}(${check.type}) 未通过`;
 }),
 alignment:details=>[...(details.requireLive!==undefined?['观察为静态读取（requireLive）']:[]),...(details.missingSourceFingerprint?['观察缺少来源指纹（requireSourceFingerprint）']:[]),...(details.sourceFingerprint?.status==='MISMATCH'?[`观察来源指纹不符: ${details.sourceFingerprint.file}`]:[]),...(details.breakingChanges??[]).map(change=>`破坏性变更: ${change.path} ${change.rule}`),...(details.differences??[]).map(difference=>`${difference.path} ${difference.rule}${difference.expected!==undefined?`（期望 ${json(difference.expected)}，实际 ${json(difference.actual)}）`:''}`)],
 consumer_matrix:details=>{
  const ruleText={missingEndpoint:'端点缺失',missingField:'缺少字段',typeChanged:'类型变更',unexpectedField:'多出字段（exact）'};
  return [...(details.attribution??[]).flatMap(item=>item.brokenConsumers.map(consumer=>`${consumer}: ${item.method} ${item.path}${item.field?` ${item.field}`:''} ${ruleText[item.rule]??item.rule}${item.rule==='typeChanged'?`（期望 ${item.expected}，实际 ${item.actual}）`:''}`)),...(details.usageFindings??[]).map(finding=>`${finding.consumer}: 使用面超出声明期望 ${finding.method} ${finding.path}${finding.field?` ${finding.field}`:''}——期望文件已过期`),...(details.requireLive!==undefined?['观察为静态读取（requireLive）']:[]),...(details.missingSourceFingerprint?['观察缺少来源指纹（requireSourceFingerprint）']:[]),...(details.sourceFingerprint?.status==='MISMATCH'?[`观察来源指纹不符: ${details.sourceFingerprint.file}`]:[])];
 },
 invariant:details=>(details.assertions??[]).filter(assertion=>assertion.status==='FAIL').map(assertion=>`断言 ${assertion.id} 失败: ${json(assertion.left)} 对 ${assertion.rightField??json(assertion.right)}`),
 journey:details=>{
  const reasons=[];
  if(details.missingRawTranscript)reasons.push('缺少原始旅程观察记录（requireRawTranscript）');
  if(details.replay?.status==='replay-baseline-modified')reasons.push(details.replay.problem);
  for(const item of details.replay?.drift??[])reasons.push(item.rule==='replay-drift'?`回放漂移: 旅程 ${item.scenario} 步骤 ${item.step} 与已验收基线不符（${list(item.differences.map(d=>d.path),3)}）——上次验收过的路这次没走一样`:`回放漂移: 旅程 ${item.scenario}${item.step?` 步骤 ${item.step}`:''} ${item.problem}`);
  for(const scenario of details.scenarios??[]){
   for(const step of scenario.steps??[])if(step.status==='FAIL')reasons.push(`旅程 ${scenario.id} 步骤 ${step.id} 不符（期望 ${json(step.expected)}，实际 ${json(step.actual)}）`);
   if(scenario.unexpectedSteps?.length)reasons.push(`旅程 ${scenario.id} 多出步骤: ${list(scenario.unexpectedSteps,3)}`);
  }
  return reasons;
 },
 visual:details=>[`视觉制品与基线不一致: ${details.actualFile}`],
 property:details=>(details.counterexamples??[]).map(counterexample=>`反例 ${counterexample.id}（seed=${details.seed}）`),
 semantic_alignment:details=>{
  const reasons=[];
  if(details.ontologyAck)reasons.push(`本体确认失效（${details.ontologyAck.rule}）: ${details.ontologyAck.fields.map(field=>`${field.field} 期望 ${clip(field.expected,20)} 实际 ${clip(field.actual,20)}`).join('，')}`);
  for(const finding of (details.findings??[]))if(finding.status==='FAIL')reasons.push(finding.runtimeUnbound?`符号 ${finding.symbol}: 无运行时来源绑定（requireRuntimeOrigin，注解≠运行时行为）`:`符号 ${finding.symbol}: 期望 ${clip(finding.expectedIri,50)}，实际 ${clip(finding.actualIri??'缺失',50)}`);
  return reasons;
 },
 semantic_relation:details=>(details.findings??[]).map(finding=>{
  const tripleText=`${clip(finding.from,40)} —${clip(finding.predicate,20)}→ ${clip(finding.to,40)}`;
  if(finding.rule==='missingRelation')return `代码缺少声明的关系: ${tripleText}`;
  if(finding.rule==='unsanctionedRelation')return `本体未认可该关系: ${tripleText}`;
  if(finding.rule==='undeclaredRelation')return `代码存在未声明的关系: ${tripleText} @ ${clip(finding.location??'',40)}`;
  if(finding.rule==='staleOntologyAck')return `本体确认失效，须重审关系声明并更新确认: ${finding.fields.map(field=>`${field.field} 期望 ${clip(field.expected,20)} 实际 ${clip(field.actual,20)}`).join('，')}`;
  return `关系引用未知概念: ${tripleText}（${clip(finding.detail??'',40)}）`;
 }),
 semantic_constraint:details=>(details.violations??[]).filter(v=>v.status==='FAIL').map(v=>`约束 ${v.constraintId} 在案例 ${v.caseId} 失败: ${JSON.stringify(v.left)} ${v.operator} ${JSON.stringify(v.right)}`),
 semantic_state:details=>(details.findings??[]).map(finding=>finding.rule==='unknownState'
  ?`案例 ${finding.caseId} 出现未声明状态: ${clip(finding.from,30)} → ${clip(finding.to,30)}`
  :finding.rule==='staleOntologyAck'?`本体确认失效，须重审状态声明并更新确认: ${finding.fields.map(field=>field.field).join('，')}`
  :`案例 ${finding.caseId} 非法转换: ${clip(finding.from,30)} → ${clip(finding.to,30)}`),
 semantic_instance:details=>(details.findings??[]).map(finding=>{
  if(finding.rule==='unknownConcept')return `记录 ${clip(finding.recordId,30)} 类型未解析: ${clip(finding.typeIri,50)}`;
  if(finding.rule==='missingEntity')return `实体 ${clip(finding.entityId,30)} 声明了期望类型但没有观察记录`;
  if(finding.rule==='typeMismatch')return `实体 ${clip(finding.entityId,30)} 类型不符: 期望 ${clip(finding.expectedIri,40)}，实际 ${list((finding.actualIris??[]).map(iri=>clip(iri,40)),3)}`;
  if(finding.rule==='disjointInstances')return `实体 ${clip(finding.entityId,30)} 被互斥的多类型标注: ${list((finding.typeIris??[]).map(iri=>clip(iri,40)),3)}`;
  if(finding.rule==='ambiguousInstanceType')return `实体 ${clip(finding.entityId,30)} 类型歧义（不可比较）: ${list((finding.typeIris??[]).map(iri=>clip(iri,40)),3)}`;
  if(finding.rule==='staleOntologyAck')return `本体确认失效，须重审实例声明并更新确认: ${finding.fields.map(field=>field.field).join('，')}`;
  return '实例对齐未通过';
 }),
 semantic_exposure:details=>(details.findings??[]).map(finding=>{
  if(finding.rule==='internalConceptExposed')return `内部概念暴露在公共面: ${clip(finding.label??finding.iri,40)} @ ${list((finding.locations??[]).map(loc=>clip(loc,40)),3)}`;
  if(finding.rule==='unknownExposedConcept')return `公共面出现未解析概念: ${clip(finding.iri,50)} @ ${list((finding.locations??[]).map(loc=>clip(loc,40)),3)}`;
  return `本体确认失效，须重审暴露策略并更新确认: ${finding.fields.map(field=>field.field).join('，')}`;
 }),
 semantic_consistency:details=>{
  const reasons=[];
  if(details.reasoner?.status==='DISAGREEMENT')reasons.push(`外部 reasoner 与内建推理不一致（仅外部声称 ${details.reasoner.claimedOnlyByExternal.length} 对、仅内核 ${details.reasoner.kernelOnly.length} 对）: ${details.reasoner.tool}`);
  if(details.reasoner?.status==='RUNNER_ERROR'||details.reasoner?.status==='INVALID')reasons.push(`外部 reasoner 失败: ${clip(details.reasoner.error,80)}`);
  if(details.ontologyAck)reasons.push(`本体确认失效，须重审一致性声明并更新确认: ${details.ontologyAck.fields.map(field=>field.field).join('，')}`);
  return reasons;
 },
 terminology:details=>(details.findings??[]).map(finding=>{
  if(finding.rule==='duplicateLabel')return `标签 ${clip(finding.label,40)} 被 ${finding.concepts.length} 个概念使用: ${list(finding.concepts.map(iri=>clip(iri,50)),3)}`;
  if(finding.rule==='ambiguousTerm')return `术语 ${clip(finding.term,40)} 命中多个概念: ${list(finding.matches.map(iri=>clip(iri,50)),3)}`;
  if(finding.rule==='unmatchedTerm')return `术语 ${clip(finding.term,40)} 未命中任何概念`;
  if(finding.rule==='staleOntologyAck')return `本体确认失效，须重审映射并更新确认: ${finding.fields.map(field=>`${field.field} 期望 ${clip(field.expected,20)} 实际 ${clip(field.actual,20)}`).join('，')}`;
  return `术语检查未通过`;
 }),
 scan:details=>(details.findings??[]).filter(finding=>finding.blocked).map(finding=>`${finding.severity} ${finding.rule} @ ${clip(finding.location,50)}${finding.acceptanceExpired?'（豁免已过期）':''}`),
 resilience:details=>[...(details.evidenceExpired?[`证据过期: observedAt=${details.evidenceExpired.observedAt} 距今 ${details.evidenceExpired.ageDays} 天 > ${details.evidenceExpired.maxAgeDays} 天`]:[]),...(details.scenarios??[]).filter(scenario=>scenario.status==='FAIL').map(scenario=>{
  const parts=[];
  if(scenario.transitionProblem)parts.push(scenario.transitionProblem);
  if(scenario.recoveryMs>scenario.maxRecoveryMs)parts.push(`恢复 ${scenario.recoveryMs}ms > ${scenario.maxRecoveryMs}ms`);
  if(scenario.finalState!==scenario.expectedFinalState)parts.push(`最终状态 ${scenario.finalState} ≠ ${scenario.expectedFinalState}`);
  if(scenario.missingSignals?.length)parts.push(`缺少信号 ${scenario.missingSignals.join('/')}`);
  return `${scenario.id}: ${parts.join('；')||'未通过'}`;
 })],
 consistency:details=>(details.checks??[]).filter(check=>check.status!=='PASS').flatMap(check=>{
  if(check.status==='ERROR')return [`${check.id}(${check.type}): ${clip(check.error,80)}`];
  if(check.type==='zero-sum')return [...(check.preCommitValidated===false?[`${check.id}: 未执行写前零和校验`]:[]),...(check.unbalanced??[]).map(o=>`${check.id}: 账单 ${o.id} 借贷不平衡（差额 ${o.balance}）`)];
  if(check.type==='append-only'){
   const reasons=(check.mutations??[]).map(m=>`${check.id}: 账本被改写 ${m.op} ${m.orderId}`);
   if(check.sourceType&&!check.sourceAccepted)reasons.unshift(`${check.id}: append-only 来源 ${check.sourceType} 不在接受列表 [${(check.acceptedSourceTypes??[]).join('/')}]`);
   return reasons;
  }
  if(check.type==='reconciliation')return (check.pairs??[]).filter(p=>p.unreconciledDiffs>0).flatMap(p=>[`${check.id}: 对账 ${p.id} ${p.unreconciledDiffs} 笔差异${p.slaBreached?'（超挂账 SLA）':''}`,...(p.diffs??[]).map(d=>`  差异 ${d.key}（账龄 ${Math.round(d.ageHours)}h）`)]);
  if(check.type==='dlq')return (check.violations??[]).map(v=>v.rule==='silentDataLoss'?`${check.id}: 队列 ${v.queue} DLQ 保留期 ${v.dlqRetentionSec}s < 源队列 ${v.sourceRetentionSec}s（静默丢数据）`:v.rule==='excessiveRedelivery'?`${check.id}: 队列 ${v.queue} 重投上限 ${v.maxReceiveCount} > ${v.limit}`:`${check.id}: 毒消息演练未通过`);
  return [`${check.id}: 操作无审计事件`,...(check.tamperedEvents??[]).map(t=>`${check.id}: 审计链在 seq=${t.seq} 处断裂/被篡改`),...(check.retentionShort?[`${check.id}: 审计留存不足`]:[])];
 }),
 budget:details=>(details.violations??[]).map(violation=>violation.rule==='budgetExceeded'?`${violation.service}: 下游超时需求 ${violation.requiredMs}ms > 预算 ${violation.budgetMs}ms`:violation.rule==='missingCallerBudget'?`${violation.service}→${violation.callee}: 调用方未声明超时预算`:`${violation.client}: 重试预算 ${violation.budgetPercent}% > 20%`),
 topology:details=>{
  const ruleText={failureDomainsUndeclared:'关键路径服务未声明故障域（缺 replicaDetails 且未显式 domainVerification:unavailable）',domainSpread:'关键服务副本故障域不足 2 个',dependencyDomainSpread:'关键依赖副本故障域不足 2 个',stateModelUndeclared:'关键服务未声明状态模型（stateless/consensus/standby）',replicaThreshold:'副本数低于状态模型阈值',consensusReplicasEven:'共识服务副本数为偶数（多数派浪费一票）',byzantineQuorum:'副本数低于拜占庭容错 3f+1',minCutOrder1:'存在一阶单点',asymmetricRoles:'副本 role 不对称且无 leader 语义',permanentPrimary:'存在不可轮转的永久 primary/leader'};
  return [...(details.findings??[]).map(f=>`${f.service}${f.dependency?`→${f.dependency}`:''}: ${ruleText[f.rule]??f.rule}${f.min!==undefined?`（${f.replicas} < ${f.min}）`:f.required!==undefined?`（${f.replicas} < ${f.required}）`:''}`),...(details.minCutOrder1??[]).map(cut=>`单点: ${cut.service}${cut.dependency?`→${cut.dependency}`:''}（${cut.domain}）`)];
 },
 rerun:details=>(details.violations??[]).map(violation=>violation.rule==='outputDivergence'?`任务 ${violation.job}: 同 seed 双次运行输出哈希不一致（出现 ${violation.hashes.length} 个不同输出）`:`任务 ${violation.job}: 复式恒等式不成立（借 ${violation.debits} ≠ 贷 ${violation.credits}）`),
 convention_alignment:details=>[...(details.rules??[]).filter(rule=>rule.severity!=='advisory'&&rule.hits?.length).flatMap(rule=>rule.hits.slice(0,5).map(hit=>`约定 ${rule.id} 命中: ${hit.word} @ ${hit.path}:${hit.line??'?'}——修复用词或更新豁免（来源 ${rule.source.file}${rule.source.section?` §${rule.source.section}`:''}）`))],
 trace_continuity:details=>(details.links??[]).filter(link=>link.status==='FAIL').flatMap(link=>(link.problems??[]).map(problem=>`断链 ${link.call}（${problem.rule}）: ${problem.problem}`)),
 symbol_grounding:details=>[
  ...(details.unresolved??[]).map(entry=>`${entry.path}:${entry.lines[0]} 说明符 ${entry.specifier} 无法对账（三分类均不可解析，尝试 ${clip(entry.attempts[0]??'',60)}）——引用不存在的东西是幻觉的典型形态，修正说明符或补声明面`),
  ...(details.unresolvedMember??[]).map(entry=>`${entry.path}:${entry.line} 成员 ${entry.member} 不在目标模块 ${entry.target} 的导出面——命名成员引用须有声明，修正成员名或在目标模块导出`),
  ...(details.unresolvedReference??[]).map(entry=>`${entry.path}:${entry.line} ${entry.kind==='endpoint'?'端点':'配置键'} ${entry.reference} 未在任何声明面——修正引用或补 API 存在性声明面登记`),
  ...Object.entries(details.importObservations?.languages??{}).flatMap(([language,result])=>[
   ...result.coverageGaps.map(gap=>`${language} 引用 ${gap.module}（${clip(gap.locations.join(', '),80)}）无适配器回报——观察不完整（observation-coverage-gap），重跑 import 参考适配器补全回报`),
   ...result.unresolved.map(entry=>`${language} import ${entry.module} 无法解析${entry.detail?`（${clip(entry.detail,60)}）`:''}——修正引用或安装/声明依赖`)
  ])
 ],
 configuration:details=>(details.findings??[]).map(finding=>`${finding.environment} ${finding.path} ${finding.rule}`),
 documentation:details=>(details.artifacts??[]).filter(artifact=>artifact.status==='FAIL').map(artifact=>{
  if(artifact.fileStatus&&artifact.fileStatus!=='FOUND')return `${artifact.role} 制品${artifact.fileStatus==='EMPTY'?'为空':'文件缺失'}: ${artifact.path}`;
  if(!artifact.path)return `${artifact.role} 制品缺失`;
  if(artifact.version!==artifact.expectedVersion)return `${artifact.role} 版本 ${artifact.version} ≠ ${artifact.expectedVersion}`;
  return `${artifact.role} 缺少主题: ${list(artifact.missingTopics,3)}`;
 }),
 debt:details=>{
  const reasons=(details.items??[]).filter(item=>item.gateStatus==='FAIL').map(item=>`债务 ${item.id}: ${item.reasons.join('/')}`);
  if(details.registerIssues?.includes('empty-register-undeclared'))reasons.push('空登记未显式声明: 需要 "none": true');
  if(details.registerIssues?.includes('none-with-entries'))reasons.push('none:true 与非空登记矛盾');
  for(const item of details.referenceChecks??[])if(item.status!=='PASS'&&item.status!=='FOUND')reasons.push(`债务 ${item.itemId}.evidence 引用未通过: ${item.type} ${item.target} → ${item.gateStatus??item.status}`);
  return reasons;
 },
 persistence:details=>{
  const reasons=[];
  if(details.request&&details.httpMatches===false)reasons.push(`HTTP ${details.request.status} ≠ ${details.expectedHttpStatus}`);
  const expectedCount=details.expectedRecordCount??1;
  if(details.recordCount!==undefined&&details.recordCount!==expectedCount)reasons.push(`落库记录数 ${details.recordCount} ≠ 期望 ${expectedCount}`);
  for(const result of details.recordResults??[])if(result.status!=='PASS')reasons.push(`批量第 ${result.index} 条记录字段不符: ${list(result.fields.filter(field=>field.status==='FAIL').map(field=>field.field),3)}`);
  for(const field of details.fields??[])if(field.status==='FAIL')reasons.push(`字段 ${field.field}: 期望 ${json(field.expected)}，实际 ${json(field.actual)}`);
  for(const delta of details.snapshots?.delta??[])reasons.push(`快照差异 ${delta.field}`);
  return reasons;
 },
 behavior:details=>{
  const reasons=[];
  if(details.missingRawTranscript)reasons.push('缺少原始用例观察记录（requireRawTranscript）');
  if(details.missingBaselineTranscript)reasons.push('缺少基线观察记录声明（requireBaselineTranscript）——观察记录未承载 baseline 块');
  if(details.replay?.status==='replay-baseline-modified')reasons.push(details.replay.problem);
  for(const item of details.replay?.drift??[])reasons.push(item.rule==='replay-drift'?`回放漂移: 用例 ${item.id} 与已验收基线不符（${list(item.differences.map(d=>d.path),3)}）——上次验收过的行为这次变了`:`回放漂移: 用例 ${item.id} ${item.problem}`);
  if(details.baseline?.mode==='git'){
   if(details.baseline.status==='missing')reasons.push('基线来源缺失（baselineMode:git）');
   else if(details.baseline.status==='embedded')reasons.push('基线为内嵌声明（embedded），baselineMode:git 不接受');
  }
  const ruleText={missingBaseline:'基线实际值缺失',f2pStillFailing:'新行为未交付（当前仍失败）',f2pPassedOnBaseline:'基线已通过（测试未绑定新行为，疑似伪修复）',p2pRegressed:'回归（当前失败）',p2pFailedOnBaseline:'基线即失败（不能作防回归证据）'};
  const expected=(details.expectedViolations??[]).map(violation=>`用例 ${violation.name}: ${violation.direction} ${ruleText[violation.rule]??violation.rule}`);
  return [...reasons,...expected,...(details.cases??[]).filter(item=>item.status==='FAIL').map(item=>`用例 ${item.id}: 期望 ${json(item.expected)}，实际 ${json(item.actual)}`)];
 },
 metrics:details=>(details.metrics??[]).filter(metric=>metric.status==='FAIL').map(metric=>`${metric.name}=${json(metric.actual)} 超出阈值`),
 ontology_map:details=>(details.mappings??[]).filter(mapping=>mapping.status!=='FOUND').map(mapping=>`映射 ${mapping.id} 未命中本体（${clip(mapping.iri,50)}）`),
 semantic_profile:details=>(details.violations??[]).map(violation=>`记录 ${violation.recordId} ${violation.path} 违反 ${violation.rule}${violation.message?`：${clip(violation.message,60)}`:''}`)
};

export const hasFailureExtractor=kind=>typeof extractors[kind?.replaceAll('-','_')]==='function';

export function failureReasons(evidence){
 if(!evidence||evidence.status==='SKIP'||evidence.status==='PASS')return [];
 if(evidence.status==='ERROR')return runnerFailure(evidence.details).length?runnerFailure(evidence.details):['未知错误'];
 const extractor=extractors[evidence.kind?.replaceAll('-','_')];
 const reasons=extractor?extractor(evidence.details??{}):[];
 return reasons.length?reasons:runnerFailure(evidence.details).length?runnerFailure(evidence.details):['未通过'];
}

const cell=value=>String(value).replaceAll('|','\\|').replaceAll('`',"'").replace(/\r?\n/g,' ');

export function durationText(startedAt,finishedAt){
 const start=Date.parse(startedAt??''),end=Date.parse(finishedAt??'');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
 const seconds=(end-start)/1000;
 if(seconds<60)return `${seconds.toFixed(1)}s`;
 const minutes=Math.floor(seconds/60);
 return `${minutes}m ${String(Math.round(seconds-minutes*60)).padStart(2,'0')}s`;
}

const headline=(report,entries,active,passed,skipped)=>{
 let text=`**Quality Gate ${report.status??'UNKNOWN'}** · ${report.stage??'?'} · ${passed}/${active.length} 通过${skipped?` · ${skipped} 跳过`:''}`;
 const duration=durationText(report.startedAt,report.finishedAt);
 if(duration)text+=` · 耗时 ${duration}`;
 return `${text} · run=${clip(report.id,8)}`;
};

// 证据降级标注（W3）：观察来源声明为可信度较弱的一类时（embedded 基线/static 观察/
// declared 来源），即使 PASS 也在报告中显式降级——数值仍自报，本框架只封来源声明。
export function downgradeNotes(report){
 const notes=[];
 for(const entry of Array.isArray(report.evidence)?report.evidence:[]){
  const details=entry.details;
  if(typeof details!=='object'||details===null)continue;
  if(entry.kind==='behavior'&&details.baseline?.status==='embedded')notes.push(`${entry.gateId}: 基线为内嵌声明（embedded，非真实历史）`);
  if(entry.kind==='engineering')for(const check of details.checks??[])if(check.baseline?.status==='embedded')notes.push(`${entry.gateId}.${check.id}: 基线为内嵌声明（embedded，非真实历史）`);
  if(entry.kind==='alignment'&&details.observationMode==='static')notes.push(`${entry.gateId}: 观察为静态读取（static，未发真实请求/未连真实存储）`);
  if(entry.kind==='consumer-matrix'){
   if(details.observationMode==='static')notes.push(`${entry.gateId}: 观察为静态读取（static，未发真实请求/未连真实存储）`);
   for(const row of details.matrix??[])if(row.usageSource==='declared')notes.push(`${entry.gateId}: 消费者 ${row.consumer} 使用面为 declared（runner 自报，无扫描/契约测试佐证）`);
  }
  if(entry.kind==='consistency')for(const check of details.checks??[])if(check.type==='append-only'&&check.sourceType==='declared')notes.push(`${entry.gateId}.${check.id}: append-only 来源为 declared（runner 自报，无外部日志佐证）`);
  if(entry.kind==='topology')for(const degradation of details.degradations??[])notes.push(`${entry.gateId}.${degradation.service}: 故障域信息不可核验（项目显式声明 domainVerification:unavailable，域判定降级）`);
 }
 return notes;
}

// 证据力汇聚（R12，v1.10.1）：只读聚合各门禁 details 的实测信号，回答"这次 PASS 由什么强度的证据支撑"。
// 等级由实测推导，不预设：anchored=存在内核可独立核验的证据信号（git 基线 rev-parse 核验/来源指纹磁盘
// 核验/同 seed 双次运行哈希一致/持久化前后快照交叉核验/原始测试输出内核解析 v1.11 B1）；declared=仅
// runner 自报数值（测试计数、覆盖率、变异分数、性质用例，形状经内核校验）；downgraded=存在来源
// 降级声明（复用 downgradeNotes，优先级最高）。只统计 PASS 门禁（非 PASS 证据不支撑准出）；
// 本层不新增采集、不改变任何门禁判定。
export function evidenceStrength(report){
 const signals={gitBaselines:0,fingerprints:0,rerunDeterministic:0,snapshots:0,rawOutputs:0,baselineContents:0};
 const tests={total:0,passed:0,failed:0,skipped:0,checks:0};
 const coverage=[];const mutation=[];let property=null;let behaviorCases=0;
 for(const entry of Array.isArray(report.evidence)?report.evidence:[]){
  if(entry.status!=='PASS')continue;
  const details=entry.details;
  if(typeof details!=='object'||details===null)continue;
  if(details.baseline?.status==='verified')signals.gitBaselines++;
  // 基线内容核验（v1.15）：git show 内容比对一致的基线内容绑定计入独立锚点
  if(details.baseline?.contentVerified)signals.baselineContents++;
  if(entry.kind==='engineering')for(const check of details.checks??[]){
   if(check.baseline?.status==='verified')signals.gitBaselines++;
   if(check.baseline?.contentVerified)signals.baselineContents++;
   if(check.rawOutput?.crossCheck==='match')signals.rawOutputs++;
   // 基线原始输出（v1.15 T3）：基线侧 TAP/JUnit 内核解析一致计入"原始输出解析"
   if(check.baselineRawOutput?.crossCheck==='match')signals.rawOutputs++;
   if(check.type==='test'){
    if(Number.isInteger(check.total)){
     tests.total+=check.total;tests.passed+=check.passed;tests.failed+=check.failed;tests.skipped+=check.skipped;tests.checks++;
    }
    if(check.coverage?.ratio!==undefined)coverage.push(`${entry.gateId}.${check.id} ${Math.round(check.coverage.ratio*1000)/10}%（${check.coverage.tool}）`);
   }
   if(check.type==='metric'&&check.score!==undefined)mutation.push(`${entry.gateId}.${check.id} ${Math.round(check.score*1000)/10}%`);
  }
  if(entry.kind==='property'&&details.caseCount!==undefined)property={gate:entry.gateId,seed:details.seed,cases:details.caseCount,counterexamples:details.counterexamples?.length??0};
  if(entry.kind==='behavior'&&Array.isArray(details.cases))behaviorCases+=details.cases.length;
  // 原始观察记录（v1.13）：behavior/journey 观察记录核验一致计入"原始输出解析"信号
  if((entry.kind==='behavior'||entry.kind==='journey')&&details.rawTranscript?.crossCheck==='match')signals.rawOutputs++;
  if(entry.kind==='rerun')for(const job of details.jobs??[])if(job.deterministic)signals.rerunDeterministic++;
  if(entry.kind==='persistence'&&details.snapshots)signals.snapshots++;
  if(entry.kind==='alignment'&&details.sourceFingerprint?.status==='VERIFIED')signals.fingerprints++;
 }
 const quantitative=tests.checks+coverage.length+mutation.length+(property?1:0)+(behaviorCases>0?1:0);
 const anchorCount=signals.gitBaselines+signals.fingerprints+signals.rerunDeterministic+signals.snapshots+signals.rawOutputs+signals.baselineContents;
 const signalTotal=quantitative+anchorCount;
 const downgrades=downgradeNotes(report).length;
 const level=signalTotal===0?'none':downgrades>0?'downgraded':anchorCount>0?'anchored':'declared';
 return {level,signals,tests,coverage,mutation,property,behaviorCases,downgrades,signalTotal};
}

const strengthLabels={anchored:'核验级',declared:'声明级',downgraded:'降级'};
// 单行呈现：证据信号与定量信号各截前 4 项；none 时返回 null（无可汇聚信号不虚报一行）
function strengthLine(strength){
 if(!strength||strength.level==='none')return null;
 const parts=[strengthLabels[strength.level]];
 const anchorBits=[];
 if(strength.signals.gitBaselines)anchorBits.push(`git 基线核验 ${strength.signals.gitBaselines}`);
 if(strength.signals.fingerprints)anchorBits.push(`来源指纹 ${strength.signals.fingerprints}`);
 if(strength.signals.rerunDeterministic)anchorBits.push(`双次运行一致 ${strength.signals.rerunDeterministic}`);
 if(strength.signals.snapshots)anchorBits.push(`持久化快照 ${strength.signals.snapshots}`);
 if(strength.signals.rawOutputs)anchorBits.push(`原始输出解析 ${strength.signals.rawOutputs}`);
 if(strength.signals.baselineContents)anchorBits.push(`基线内容核验 ${strength.signals.baselineContents}`);
 if(anchorBits.length)parts.push(`信号 ${list(anchorBits,4)}`);
 const quantityBits=[];
 if(strength.tests.checks)quantityBits.push(`测试 ${strength.tests.passed}/${strength.tests.total}${strength.tests.skipped?`（跳过 ${strength.tests.skipped}）`:''}`);
 if(strength.coverage.length)quantityBits.push(`覆盖率 ${list(strength.coverage,3)}`);
 if(strength.mutation.length)quantityBits.push(`变异 ${list(strength.mutation,3)}`);
 if(strength.property)quantityBits.push(`性质 ${strength.property.cases} 例（seed ${strength.property.seed}）`);
 if(strength.behaviorCases)quantityBits.push(`行为 ${strength.behaviorCases} 例`);
 if(quantityBits.length)parts.push(`定量 ${list(quantityBits,4)}`);
 return `证据力: ${parts.join(' · ')}`;
}

export function renderBrief(report){
 try{
  const entries=Array.isArray(report.evidence)?report.evidence:[];
  const active=entries.filter(entry=>entry.status!=='SKIP');
  const passed=active.filter(entry=>entry.status==='PASS').length;
  const skipped=entries.length-active.length;
  const lines=[];
  lines.push(`${symbol[report.status]??''} ${headline(report,entries,active,passed,skipped)}`);
  if(report.error)lines.push(`内部错误: ${clip(report.error,120)}`);
  const coverageRows=report.levelCoverage??report.domainCoverage;
  if(Array.isArray(coverageRows)&&coverageRows.length)lines.push(`层级覆盖: ${coverageRows.map(item=>`${item.level??item.domain} ${domainMark[item.status]??'?'}`).join(' · ')}`);
  const unmetLevels=report.unmetRequiredLevels??report.unmetRequiredDomains;
  if(unmetLevels?.length)lines.push(`未满足必需层级: ${unmetLevels.join(', ')}`);
  const notes=downgradeNotes(report);
  if(notes.length)lines.push(`证据降级: ${list(notes,3)}`);
  const strength=strengthLine(evidenceStrength(report));
  if(strength)lines.push(strength);
  lines.push(`完整证据: ${stripCwd(report.reportPath??`${report.root}/.quality-gate/runs/${report.id}.json`)} · 全表: node "${qgateCli}" report "${stripCwd(report.root)}" ${id8(report)}`);
  return lines.join('\n');
 }catch(error){return `${symbol[report.status??'ERROR']} **Quality Gate ${report.status??'ERROR'}** · 摘要渲染失败: ${error.message}`;}
}

export function renderSummary(report){
 try{
  const entries=Array.isArray(report.evidence)?report.evidence:[];
  const active=entries.filter(entry=>entry.status!=='SKIP');
  const passed=active.filter(entry=>entry.status==='PASS').length;
  const skipped=entries.length-active.length;
  const lines=[];
  lines.push(headline(report,entries,active,passed,skipped));
  if(report.error)lines.push(`内部错误: ${clip(report.error,120)}`);
  const coverageRows=report.levelCoverage??report.domainCoverage;
  if(Array.isArray(coverageRows))lines.push(`层级覆盖: ${coverageRows.map(item=>`${item.level??item.domain} ${domainMark[item.status]??'?'}`).join(' · ')}`);
  const unmetLevels=report.unmetRequiredLevels??report.unmetRequiredDomains;
  if(unmetLevels?.length)lines.push(`未满足必需层级: ${unmetLevels.join(', ')}`);
  const notes=downgradeNotes(report);
  if(notes.length)lines.push(`证据降级: ${list(notes,3)}`);
  const strength=strengthLine(evidenceStrength(report));
  if(strength)lines.push(strength);
  // 任务意图基准行（v1.17 轨道 A）：登记存在与绑定核验结果一行可见——漂移细节仍在失败原因列
  const intent=entries.map(entry=>entry.details&&typeof entry.details==='object'?entry.details.taskIntent:null).find(item=>item&&typeof item==='object');
  if(intent){
   const stateText=intent.status==='verified'?'内容哈希绑定一致':intent.status==='intent-file-modified'?'内容哈希绑定不符——修订须显式（--revise+reason）':intent.status==='no-task-intent'?'未登记——没有意图基准的"完成"只是 agent 自述':'未绑定哈希（漂移对账无守护）';
   lines.push(`任务意图基准: ${intent.taskId??'—'}（${stateText}${intent.status!=='no-task-intent'?` · scope ${intent.scopePatterns?.length??'?'} 项 · ${intent.outsideTaskScope?.length?`越界 ${intent.outsideTaskScope.length} 项`:'对账通过'}`:''}）`);
  }
  if(report.exceptions?.length){
   const blocking=report.exceptions.filter(item=>item.waiver?.status!=='waived');
   const waived=report.exceptions.filter(item=>item.waiver?.status==='waived');
   if(blocking.length)lines.push(`未决例外: ${list(blocking.map(item=>`${item.id}${item.waiver?.reason?`（${item.waiver.reason==='expired'?'豁免已过期':item.waiver.reason==='not-yet-effective'?'审批未生效':''}）`:''}`),3)}——登记即阻断`);
   if(waived.length)lines.push(`已豁免例外: ${list(waived.map(item=>`${item.id}（审批 ${item.approvedBy}，至 ${item.expiresAt}）`),3)}——不改变门禁判定，仅免于登记阻断`);
  }
  if(report.dependencies?.missing?.length)lines.push(`缺少外部依赖: ${report.dependencies.missing.map(item=>`${item.tool}（门禁 ${list(item.gateIds,3)}）`).join('；')}；安装指引: ${report.dependencies.missing.map(item=>item.url).join(' / ')}`);
  lines.push('');
  if(entries.length){
   lines.push('| ID | 域 | Kind | 状态 | 耗时 | 原因 | 建议 |');
   lines.push('|----|----|------|------|------|------|------|');
   for(const entry of entries){
    const reasons=failureReasons(entry);
    const reason=reasons.length?cell(list(reasons,maxReasons)):'—';
    const duration=durationText(entry.startedAt,entry.finishedAt)??'—';
    lines.push(`| ${cell(entry.gateId)} | ${cell(entry.level??entry.domain??'?')} | ${cell(entry.kind??'?')} | ${symbol[entry.status]??''} ${entry.status} | ${duration} | ${reason} | ${suggestions[entry.status]??''} |`);
   }
  }else lines.push('本次运行没有执行任何门禁。');
  lines.push('');
  lines.push(`完整证据: ${stripCwd(report.reportPath??`${report.root}/.quality-gate/runs/${report.id}.json`)}`);
  lines.push(report.status==='PASS'?'全部通过；证据已归档。':`修复失败项后重跑: node "${qgateCli}" "${stripCwd(report.root)}" ${report.stage??'close'}；不要通过禁用门禁来放行。`);
  return lines.join('\n');
 }catch(error){return `**Quality Gate ${report.status??'ERROR'}** · 摘要渲染失败: ${error.message}\n完整证据: ${report.reportPath??'未知'}`;}
}
