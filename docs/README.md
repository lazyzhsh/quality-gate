# docs 目录导读

本目录按"产品 → 规范 → 状态 → 历史 → 上下文"五层组织（决策记录见 [adr/ADR-0012](adr/ADR-0012-parallel-tracks.md)）。根目录三入口（AGENTS/PROJECT-HANDOFF/README）之外的项目文档在这里；开源 LICENSE 位于根目录，贡献/安全入口在 .github/。

[开源状态与支持范围](OPEN-SOURCE-STATUS.md)、[第三方许可](THIRD-PARTY-NOTICES.md)、[贡献指引](../.github/CONTRIBUTING.md) 与 [安全报告](../.github/SECURITY.md) 为公开使用入口。

## 产品层（是什么、为什么、追到哪）

| 文档 | 用途 |
|---|---|
| [PRD.md](PRD.md) | 产品需求：问题定位、目标/非目标、六域问题框架、功能概览、路线图（原始需求+现状+规划的唯一产品视角整合） |
| [RTM.md](RTM.md) | 需求跟踪矩阵：设计任务→实现→验证依据→状态→后续的**单一索引**（含状态图例与维护约定） |
| [adr/](adr/) | 17 条架构决策记录（编号递增，已接受状态，含备选与后果） |

## 规范层（怎么配置、怎么判）

| 文档 | 用途 |
|---|---|
| [GATE-SPEC-v1.23.md](GATE-SPEC-v1.23.md) | 现行 Gate Spec：配置与 runner 协议、判定规则（活规范；保留 1.23 文件入口，v1.24 起修正与 v2.0 AsyncAPI event 扩展以文末追加节登记） |
| [GLOSSARY.md](GLOSSARY.md) | 统一语言术语表：全项目概念唯一登记处（规范中文/代码名/定义/上下文/弃用别名；v1.19 起弃用词由约定对齐门禁 G-CONVENTIONS 强制（自举自 glossary 防回归测试）） |
| [CONFIG-GUIDE.md](CONFIG-GUIDE.md) | 全部可配置项与逐 kind 机器校验 jsonc 样例（受 tests/config-guide.test.mjs 强制同步） |
| [WRITING-GUIDE.md](WRITING-GUIDE.md) | 写作规则（受控表达，RTM X12）：按用途定约束强度＋核心规则 W1–W12——GLOSSARY 管术语、本文件管表达；文风自动检查已随 X14 接入（v1.27.0 起 advisory 首轮） |
| [PERSISTENCE-GATE.md](PERSISTENCE-GATE.md) | 持久化门禁协议与真实 API→DB 核对方法 |
| [FIBO-PROVIDER.md](FIBO-PROVIDER.md) | FIBO 固定版本目录、手动升级工作流与 local-catalog 替换 |

## 状态层（接下来做什么）

| 文档 | 用途 |
|---|---|
| [PLAN.md](PLAN.md) | 下一版本规划与历史版本记录；含"明确不做"与范围决定（出项目范围事项留档）防范围蔓延 |

实现状态与逐项边界的索引已并入产品层 RTM；其前身"设计覆盖台账"（含更细的逐项执行语义长文）与"讨论与关键决定"档案均已归档至 history/。

## 历史层（只增不改，按当时语境理解）

- [release/](release/)：各版发行说明 RELEASE-0.2 起按版本递增排列（含补丁），便于追溯发行历史；新版本发布说明归档至此。
- [history/](history/)：LIVE-ACCEPTANCE-*、ITERATION-0.2–0.9、历版 GATE-SPEC（现行版之外全部归档于此）、VALIDATION、MECHANISM-REVIEW-*（首轮六域评审与 L3 复审）、VALIDATION-EXPENSE-FIXTURE-1.5、VERSION-HISTORY（2026-10-06 批次 3 自 PLAN/HANDOFF 迁入的逐版完成记录），以及两份带"已取代"横幅的归档（[DISCUSSION-AND-DECISIONS.md](history/DISCUSSION-AND-DECISIONS.md) 讨论档案、[DESIGN-COVERAGE-ROADMAP.md](history/DESIGN-COVERAGE-ROADMAP.md) 实施台账）。

注意：本项目独立化（2026-09-24 迁移）之前的实机证据 JSON 中 `root` 为旧工作区路径，属历史事实，不回写改写。

## 上下文层（需求与研究输入的"为什么"，均非实施承诺）

- [context/RESEARCH-CONTROLLED-EXPRESSION-2026-10-06.md](context/RESEARCH-CONTROLLED-EXPRESSION-2026-10-06.md)：受控表达应用方案。覆盖开发指令、文档重构、插件报告、自动检查及效果实验；四批均已实施——1.25.0/1.26.0 指令与报告表达（X12 经 v2.0 终审结算、X13 达成）、1.27.0 文档重构与自动检查（X14 首轮达成）、效果实验（X15 已执行并结算，测量边界见 RTM 该行）。
- [context/original-design-v0.1.md](context/original-design-v0.1.md)：原始设计基线，研究/需求资料，不代表全部已实现（已归档）。
- [context/original-design-v0.9.md](context/original-design-v0.9.md)：演进设计基线 v0.9（全量，现状描述以 v1.16.0 为实现基线；新增 Agent 对齐失效防护四轨道设计与阶段路线，取代 v0.1 作为后续开发指导；v2.0 已完成所采用范围，头部补注指向终审核对；原提案正文保留，见 GLOSSARY §1 提案概念例外）。
- [context/RESEARCH-ARCH-PRINCIPLES.md](context/RESEARCH-ARCH-PRINCIPLES.md)：架构原则调研（R 系列，四原则语义深化与候选路线）。
- [context/RESEARCH-PRINCIPLE-CATALOG.md](context/RESEARCH-PRINCIPLE-CATALOG.md)：原则目录（A/B/C/D/E 系列，四原则之外的扩展候选）。

## 约定

- 根目录入口文档保留 AGENTS.md、PROJECT-HANDOFF.md、README.md；另保留开源许可证 LICENSE，社区文件放 .github/。
- 新增可配置项必须同步 CONFIG-GUIDE（测试强制）；新增需求先入 RTM 再排 PLAN。
- 活文档引用历史文档一律指向 `history/`；移动文件后全量修复相对链接。
- 夹具验收文档 [history/VALIDATION-EXPENSE-FIXTURE-1.5.md](history/VALIDATION-EXPENSE-FIXTURE-1.5.md)；其中引用的 `evidence/fixture-v15/` 为维护者本机历史证据，公开源码不上传这些产物；`acceptance/expense-approval-fixture/` 夹具已入库（`evidence/fixture-v15/graphify-out/` 为工具缓存，已 gitignore）。
