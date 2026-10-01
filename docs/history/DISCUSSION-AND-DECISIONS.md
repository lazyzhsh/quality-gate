# 讨论脉络、需求与工程决定（已归档）

> **已归档（2026-09-25）**：本文档的活跃职责已由 [PRD](../PRD.md)（问题框架/目标非目标/路线图）、[RTM](../RTM.md)（逐项状态与未完成主线）与 [adr/](../adr)（架构决定，含 [ADR-0013](../adr/ADR-0013-persistence-readback.md) 持久化独立回读）承接，仅作历史档案保留。迁移事实（早期实机证据 JSON 中 `root` 为旧工作区路径，属历史事实不回写）已记入 [docs/README](../README.md) 历史层说明。

本文件压缩了 ChatGPT 对话“完善质量门禁体系”（会话 ID `6ab32a41-31bc-83ea-9589-92f8da2764a8`）、后续 Codex 开发与验收对话，以及原始设计文档。完整设计原文保存在 [original-design-v0.1.md](../context/original-design-v0.1.md)，逐项实现状态在 [设计覆盖台账](DESIGN-COVERAGE-ROADMAP.md)。对话和设计文档是需求/探索资料，实施仍须以当前代码与实测证据为准。

## 问题如何形成

用户最初担心 Vibe/Agentic Coding 的传统 lint→build→unit→E2E 流水线不够完整，无法判断生成软件是否达到交付条件。最初列出的检查包括语法、编译打包、单测、API/数据库字段对齐、冒烟/集成/E2E/页面目检、安全白盒/黑盒、配置与手册、PRD、架构、Open Decision、技术债、假设和本体语义。讨论将其重组为六个逐渐增强的**质量证明域**：

| 域 | 要回答的问题 | 代表任务 |
|---|---|---|
| L0 范围与需求 | 是否漏做、误做或擅自假设？ | RTM、验收条件类型、假设/决策、变更范围 |
| L1 工程正确性 | 代码和制品是否成立？ | 静态、构建、单测/变异、结构和规范 |
| L2 系统一致性 | API、Schema 与实际数据是否一致？ | 契约、结构/语义、**实际调用后的持久化逐字段核对**、跨表不变量 |
| L3 行为与业务语义 | 运行行为是否符合业务意图？ | 冒烟/集成/E2E、视觉、行为案例、性质/状态、本体映射 |
| L4 架构、非功能与安全 | 实现方式是否可接受？ | 架构规则、性能、观测、扫描、DAST、故障恢复 |
| L5 交付与治理 | 是否能部署、运营和追责？ | 配置、迁移、文档、运维、债务、决策、发布证据 |

用户特别强调 L2 不能只做 Schema Semantic Check：必须执行真实案例或接口调用，随后独立读取持久化数据，逐字段比较预期与实际。该决定落实为 persistence Gate 及 HTTP→SQLite 样例，不能用接口响应回显代替数据库核对。

## 产品与架构决定

1. **两个维度分开**：L0–L5 是 Quality Domains；Task Start、Before Change、After Edit、Task Closing、PR、Release 是触发阶段。不是每次都运行全部域，Gate 通过 `enabled`、`stages` 和阶段必需域裁剪；SKIP/缺证据不得算 PASS。
2. **核心模型**：Claim 说明要证明什么，Evidence 指出可复核的事实，Gate 按策略作判断，Risk 明示未证明的敞口，Exception 记录受控例外。当前 Exception 只登记并阻断，不自动批准豁免；不能暗中把 FAIL/SKIP 变为 PASS。
3. **智能体平台无关**：独立 Node CLI/内核承担执行与报告；ZCode Hook、Command、Skill 是首个适配器。未来可以做 Claude Code、Codex、MCP 等 adapter，但不能让宿主事件格式污染核心模型。
4. **确定性优先**：运行真实工具、比较结构化结果并记录证据；LLM 可帮助提取需求、发现可能的假设或解释结果，但不能仅凭自身声称完成来放行。
5. **本体可替换**：FIBO 是首个金融领域 provider 的固定版本小样本；`local-catalog` 能替换。现有 lookup/profile/alignment 并不是完整 OWL/SHACL 推理，也不自动证明金融业务语义。
6. **标准化参考**：ISO 26262 的需求追踪、分层验证与证据治理值得借鉴；本项目没有声称符合 ISO 26262 或具备安全认证资格。
7. **研发纪律**：先制定阶段计划，每加一项做可运行正例、故意失败反例、旧功能回归，留下证据，再进入下一项；客户端实机验收与模拟/CLI 测试必须区分。

## 路线如何变化

本独立项目于 2026-09-24 自原 CodeX 工作区以“复制并验证”方式迁出（当时的逐文件核对记录见 git 历史中的 `docs/context/MIGRATION-RECORD.md`，已删除）；迁移前的实机证据 JSON 中 `root` 为旧工作区路径，属历史事实，不回写改写。

初期 MVP 只要求可部署骨架、Gate Spec、一个 L1 或 L0 Gate、ZCode Hook/Command/Skill、最小本地验证，再补第二个 Gate 与 FIBO skeleton。用户随后明确希望覆盖 **L0–L5 全部质量域**，所以路线从 v0.1 扩为六域原型，并最终按原始设计 §6–11 逐条补齐可执行 Gate/runner 协议。历史里程碑：v0.2 实际 API→DB 字段核对；v0.3 固定版本 FIBO；v0.4–v0.9 逐域能力；v1.0 六域组合与 ZCode 实机；v1.1 覆盖 36 项设计任务、114 项回归和 L3 性质 Gate 实机阻断/恢复；v1.2–v1.4 语义轨道（terminology、七类 semantic-* 对齐、内建 OWL 子集推理、FIBO 固定目录升级）；v1.5 原则/实践轨道（F2P/P2P、证据纪律、consistency、api-authz/credential、budget、容量演练）并完成六域 ZCode 客户端实机验收。历史阶段文档、发布说明和 JSON 证据都留在仓库。

## 明确未完成及建议优先级（2026-09-25 随 v1.5.0 校准）

本节只保留**当前仍未完成**的项；逐项实现状态以[设计覆盖台账](DESIGN-COVERAGE-ROADMAP.md)为准，已完成条目的证据见各版发布说明。

已自本节移出的闭环条目：Command/Skill 与六域组合的实机验收（[1.5 实机验收](LIVE-ACCEPTANCE-1.5.md)及夹具交叉复验）；provenance 分级与证据有效期/新鲜度/存量冻结（v1.5）；关系/约束/状态推理、概念冲突检测与术语门禁（v1.3–v1.4）。

- **证据治理收尾**：跨运行汇总、发布包数字签名与防篡改（`releasePackage` 仅有当次 SHA256 清单）、结构化风险处置、带审批/过期机制的 Exception 放行，仍需后续设计。
- **裁剪智能化**：Gate 选择仍靠显式配置（`enabled`/`stages`/`requiredDomains`），尚未根据变更影响自动推荐可靠 Gate 集。
- **业务语义深化**：完整 OWL/SHACL 关系与属性推理、多语言术语与未声明同义词、双人核准机制、观测用例之外的覆盖声明，仍未完成。
- **原则深化（v1.5 遗留决策 R1–R6）**：故障域、最小割集、副本分型、灰度判定协议、重跑确定性等，按用户决策留待下一轮（依据 [RESEARCH-ARCH-PRINCIPLES.md](../context/RESEARCH-ARCH-PRINCIPLES.md)）。
- **生产接入**：完整 OpenAPI/ORM/消费者链、真实浏览器视觉测试、专业 SAST/DAST/依赖图、负载/遥测、生产方言迁移和运维演练，仍需项目侧接入真实工具与隔离环境（runner 协议与 KNOWN_TOOLS 登记已就绪，登记表随内核维护）。
- **其他 Agent**：实现第二个 adapter 前先固定核心与宿主事件之间的协议，并用相同案例比较输出。

任何下一迭代都应明确“检查到的是什么”与“尚未证明的是什么”，并让报告中的 Claim、Evidence、Risk 与该边界一致。
