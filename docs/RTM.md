# 需求跟踪矩阵（RTM）

基线需求：[原始设计 v0.1](context/original-design-v0.1.md) §4–§22（原则、维度、L0.1–L5.7、元模型）及原始讨论中的用户决定（关键决定已固化于 [adr/](adr/)，如 [ADR-0013](adr/ADR-0013-persistence-readback.md) 持久化独立回读）；实现状态依据各版发布说明（[release/](release/) 与 [history/](history/)）。**本矩阵是需求→实现→证据→后续的单一索引**：功能或证明边界变化时同步对应行，版本发布时在"验证依据"补充该版证据链接，新增需求先入本矩阵再排入 PLAN。字段级规则见 [GATE-SPEC-v1.23.md](GATE-SPEC-v1.23.md)。1.8.0 起按用户决定裁剪：L4.2 非功能阈值、L4.4 的 dependency/secret/iac、L4.5、L5.2、L5.4、L5.7、P6、V5 对应功能整体移出（详见 [release/RELEASE-1.8.0.md](release/RELEASE-1.8.0.md)）；对应矩阵行已随 2026-10-01 文档精简轮删除（用户裁决），明细以该发行说明为准。

状态图例：**原生**＝内核有专门验证与结构化证据；**达成**＝曾为"部分"、经升级或"边界即达成"裁决转正（边界注记保留）；**协议**＝原生执行协议（内核跑真实工具、按结构化结果判定，分析逻辑由项目配置）；**部分**＝部分原生（有可执行判定，覆盖面有明确边界）；**横切**＝框架级需求；**未做**＝尚未实现。所有"协议/部分"条目的证明边界见各行说明与 GATE-SPEC，演示结果不外推为生产认证。

## 1. 六域功能需求（原始设计 §6–§11；原始 36 项任务，在册 31 项——5 项经 v1.8.0 裁剪并于 2026-10-01 精简轮删行，见文首说明）

| ID | 需求（摘要） | 来源 | 实现（gate kind / 机制） | 验证依据 | 状态 | 后续 |
|---|---|---|---|---|---|---|
| L0.1 | 需求追踪：RTM 逐条关联 AC、代码与同轮 PASS 检查；可选覆盖核验 | §6.1 | `traceability` | tests/traceability.test.mjs、engineering-demo 联动 | 原生 | 不自动从 PRD 推导遗漏场景 |
| L0.2 | 验收条件类型覆盖（normal/boundary/negative/exception/state-transition） | §6.2 | `traceability` requiredTypes | 同上 | 原生（声明范围内） | 同上 |
| L0.3 | 假设登记与处理（open/rejected 失败；结构化证据引用） | §6.3 | `assumptions` | tests/assumptions.test.mjs、demo | 原生 | — |
| L0.4 | Open Decision 检查（owner/resolution/evidence；影响面声明） | §6.4 | `decisions` | tests/decisions.test.mjs、decisions-demo | 原生 | — |
| L0.5 | 变更范围核对（Git 基准、允许/必需/敏感路径、contentCheck、acknowledgedBase） | §6.5 | `change-scope` | tests + 台账 + change-scope-demo（场景驱动正反例） | 原生 | 不判语义变更 |
| L1.1 | 语法/静态检查执行协议 | §7.1 | `engineering` static 子检查 | engineering-demo | 协议 | 项目接 lint/type 工具 |
| L1.2 | 构建/打包协议（非空制品+SHA256） | §7.2 | `engineering` build | 同上 | 协议 | — |
| L1.3 | 单测协议（total/passed/failed/skipped；blockOnSkipped、minTotal、F2P/P2P、minCoverageRatio+coverage 证据） | §7.3 | `engineering` unit | engineering-demo（含 F2P/P2P 与覆盖率正反例） | 协议 | — |
| L1.4 | 变异测试协议（killed/total/score+存活明细） | §7.4 | `engineering` mutation | engineering-demo | 协议 | — |
| L1.5 | 代码结构规则（逐 finding、分严重度阈值） | §7.5 | `engineering` structure | engineering-demo | 协议 | 生产需依赖图工具 |
| L1.6 | 仓库约定对齐 | §7.6 | `engineering` convention | engineering-demo | 协议 | — |
| L2.1 | API 契约对齐（声明 vs 运行观察，Pointer 差异，ignorePaths） | §8.1 | `alignment` | alignment-demo（真实 HTTP） | 部分 | 完整 OpenAPI；已接入 consumer-matrix，真实消费者覆盖仍由项目提供 |
| L2.2 | Schema 结构对齐（migration 后实际列结构） | §8.2 | `alignment` | alignment-demo（SQLite） | 部分 | ORM/外键/多方言 |
| L2.3 | Schema 语义检查（概念-字段约束） | §8.3 | `semantic-profile`（v1.22 起：深度匹配＋组件全集原生判定＋`shacl` 引擎可选集成——OD-114=B 用户裁决；v1.22.1 OD-116 起默认零外部依赖，pyshacl 为环境就绪时的第二实现） | fibo-demo、semantic-profile-demo、shacl-engine-demo | 达成（引擎边界如实） | 完整 SHACL 语义属外部引擎（pyshacl/pip 安装指引）；内核翻译的 JSON 子集不含 SPARQL 约束/路径表达式/sh:node 递归；object 型 valueType 近似 nodeKind |
| L2.4 | 持久化行为验证（真实调用后独立回读逐字段核对） | §8.4+用户强调（[ADR-0013](adr/ADR-0013-persistence-readback.md)） | `persistence` | persistence-demo（HTTP→SQLite） | 原生 | — |
| L2.5 | 跨表/跨服务不变量 | §8.5 | `invariant`（eq/neq/le/lt/ge/gt+when 条件）+ `consistency`（v1.5 起含 zero-sum 等支付五类子检查） | persistence-demo、ledger-demo | 原生 | 跨服务事务/最终一致未覆盖 |
| L3.1–L3.3 | 冒烟/集成/E2E 旅程 | §9 | `journey`（逐步骤、ignorePaths） | journey-demo（真实本地 HTTP） | 协议 | 非浏览器旅程 |
| L3.4 | 视觉/UI 核对 | §9.4 | `visual`（字节级+像素容差协议） | visual-demo | 部分 | 已有浏览器截图参考 runner；成熟视觉差分与跨环境基线仍需完善 |
| L3.5 | PRD 行为验证 | §9.5 | `behavior`（案例输入/预期，内核判 F2P/P2P 基线） | behavior-demo、fixture 夹具 | 部分 | 不自动由 PRD 推导 |
| L3.6 | 领域不变量（性质/状态机，固定 seed 多案例） | §9.6 | `property` | property-demo、acceptance/zcode-v11-acceptance | 协议 | 无穷举证明/自动收缩 |
| L3.7 | 本体语义门（IRI 对齐→术语→关系/约束/状态/实例/暴露/一致性八层） | §9.7 | `semantic-alignment`/`terminology`/`semantic-relation`/`semantic-constraint`/`semantic-state`/`semantic-instance`/`semantic-exposure`/`semantic-consistency`（v1.23 推理深化：等价类/并类/子属性/逆属性/传递链；v1.22 多语言） | 逐 semantic-*-demo + FIBO 固定目录 + owl-reasoning-demo | 达成（确定性子集边界如实） | 确定性 OWL 子集——无开世界假设/反例推理/unionOf 外类表达式；双人核准经用户裁决移出范围（2026-10-01） |
| L4.1 | 架构适应度函数 | §10.1 | `metrics`（含四原则拓扑正反例） | architecture-demo | 部分 | 生产需依赖图工具 |
| L4.3 | 可观测性信号核对 | §10.3 | `resilience` 四信号＋`trace-continuity` 贯通核验（v1.21：声明调用对同 traceId/parentSpanId 衔接/traceparent W3C 一致，断链 `trace-discontinuity` 指名） | resilience-demo、trace-continuity-demo | 原生（v1.21 起补齐贯通性） | 声明式对账——生产采集/告警投递与 OpenTelemetry 接入属项目工程（内核不做流量采集/APM） |
| L4.4 | SAST/依赖/秘密/IaC 扫描 | §10.4 | `scan` 仅存 sast/api-authz/credential 三类（acceptedFindings 显式豁免+过期）；dependency/secret/iac 已裁剪（1.8.0） | scan-demo、api-security-demo | 协议 | 专业扫描器由项目接入 |
| L4.6 | 故障恢复演练 | §10.6 | `resilience`（含 v1.5 requiredTransitions 熔断全路径） | resilience-demo、budget-demo | 部分 | 六类故障指引外由项目 runner |
| L5.1 | 配置变更核对（多环境键/类型/秘密引用、allowedDifferences） | §11.1 | `configuration` | configuration-demo | 原生 | 不读线上配置 |
| L5.3 | 文档一致性 | §11.3 | `documentation` | documentation-demo | 部分 | 不证全文准确 |
| L5.5 | 技术债登记（owner/期限/逾期阻断；resolved 证据引用） | §11.5 | `debt` | debt-demo | 原生 | — |
| L5.6 | Open Decision 收尾（L5 下 open/deferred 均失败） | §11.6 | `decisions` | decisions-demo | 原生 | — |

## 2. 横切需求（原始设计 §4/§5/§12–§22 + 讨论补充）

| ID | 需求 | 来源 | 实现 | 验证依据 | 状态 | 后续 |
|---|---|---|---|---|---|---|
| X1 | 证明链元模型 Claim→Evidence→Gate→Risk→Exception；Exception 只登记不豁免 | §12–§17 | 内核报告模型；v1.6 起 approved+有效期内呈现 WAIVED（不改变门禁判定） | 全部测试与报告 | 横切/已实现（含 v1.6 审批窗口） | 审批为声明字段，签名防伪造暂缓 |
| X2 | 判定状态含 INCONCLUSIVE/WAIVED/NOT_APPLICABLE | §20–§21 | 实现 PASS/FAIL/SKIP/ERROR（+延后评估 PENDING）；SKIP 不算 PASS、框架错误不得 PASS；v1.6 起 WAIVED 限定用于已审批且未过期 Exception 的呈现 | kernel 测试 | **有意偏差**：INCONCLUSIVE 归入 ERROR（fail-closed）；门禁判定无 WAIVED（豁免走 approved Exception 呈现与 acceptedFindings 显式登记） | — |
| X3 | 六质量域 × 生命周期阶段两维正交；enabled/stages/requiredLevels 裁剪 | §5 | 配置模型 | validate 测试、six-domain-demo | 横切/已实现 | 变更影响驱动的自动选择未做 |
| X4 | Evidence First / No Evidence ≠ PASS / Deterministic First, LLM Second | §4.1–§4.3 | 内核判定哲学；LLM 仅辅助 | 负例矩阵（fixture） | 横切/已实现 | — |
| X5 | 证据独立性与防伪造（内核重算审计链、runner 无法自判 F2P/P2P） | §4.5、§4.7 | consistency 审计链、behavior 基线内核判定 | ledger-demo、behavior-demo | 横切/已实现 | 验证独立性字段 R8 暂缓 |
| X6 | 本体 Provider 可替换（FIBO 固定版本离线目录，SHA 钉扎；local-catalog） | §4.6 | fibo-pinned/local-catalog | fibo-demo、FIBO-PROVIDER.md | 横切/已实现 | — |
| X7 | Agent 平台无关内核 + 多宿主适配器路线 | §4.8、§2.1 | 内核与 adapter 分离；ZCode plugin（Hook/Command/Skill）+独立 CLI | adapter 测试、实机验收 | 横切/已实现（1/多宿主） | 第二 adapter 前先固定事件协议 |
| X8 | 首版 MVP 十项闭环（安装→Hook→Spec→执行→证据→判定→Stop 阻断→反馈→修复→自动化测试） | §2.2 | v0.1 即达成并持续回归 | history/VALIDATION.md、LIVE-ACCEPTANCE-*.md | 已实现 | — |
| X9 | 客户端实机验收与 CLI/模拟分别记录 | 讨论决定 | LIVE-ACCEPTANCE 系列 + CUA 交叉轮；1.7.3 起 expense-approval-fixture 固化为可复用验收基线（1.8.0 起随裁剪调整为 13 门禁/12 kind/六域 + 逐门禁负例矩阵 + lifecycle-check，验收按其 README 四步复用） | history/LIVE-ACCEPTANCE-1.5.md、history/LIVE-ACCEPTANCE-1.7.md（1.6.0–1.7.3 五版收尾，evidence/zcode-live-v1.7/） | 已实现 | — |
| X10 | 外部依赖缺失必须提示安装指引（KNOWN_TOOLS 登记） | 用户要求 | lib/dependencies.mjs + SessionStart/摘要/报告注入 | 依赖提示注入实机证据 | 已实现 | 新增强前置依赖须登记 |
| X11 | 打包自含 marketplace、解包复验全量回归与冒烟测试 | 工程纪律 | devtools/build_delivery.py + examples.manifest.json 单一事实源 | evidence/v1.5/package-smoke.txt | 已实现 | — |

## 3. v1.5 原则/实践轨道增补（来源：[PLAN.md](PLAN.md) 六工作包，选型自研究目录 A/B/C/E 系列）

| ID | 需求 | 实现 | 验证依据 | 状态 | 后续 |
|---|---|---|---|---|---|
| P1 | F2P/P2P 双向测试协议（防伪修复） | engineering unit + behavior `expected:{f2p,p2p}` | engineering/behavior 测试+demo | 原生 | — |
| P2 | 证据纪律四件套（测量有效性/新鲜度/存量冻结/来源分级） | resilience 期限/来源及原始证据核验（metrics 证据纪律已于 1.8.0 裁剪） | resilience/raw-evidence 测试 | 原生 | in-toto 信封与签名已出项目范围（2026-09-26） |
| P3 | 支付数据正确性（零和/append-only/对账/DLQ/审计链 + 契约兼容阻断） | `consistency` 门禁 + alignment contract-diff | ledger-demo 正反例 | 原生 | 非生产存储认证 |
| P4 | 安全最小集（逐端点显式鉴权+越权反例+凭据轮换） | `scan` api-authz/credential 类目 | api-security-demo（BOLA、fail-secure） | 协议 | mTLS/威胁模型等 C4/C7/C8 暂缓 |
| P5 | 超时/重试预算与熔断全路径演练 | `budget` 门禁 + resilience requiredTransitions | budget-demo | 原生 | — |

## 4. v1.6 增补（来源：[PLAN.md](PLAN.md) v1.6 工作包，主线"R 系与治理混编"经用户 2026-09-25 确认）

| ID | 需求 | 实现 | 验证依据 | 状态 | 后续 |
|---|---|---|---|---|---|
| V1 | change-scope 独立示例，全部 kind 均有示例依据 | examples/change-scope-demo（scenario 驱动临时 Git 项目正反例） | tests/change-scope-demo.test.mjs；knownKindsWithoutExamples 清空 | 已实现 | — |
| V2 | 单测覆盖率统计（L1.3 收尾） | engineering unit `minCoverageRatio` + `coverage:{tool,ratio,total?,covered?}` 证据（计数交叉核验） | tests/engineering.test.mjs（低于阈值 FAIL/缺证据 ERROR/比值不一致 ERROR） | 协议 | 工具来源由 coverage.tool 登记，不外推认证覆盖率 |
| V3 | R5 灰度判定协议 | 拓扑 `canaryAnalysis:{verdict,judge,sampleSize,window,sequentialMethod,guardrailViolations,srmDetected?}` + runner 指标 canaryNotPromoted/GuardrailContradiction/SrmVoided | tests/metrics.test.mjs 三反例 + architecture-demo 正例 | 协议 | R1–R4 拓扑语义留 v1.7 |
| V4 | R6 重跑确定性协议 | 新 gate kind `rerun`（文件式内核校验：≥2 次同 seed 双次运行 sha256 一致 + 幂等键策略 + 可选复式恒等式） | tests/rerun.test.mjs + examples/rerun-demo（测试重跑核验哈希真实） | 原生 | 内核不重执行任务，哈希真实性由项目双次运行保证 |
| V6 | 审批/到期 Exception（X1 后续） | exception `status: approved` + `approvedBy/approvedAt`：有效期内呈现 WAIVED（不改变门禁判定）；过期/未生效回退阻断 | tests/domain-profile.test.mjs（WAIVED/过期/未来审批/不豁免 FAIL 门禁） | 原生 | 审批为声明字段，不防伪造 |

## 5. v1.7 增补（O1 来源：用户 2026-09-26 提出"首运行引导对话，推荐&选择定制初始化 .quality-gate.json"，三层定制/档位模板经 AskUserQuestion 选定；O2/O3 为 1.7.1 补丁，来源：同日实机验收反馈）

| ID | 需求 | 实现 | 验证依据 | 状态 | 后续 |
|---|---|---|---|---|---|
| O1 | 首运行引导 onboarding：档位（lite/pro/max）→模板推荐→附加门禁/禁用→真实命令三层定制，确定性装配写入 `.quality-gate.json`（[ADR-0014](adr/ADR-0014-guided-onboarding.md)） | `lib/templates.mjs` 静态模板库（占位符 fail-closed）＋CLI `templates`/`init`（写入仅在 CLI 层，`--force` 才覆盖）＋`/quality-gate-init` 引导命令（agent 只问询不代写）＋SessionStart 缺配置指向引导 | tests/templates.test.mjs、tests/init.test.mjs；客户端实机全问答链（[LIVE-ACCEPTANCE-1.7](history/LIVE-ACCEPTANCE-1.7.md)） | 原生 | 裁剪智能化已于 v1.15.0 落地（TS1）；模板为骨架协议，runner/登记文件由项目按 CONFIG-GUIDE 补齐 |
| O2 | 配置生命周期分权（1.7.1）：重初始化＝残留确认后删除再全新引导；升级＝独立 update 增量（[ADR-0015](adr/ADR-0015-config-lifecycle.md)） | CLI `leftovers` 残留扫描＋`init --fresh`（装配成功才删除）＋`inspect`（有效性/预算/模板漂移/登记存在性）＋`update`（changes 契约增量＋migrateRegistries 内存改写→校验→移动）＋`template:{id,generatedAt}` 溯源 | tests/lifecycle.test.mjs；客户端实机重初始化与 update 增量走查（[LIVE-ACCEPTANCE-1.7](history/LIVE-ACCEPTANCE-1.7.md)） | 原生 | 删除不可恢复（确认＋git 兜底）；旧配置已删时深路径残留不在启发层内 |
| O3 | 登记文件集中管理（1.7.1）：默认 `.quality-gate/registries/`（可提交） | 模板/附加门禁 file 类字段默认路径改指该目录；`update --migrateRegistries` 收纳存量根目录文件并改写路径 | tests/templates.test.mjs、tests/lifecycle.test.mjs | 原生 | 仅迁移配置指向的根目录文件；runner 自用文件不迁移 |
| O4 | 引导收尾（1.7.2）：ontology/阈值可替换；登记引用预检 | answers/changes 增 `ontology`（严格形状；随包 sha 经 `templates` 输出 `ontologyHint` 发布）与 `thresholds` 自有指标替换；`preflightRefs` init/update 后只读检查引用（1.7.3 深度收集嵌套引用） | tests/templates.test.mjs、tests/lifecycle.test.mjs；夹具 lifecycle-check 10 步 | 原生 | fibo-skeleton 仍为 six-domain 默认（运行 ERROR 属 fail-closed 常规路径）；预检只读不阻断 |
| O5 | 报告可见性（1.7.4/1.7.5）：门禁结果在对话正文可见 | CLI stderr 分级（PASS 一行 brief；非 PASS 全表＋建议列＋耗时列＋路径相对化）；`report` 归档重渲染（runId 唯一前缀解析）；提示词层强制 Markdown 正文粘贴 | tests/summary.test.mjs、tests/report.test.mjs；夹具 brief/负例注入（evidence/v1.7.4、v1.7.5） | 原生 | stdout JSON 与判定语义不变；Stop PASS 静默属客户端平台行为（可见性由提示词层承接） |

## 6. v1.9 增补（已全部落地 2026-09-26，来源：六域机制评审总敞口清单 + 原 v1.9 工作包，主线"信任边界收敛"经用户选定）

| 增补 | 需求 | 溯源（敞口编号） | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| C1 | 空登记直通阻断：assumptions/debt 空登记须显式 `none:true`；decisions 可选 `requireProvenance`；deferred 须带 `revisitBy` 期限 | A4–A7 | 三 kind 的空登记显式声明、结构化证据引用与延后期限的 validate/判定强化（details 暴露 `registerIssues`） | tests/assumptions/debt/decisions.test.mjs；evidence/v1.9.0/ | 原生（W1） | 显式声明仍是声明，不防伪造 |
| C2 | 自引用保护：change-scope spec 自绑定与基准绑定；requiredChecks 全覆盖或显式排除；rename 源路径入变更集 | D1–D4 | `selfGuard:{acknowledgedSpecSha256}`（spec JSON 去自身字段哈希比对）＋`pinnedBase:{commit}`＋R/C 源路径条目；engineering/consistency `excludedChecks:[{id,reason}]` 全覆盖校验 | tests/change-scope/engineering/consistency.test.mjs；evidence/v1.9.0/ | 原生（W2） | 哈希/绑定仍是声明式确认，不防绕过 git 本身的攻击 |
| C3 | 观察可信度：基线来源协议/观察模式/append-only 来源枚举 | B2/B4/B5 | 共享 `lib/baseline.mjs`：behavior/unit `baselineSource`（git 型内核核验 ref，embedded 降级标注，`baselineMode:git` 强制）；alignment `mode:live|static`＋`requireLive`；consistency `sourceType` 枚举强制；报告"证据降级"行 | tests/behavior/engineering/alignment/consistency.test.mjs；evidence/v1.9.0/ | 原生（W3） | 观察数值仍自报，仅封来源声明，不防伪造 |
| C4 | 登记完备性：requirements `prdRef{file,section}` 核验＋`requirePrdRefs`；`defaultRequiredTypes` 默认集 | A1/A2 | prdRef 存在性＋防逃逸核验；traceability 强制 PRD 绑定与默认类型覆盖集 | tests/traceability.test.mjs | 原生（W4） | 只核验 PRD 文件存在，不证需求涵盖 PRD 全部内容 |
| C5 | 语义-行为桥：semantic-alignment `origin:annotation|runtime`＋`requireRuntimeOrigin` | C1 | 观察映射来源枚举；强制后每符号须至少一条 runtime 候选且与期望一致（finding 记 `origins`/`runtimeUnbound`） | tests/semantic-alignment.test.mjs | 原生（W5） | 非完整行为语义验证（OWL 边界不变） |

## 7. v1.9.1/v1.10 增补（已全部落地，2026-09-26 经 AskUserQuestion 选定：小迭代补丁 + 拓扑语义深化主线；完成记录见 [PLAN.md](PLAN.md) 历史版本记录）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| E4 | 受保护路径变更而无内容级检查不再静默 | E 系列缺口 | change-scope `requireContentCheck`（`protectedChangedWithoutContentCheck` 指名） | tests/change-scope.test.mjs；evidence/v1.9.1/ | 原生 | 防静默，不防蓄意绕过 |
| AF | 观察端来源指纹：观察绑定具体项目制品 | L2 机制评审 | `sourceFingerprint:{file,sha256}` 声明即核验（api/schema 与 contract-diff 同构）；`requireSourceFingerprint` 强制 | tests/alignment.test.mjs | 原生 | 核验声明与磁盘一致，不证观察面即生产 |
| E3 | persistence 快照默认强制（设计对齐） | E 系列缺口 | `requireSnapshots` 缺省 true（`!==false`）；批量须显式 false；after 快照与独立观察不一致 ERROR | tests/persistence.test.mjs；evidence/v1.10.0/ | 原生 | 退出为可见声明；不防 runner 伪造快照内容 |
| R1 | 故障域语义：关键副本/依赖 distinct≥2，无域信息显式降级登记 | 四原则 R1 | 纯内核 kind `topology`（L4 文件式）：必存活集合＋`replicaDetails` domainKey distinct 判定＋`domainVerification:"unavailable"` 显式降级入报告降级行 | tests/topology.test.mjs | 原生 | 核验声明文件一致性，非真实部署（R13 推导器已出范围 2026-09-27；纯声明核验为最终形态） |
| R2 | 副本阈值按状态模型分型 | R2 | `stateModel` 必声明＋分型阈值（stateless≥2/consensus≥3 奇/standby≥3/byzantine≥3f+1） | 同上 | 原生 | 同 R1 |
| R3 | 一阶最小割集＝0 严格等价"无单点"；二阶记数 | R3 | 节点侧（必存活全同域/单副本）＋边侧（关键依赖 instances=1）；`minCutOrder1` 阻断、`minCutOrder2Count` 仅计数；batch 单副本不豁免 | 同上 | 原生 | demo 规模简化，非通用 FTA/RBD |
| R4 | role 对称与 leader 轮转字段 | R4 | `asymmetricRoles`/`permanentPrimary`（transientLeadership＋leaderLeaseSec） | 同上 | 原生 | 同 R1 |

## 8. v1.10.1–v1.12 增补（2026-09-27 经 AskUserQuestion 选定：B1 + E 系列其余主线，R12 小迭代先行，L3 机制复审随版发布；R12 已落地 v1.10.1，B1/E7/E5 已落地 v1.11.0，E6 经用户二次选定方案 B+分层来源协议落地 v1.12.0；范围决定同日——R13 拓扑推导器与容器编排接入永久出项目范围）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| R12 | 摘要层证据力汇聚 | R12 | `summary.evidenceStrength` 只读聚合（证据信号＋定量信号，等级实测推导：核验级＞声明级＞降级，无信号不显示） | tests/summary.test.mjs；evidence/v1.10.1/ | 原生 | 只汇聚已回报证据，不新增采集，不改判定 |
| B1 | 原始证据内核解析：unit 计数不再信任自报 | L1.3 去信任化 | `lib/raw-evidence.mjs` TAP/JUnit 无依赖解析器（真实工具形状互核、畸形拒收）；unit `rawOutput:{format,file}` 声明即核验（内核重算交叉核验，判定以内核值为准）＋`requireRawOutput` | tests/raw-evidence/engineering.test.mjs；engineering-demo 启用；evidence/v1.11.0 | 原生 | 不防蓄意伪造内容一致的原始文件；覆盖率原始解析不做；mutation/behavior 的 rawOutput 扩展留候选 |
| E7 | Java/Python 参考适配器 | E 系列缺口 | `adapters/python/unit_runner.py`（pytest 包装，退出码恒 0=观察协议）＋`adapters/java/merge-junit.mjs`（surefire/gradle 合并，自检）＋`adapters/README.md` 指引 | tests/adapters.test.mjs；端到端 FAIL/PASS 旅程（evidence/v1.11.0-t3-python-adapter.txt） | 原生 | 参考实现非认证工具；Java 侧无 JDK，样例＋内核单测验证 |
| E5 | Entity↔ORM 参考适配 | L2.2 后续 | `adapters/python/persistence_orm.py`（SQLAlchemy 会话快照＋独立回读=ADR-0013，`orm://` 如实标注，内核零改动） | tests/adapters.test.mjs；run=5577d80 | 原生 | 示范观察协议非 ORM 认证；request 非真实 HTTP 面；外键/多方言留 L2.2 |
| E6 | API 消费者链层：兼容矩阵与破坏归因 | L2.1 后续 | 新纯判定 kind `consumer-matrix`（第 34 个，用户选定方案 B＋分层来源协议）：声明层逐消费者期望比对＋归因表；观察层 `consumerUsage` 来源枚举（越界使用 FAIL、declared 降级）；ignoreRoutes/mode/指纹沿用 alignment | tests/consumer-matrix.test.mjs；consumer-matrix-demo | 原生 | 消费者期望仍为声明式；类型词汇项目自有、内核比较相等性 |

> L3 机制复审已随版发布完成（2026-09-27，评审性）：对照 v1.9.0（W3/W5）与 v1.10/v1.11 落地现状逐项对账——C1/C2 部分闭合（origin 运行时绑定/baselineSource ref 核验）、C3 经 B1 收敛至"仅内容自报"、C4/C5/C6 开放或设计边界；改进候选 4 项（behavior/journey raw-transcript、baseline 内容内核重放、visual 浏览器接入、C6 语义深化）供后续版本选择。首轮六域评审记录与本次复审已归档：[MECHANISM-REVIEW-2026-09-26](history/MECHANISM-REVIEW-2026-09-26.md)、[MECHANISM-REVIEW-L3R-2026-09-27](history/MECHANISM-REVIEW-L3R-2026-09-27.md)。

## 9. v1.13 增补（2026-09-28 经 AskUserQuestion 选定候选 1+3+5——用户在推荐组合 1+5 之外将 visual 浏览器接入升入本轮；主线"L3 证据链延伸 + 观察工具链"，零破坏）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| T2/T3 | behavior/journey 观察记录声明即核验（C3 开放→部分闭合） | L3R 改进候选 1 | `parseTranscript`（自有协议形状 fail-closed＋畸形矩阵）；`rawTranscript:{format,file}` 声明即核验（runId 绑定防重放＋逐例/逐步骤交叉核验＋判定以观察记录为准）；`requireRawTranscript` | tests/raw-evidence/behavior/journey.test.mjs；demo run 576f90e9/2bf6e1f6 | 原生 | 不防蓄意伪造两份一致记录；"声明面之外静默"边界不变 |
| T4 | visual 浏览器参考 runner（C4 开放→部分闭合） | L3R 改进候选 3（用户升入本轮） | `adapters/visual/screenshot.mjs`（零 npm headless CLI；`QGATE_BROWSER` 显式不回退）；KNOWN_TOOLS 登记；visual-browser-demo 同机 pin 基线 | tests/adapters.test.mjs；run 11a1f42 | 原生 | 同机字节稳定、跨机渲染差异须重 pin；像素容差需 diff 度量本参考不实现；截图正确性属 runner 残余风险 |
| T5 | consumer-matrix 观察层工具化 | §8 E6 后续 | `adapters/consumer-usage/`：pact-normalize（contract-test 最强来源）＋scan-usage（scanned 弱来源）；demo 三来源真实派生 | tests/adapters/consumer-matrix.test.mjs；run 84445ea | 原生 | Pact 只绑定请求面；静态扫描漏扫→使用面偏小、越界判定偏松 |

## 9.1 v1.14 增补（2026-09-28，Stop Hook 摩擦优化——1.13.0 实机会话复盘，用户全量采纳 P1–P4）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| H1 | Stop 阻断摩擦：全量重跑/既有红灯到 Stop 才暴露/无关失败无差别拦截/证据双轨 | 1.13 实机复盘 P1–P4（全量采纳） | `lib/freshness.mjs`（v1.24 内容快照；仅确定性文件式检查可复用，其他重新评估）；Stop 复用归档结论（同阶段＋配置哈希一致＋其后输入未变）；SessionStart 基准行＋会话基准；`stop.blockMode:new-only` 降级（ERROR/未声明 inputs/配置漂移仍阻断）；证据位置统一项目 runs | tests/freshness.test.mjs、tests/adapter.test.mjs；实机 H1a/H1b（[LIVE-ACCEPTANCE-1.14](history/LIVE-ACCEPTANCE-1.14.md)） | 原生 | 内容快照不证明外部状态；删除/漂移/旧报告不复用；new-only 只影响 Stop 呈现不改判定与退出码；会话基准依赖 SessionStart 运行 |

## 10. v1.15 增补（2026-09-28 经 AskUserQuestion 选定：主线 A baseline 内容内核重放+随版发布 C 裁剪智能化/D consumer-matrix 深化；已落地）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| BR1 | baseline 内容内核重放（C2 残余→部分闭合） | L3R2 遗留候选 | transcript `baseline` 块（git 型 file＋contentSha256 经 `git show` 内容比对→`contentVerified` 信号）＋behavior 两源一致核验＋`requireBaselineTranscript`；engineering `baselineRawOutput` 逐用例重算基线状态＋`requireBaselineRawOutput`（F2P/P2P 基线侧取内核值） | tests/raw-evidence/behavior/engineering.test.mjs；demo 双改造 | 原生 | 仍不执行基线——伪造成本升至"内容一致的双记录"；embedded 形状收紧为仅 type（迁移见 RELEASE-1.15.0） |
| TS1 | 变更影响驱动的 Gate 推荐 | PRD §7 候选 | ADDONS `suggest` 元数据＋`suggestPathMatches` 匹配器＋`qgate inspect` 建议块（`git status -uall` 逐文件；非 git unavailable 如实） | tests/lifecycle.test.mjs | 原生 | 建议性输出不构成证明链一环；变更面仅未提交变更 |
| CD1 | consumer-matrix 字段级使用面＋扫描器多语言 | §9 T5 后续 | `bodyFieldPaths`（叶子/点嵌套/深度≤4/数组同键归并）；scan-usage python/go/java 常见形状 | tests/adapters/consumer-matrix.test.mjs；demo run=251c7fb | 原生 | 正则级扫描漏扫边界不变；字段路径为字符串相等比较 |

## 11. v1.16 增补（2026-09-30 经 AskUserQuestion 选定：统一语言治理轮——作用域 D 全量含协议键/自造词 A 全部规范化/双语 A 双轨映射制/时序 B 验收并入；已落地）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| UL1 | 统一语言治理：GLOSSARY 唯一登记处＋ADR-0016＋弃用词防回归 | 三轮术语盘点（2026-09-30） | docs/GLOSSARY.md（概念族/上下文六分/验证动词/ID 前缀/借词/命名谱系）＋AGENTS "新概念先入 GLOSSARY"规则；弃用词防回归 v1.19 起由根门禁 G-CONVENTIONS 自举承载（glossary 测试整体退役，用户裁决） | v1.16 全量回归（上线即逮漏网） | 原生 | 拦字面弃用词、不拦语义漂移；历史区旧词按当时语境保留 |
| UL2 | 概念拆义与替换落地（基线/基准二分、36 项弃用词约 640 处） | 同上＋用户四问选型 D+A+A+B | L0–L5 长名规范、summary 显示与 hook 文案、19 活文档＋测试同批替换（白名单/台账/灰度/口径/敞口 五词经同日用户裁决保留并回滚） | 464 回归；summary/hook 文案测试针同批 | 原生 | 本轮不改判定语义 |
| UL3 | 协议键迁移 schemaVersion 0.1→0.2 | 盘点附带发现＋两处缺陷 | domain→level 族/addAddOns→addOns；旧键 fail-closed＋迁移表；0.1 归档读兼容垫片；hooks 状态文件更名（读侧回读旧名）；缺陷①update 白名单补 ontology＋缺陷②打包排除 .zcode/ | 464 回归；0.1 归档重渲染实证（evidence/v1.16.0） | 原生 | 观察协议与 transcript schema 键零改名 |

## 12. v1.17 增补（2026-09-30 经 AskUserQuestion 选定：A 核心+C 首轮组合——任务意图登记+漂移对账+import 对账；2026-10-01 落地，工作包与选型记录见 [RELEASE-1.17.0](release/RELEASE-1.17.0.md) 与 [PLAN.md](PLAN.md) 历史版本记录，设计依据见 [original-design-v0.9](context/original-design-v0.9.md) §41/§43.2；OD-101=registries 单文件、OD-107=交集、T3 承载=独立 kind `symbol-grounding` 经 2026-10-01 AskUserQuestion 裁决）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| AL1 | 任务意图登记与漂移对账（问询不代写、修订留痕、哈希可守护） | v0.9 §41（轨道 A 核心） | `lib/task-intent.mjs` 登记协议（revisions 修订链 fail-closed）＋change-scope `taskIntent` 绑定/交集对账（outside-task-scope/intent-file-modified/requireTaskIntent/no-new-dependencies）＋`qgate intent` 写入通道＋`/quality-gate-intent` 四步问询＋summary 基准行 | tests/task-intent/intent-drift-demo.test.mjs；demo；全量 497 | 原生 | 不判语义（一致性靠确认留痕）；对账为路径级；软形态 v1.17.1（OD-105 登记即激活）与 AC 结构化 v1.18.0 已落地——轨道 A 收官 |
| AL2 | import 对账（符号存在性首轮） | v0.9 §43.2（轨道 C 首轮） | 新纯内核 kind `symbol-grounding`（第 35 个）：保守词法提取（注释剥离＋字符串掩码）＋三分类解析（项目内/依赖清单/内置）＋`unresolved-import` 指名；check changed-files(默认)/all | tests/symbol-grounding.test.mjs；demo | 原生 | JS/TS 首版；动态引用不覆盖（dynamicFormsTotal 如实标注）；tsconfig paths 别名不解析 |
| AL3 | 约定对齐（轨道 B）＋决策-ADR 双向绑定＋自举 | v0.9 §42 | 新纯内核 kind `convention-alignment`（第 36 个）：conventions.json banned-words/argv 规则统一观察协议；decisions `adrRef` frontmatter 核验（状态映射/supersedes 链互指/requireAdrRefs）；自举＝根门禁 G-CONVENTIONS | tests/convention-alignment/decisions-adr.test.mjs；demo；根门禁 2/2 | 原生 | 只对账字面词/结构条目不核验全文语义；frontmatter 平面 YAML 子集；两处弃用词清单同步为人工纪律 |
| AL4 | API/符号存在性声明即核验（轨道 C 收官） | v0.9 §43.3（轨道 C 剩余） | symbol-grounding 三扩展（OD-108=C 混合/OD-109=B 登记文件/OD-110=A JSON 直读/OD-111=A 双向对账）：命名成员对账默认启用＋apiSurface 登记文件（三类声明面＋mtime 哨兵）＋importObservations 双向对账（防瞒报）＋adapters/python/java 参考适配器 | tests/api-surface/symbol-grounding/reference-adapters；全量 555 | 原生 | 端点匹配路径级方法不判；schema 键面无 patternProperties；适配器解析以运行环境为准（venv/JDK 如实）；java `.*` 不覆盖 |

## 12.1 v1.21 增补（2026-10-01 经 AskUserQuestion 三裁决：OD-106=B 独立 kind[用户覆盖倾向案——可单独挂 close]/OD-112=A contentSha256 内容绑定/OD-113=B 容忍自报对照；轨道 D 收官）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| AL5 | 验收可观测（轨道 D）：trace 贯通核验＋回放基线资产 | v0.9 §44（轨道 D） | ①新纯判定 kind `trace-continuity`（第 37 个）：逐声明调用对核验同 traceId/parentSpanId 衔接/traceparent W3C 一致（断链指名，单条问题逐项列全；`requireTraceparent` 可选；extraLinks 审计面）；②journey/behavior `replayBaseline:{file,contentSha256}`：步骤序＋关键字段/逐用例对照（篡改须显式重 pin；无观察记录时自报对照如实标注） | tests/trace-continuity/replay-baseline.test.mjs；demo×2；全量 575 | 原生 | trace 贯通为声明式对账（不采集流量/不做 APM）；回放为行为回归对照（非性能/时序）；自报对照弱一档如实标注。**四轨道 A/B/C/D 全部收官** |

## 12.2 v1.22 增补（2026-10-01 经 AskUserQuestion 三裁决：OD-114=B runner 协议外接[用户覆盖推荐 A 零依赖自研——pyshacl 为 SHACL 真引擎]＋扩展集 8 组件＋OD-115=A SKOS 语言标签；C6-1）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| C6-1a | SHACL Core 引擎接入（L2.3→达成）：深度匹配＋8 组件＋引擎观察核验 | [original-design-v0.9](context/original-design-v0.9.md) §33 后续候选（C6） | semantic-profile 三层升级：sh:targetClass 深度匹配（subsumptionPath 路由，真子类套用入 deepMatches——旧精确匹配为缺陷面）；新组件 pattern/minLength/maxLength/minInclusive/maxInclusive/languageIn/closed（v1.22.1 起内核原生判定——OD-116 默认零外部依赖；引擎可选并集）；`shacl:{argv,timeoutMs}` 引擎协议（stdin 形状/记录/子类边→findings＋conformance，内核核验未知记录/未知组件/自报矛盾均 ERROR）；adapters/shacl/pyshacl_runner.py 参考适配器（JSON→SHACL/数据图，缺 pyshacl 安装指引） | tests/shacl-engine 6（pyshacl 守卫）+semantic-profile 增 3；semantic-profile-demo 深度匹配腿＋shacl-engine-demo 8 组件 | 原生（v1.22.0，2026-10-01） | 完整 SHACL 语义属 pyshacl；JSON 子集无 SPARQL/路径表达式/sh:node；object 型近似 nodeKind |
| C6-1b | terminology 多语言术语 | 同上 | 目录 altLabels `{value,lang}`（纯字符串＝语言未定，旧目录零改动；BCP47 子集校验）；S14 唯一性按 (语言, 值) 分域；术语可选 lang 严格同语言匹配（不带 lang 跨语言重名即歧义） | terminology 增 3 用例＋terminology-demo zh 标签 | 原生（v1.22.0，2026-10-01） | 严格制：带 lang 术语不命中语言未定条目；FIBO 钉扎目录单语零改动 |

## 12.3 v1.23 增补（2026-10-01 经 AskUserQuestion 两裁决：Q1=C 更大集[用户覆盖推荐 A——推理四件套全上]＋Q2=双人核准取消[用户裁决移出范围]；C6-2 收官）

| 增补 | 需求 | 溯源 | 实现 | 证据 | 状态 | 边界/后续 |
|---|---|---|---|---|---|---|
| C6-2 | OWL 推理深化（L3.7→达成） | [original-design-v0.9](context/original-design-v0.9.md) §33 后续候选（C6） | 确定性子集四件套：equivalentClass 等价（对称物化进扩展包含图——互达/互斥传播/A≡B 且 A⊥B 建时 fail-closed）；unionOf 并类（操作数父类物化）；属性注册表 properties[{subPropertyOf(DAG)/inverseOf(单边即双向)/transitive}]；semantic-relation 满足判定重写（直接/子属性/逆属性/传递链＋链边覆盖＋认可扩展＋inferred 证据）；alignment/consistency 经 provider 免费继承 | tests/owl-reasoning 10 项（四规则正例＋六负例＋建时矛盾＋助手）；owl-reasoning-demo（46 示例） | 原生（v1.23.0，2026-10-01） | 无开世界/反例推理；unionOf 外类表达式不出；等价不合并术语标签；双人核准移出范围（用户裁决） |

## 13. 状态汇总与未完成主线

- 设计任务在册 31 项（2026-10-01 精简轮删 5 条裁剪行后按表现状重算）：**原生（含达成）13、协议 11、部分 7**，无"未做"；"部分"行均附明确证明边界（L2.1/L2.2/L3.4/L3.5/L4.1/L4.6/L5.3）。此前口径"36 项 原生 17/协议 11/部分 8"为含裁剪行的历史盘点，随删行作废。
- 横切 11 项全部落地（X2 为记录在案的有意偏差；v1.6 起 WAIVED 语义限定于已审批 Exception 呈现）；v1.5 增补在册 5 项（P6 裁剪删行）、v1.6 增补在册 5 项（V5 裁剪删行）、v1.7 增补 O1–O5 全部落地。
- v1.9–v1.23 各版增补（§6–§12.3）全部落地：信任边界收敛 W1–W5、E3/E4/AF、topology R1–R4、R12/B1/E7/E5/E6、v1.13 观察工具链、H1 Stop 摩擦优化、BR1/TS1/CD1、UL1–UL3 统一语言治理、AL1–AL5 对齐防护四轨道、C6-1/C6-1b/C6-2 语义深化——逐版一行完成记录见 [PLAN.md](PLAN.md) 历史版本记录，细节见各版 [RELEASE](release/)。
- 客户端实机验收全部收尾：最近两轮为 1.17.0–1.20.0 五版同轮（[LIVE-ACCEPTANCE-1.20](history/LIVE-ACCEPTANCE-1.20.md)）与 v1.21.0–v1.23.0 五版同轮（[LIVE-ACCEPTANCE-1.23](history/LIVE-ACCEPTANCE-1.23.md)）；更早各轮见 [docs/history/](history/) 与交接入口实机证据清单。
- 未完成主线：**v2.0.0 收尾终审轮**——剩余"部分"行逐行终审（技术可及升级或"边界即达成"转正，首日裁决 L2.1 AsyncAPI 纳入与否）、transcript 强制化默认裁决、RTM 终版清算、v0.9 基线标记完成（见 [PLAN.md](PLAN.md) 路线图与 [PRD §7](PRD.md)）。
- 范围红线（不再列为候选）：R13 拓扑推导器与容器编排接入（2026-09-27 用户决定，topology 保持纯声明核验为最终形态）；发布包签名与 CI（2026-09-26）；双人核准（2026-10-01 Q2 裁决移出范围）。基线外并行候选：生产工具接入、第二 adapter（v2.0 后新基线再议）。

> 维护约定见文首；本矩阵取代已归档的设计覆盖台账（[history/DESIGN-COVERAGE-ROADMAP.md](history/DESIGN-COVERAGE-ROADMAP.md)，其逐项长描述含更细的执行语义，可作查阅副本）。

## v1.24 开源发布前修复（2026-10-01）

L0.4/L5.6（ADR deferred）、L2.3（SHACL 单边约束/Unicode/引擎组件）、L2.5（账本精确整数）、L3.7（传递属性方向/外部 reasoner 完整事实）、L5.1（配置数组）、H1（内容快照）及轨道 C（根文件扫描/完整内置模块）由 tests/release-correctness.test.mjs、freshness/adapter 反例验证。预算计算共享并含 shacl；长回归走 pr/release，Stop 超预算 ERROR。证明边界与剩余 7 项部分需求见 [OPEN-SOURCE-STATUS](OPEN-SOURCE-STATUS.md)；发布验证见 [RELEASE-1.24.0](release/RELEASE-1.24.0.md)。
