# PRD：Quality Gate 产品需求文档

版本基线：v1.31.1（2026-10-06）。本文档把[原始需求](context/original-design-v0.1.md)、当前实现与[后续规划](PLAN.md)整合为产品视角的唯一入口；需求→实现的逐项映射见 [RTM.md](RTM.md)，架构决策见 [adr/](adr/)，字段级规范见 [GATE-SPEC-v1.23.md](GATE-SPEC-v1.23.md) 与 [CONFIG-GUIDE.md](CONFIG-GUIDE.md)，表达规则见 [WRITING-GUIDE.md](WRITING-GUIDE.md)。

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
| 可维护 | 回归计数见最新发布验证；48 示例（27 冒烟测试）；新增可配置项必须同步 CONFIG-GUIDE 并由测试强制；新概念先入 GLOSSARY（弃用词由根 G-CONVENTIONS 强制） |

## 6. 交付形态与验收纪律

- **交付物**：`dist/quality-gate-<版本>.zip`（自含 marketplace.json+docs+源码与测试；不包含本机 evidence，SHA256 留档）；本地 marketplace 安装路径见根 [README.md](../README.md)。
- **每增量验收纪律**（AGENTS 约定）：可运行正例 + 故意失败反例 + 明确失败证据 + 全量回归；ZCode 实机验收与 CLI/模拟测试分别记录；打包变更跑解包复验。
- **版本节奏**：v0.1–v1.1 六域逐项落地 → v1.2 工程与治理增强 → v1.3/v1.4 语义轨道 → v1.5 原则/实践轨道 → v1.6 判定协议与证据治理收尾（R5/R6+priorRuns+WAIVED；双轨并行迭代，见 [adr/ADR-0012](adr/ADR-0012-parallel-tracks.md)）。全部历史见 [history/](history/)。

## 7. 路线图

**已达成（v1.7–v1.23.0；逐版一行完成记录与测试/kind/示例计数见 [history/VERSION-HISTORY.md](history/VERSION-HISTORY.md)，细节见各版 [RELEASE](release/)）**：v1.7 首运行引导与配置生命周期（[ADR-0014](adr/ADR-0014-guided-onboarding.md)/[ADR-0015](adr/ADR-0015-config-lifecycle.md)）→ v1.8.0 功能裁剪（移除 migration/operational/readiness 门禁、扫描 dependency/secret/iac/dast 类别、metrics 证据纪律与 releasePackage/priorRuns，破坏性配置变更）→ v1.9 信任边界收敛（空登记阻断、自引用保护、观察可信度、登记完备性、语义-行为桥）→ v1.10–v1.12 拓扑语义 R1–R4、原始证据内核解析（TAP/JUnit）、Python/Java/ORM 参考适配器、consumer-matrix 兼容矩阵 → v1.13 观察工具链（rawTranscript 声明即核验、浏览器截图参考 runner、consumer-usage）→ v1.14 Stop 摩擦优化（归档复用、会话基准前置、new-only）→ v1.15 基线内容绑定与变更影响建议 → v1.16 统一语言治理（GLOSSARY 唯一登记处、协议键迁移 schemaVersion 0.2）→ v1.17–v1.21 对齐防护四轨道收官（任务意图、约定对齐、符号存在性、trace 贯通与回放基线）→ v1.22 SHACL 引擎协议与多语言术语（v1.22.1 组件全集内核原生化）→ v1.23 OWL 推理深化四件套（L3.7 达成，37 kinds 定型）。以上各版客户端实机验收均已分轮收尾（[history/](history/) 各 LIVE-ACCEPTANCE）。

**已达成（v1.24.0–v1.31.0，2026-10-01/06）**：v1.24.0 = 首次 GitHub 开源发行＋2026-10-01 全项目审查 11 组错误放行/错误阻断问题修复（Stop 复用条件、OWL 推理方向、账本整数精度、根目录符号扫描、SHACL 单边约束、Stop 预算、内置模块识别、引擎组件与 Unicode、reasoner 事实、配置数组、deferred ADR——复现转回归 [RELEASE-1.24.0](release/RELEASE-1.24.0.md)，支持范围见 [OPEN-SOURCE-STATUS](OPEN-SOURCE-STATUS.md)）；v1.25.0–v1.27.0 = 受控表达三批（X12/X13 达成/X14 首轮达成——报告表达、来源列与声明关联等证明范围显示）；v1.28.0 = 评审残余收尾（SKIP 原因显式化、不适用跳过审计、零文件面可见）；v1.29.0 = 评审后续推进（内容级核验/真实故障/真实测量/像素重算/组合验证/OpenAPI 子集/延迟分布——L2.1/L4.1/L4.6/L5.3 按完成条件达成，653 测试/37 kinds/48 示例，[RELEASE-1.29.0](release/RELEASE-1.29.0.md)）；v1.30.0 = 二轮评审修复（evidence/project-review-2026-10-06 六组实现问题收敛：F01 登记内 runner 计入统一执行预算＋剩余期限停止启动、F02 requireLive 缺失 mode 即缺证据 FAIL、F03 反向认可须显式 inverseOf、F04 PNG tRNS 透明键与结构防线、F05 依赖图提取跳过注释/字符串并计副作用 import/export-from、F06 OpenAPI 提取 fail-closed＋参数 name+in 覆盖＋输出 kind:'api'——672 测试 0 SKIP，[RELEASE-1.30.0](release/RELEASE-1.30.0.md)）；v1.31.0 = 证明链补齐（AC→真实用例身份与当轮结果绑定 cases/requireCaseBinding——缺失/被跳过/无关成功门禁均不得作为 AC 通过依据；来源信号覆盖 kernel-recompute 与 contentCheck、PASS 无信号门禁显式"无信号"——678 测试 0 SKIP，[RELEASE-1.31.0](release/RELEASE-1.31.0.md)）；v1.31.1 = 反思轮补丁（PNG 重复 tRNS 拒绝、依赖提取正则字面量语境守卫、visual 字节一致计入核验信号、GLOSSARY 术语补登记，[RELEASE-1.31.1](release/RELEASE-1.31.1.md)）。客户端实机验收 1.24.0–1.27.0 已四版同轮收尾（[LIVE-ACCEPTANCE-1.27](history/LIVE-ACCEPTANCE-1.27.md)）。

**通往 v2.0 的路线**（2026-10-01 经 AskUserQuestion 选定：一轨一轮，目标=v0.9 演进基线全部完成——四轨道闭环＋RTM 无"部分"行[双轨制：技术可及项升级，证明哲学性边界以"边界即达成"终审转正]；详规见 [PLAN.md](PLAN.md) 路线图）：v1.17.1–v1.31.1 已全部落地（对齐防护四轨道收官、C6 语义深化、开源与审查修复、受控表达四批、评审收尾与后续推进、二轮评审修复与证明链补齐，见上两段）；余 **v2.0.0 收尾终审轮**——剩余"部分"行（L3.5）终审（另裁决 L2.1 AsyncAPI 纳入与否）、transcript 强制化默认裁决、RTM 终版清算、v0.9 基线标记完成。外部真实项目使用验证属进一步需求收集（2026-10-06 用户裁定）：不作为本项目需求跟踪与验收条件，使用方反馈作为后续新需求来源。

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
