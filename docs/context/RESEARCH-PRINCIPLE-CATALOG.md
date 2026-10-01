# 架构原则范围调研:建议纳入插件的候选原则目录

日期:2026-09-25。状态:调研报告(未实施任何条目;第 4 章为候选清单,纳入与否由用户逐项决策)。

**定位**:本文回答"四原则之外,还应纳入哪些架构原则"。与 [RESEARCH-ARCH-PRINCIPLES.md](RESEARCH-ARCH-PRINCIPLES.md)(四原则的语义深化,建议 R1–R18)互补,两文不重复:凡上轮已覆盖(故障域/割集、副本分型、灰度判定协议、重跑确定性、供应链签名、混沌演练、F2P/P2P 等)此处只引用不重述。

**方法与证明边界**:4 个并行 Web 调研(性能工程/安全架构/弹性与数据一致性/可运维与演进),约 65 项候选发现,去重后精选 50 项。二手来源声明见第 8 章;所有"机检表达"均为设计提案,demo 只能证明协议与判定链路,不等于生产认证(对齐 AGENTS.md)。

---

## 1. 现有覆盖盘点(对照基线)

**内置原则(4)**:实时链路无单点、关键后台平等多活、核心链路可灰度试算、批量可重跑并跑(L4 metrics 违背数)。

**CONFIG-GUIDE 模式库(13 条)**:分层单向依赖、禁止循环依赖、同步调用扇出上限、每跳超时预算、重试上限、错误率/可用性 SLO 与错误预算、容量冗余 N+1、RPO/RTO、连接池/线程池/队列长度上限、幂等覆盖率、降级开关覆盖率、密钥轮换周期、慢查询/慢事务预算。

**相关 gate**:resilience(DB 不可用/重复消息/外部超时演练+四信号)、invariant(跨表谓词)、persistence(幂等双 gate)、scan(五类)、configuration(多环境+明文秘密失败)、migration(up/down)、operational(八项演练)、debt/decisions/documentation。

关键判断:**候选原则约六成是对模式库既有条目的"深化"而非全新**——深化方向集中在三点:从"数值上限存在"到"全局守恒校验"(如超时预算求和)、从"配置存在"到"演练证据"(熔断/降级/探针)、从"静态声明"到"静默丢失类缺陷的显式证据"(DLQ retention、对账差异、迟到事件)。

---

## 2. 候选原则目录(A 性能)

| # | 原则(一句话) | 来源 | 机检表达(草案) | 与现有关系 |
|---|---|---|---|---|
| A1 | **尾部承诺**:对外延迟承诺必须以 P99/P99.9 声明;扇出链路尾部风险 `1-(1-p)^N` 静态可算 | Dean & Barroso "The Tail at Scale", CACM 2013;Google SRE Book ch.4/6 | 每个 API 声明 `latencySlo{percentile,thresholdMs,window}`;`fanoutTailRisk<=budget`(纯静态) | 深化"SLO"条目:百分位强制+扇出放大 |
| A2 | **预算守恒**:端到端延迟预算必须 ≥ 各跳(含重时)之和;超时设在延迟分布高分位 | AWS Builders' Library "Timeouts, retries, backoff with jitter";5 层×3 重试=243 倍放大 | `timeoutBudgetTree` 校验 `upstream.timeout>=Σchildren`;`falseTimeoutRateTarget` 对照 p99.9 | 深化"每跳超时/重试上限":从单跳存在性到全局求和 |
| A3 | **风暴防护**:重试占总流量预算(典型≤20%)+full jitter;超时-重试-熔断参数作为整体联合演练 | 同上;Brooker "Exponential Backoff and Jitter" 2015;Fowler CircuitBreaker 2014 | `retryBudgetPercent/jitterMode`;组合演练证据:过载+熔断开路时 `retryToTotalRatio<=预算` | 新增"组合交互"维度:单机制各自 PASS、组合爆炸是最易漏的交互缺陷 |
| A4 | **背压有界**:组件间通道禁止无界缓冲;过载必须先拒绝后劣化 | Reactive Streams 规范/JCP 266;AWS "Using Load Shedding to Avoid Overload";Netflix concurrency-limits | `unboundedQueueCount==0`;`admissionControl{present,priorityClasses>=2}`;演练 `shedUnderOverload`(高优先级 P99 保持+拒绝响应可区分+无残留劣化);`staticStability`(关自动扩容扛 2× 常态负载) | 深化"队列长度上限":无界=违规、拒绝必须"便宜" |
| A5 | **尾部对冲仅限幂等读**:读依赖可对冲(超 p95 发第二副本,额外负载≤5%),写路径禁止 | Dean & Barroso 2013(BigTable backup requests) | `hedgingPolicy{delayPercentile:95,maxExtraLoadPercent:5}`+慢副本注入演练;断言 `hedgeTargetSupportsIdempotentReads` | 新增;与幂等覆盖率联动 |
| A6 | **容量可推导**:并发/队列声明必须满足 Little's Law(L=λW);扩容主张必须给出实测加速比(Amdahl/USL 退化拐点留余量) | Little, Oper. Res. 1961;Amdahl 1967;Gunther USL(arXiv:0808.1431) | `declaredConcurrency≈throughputTarget×latencyBudget`(静态一致性);`uslFit{points>=4,alpha,beta,peakLoad}`,`ratedLoad<=peak×0.7` | 深化"N+1":数学一致性零成本静态校验 |
| A7 | **隔离分舱**:关键依赖不与他人共享池;单舱打满不影响其余舱 | Azure Bulkhead pattern;Netflix Hystrix;AWS "Fairness in Multi-tenant Systems" | `criticalDependenciesWithSharedPool==0`;干扰演练:打满 A 依赖,断言 B 路径 `interferencePercent<=阈值`;`noisyNeighborTest` | 深化"连接池上限":从上限到 per-dependency/per-tenant 隔离维度 |
| A8 | **负载阶梯单调**:至标称容量前吞吐不得随负载下降 | Smaalders "Performance Anti-Patterns", ACM Queue 2006 | 阶梯压测 `[0.5,0.75,1.0]×ratedCapacity`,`throughputMonotonic`(容差 3%) | 新增;与 A4 过载演练互补(容量内稳定/容量外可控) |
| A9 | **查询形状有界**:每操作 DB 往返 O(1),禁止 N+1 | Fowler PoEAA 2002;Hibernate in Action 2005;pytest assertNumQueries 实践 | `queryCountPerOperation<=budget`;断言 `queryCount(size=100)==queryCount(size=10)` | 深化"慢查询预算":条数/形状维度 |
| A10 | **读己之写**:经缓存/副本的读路径必须保证会话内 read-your-writes;热键过期不得引发重建风暴 | Terry et al. "Session Guarantees", PDIS 1994;Vattani et al. cache stampede, PVLDB 2015 | `readPathConsistency{mechanism}`;行为测试 `staleReadAfterWrite==0`;`stampedeDrill`(强制过期最热键,`maxConcurrentRebuilds<=2`) | 新增(一致性×性能交叉) |
| A11 | **性能预算绝对制**:CI 比较用绝对预算,禁止"比上版慢 X% 可以"的相对棘轮 | Alex Russell performance budgets 2017;web.dev | `endToEndBudgetMs→逐跳分解`;`artifactSizeBytes<=sizeBudget` | 新增纪律条款 |
| A12 | **后台活动有界**:交互流量优先;后台任务可调度、影响有界、大任务拆小 | Dean & Barroso 2013 变异性管理 | `gcPauseP99Ms<=budget`;`backgroundTaskHasSchedule`;`maxWorkItemSizeBytes` | 新增 |

## 3. 候选原则目录(B 弹性与数据正确性)

| # | 原则 | 来源 | 机检表达(草案) | 与现有关系 |
|---|---|---|---|---|
| B1 | **熔断可演练**:不稳定依赖经三态状态机,`closed→open→half-open→closed` 全路径演练过才算有熔断 | Nygard《Release It!》2007;Fowler 2014;AWS 点名 modal behavior 是测试缺陷之源 | `breakerStateTransitions` 演练证据(复用 resilience 四信号);`breakerEventsLogged` | 新增;配置存在≠证据 |
| B2 | **可被安全杀死**:crash-only 恢复(kill -9 后状态一致+恢复有界);SIGTERM 排空在 grace period 内完成 | Candea & Fox "Crash-Only Software", HotOS 2003;K8s Pod Lifecycle | `kill -9` 注入+`crashRecoveryMs`;SIGTERM 演练:`drainCompletesWithinGracePeriod`、`podsKilledDuringRolloutWithRequestErrors==0` | 扩展 resilience 故障类型+operational stop/start 语义 |
| B3 | **降级模式显式**:每个非关键依赖声明目标降级模式并演练;依赖故障表现为 not-ready 而非重启级联 | AWS REL05;K8s 探针语义 | `degradedModes[]{dependency,trigger,corePathsPreserved}`;演练断言降级期核心交易成功率;探针行为断言(停 DB→摘流量而非 restart loop) | 深化"降级开关覆盖率":从有开关到有目标模式+演练 |
| B4 | **消息默认 at-least-once+幂等消费+死信有界**:`dlqRetention>=sourceRetention`(违者=静默丢数据),毒消息 N 次重投后必入 DLQ 且告警 | AWS SQS DLQ 官方文档;Azure Idempotent Consumer | `dlqMaxReceiveCount(3-5)`;关系校验 `dlqRetentionGeSource`;演练:`dlqOldestAgeSec`、主队列恢复流动 | 深化"幂等覆盖率":静默丢失类缺陷显式化 |
| B5 | **补偿完整**:Saga 每个正向操作有幂等可重试的补偿;断点矩阵逐步注入失败验证回到一致 | Temporal saga 实践;工程共识(补偿必须幂等) | `sagaSteps{action,compensation}`;`compensationCoverage==100%`;每步注入失败断言账本零和+重复补偿不二次冲正 | 新增 |
| B6 | **账务零和+不可变账本**:每笔资金操作 entries 写前求和为零;账本 append-only;调整=追加新单 | Uber "Zero-Sum by Design" 2025(pre-commit 校验+不可变 money order) | invariant 强化:`perEntrySumZero`(写前)、`balanceDerivable`(余额=Σentries)、schema 层禁 UPDATE/DELETE 路径;反例:借贷不平必须被拒并留证 | 强化 invariant/persistence(金融 demo 核心不变量) |
| B7 | **持续对账**:总分核对+双边对账是持续运行的最终防线;差异显式挂账带 SLA | Modern Treasury;结算系统两层对账实践("Reconciliation is where reality enters") | `reconciliationPairs{sourceA,sourceB,intervalSec}`;证据:`unreconciledDiffs`、`diffAgeBuckets`、`breakResolutionSlaHours`;对账=周期调度的 invariant(复用 eq/ge 谓词) | 新增运行时形态;与 B6 成对 |
| B8 | **双时间轴正确性**:金融事实携带 valid time+transaction time;迟到事件按 valid time 入账,as-of 查询可重建任一时点认知 | Fowler & Carlson Temporal Patterns 1998;Johnston《Bitemporal Data》;TigerBeetle 2026 | schema 校验 `bitemporalColumns{validFrom,validTo,recordedAt}`+修订=新增行;as-of 测试协议 | 新增(审计与争议处理的前提) |
| B9 | **契约兼容显式**:每个接口声明兼容级别(BACKWARD/FORWARD/FULL),breaking change CI 阻断;破坏性 schema 变更必须 expand/contract 两阶段 | Confluent Schema Registry 兼容矩阵;oasdiff/openapi-diff 工具链 | `compatibilityLevel` 声明+`breakingChangesDetected`(diff 工具结构化输出,非空即 FAIL);`inPlaceDestructiveMigrations==0` | 扩展 alignment/migration:方向性兼容+CI 阻断 |
| B10 | **一致性级别显式声明**:每读写路径声明 R/W 或级别;`R+W>N` 校验;会话保证(RYW/单调读)行为测试 | Terry et al. 1994;Dynamo/Cassandra 实践 | `declaredConsistency` 覆盖率 100%;RYW 测试:写后立读(副本延迟注入下仍成立) | 深化上轮 PACELC/quorum 发现为可测协议 |

## 4. 候选原则目录(C 安全)

| # | 原则 | 来源 | 机检表达(草案) | 与现有关系 |
|---|---|---|---|---|
| C1 | **逐跳显式授权(complete mediation)**:每个端点显式声明鉴权策略(anonymous 合法但必须显式),缺省即拒绝 | Saltzer & Schroeder, Proc. IEEE 1975;OWASP API Top10 BOLA/BFLA | OpenAPI 逐 operation 校验 `security∈{anonymous,authenticated,service-role}`:`endpointsWithoutAuthz==0`;越权负例:`bolaNegativeTests`(A 的凭证访问 B 的对象断言 403) | 新增;与"每 gate 正例+反例"约定同构 |
| C2 | **故障即拒绝(fail-secure)**:鉴权依赖故障(超时/500/空主体)必须落到 401/403 分支,绝不 fail-open | CWE-636;NIST SP 800-82r3 | `authzFailureModeTests`:每个鉴权依赖注入故障断言拒绝;`emptyCatchInAuthzPath==0` | 新增负例类 |
| C3 | **最小权限可审计**:服务声明所需权限,比对声明 vs 使用;容器非 root、非 privileged | Saltzer & Schroeder 1975;AWS IAM Access Analyzer 思路 | `excessivePermissions==0`;`containersRunningAsRoot==0`(IaC findings 复用 scan);demo 边界:声明即审计 | 复用 scan(iac) |
| C4 | **零信任传输**:服务间调用全部 mTLS/TLS(内网亦然,PCI DSS 4.2.1);网络策略默认拒绝;弱算法禁用 | NIST SP 800-207;PCI DSS 4.0;SP 800-52r2 | 清单推导:`interServiceCallsWithoutMTLS==0`;`namespacesWithoutDefaultDenyNetworkPolicy==0`;`tlsVersionWhitelist[1.2,1.3]`+回环 DAST 实际协商探测(静态与运行时双证据) | 扩展 scan/dast 协议 |
| C5 | **密钥短期化**:零明文(已有)+每凭据 `issuedAt` 轮换上限(≤90 天)+CI 无长期静态凭据(OIDC/keyless)+秘密必须解析到 vault 路径 | GitHub PAT 指南;gitleaks;keyless 实践 | `maxCredentialAgeDays<=90`;`staticCredentialsInCI==0`;`secretsSourcedFromVault` | 深化"密钥轮换"与 configuration 明文秘密检查 |
| C6 | **审计防篡改可归因**:关键操作(state-changing 端点)全量产生含 actor 的审计事件;日志 append-only hash chain 可验证;留存达标(PCI 365 天/SOX 7 年按分级) | PCI DSS 4.0 Req 10;SOX;Certificate Transparency/Rekor | `stateChangingEndpointsWithoutAuditEvent==0`;`auditChainVerified`(CI 重算 hash chain);`auditRetentionDays>=分域阈值` | 新增证据类型(demo 可实现 hash-chain 验证器出真实证据) |
| C7 | **分区与管道**:每个部署单元归属安全 zone,跨 zone 流量只经声明 conduit,zone 标定目标 SL 并推导检查项 | IEC 62443-3-2/-3-3(zones/conduits/SL1-4) | `zones[]/conduits[]` 登记;`crossZoneFlowsWithoutConduit==0`(调用图×声明双向核对);金融 demo:账务核心区/接入区/管理区 | 新增(拓扑级安全,与架构拓扑登记共用图) |
| C8 | **威胁模型即代码**:模型覆盖全部关键资产,STRIDE 六类逐一有结论,威胁挂缓解+测试证据 | pytm/Threagile/Threat Dragon;abuse cases | `assetsWithoutThreatModel==0`;`strideCategoriesPerAsset==6`;`abuseCasesWithoutTestEvidence==0`;`lastSyncedWithCode<=N 天` | 新增 L0/L4 交叉(证明边界:只证模型闭环,不证枚举正确) |
| C9 | **数据分级与最小保留**:每个存储/字段声明 classification+retentionDays;敏感字段静态加密;API 字段级分类标注 | PCI DSS Req 3;OpenMetadata lineage 实践 | `untaggedDataStores==0`;`storesWithoutRetentionPolicy==0`;`unclassifiedApiFields==0`(OpenAPI x-data-class) | 扩展 configuration/documentation |
| C10 | **安全主张须可引用证据**:文档中的安全断言必须引用 evidence ID,否则 FAIL(CISA 反"空泛安全声明") | CISA Secure by Design 2023;NIST CSF 2.0 | `unsupportedSecurityClaims==0`(claim 清单×evidence 引用) | 强化 Claim→Evidence 语义本身,零新增概念 |
| C11 | **AI 流水线自身防护**:agent 工具白名单+权限分级;不可逆副作用工具须人类审批;不可信外部内容进上下文须标记 | OWASP LLM Top10 2025(LLM01/LLM06);Agentic Top10(ASI01-03) | `agentToolsUndeclared==0`;`requiresHumanApproval` 工具调用记录含审批证据;`untrustedContentMarked` | 新增;现有"DAST 仅回环授权"即 ASI03 实例,可按此框架重述 |

## 5. 候选原则目录(D 可运维与演进)

| # | 原则 | 来源 | 机检表达(草案) | 与现有关系 |
|---|---|---|---|---|
| D1 | **探针契约**:liveness/readiness 语义分离(依赖故障→摘流量而非重启级联);两者端点不复用 | K8s 探针文档;microservices.io | 演练断言:停 DB→not-ready 而非 restart loop;`probesSharingSameEndpoint==0` | 扩展 resilience/operational |
| D2 | **变更可逆且双向演练过**:每次变更登记 `reversible`;不可逆须升级审批;每次发布关联同栈回滚演练,实测恢复时间≤声明 RTO | Bezos 两向门;DORA failed deployment recovery time;AWS "未演练过的回滚等于不存在" | `irreversibleChangesWithoutApproval==0`;`changesWithoutRollbackDrill==0`;`measuredRto<=declaredRto` | operational 已有 rollback 演练,深化为 per-change 断言 |
| D3 | **flag 是有寿命的债**:关键变更挂 flag 且默认值安全(flag 服务不可用→旧行为);创建即登记 expiry/owner/清理条件;过期未删按高严重度债阻断 | Harness flag debt;Knight Capital 2012 反例 | flag 登记复用 debt 协议:`flagsWithoutExpiry==0`;演练:断 flag 存储→断言旧行为;`expiredFlagsNotRemoved==0` | 复用 debt 门禁,零新协议 |
| D4 | **监控最小完备**:每服务四黄金信号(latency/traffic/errors/saturation)各有指标,延迟按成败分列;每条 page 级告警挂 runbook | Google SRE Book ch.6;RED/USE | `servicesMissingAnyGoldenSignal==0`(信号矩阵×指标名);`alertsMissingRunbook==0`(规则注解静态核验) | 新增静态核验,最易先落地 |
| D5 | **PRR 清单化**:上线前结构化就绪清单逐项有证据指针 | Google SRE Workbook PRR | `prrItemsWithoutEvidence==0` | 复用登记+证据模式 |
| D6 | **诊断即代码+runbook 新鲜度**:机械处置步骤是脚本(doctor 退出码即诊断证据);runbook 带 last-verified 且引用当前版本 | Netflix doctor/Winston(演讲披露) | 演练调 doctor 脚本,退出码入证据;`runbookStalenessDays<=180` | 扩展 operational diagnosis |
| D7 | **弃用有通知期**:breaking change 必须配弃用登记(通知/移除日期/替代);`Sunset` 头;过移除期的旧端点不得存活 | 行业 API 政策(≥90 天);oasdiff | `breakingChangesWithoutDeprecationNotice==0`;`deprecatedEndpointsPastRemovalDateStillLive==0` | 与 B9 同基础设施(diff 工具) |
| D8 | **无主代码即债**:每服务 owner 可解析到存活团队;认知复杂度超限(15)登记为债 | Team Topologies 2019;CODEOWNERS;Campbell 认知复杂度 | `servicesWithoutOwner==0`;`ownersPointingToUnknownTeam==0`;`functionsWithCognitiveComplexityOver15` 入 debt | 复用 debt;耦合度量归上轮 |
| D9 | **环境偏差最小**:backing services 三环境版本一致;配置键集合一致仅值不同 | 12-Factor Factor X | `backingServiceVersionDrift==0`;`configKeysParity` | 深化 configuration(现有 allowedDifferences 管"声明的差异",此管"版本漂移") |
| D10 | **备份必须恢复验证过**:"未恢复验证的备份不是备份";DR 演练新鲜度+实测 RTO/RPO | AWS Well-Architected;NIST SP 800-34 | `backupsWithoutRestoreTest==0`;`lastRestoreTestAgeDays<=90`;恢复后 checksum 比对 | operational DR 项深化:新鲜度+实测vs声明 |
| D11 | **决策↔ADR 双向核对**:decisions 登记与 ADR 文件互相解析;编号连续;状态机合法(superseded 必须指向后继) | Nygard ADR 2011;MADR | `decisionRecordsWithoutAdr==0`;`adrNumberingGaps==0`;`adrStatusValid` | decisions 门禁直接扩展 |

## 6. 横切元原则(证据合格性,适用于所有域)

| # | 元原则 | 来源 | 说明 |
|---|---|---|---|
| E1 | **测量纪律前置**:coordinated omission 纠正(从"打算发送"起算,open 负载模型)+统计化比较(非参数检验+效应量+固定样本量)是**所有性能证据的合格性前置**,不合格工具产出的 P99 不予采信 | Gil Tene "How NOT to Measure Latency";Performance Calendar 2024;benchstat/criterion 实践 | 建议做成 metrics 门禁的 evidence-validity 子检查(先于阈值比较) |
| E2 | **声明须锚定**:任何布尔自声明(canarySupported/rerunnable/authz 存在)无对应运行时证据锚点时降级为 Risk(上轮 R5/R7 的通用化) | 架构适应度函数哲学+DO-178C 独立性 | 目录中所有"演练证据"字段即锚点 |
| E3 | **安全主张可引用**(=C10)与**框架映射可报告**(SSDF 任务 ID 挂 gate,输出覆盖报告) | NIST SP 800-218;CISA SbD | 元门禁:检查其他门禁的存在性与映射完整性 |

---

## 7. 推荐分层(候选,待用户决策)

### 第一批建议纳入(6 条,理由:金融 demo 可直接出正反例;复用现有门禁构件成本最低;覆盖"静默丢失"与"组合风暴"两类单点机检最易漏的缺陷)

1. **A2+A3 预算守恒与风暴防护**(超时求和校验+retry budget+jitter+组合演练)——resilience/metrics 扩展;
2. **C1+C2 逐跳显式授权与故障即拒绝**(端点鉴权声明+越权/鉴权故障反例)——scan/behavior 扩展,天然契合"每 gate 正反例"约定;
3. **B6+B7 账务零和与持续对账**——invariant/persistence 强化,金融核心不变量,demo 最短路径;
4. **B4 死信有界**(dlqRetention≥source 关系校验+毒消息演练)——静默丢数据类,一行关系校验即可出反例;
5. **C5 密钥短期化**(issuedAt+轮换上限+CI keyless)——configuration/scan 扩展;
6. **D2 变更可逆且双向演练过**——operational 深化为 per-change 断言。

### 第二批(模式库扩展,登记字段+指标即可)

A1 尾部承诺、A4 背压有界、A7 分舱隔离、A9 查询形状、A10 读己之写、B1 熔断演练、B3 降级模式、B9 契约兼容、B10 一致性声明、C3 最小权限、C4 零信任传输、C6 审计防篡改、C7 分区管道、C8 威胁模型、C9 数据分级、D1 探针契约、D3 flag 债、D4 监控完备、D10 备份恢复验证、D11 决策↔ADR。

### 第三批(需生产环境或较大协议设计,先协议后实现)

A5 对冲请求、A6 USL 拟合、A8 负载阶梯、A12 后台活动、B2 crash-only/SIGTERM、B5 Saga 断点矩阵、B8 bitemporal、C11 AI 流水线防护、D5 PRR、D6 诊断即代码、D7 弃用通知、D8 owner/认知复杂度、D9 环境偏差。

### 元原则(横切,优先于一切新指标)

E1 测量纪律前置建议与上轮 R5(灰度判定协议)同批实施——都属"证据合格性"层;E2/E3 随任何新原则一起落。

---

## 8. 来源可靠性声明

- 厂商自报调研数据(PagerDuty 45% 误报、Catchpoint 70% 告警疲劳)为行业问卷,非同行评审;引用须标注。
- Netflix doctor/Winston 为演讲披露的内部工具,无公开规范,不得表述为"开源方案";PRR 权威在线内容在 SRE Workbook 第 18 章(`sre.google/workbook/production-readiness-review/` 实测 404)。
- 标准类(PCI DSS 4.0、IEC 62443-3-2/-3-3、NIST SP 800-207/218/52r2/34、SOX)部分经厂商解读页转引,正式引用须核对原文;PCI DSS Req 10 映射经 LogRhythm 文档。
- DORA 指标为问卷自报;90 天弃用通知期为行业惯例非标准;认知复杂度阈值 15 为经验值(Campbell 自述)。
- 上轮报告的未验证项声明同样适用;两报告共同恪守:demo 证明协议与判定链路,不证明生产就绪。

## 9. 主要参考来源(按目录分组)

**A 性能**:[Dean & Barroso, The Tail at Scale(CACM 2013)](https://cacm.acm.org/research/the-tail-at-scale/) · [AWS Builders' Library: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) · [Brooker: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) · [AWS: Using Load Shedding to Avoid Overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/) · [AWS: Fairness in Multi-tenant Systems](https://aws.amazon.com/builders-library/fairness-in-multi-tenant-systems/) · [Netflix concurrency-limits](https://github.com/Netflix/concurrency-limits) · [Little 1961](https://doi.org/10.1287/opre.9.3.383) · [Amdahl 1967](https://doi.org/10.1145/1465482.1465560) · [Gunther USL(arXiv:0808.1431)](https://arxiv.org/abs/0808.1431) · [Smaalders: Performance Anti-Patterns(Queue 2006)](https://queue.acm.org/detail.cfm?id=1117403) · [Gil Tene: How NOT to Measure Latency](https://www.infoq.com/presentations/latency-response-time/) · [Performance Calendar 2024 统计工具](https://calendar.perfplanet.com/2024/detecting-web-performance-regressions-using-statistical-tools/) · [Azure Bulkhead](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead) · [Terry et al. Session Guarantees(PDIS 1994)](https://ieeexplore.ieee.org/document/331722) · [Vattani et al. Cache Stampede(PVLDB 2015)](http://www.vldb.org/pvldb/vol8/p886-vattani.pdf) · [Fowler Lazy Load](https://martinfowler.com/eaaCatalog/lazyLoad.html) · [Reactive Streams](https://www.reactive-streams.org/)

**B 弹性/数据**:[Fowler CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html) · [Candea & Fox: Crash-Only Software(HotOS 2003)](https://www.usenix.org/legacy/events/hotos03/tech/candea.html) · [AWS SQS DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html) · [Azure Idempotent Consumer](https://learn.microsoft.com/en-us/azure/architecture/patterns/idempotent-consumer) · [Uber: Zero-Sum by Design](https://www.uber.com/us/en/blog/ubers-payments-platform) · [Confluent Schema 兼容性](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) · [Modern Treasury Recon](https://docs.moderntreasury.com) · [Fowler & Carlson Temporal Patterns](https://martinfowler.com/articles/temporal-patterns.html) · [oasdiff](https://www.oasdiff.com)

**C 安全**:[Saltzer & Schroeder 1975(经 systemsapproach 解读)](https://security.systemsapproach.org) · [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) · [NIST SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) · [NIST SP 800-52r2](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-52r2.pdf) · [NIST CSF 2.0](https://www.nist.gov/cyberframework) · [CISA Secure by Design](https://www.cisa.gov/resources-tools/resources/secure-by-design) · [CWE-636](https://cwe.mitre.org/data/definitions/636.html) · [OWASP API Security Top 10](https://owasp.org/API-Security/) · [OWASP LLM Top 10 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection) · [PCI SSC Blog(4.2.1 全网加密)](https://blog.pcisecuritystandards.org) · [Istio PeerAuthentication](https://istio.io/latest/docs/reference/config/security/peer_authentication/) · [Threagile](https://github.com/Threagile/threagile) · [pytm](https://github.com/izar/pytm) · [gitleaks](https://github.com/gitleaks/gitleaks) · [Sigstore Rekor](https://github.com/sigstore/rekor)

**D 可运维/演进**:[K8s 探针](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) · [K8s Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle) · [Google SRE Book ch.6](https://sre.google/sre-book/monitoring-distributed-systems/) · [SRE Workbook ch.18(engagement model/PRR)](https://sre.google/workbook/engagement-model/) · [Brendan Gregg: Netflix RCA(YOW 2018)](https://www.brendangregg.com/Slides/YOW2018_CloudPerfRCANetflix) · [12-Factor Dev/Prod Parity](https://12factor.net/dev-prod-parity) · [NIST SP 800-34](https://csrc.nist.gov/pubs/sp/800/34/final) · [Nygard: Documenting ADRs(2011)](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) · [MADR](https://github.com/adr/madr) · [Campbell: Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) · [Team Topologies(经摘要)](https://www.teamtopologies.com) · [DORA 指标沿革](https://dora.dev/insights/dora-metrics-history)
