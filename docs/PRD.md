# PRD：Quality Gate 产品需求文档

版本基线：v1.24.0（2026-10-01）。本文档把[原始需求](context/original-design-v0.1.md)、当前实现与[后续规划](PLAN.md)整合为产品视角的唯一入口；需求→实现的逐项映射见 [RTM.md](RTM.md)，架构决策见 [adr/](adr/)，字段级规范见 [GATE-SPEC-v1.23.md](GATE-SPEC-v1.23.md) 与 [CONFIG-GUIDE.md](CONFIG-GUIDE.md)。

## 1. 问题与产品定位

**问题**：Vibe/Agentic Coding 中，传统 lint→build→unit→E2E 流水线不足以判断"生成的软件是否达到交付条件"——遗漏了需求追踪、数据一致性、业务语义、架构健康、运维就绪等维度；而 agent 自述"已完成"不构成证据。

**产品定位**：一个**智能体平台无关、可声明、可组合、可裁剪、可追踪、可独立验证的软件交付质量门禁框架**（原始设计 §2.1 目标原文），把"软件可交付"变成可追溯的证明链：**Claim → Evidence → Gate → Risk → Exception**。首个交付形态为 ZCode 插件（Hook/Command/Skill），同一内核可独立 CLI 运行并接入 CI。

**核心理念**（自 v0.1 未变）：Evidence First；No Evidence ≠ PASS；Deterministic First, LLM Second（LLM 可辅助提取与解释，不得自行放行）；小步可验证步进。

## 2. 目标用户与场景

- **主用户**：与编码智能体协作的开发者/小团队，需要在任务结束、PR、发布三个时点获得"可交付/不可交付及原因"的机器可复核判定。
- **服务对象假设**（v1.5 选型，见 PLAN）：Java、JS/TS、Python 实现的**支付清算关键基础设施核心软件**（高性能/高可用/高安全）；由此推导语言中立的证据协议、通用制品绑定（OpenAPI/部署清单/依赖锁文件）与"每个增量本地可出真实正反例"的验收纪律。
- **典型场景**：agent 修改代码→Stop Hook 自动跑配置的门禁→FAIL 时把失败摘要回传给 agent 修复→PASS 放行；CI 中同一 CLI 退出码作为最终强制准出。

## 3. 产品目标与非目标

**目标**（原始设计 §2.1/§2.2，框架闭环已实现；效果与剩余差距按 RTM 逐项评价）：

1. 覆盖 L0–L5 六个质量证明域的**可执行门禁**（37 种 gate kind），按 `enabled`/`stages`/`requiredLevels` 裁剪；
2. 每次运行产出标准化证据报告（逐门禁结构化证据与 `configSha256`；跨运行证据包已随 1.8.0 裁剪）；
3. Stop 阶段能在必要证据缺失/失败时**阻断** agent 结束并给出可操作反馈（客户端三轮重试上限内）；
4. MVP 十项闭环（安装→触发→声明→执行→证据→判定→阻断→反馈→修复→测试）自 v0.1 起保持。

**非目标**（原始设计 §3，继续有效）：不实现通用形式化验证器、不证明"绝对无 Bug"、不宣称 ISO 26262 认证（仅借鉴其需求追踪、分层验证与证据治理思想）、不把 FIBO 写死进核心、不让 LLM 自由决定结论、不构建企业 SaaS/Web 控制台、演示结果不表述为生产认证。

## 4. 功能需求概览

六域各自回答一个交付问题（源自原始需求讨论，代表任务逐项见 RTM）：

| 域 | 要回答的问题 |
|---|---|
| L0 范围、需求与生成完整性 | 是否漏做、误做或擅自假设？ |
| L1 代码与工程正确性 | 代码和制品是否成立？ |
| L2 接口、数据与系统一致性 | API、Schema 与实际数据是否一致？ |
| L3 功能与业务语义正确性 | 运行行为是否符合业务意图？ |
| L4 架构、非功能与安全 | 实现方式是否可接受？ |
| L5 交付、运行与治理完整性 | 是否能部署、运营和追责？ |

按域摘要（状态与逐项映射见 RTM；全部字段见 GATE-SPEC/CONFIG-GUIDE）：

- **L0 范围与需求**：需求追踪矩阵（AC 类型覆盖）、假设登记、决策登记、Git 变更范围——原生判定。
- **L1 工程正确性**：静态/构建/单测/变异/结构/约定六类工程检查协议；F2P/P2P 双向测试协议防伪修复。
- **L2 系统一致性**：契约与结构对齐、持久化行为逐字段核验、跨表不变量；v1.5 支付数据正确性（零和账本、append-only、对账、DLQ 保留、内核重算审计链、契约破坏性变更阻断）。
- **L3 行为与业务语义**：旅程（冒烟/集成/E2E）、视觉、行为案例、性质/状态机；本体语义八层（对齐/术语/关系/约束/状态/实例/暴露/一致性）、确定性 OWL 子集推理（等价/并类/子属性/逆属性/传递，v1.23）与多语言术语（v1.22）；SHACL Core 组件内核原生判定、pyshacl 引擎可选并集（v1.22.x）。
- **L4 架构非功能与安全**：适应度度量（`metrics` 纯阈值判定，证据纪律已随 1.8.0 裁剪）、扫描（sast/api-authz/credential 三类；dependency/secret/iac/dast 已随 1.8.0 裁剪）、故障恢复与熔断演练、超时/重试预算守恒、拓扑语义（`topology`，v1.10）、重跑确定性（`rerun`）；trace 贯通核验与回放基线（v1.21 轨道 D 收官）。
- **L5 交付与治理**：配置核对、文档一致性、债务登记、决策收尾（迁移演练/运维就绪/发布证据包已随 1.8.0 裁剪，six-domain 模板 L5 由 debt+回滚 command 承载）。
- **横切**：SessionStart 依赖提示与 onboarding 引导（v1.7 起首运行 `/quality-gate-init` 引导对话：档位/模板推荐选择 + CLI 确定性装配写入；v1.7.1 起配置生命周期分权——重初始化 `leftovers`+`init --fresh` 列表确认后清理，升级/增量调整 `/quality-gate-update`+`inspect`/`update`，登记文件集中 `.quality-gate/registries/`）、Stop 阻断反馈循环、报告摘要层（stderr brief+Markdown 表）、外部依赖登记表安装指引、示例清单单一事实源。

## 5. 非功能需求

| 需求 | 约束 |
|---|---|
| 运行环境 | Node.js 20+，零 npm 依赖，运行不联网；部分示例另需 Python 3.10+ |
| 确定性 | 固定 seed 的可复现判定；框架自身错误一律 fail-closed（ERROR 非 PASS） |
| 时效 | CLI edit/close 总预算 ≤60s，pr/release ≤300s；仅 pr/release 的 command 可到 300s，Stop 配置执行预算 ≤50s（宿主 55s） |
| 平台 | Windows/macOS/Linux；内核不依赖宿主事件格式（ZCode adapter 隔离） |
| 安全 | argv 以当前用户执行（按构建脚本同等审查）；秘密脱敏失败；报告只落本地不外传 |
| 可维护 | 回归计数见最新发布验证；46 示例（25 冒烟测试）；新增可配置项必须同步 CONFIG-GUIDE 并由测试强制；新概念先入 GLOSSARY（弃用词由根 G-CONVENTIONS 强制） |

## 6. 交付形态与验收纪律

- **交付物**：`dist/quality-gate-<版本>.zip`（自含 marketplace.json+docs+源码与测试；不包含本机 evidence，SHA256 留档）；本地 marketplace 安装路径见根 [README.md](../README.md)。
- **每增量验收纪律**（AGENTS 约定）：可运行正例 + 故意失败反例 + 明确失败证据 + 全量回归；ZCode 实机验收与 CLI/模拟测试分别记录；打包变更跑解包复验。
- **版本节奏**：v0.1–v1.1 六域逐项落地 → v1.2 工程与治理增强 → v1.3/v1.4 语义轨道 → v1.5 原则/实践轨道 → v1.6 判定协议与证据治理收尾（R5/R6+priorRuns+WAIVED；双轨并行迭代，见 [adr/ADR-0012](adr/ADR-0012-parallel-tracks.md)）。全部历史见 [history/](history/)。

## 7. 路线图

**已达成**（详证据见 history/ 各发布与验收文档）：v1.5.0 = 34 kinds、304 测试、38 示例、ZCode 客户端实机验收完成（SessionStart/Skill/Stop 阻断与放行/依赖提示/插件页 1.5.0，双驱动栈交叉复验）。**v1.6.0**（2026-09-25，主线"R 系与治理混编"经用户选定）= 35 kinds、330 测试、40 示例（28 冒烟测试）：v1.5.1 补丁先行（config-guide 安装布局修复随包送达）；R5 灰度判定协议（canaryAnalysis，inconclusive 不计 PASS、SRM 作废）、R6 重跑确定性 `rerun` 门禁（同 seed 双次运行哈希一致）、跨运行汇总 `priorRuns` 哈希链、审批/到期 Exception WAIVED 呈现（不豁免 FAIL 门禁）、change-scope 独立示例清空 kind 缺口、unit `minCoverageRatio` 覆盖率协议（L1.3 收尾）。**v1.7.0**（2026-09-26，用户提出首运行引导对话）= 350 测试：档位化模板库（lite/pro/max × 7 模板 + 10 附加门禁）、CLI `templates`/`init` 确定性装配（占位符 fail-closed、写入仅在 CLI 层）、`/quality-gate-init` 引导命令（agent 只问询不代写）、SessionStart/缺配置报错指向引导（RTM O1、ADR-0014）。**v1.7.1**（同日，实机验收反馈）= 363 测试：配置生命周期分权（`leftovers`+`init --fresh` 列表确认后清理重初始化；`inspect`/`update`+`/quality-gate-update` 增量调整；`template` 溯源字段）与登记文件集中管理（`.quality-gate/registries/` + `migrateRegistries` 迁移，RTM O2/O3、ADR-0015）。**v1.7.2**（同日，1.7.0 实机验收三项反馈收尾）= 367 测试：answers/changes `ontology` 替换（fibo-pinned 随包 sha 经 `templates` ontologyHint 发布）、metrics `thresholds` 自有指标名替换、init/update 登记门禁引用预检 `preflightGateRefs`（RTM O4）。**v1.7.3**（同日，夹具基线化发现）= 367 测试：preflightRefs 深度收集嵌套登记引用；expense-approval-fixture 固化为可复用验收基线。**v1.8.0**（2026-09-26，主线"功能裁剪"）= 354 测试/35 示例/32 kinds：按用户决定移除 migration/operational/readiness、scan 的 dependency/secret/iac/dast、metrics 证据纪律与 releasePackage/priorRuns（破坏性配置变更）。

**已达成（v1.9.0 → v1.22.1，逐版一行；细节见各版发行说明与 [PLAN.md](PLAN.md) 历史版本记录）**：

- v1.9.0（2026-09-26，信任边界收敛 W1–W5：空登记阻断/自引用保护/观察可信度/登记完备性/语义-行为桥；376 测试/32 kinds）→ v1.9.1（E4 requireContentCheck＋alignment sourceFingerprint；378）；
- v1.10.0（新 kind topology 承载 R1–R4＋E3 快照默认强制；386/33）→ v1.10.1（R12 证据力汇聚；390）→ v1.11.0（B1 原始证据内核解析＋E7 Python/Java 参考适配器＋E5 ORM 参考；407）→ v1.12.0（新 kind consumer-matrix 兼容矩阵与分层来源；415/34）；
- v1.13.0（behavior/journey rawTranscript 声明即核验＋visual 浏览器参考 runner＋consumer-usage 工具化；433/34/37 示例）→ v1.14.0（Stop Hook 摩擦优化：归档复用/SessionStart 基准行/new-only 降级；445）；
- v1.15.0（基线内容绑定＋两源一致＋inspect 建议块＋consumer-matrix 字段级使用面；460/34/37）→ v1.16.0（统一语言治理：GLOSSARY 唯一登记处＋概念拆义＋协议键迁移 schemaVersion 0.2；464/34/37；实机验收含 v1.15.0 并入已收尾）；
- v1.17.0（任务意图登记＋漂移对账＋新 kind symbol-grounding；497/35/39）→ v1.17.1（意图软形态 Hook；506）→ v1.18.0（AC 结构化协议双验证器——轨道 A 收官；515/35）→ v1.19.0（convention-alignment＋ADR 绑定＋自举——轨道 B 收官；525/36/40）→ v1.20.0（symbol-grounding 三扩展＋Py/Java 适配器——轨道 C 收官；555/36/42）→ v1.21.0（trace-continuity＋replayBaseline——轨道 D 收官，四轨道全部收官；575/37/44）→ v1.21.1（内核预算上限 60000；578）→ v1.22.0（SHACL 引擎协议＋深度匹配＋terminology 多语言；590/37/45）→ v1.22.1（SHACL 组件全集内核原生化——OD-116 默认零外部依赖；592/37/45）。

以上各版客户端实机验收均已收尾（最近两轮：1.17.0–1.20.0 五版同轮 [LIVE-ACCEPTANCE-1.20](history/LIVE-ACCEPTANCE-1.20.md)、v1.21.0–v1.23.0 五版同轮 [LIVE-ACCEPTANCE-1.23](history/LIVE-ACCEPTANCE-1.23.md)）。

**已达成（v1.23.0，2026-10-01，主线"C6-2 语义深化·下——OWL 推理深化·确定性子集更大集"——两裁决 Q1=C 更大集[用户覆盖推荐 A]/Q2=双人核准取消[移出范围]，37 kinds 零破坏）**= 602 测试（601 过/1 skip）/37 kinds/46 示例：等价类/并类/子属性层级/逆属性/传递链四件套（对称物化进扩展包含图＋建时矛盾 fail-closed＋semantic-relation 推理满足判定与 inferred 证据）；alignment/consistency 经 provider 免费继承。RTM L3.7→达成。工作包与证据见 [RELEASE-1.23.0](release/RELEASE-1.23.0.md)。实机验收已随五版同轮收尾（LIVE-ACCEPTANCE-1.23）。

**通往 v2.0 的路线**（2026-10-01 经 AskUserQuestion 选定：一轨一轮 8 版，目标=v0.9 演进基线全部完成——四轨道闭环＋RTM 无"部分"行[双轨制：技术可及项升级，证明哲学性边界以"边界即达成"终审转正]；详规见 [PLAN.md](PLAN.md) 路线图）：v1.17.1–v1.23.0 七版已全部落地（对齐防护四轨道收官＋C6 语义深化上下）；余 **v2.0.0 收尾终审轮**——剩余"部分"行逐行终审（首日裁决 L2.1 AsyncAPI 纳入与否）、transcript 强制化默认裁决、RTM 终版清算、v0.9 基线标记完成。

**基线外并行候选**（不随路线图排期）：第二个 agent adapter（先固定核心-宿主事件协议并以同案例比对输出）；生产工具接入：专业扫描器/浏览器/负载/遥测/迁移工具经 runner 协议与 KNOWN_TOOLS 登记接入真实项目（协议侧已就绪，属各项目工程工作）。

发布包签名（in-toto/DSSE）与仓库自有 CI 工作流**已明确出项目范围**（2026-09-26 用户决定）：非本项目目标；生产强制准出由使用方的 CI 承接（见 §8 边界），签名不在路线图。R13 拓扑推导器与容器编排接入（K8s API/服务注册/IaC state 等编排源推导）**已永久出项目范围**（2026-09-27 用户决定）：本项目面向应用研发，编排接入影响插件效率，不再列入任何路线图；topology 门禁保持纯声明文件一致性核验，其"非真实部署"证明边界为最终形态。

## 8. 开放问题与风险

- Stop 阻断受客户端重试上限约束，生产强制准出依赖 CI（设计使然，非缺陷）；
- 演示扫描器/本地计时/隔离回滚证明协议链路，生产接入专业工具前不得外推；
- 多会话并行迭代同仓库时，未跟踪文件归属需显式约定（本轮文档重组已遵循）；
- docs/history/ 归档文档中的相对链接已修复，全仓库 markdown 链接校验 0 断链（2026-09-28 校对轮）；历史文档内部陈述按其当时语境理解。

## 9. 附录

- 需求基线：[原始设计 v0.1](context/original-design-v0.1.md)（讨论档案与逐项实施台账已归档至 [history/](history/)，其活跃内容由本文档、[RTM.md](RTM.md) 与 [adr/](adr/) 承接）
- 逐项状态：[RTM.md](RTM.md)（设计任务→实现→证据→后续的单一索引）
- 规范：[GATE-SPEC-v1.23.md](GATE-SPEC-v1.23.md)｜[CONFIG-GUIDE.md](CONFIG-GUIDE.md)｜[PERSISTENCE-GATE.md](PERSISTENCE-GATE.md)｜[FIBO-PROVIDER.md](FIBO-PROVIDER.md)
- 决策：[adr/](adr/)｜规划：[PLAN.md](PLAN.md)｜研究输入：[RESEARCH-ARCH-PRINCIPLES.md](context/RESEARCH-ARCH-PRINCIPLES.md)、[RESEARCH-PRINCIPLE-CATALOG.md](context/RESEARCH-PRINCIPLE-CATALOG.md)
