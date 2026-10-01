# 架构原则技术调研:无单点、平等多活、试算灰度、重跑并跑

日期:2026-09-25。状态:调研报告(尚未实现任何条目;第 6 章为候选建议,须按项目小步流程逐项决策)。

**方法与证明边界**:第 2 章基于本仓库 v1.2.0(f1e7e83)源码直接分析(`lib/metrics.mjs`、`lib/kernel.mjs`、`examples/architecture-demo/`、`docs/GATE-SPEC-v1.2.md`、`docs/CONFIG-GUIDE.md`)。第 4 章来自 4 个并行 Web 调研(高可用架构 / 渐进式交付 / 安全关键证据工程 / 行业门禁实践),共约 90 项候选发现,本文精选约 40 项。调研依赖公开二手来源:标准类(DO-178C、IEC 61508、Uptime Tier、DORA/EU DORA)部分引自厂商与官方解读页而非购买原文;论文类以 arXiv/ACM/IEEE 出版版为准,个别转引编号已在第 8 章标注。**本文不构成对任何条目的实施承诺,也不得把"调研到行业做法"表述为"本项目已具备该能力"。**

---

## 1. 为什么调研

四条架构原则(实时链路无单点、关键后台服务平等多活、核心链路支持并跑试算/灰度、批量任务支持重跑并跑)是本项目 L4.1 Architecture Fitness 的核心输入,用户目标是让门禁服务**高性能、高可用、高安全的关键基础设施核心软件**的交付。当前实现是"声明式拓扑 → 违背数计数"的最小闭环(v1.2.0 已有正反例)。本次调研回答:行业与学术上,这四条原则的**更强语义**是什么、别人如何**机器可验证**地表达与判定、有哪些工程经验值得以"协议+证据"的形式引入本框架。

---

## 2. 当前实现机制(基线事实)

### 2.1 四原则的表达方式

原则落在 L4 `metrics` 门禁(`lib/metrics.mjs`):项目侧 runner 收到当次 `runId`(stdin),回显相同 `runId` 的结构化观察(含 `source`),内核逐一比较 `thresholds`(`min`/`max`)。`examples/architecture-demo/runner.mjs` 从手工声明的 `topology.json` 计算四个违背数指标,配置阈值全部 `max:0`:

| 原则 | 指标(违背数) | 当前判定逻辑 |
|---|---|---|
| 1 实时链路无单点 | `realtimeSinglePointDependencies` | realtime 层服务的依赖中 `instances<2` 的计数 |
| 2 关键后台平等多活 | `backgroundNotActiveActive` | background 层 `critical` 服务 `replicas<2` 的计数 |
| 3 核心链路可灰度/试算 | `coreWithoutCanary` | critical 的 realtime/background 服务缺 `canarySupported:true` 的计数 |
| 4 批量可重跑并跑 | `batchNotRerunnable` | batch 层服务非 `rerunnable&&parallelizable` 的计数 |

配置声明风险 ARC-R1:"Fitness values come from the demo topology reader; production should derive them from the real dependency graph"。`docs/CONFIG-GUIDE.md` 已提供可选模式库(分层单向依赖、扇出/每跳超时、SLO 与错误预算、N+1、RPO/RTO、幂等与降级开关覆盖率等)。

### 2.2 内核对"证据可信"的既有保障

- runner 协议防陈旧:必须回显当次 `runId`,`schemaVersion` 校验,超时/非零退出/畸形输出一律 ERROR,不 PASS(`lib/metrics.mjs:23-33`);
- 总判定:`ERROR>FAIL>PASS`,`SKIP` 不计 PASS;提议中的 Exception 始终阻断(`lib/kernel.mjs:209-219`);
- 证据归档:逐 gate evidence 落 `.quality-gate/runs/<uuid>.json`,release 阶段产出逐条 SHA256 的 `releasePackage` 清单(`lib/kernel.mjs:220-224`);
- 相关支撑:`resilience` 门禁对 DB 不可用/重复消息/外部超时做真实故障注入,核对恢复时长、最终状态与 log/metric/trace/alert 信号;L1 `engineering` 已有 mutation 子检查(killed/total/score + 存活变异明细)。

### 2.3 与行业的第一眼对照

值得先说结论:**当前框架的骨架方向与行业共识一致**——"fitness function=可自动化、有明确阈值的客观度量"(Ford/Parsons/Sadalage,《Building Evolutionary Architectures》,O'Reilly 2017/2022)正是本框架"metrics 违背数+阈值"的同路;"SKIP/未运行/缺证据一律不是 PASS"是 Google TAP、SWE-bench harness、OPA 生态共同的公理(SWE-bench 生态曾因 harness 静默 skip P2P 测试导致 resolved 虚高,与本项目"SKIP≠PASS"哲学同源)。差距不在骨架,在**原则语义深度**与**证据等级**。

---

## 3. 结构性差距(与行业对照后的五项)

1. **声明与现实脱节(drift)**:拓扑是手工 JSON,没有 observed 态、没有推导器、没有新鲜度。GitOps 的核心恰是"声明+持续调和回路才是事实"(OpenGitOps 四原则,CNCF);Terraform 用 `plan -detailed-exitcode` 把 drift 变成机器可判定信号。
2. **"无单点"按实例数计数,不按故障域**:2 副本同 AZ/同镜像仍是单点。行业表达是故障域层级(region/zone/host)上的冗余(AWS REL05-BP01;K8s topology spread constraints),而"单点"在可靠性工程里的严格等价物是**阶数为 1 的最小割集**(FTA/RBD 理论)。共识类有状态服务 2 副本只容错 0 个故障(Raft majority),最小无单点配置是 3。
3. **"平等多活"未验证"平等"**:行业把平等定义为角色对称(无固定 primary)+职责可迁移(Spanner 的 leader 租约轮转、Dynamo/SWIM 的无特权节点),并有共因失效警示:同镜像多副本只防硬件故障,不防软件共因失效(Knight & Leveson 1986 对 NVP 的经典质疑)。
4. **灰度/并跑只有布尔标记,没有判定协议**:行业判定是统计性 verdict——Argo Rollouts 的 `AnalysisRun` 有 success/failed/**inconclusive** 三值,Kayenta 用 Mann-Whitney U judge 输出 pass/marginal/fail;marginal/inconclusive 均不得当 pass。并跑试算的判定是 mismatch 计数+样本量+时间窗(GitHub Scientist/Twitter Diffy/Stripe 在线迁移)。当前 `canarySupported:true` 是无锚点自声明。
5. **证据链缺四个行业标配属性**:独立性(DO-178C "with independence")、有效期(DORA/EU DORA 的周期性演练义务;安全证据 7–30 天即过期)、签名与透明日志(in-toto/DSSE、sigstore)、跨运行汇总(IEC 61508 Route 3H "proven in use")。这些 v1.2 已自我声明为局限,行业均有成熟协议可引。

---

## 4. 行业与学术发现精选

### 4.1 无单点:从"数实例"到"故障域+割集+容错公式"

| # | 发现 | 来源 | 对本框架的含义 |
|---|---|---|---|
| 1 | 故障域/爆炸半径/舱壁三语汇;跨 AZ 是消除 SPOF 的最低标准,且冗余必须"可被验证为可切换" | AWS Well-Architected Reliability Pillar REL05-BP01、REL10-BP04 | 指标应从 `instances>=2` 升级为 `distinct(failureDomain)>=2` |
| 2 | 冗余分级语汇 N/N+1/2N;"Tier III 并发可维护"=能停一个做维护/灰度而不影响服务 | Uptime Institute Tier Standard(付费标准,引自公开摘要) | `redundancyModel` 字段化;灰度(原则 3)在语义上就是并发可维护性 |
| 3 | 故障域独立性的一等 API:topologyKey+maxSkew+`whenUnsatisfiable: DoNotSchedule`;**软约束静默降级=不达标** | Kubernetes Pod Topology Spread Constraints(1.19+ GA) | 拓扑登记引入 `{region,zone,host}` 层级;门禁把软约束视为未满足 |
| 4 | 容错公式:崩溃故障 majority quorum 容错 ⌊(N-1)/2⌋,**2 副本容错 0**;拜占庭需 3f+1 | Raft(Ongaro & Ousterhout, USENIX ATC 2014);PBFT(Castro & Liskov, OSDI 1999) | 副本阈值按服务状态模型分型:stateless≥2、consensus≥3(奇数)、byzantine≥3f+1 |
| 5 | "单点故障"的严格等价物是**1 阶最小割集**;FTA/RBD 有百年数学,但开源工具链空档(Python `reliability` 库实测不含 RBD/FTA) | 可靠性工程经典;Fast-MCS(arXiv)仅面向网络工程 | 违背数可升级为 `minCutOrder1Count`(demo 规模可自研简化枚举);2 阶割集记 Risk 不阻断 |
| 6 | 爆炸半径可量化(组合数学证明)与多租户隔离 | AWS Shuffle Sharding(MacCárthaigh, AWS Architecture Blog 2014/Amazon Builders' Library) | 共享型后台服务可加 `estimatedBlastRadius<=1/k` 类指标 |
| 7 | 架构规则即测试;violation store 冻结存量违背、只拦新增(FreezingArchRule) | ArchUnit;NetArchTest | 与"灰度"哲学同构的门禁自身灰度:存量违背登记基线,新增才 FAIL(见建议 R11) |

### 4.2 平等多活:从"副本≥2"到"角色对称+职责可迁移+一致性代价显式化"

| # | 发现 | 来源 | 对本框架的含义 |
|---|---|---|---|
| 8 | 无主对等架构的奠基:成员角色对称、请求可路由任意副本、去中心化成员管理;N/R/W 把一致性变成每请求显式配置 | Dynamo(DeCandia et al., SOSP 2007) | "平等"的可验证定义:所有副本 role 相同,出现 primary/secondary 即违背 |
| 9 | 对等失败检测与成员收敛:每节点探测负载 O(1),无特权节点;工业实现 memberlist/Serf | SWIM(Das et al., DSN 2002) | 证据字段可加 `membershipConvergence`(≥2 副本各自导出成员视图哈希一致) |
| 10 | **副本平等+职责轮转**:leader 只是带租约的临时职责,非主从;外部一致多活事务可行但有跨洲 RTT 代价 | Spanner(Corbett et al., OSDI 2012) | `role: peer + transientLeadership + leaderLeaseSec`;违背定义=存在无法轮转的永久 primary |
| 11 | 多主无协调收敛的理论上界(strong eventual convergence);汇聚语义可用 CRDT/确定性归并论证 | CRDT(Shapiro et al., SSS 2011) | 并跑/重跑的**结果汇聚点**登记 `mergeStrategy: crdt|deterministic-reduce|manual` |
| 12 | 每个多活系统必须声明 (PA/PC)×(EL/EC) 象限位置 | PACELC(Abadi, ICDCS 2012) | 数据依赖登记 `pacelcClass`;强一致消费方依赖 PA 类存储即违背 |
| 13 | 单元化:按路由键切流,单元闭环,故障只影响流量切片;年度断网演练制度化 | Alibaba/Ant 异地多活与 LDC(厂商博客/大会分享,非同行评审) | 拓扑可加 `unitization` 闭环校验;演练证据字段 `drillDate/injectedFault/observedBlastRadius/recoveryTimeSec` |
| 14 | **共因失效警示**:独立开发的版本仍会在相同输入犯相同错;同镜像多副本只防硬件故障 | NVP(Avizienis 1985)与 Knight & Leveson 1986 质疑 | 新增共因失效维度:`imageDiversity`(错批发布镜像 digest 去重数)或 `deployWaveCount>=2`,或走 Exception 显式登记 |
| 15 | 可信性分类:fault→error→failure 传播链;"部署了冗余"(手段)≠"不会失败"(结果主张) | Avizienis/Laprie/Randell/Landwehr, IEEE TDSC 2004 | 证据字段命名对齐:`faultInjected/errorObserved/failureContained`;文档术语纪律的理论出处 |

### 4.3 试算灰度:从布尔标记到"判定协议"

| # | 发现 | 来源 | 对本框架的含义 |
|---|---|---|---|
| 16 | AnalysisRun 协议:周期测量+`successCondition/failureCondition`+failureLimit+consecutiveSuccessLimit;**inconclusive 不得计为通过**;metric 支持 dryRun | Argo Rollouts(CNCF) | canary 判定协议的现成 schema:`verdict/judge/measurements/failures` |
| 17 | guardrail 指标(成功率≥99%、P99<阈值)+失败计数阈值+**自动回滚** | Flagger(Flux CD) | `canarySupported` 应升级为"存在带阈值、带失败计数、带回滚结论的分析记录" |
| 18 | 自动化 canary 分析:baseline 与 canary 同期同环境,**Mann-Whitney U judge** 按指标打分聚合为 pass/marginal/fail | Netflix Kayenta(Netflix Tech Blog 2018) | marginal 不当 pass;judge 名与统计方法入证据 |
| 19 | canary 判定服务化、结论可持久化;混杂因素需控制 | Google Canary Analysis Service(ACM Queue 2018) | 门禁不重算统计,只消费结构化判决记录(与 runner 协议哲学一致) |
| 20 | **偷看(peeking)会膨胀假阳性**;持续轮询必须用 mSPRT 等 always-valid 序贯法 | Johari et al., KDD 2017/OR 扩展 | canary 证据须声明 `sequentialMethod`,否则统计结论降级 |
| 21 | **SRM 自检**:分流比例 49.6/50.4 即报 chi-square 警,实验基础设施自身有 bug 时一切结论作废 | Fabijan et al., KDD 2019;Kohavi/Tang/Xu《Trustworthy Online Controlled Experiments》2020 | `srmDetected=true` 时其他指标结论作废——现成的"故意失败反例"素材 |
| 22 | 并跑试算框架:control+candidate、**随机化执行顺序**、mismatch/ignored 计数、发布结果;README 明示**不适合写路径** | GitHub Scientist(Ruby, 2015) | parallelRunEvidence=`{sampleSize, matchCount, mismatchCount, ignoredCount, randomizedOrder}`;PASS=mismatch==0 |
| 23 | 影子流量三方 diff+噪声消除(新代码自比对过滤时间戳/随机数) | Twitter Diffy(2015) | `realDiffs==0` 且 noise 比例合理;shadow 放大下游负载 |
| 24 | 零停机迁移五步:双写→backfill→**校验(逐行/双读比对)**→渐进切读→清理;切读前置=校验零差异 | Stripe "Online Migrations"(2017);Figma shadow table(2023/2025) | reconciliationEvidence=`{rowsCompared, mismatchCount, checksumOld/New}`;**支付场景双写最高危,须幂等键护航** |
| 25 | dry-run 双语义:client 渲染 vs **server 端走完准入链不落盘**;计划工件签名后只 apply 该工件 | K8s API `dryRun=All`;Terraform plan/apply 分离 | 试算证据要求 server 级;`artifactMatch`(评审的=执行的)可作门禁断言 |
| 26 | 幂等键:同 key 重试返回首次结果;原子插入/取回;TTL;并发同 key 返回冲突 | Stripe API docs;Leach 2017 | 对 payment-api 类写端点,"幂等键存在性+同 key 双发断言"应成硬门禁(L2 `persistence` 的双 gate 幂等模式已有雏形) |
| 27 | 风险感知放量:新策略仅在高置信下界优于生产时获更多流量 | Jagerman et al., ACM TOIS 2020;Thomas et al., ICML 2015 | 灰度步长由证据驱动:`lowerBoundAdvantage>0` 字段化 |

### 4.4 重跑并跑:从"标记支持"到"确定性证据"

| # | 发现 | 来源 | 对本框架的含义 |
|---|---|---|---|
| 28 | 状态=事件日志重放;会计分录天然 event sourcing;重放期间**不得重复外发副作用** | Fowler "Event Sourcing"(2005) | replayEvidence=`{logBounds, replayChecksum, liveChecksum, equal}` |
| 29 | 确定性模拟:单线程模拟整个集群+故障注入,**同 seed→逐位相同轨迹**;FDB 累计~10⁹ CPU 小时 | FoundationDB(SIGMOD 2021);Antithesis(同班人马) | "可重跑"的最强机器检查:**跑两次、diff 输出哈希一致** |
| 30 | 金融账务数据库:严格串行化+复式恒等式编码为状态机+VOPR 确定性演练 | TigerBeetle(ThoughtWorks Radar 2024) | `debitsSum==creditsSum` 本身就是门禁断言;settlement-batch 可直接采用 |
| 31 | 同源码→bit-for-bit 相同制品(SOURCE_DATE_EPOCH 等);双环境构建哈希一致即可机检 | Reproducible Builds(Linux 基金会) | `build_delivery.py` 可加双环境构建哈希一致检查(dist 已有 SHA256 基础) |
| 32 | 并行变更三阶段 expand→migrate→**contract**;不做 contract 比不开始还糟 | Fowler "ParallelChange" | 迁移证据含 `phase`;旧路径未删除=违规项 |

### 4.5 证据链与验证独立性(含 AI 特有)

| # | 发现 | 来源 | 对本框架的含义 |
|---|---|---|---|
| 33 | **验证者独立性是硬性目标属性**(按 DAL 分级,Level A/B 大多数验证目标须独立完成) | DO-178C(2011) | evidence 加 `independence` 枚举:`self/same-family/cross-model/tool/human`;高危域禁 self |
| 34 | 主张-论证-证据三元组;GSN 虚线=未支持主张(不得当 PASS);defeater=记录"什么会推翻主张" | GSN Community Standard v3(2021);Adelard CAE;OMG SACM | Claim 与 Evidence 之间显式 Argument 层(gate 判定规则即 Strategy);Risk 节点≈defeater |
| 35 | 证据溯源三元组 Entity/Activity/Agent;主张永远绑定带 digest 的 subject;DSSE 签名留位 | W3C PROV(2013);in-toto Attestation Framework | release manifest 可采用 in-toto Statement 信封;`generatedBy/attributedTo` 字段化 |
| 36 | 按"证据被伪造难度"分级(L1 存在/L2 托管平台签名/L3 隔离构建不可伪造);透明日志使篡改事后可查 | SLSA v1.0;sigstore(Fulcio+Rekor) | 本框架证据可对应:L1=gate JSON(现状)、L2=CI 生成+签名、L3=验证环境与生成环境隔离 |
| 37 | "proven in use":历史运行数据可替代部分开发证据;工具按置信度分级(LLM verifier 属"错误难检测且污染证据"类) | IEC 61508 Route 3H;TCL(引自 TÜV SÜD 等解读页) | 跨运行汇总的监管先例:evidence 加 `fieldHistory(累积时长+失效计数)` |
| 38 | VEX:带状态、理由、签发者的结构化例外主张,可被机器重估(新 CVE 出现自动重开) | OpenVEX/CycloneDX | Exception 机制的标准化参照:`{status, justification, expiresAt, issuedBy}`(现有 reason/owner/expiresAt 已接近) |
| 39 | 监管把韧性定义为**周期性重验**:金融 DR 演练年度+留档;EU DORA TLPT≥每 3 年;AI Act 日志≥6 个月 | FFIEC BCP Handbook;EU DORA (EU) 2022/2554 Art.24 | `validUntil` 分域周期:安全 7–30 天、HA 演练 12 个月、深度审计 36 个月 |
| 40 | 变异分数=学界公认的测试充分性量化指标;耦合效应提供理论基础 | Jia & Harman, IEEE TSE 2011;Offutt 1992 | L1 已有 mutation 子检查,可把 `mutationScore` 提升为跨域 `evidenceStrength` 字段 |
| 41 | 黑盒故障注入+**独立实现的 checker** 验证宣称的一致性;"付费但不买结论"的独立性商业模式 | Jepsen(Kingsbury, 2013–;PODC 2021:8 年 26 系统发现缺陷) | `checkerIndependent:true` 字段;失败报告格式(宣称 vs 观察+复现步骤)是 FAIL 证据范本 |
| 42 | HA 主张=可证伪的稳态假设:稳态指标→注入故障→稳态保持与否;单次通过只是一次观测 | Chaos Engineering(Basiri et al., IEEE Software 2019;principlesofchaos.org) | 演练证据四元组:`{steadyStateHypothesis, faultsInjected[], observed, outcome}`;须带 blast radius 与中止条件 |
| 43 | 形式化作为最高等级证据:TLA+/TLC 在 AWS 验证 S3/DynamoDB/EBS 的冗余与一致性协议;**model checking 是有界的** | Newcombe et al., CACM 2015 | 可选 gate 类型 `formal-spec`:`{specFile, invariants, statesExplored, counterexample}`;须记录状态空间边界 |
| 44 | 运行时验证三值语义(true/false/**presumably**):有限前缀不足以判定时不得判 PASS | LTL₃(Bauer/Leucker/Schallhart);NASA RTA/Simplex | 给"证据不充分"状态提供语义依据(与 inconclusive 一致) |
| 45 | **LLM 无外部反馈时自我纠错不提升甚至降低性能**;LLM 判分者系统性偏爱本家族生成物 | Huang et al.(Google DeepMind), ICLR 2024;Panickssery et al., NeurIPS 2024;Shankar et al., CIKM 2024 | 同一 agent 的"我检查过了"不构成证据:`verifiedBy.modelFamily != generatedBy.modelFamily` 才算 cross-model;LLM verifier 需 golden-set 校准报告 |
| 46 | AI 生成代码漏洞基线:Copilot 89 场景约 40% 含可利用弱点;BaxBench 最佳模型功能正确率 62%,正确的约一半可被端到端 exploit | Pearce et al., IEEE S&P 2022;Vero et.(ETH)BaxBench 2025 | "功能正确≠安全"实证 L3/L4 分域的必要性;AI 参与的 diff 要求更高独立性等级 |
| 47 | SWE-bench 判据:F2P(新行为)+P2P(防回归)双通过;**hidden tests 不信 agent 自述**;lucky pass 约 10.7% | Jimenez et al., ICLR 2024;SWE-bench Verified(OpenAI);AgentLens(ICML 2025) | "防 AI 假宣称"的直接蓝本:L3 runner 协议可加 `f2p/p2p` 字段;skip 不计通过 |

### 4.6 门禁工程自身治理

| # | 发现 | 来源 | 对本框架的含义 |
|---|---|---|---|
| 48 | 分层门禁:presubmit 只放 fast+reliable(平均等待约 11 分钟是上限),慢 gate 后移 post-submit;Build Cop+自动回滚兜底 | 《Software Engineering at Google》Ch.23;Memon et al., ICSE-SEIP 2017 | gate 可加 `tier` 与耗时预算校验(内核已有 40s 总预算,方向一致) |
| 49 | merge queue:门禁结果绑定"提交+基线组合";失败回退重排 | bors(Rust);GitHub merge queue | 证据字段 `baselineCommit`(change-scope 的 acknowledgedBase 已有近似语义) |
| 50 | **error budget policy**:4 周滚动窗口,预算耗尽冻结发布仅放行 P0/安全;>20% 预算事件强制 postmortem | Google《Site Reliability Workbook》附录 B | L5 放行策略可量化:滚动窗口 `riskBudget`;Exception 分级=仅 P0/安全可提 |
| 51 | flaky 政策:重试只是推迟根因;检疫必须显式登记+复审期限,**检疫不计 PASS** | Google SWE Book Ch.11/23;Lam et al., TOSEM 2020 | 可考虑第四态 QUARANTINED(与现有 SKIP≠PASS 一致,但需登记与期限) |
| 52 | 同一策略多强制点(CI 校验→admission 强制→运行时),策略自身可版本化、可测试 | OPA/Rego、Conftest | runner 协议可加 `policyBundleRef/enforcementPoint`;跨层复跑=重跑并跑的自然形态 |
| 53 | DORA 2024→2025:AI 采用使吞吐转正但**稳定性持续下降**("AI 是放大器");门禁恰是稳定性护栏的市场位置 | DORA 报告 2024/2025(n≈5000,相关性研究) | 框架自身价值论证:以 CFR/回滚率而非拦截数衡量门禁有效性 |

---

## 5. 差距矩阵(当前 → 行业对应)

| 维度 | 当前 v1.2.0 | 行业对应(发现#) | 差距性质 |
|---|---|---|---|
| 无单点判定 | 依赖实例数≥2 | 故障域去重≥2(1,3);1 阶最小割集=0(5);按状态模型分型(4) | 语义深度 |
| 平等多活判定 | 副本数≥2 | 角色对称+职责轮转证据(8,10);一致性代价显式(12);共因失效(14) | 语义深度 |
| 灰度判定 | `canarySupported` 布尔 | verdict 协议+统计方法+guardrail+inconclusive 语义(16–21) | 判定协议缺失 |
| 并跑试算判定 | 无 | mismatch 计数+样本量+时间窗+噪声过滤(22–24) | 判定协议缺失 |
| 重跑判定 | `rerunnable` 布尔 | 同 seed 双跑哈希一致;重放 checksum=线上 checksum(28–30) | 判定协议缺失 |
| 拓扑事实来源 | 手工声明 JSON | observed 态推导+调和窗口+drift 信号(§3.1;Terraform/Argo CD) | 证据等级 |
| 证据独立性 | 未建模 | independence 分级;LLM 自证无效(33,45,47) | 证据等级(高价值) |
| 证据时效 | 无 | validUntil 分域周期(39) | 证据等级 |
| 证据防伪 | SHA256 清单(无签名) | in-toto 信封+DSSE 签名+透明日志(35,36) | 已知局限,有标准解 |
| 跨运行汇总 | 无 | proven-in-use/演练时间线(37) | 已知局限,有监管先例 |
| 存量违背处理 | 全量 max:0 | 冻结基线、只拦新增(7) | 门禁自身灰度 |

---

## 6. 借鉴建议(候选,按优先级三批;均未实施)

每条给出落点(指标/证据字段/门禁模式),供按项目流程(分析→确认→正反例→实现→回归→记录证据)逐项决策。命名均为草案。

### P0 — 深化四原则语义(内核协议不变或小改,architecture-demo 先行)

- **R1 故障域语义**:拓扑登记增加 `failureDomain:{region,zone,host}`;原则 1/2 指标改为关键依赖/副本的 `distinct(failureDomain)>=2`;无域信息时允许按声明降级但必须登记 Risk(对齐"软约束=不达标"的行业共识)。
- **R2 副本阈值按状态模型分型**:服务登记 `stateModel: stateless|consensus|standby`(可选 `faultModel: byzantine`);阈值分别为 ≥2 / ≥3 且奇数 / ≥3f+1。附 CONFIG-GUIDE 模式说明:2 副本共识集群是常见误配(Raft majority)。
- **R3 违背数升级为 1 阶最小割集计数**:demo 规模自研简化枚举(关键链路×故障域节点);`minCutOrder1Count max:0` 与"无单点"严格等价,天然覆盖共享依赖与同域副本;2 阶割集记 Risk 不阻断。
- **R4 "平等"判定字段**:副本 `role` 集合对称;有 leader 的服务登记 `transientLeadership+leaderLeaseSec`;违背=存在不可轮转的永久 primary。
- **R5 灰度判定协议(canaryAnalysis 模式)**:`canarySupported` 升级为结构化证据 `{verdict: promote|rollback|inconclusive, judge, guardrailViolations[], sampleSize, window, sequentialMethod}`;**inconclusive/marginal 不计 PASS**;SRM 检出作废全部指标结论(现成反例素材)。
- **R6 重跑确定性协议(rerunEvidence 模式)**:同 seed 双跑输出哈希一致 + 幂等键策略字段 + (账务场景)复式恒等式断言;`rerunnable/parallelizable` 布尔保留为最低档,结构化证据为高档。

### P1 — 证据链升级(跨域收益,响应已知局限)

- **R7 证据 provenance 三级**:每条 evidence 标注 `provenance:{source: declared|derived|drilled, tool, generatedAt}`;拓扑拆 `expected/observed` 双层+`lastReconciledAt` 新鲜度窗口,过期视为证据缺失(ERROR),不许 PASS。
- **R8 验证独立性字段**:`generatedBy/verifiedBy`(agent 模型家族/工具/人)+`independence` 枚举;`self` 在 L4/L5 视为无效证据(DO-178C 独立性 + LLM 自偏好研究的双重背书,是"防 AI 自我宣称"的关键一步)。
- **R9 证据有效期**:`validUntil` 分域默认(安全 30 天/演练 12 个月),过期自动 FAIL 并标注;Exception 补 `status/issuedBy` 向 VEX 语义对齐(现有 reason/owner/expiresAt 已接近)。
- **R10 release manifest 采用 in-toto Statement 信封**:subject 摘要+predicateType=p域+DSSE 签名留位;解决"无签名"局限且有生态工具链。
- **R11 存量违背冻结模式(FreezingArchRule 式)**:`baselineViolations:{frozenAt, count}` 冻结存量,新增违背才 FAIL——这是"试算灰度"原则在门禁自身上的应用,适合生产项目渐进接入。
- **R12 evidenceStrength 汇聚**:把 L1 `mutationScore`、property 的 seed/反例、覆盖率等汇聚为证据力字段,报告摘要层展示(数值来自各 gate 实测,不硬编码)。

### P2 — 需客户端/生产环境配合,先协议后实现

- **R13 拓扑推导器**:observed 态从真实编排(K8s API/服务注册/IaC state)推导,Terraform `plan -detailed-exitcode` 语义;推导器本身作为项目 runner 接入。
- **R14 演练证据 schema**:混沌四元组(steadyStateHypothesis/faultsInjected/observed/outcome)+drillDate 新鲜度;resilience 门禁已示范前 3 类故障,可按 CONFIG-GUIDE 六类指引扩展。
- **R15 formal-spec gate(L5 可选)**:TLA+/TLC 输出作最高等级证据;必须记录状态空间边界,不得表述为"已证明正确"。
- **R16 mini-Jepsen 一致性审计**:对并跑/重跑汇聚组件注入分区/重复消息,独立 checker 断言收敛语义。
- **R17 error budget 滚动窗口放行(L5)**:跨运行汇总窗口内风险加权;仅 P0/安全类 Exception 可提(跨运行汇总的工程载体)。
- **R18 L3 runner 增加 F2P/P2P 协议**:fail-to-pass(新行为)+pass-to-pass(防回归)双计数;skip 不计通过(SWE-bench harness 教训)。

### 落地注意(全批通用)

1. 每项须"可运行正例+故意失败反例+失败证据定位到具体对象";数值阈值全部来自配置或实测,不硬编码。
2. 新增可配置项同步 CONFIG-GUIDE 选项表与 jsonc 样例(`tests/config-guide.test.mjs` 自动校验);摘要层提取器覆盖由 `tests/summary.test.mjs` 强制。
3. demo 只证明协议与判定链路;生产推导(真实依赖图、真实编排、真实演练)必须在 Risk/证据中写明工具来源与证明边界,不得表述为生产认证。
4. 建议顺序:R5/R6(判定协议,收益最直接)→ R1/R2/R3/R4(拓扑语义)→ R7/R8/R9(证据等级)→ 其余。R3 依赖 R1 的故障域字段。
5. shadow/双写在支付场景最高危:并跑试算协议必须内建"仅读路径或幂等键护航"的约束说明。

---

## 7. 与四原则目标的呼应

- **高性能**:canary guardrail(P99/P95)、扇出与每跳超时预算(模式库已有)、门禁分层耗时预算(R48)。
- **高可用**:R1–R4(故障域/割集/分型/平等)+R14(演练证据)直接服务原则 1/2;行业公理"HA 主张是故障注入下证伪未遂的结果,不是声称出来的"。
- **高安全**:R8 独立性(AI 自证无效是实证结论)、幂等键护航并跑、VEX 式例外、`pacelcClass` 显式一致性代价。
- **重跑并跑**:R6 确定性协议是行业最强形态(FDB/TigerBeetle 的"同 seed 逐位等价"),也是本框架"可重跑"哲学在交付物上的镜像:框架自身即以"重跑同套 180 测试+21 demo"为准出条件。

---

## 8. 来源可靠性声明

- 标准类(DO-178C、IEC 61508/62443、Uptime Tier、EU DORA、FFIEC)的条文细节部分引自 TÜV SÜD、LDRA、Siemens 等厂商解读页与官方摘要,**正式引用前须核对购买原文**;Uptime Tier 全文为付费认证文档。
- 论文类以出版版为准;Pearce et al. "Asleep at the Keyboard"请以 IEEE S&P 2022 出版版为准(arXiv:2108.09293)。
- Alibaba/Ant 异地多活资料多为厂商博客/大会分享(非同行评审),引用时标注"厂商实践"。
- DORA 2024/2025 为大样本**相关性**研究(n≈5000),不得表述为因果结论;2025 报告有官方勘误。
- 调研中经核实**不成立**而未采用的传闻:Python `reliability` 库不含 RBD/FTA;传说的 Alibaba 开源 FTA 工具 GitHub 404——开源 FTA/RBD 自动化存在工具空档,佐证 R3 自研简化割集分析是合理路线。
- 本文调研依赖 WebSearch/WebFetch 的公开来源快照(2026-09-25);URL 随站点改版可能失效,引用以"标题+出处"检索为准。

## 9. 主要参考来源

**系统与文档**:AWS Well-Architected Reliability Pillar;Kubernetes Pod Topology Spread Constraints;Amazon Builders' Library(Shuffle Sharding);Netflix Tech Blog(Kayenta 2018/Simian Army 2011);Argo Rollouts Analysis 文档;Flagger;GitHub Scientist;Twitter Diffy;Stripe Online Migrations 与 Idempotent Requests;Figma Engineering;Terraform/K8s dry-run 文档;FoundationDB(SIGMOD 2021 + testing 文档);Antithesis;TigerBeetle;Reproducible Builds;ArchUnit;OpenGitOps;SLSA/in-toto/sigstore/OpenVEX;OPA/Conftest;DORA(dora.dev);Google SRE Workbook Error Budget Policy;《Software Engineering at Google》(abseil.io 免费版);bors/GitHub merge queue;Dependency-Track。

**论文与标准**:Raft(USENIX ATC 2014);Dynamo(SOSP 2007);Spanner(OSDI 2012);PBFT(OSDI 1999);SWIM(DSN 2002);CRDT(SSS 2011);PACELC(ICDCS 2012);Avizienis et al.(IEEE TDSC 2004);Avizienis NVP(1985)与 Knight & Leveson(1986);Newcombe et al.(CACM 2015);Jia & Harman(IEEE TSE 2011);Claessen & Hughes(ICFP 2000);Segura & Fraser(IEEE TSE 2016);Huang et al.(ICLR 2024, arXiv:2310.01798);Panickssery et al.(NeurIPS 2024);Shankar et al.(CIKM 2024, arXiv:2404.12272);Jimenez et al.(ICLR 2024);AgentLens(ICML 2025);Pearce et al.(IEEE S&P 2022);BaxBench(arXiv:2502.11844);Johari et al.(KDD 2017);Fabijan et al.(KDD 2019);Machalica et al.(ICSE-SEIP 2019);Basiri et al.(IEEE Software 2019);DO-178C;GSN Community Standard v3;OMG SACM;W3C PROV;IEC 61508/62443;EU DORA (EU) 2022/2554;EU AI Act (EU) 2024/1689;FFIEC BCP Handbook。
