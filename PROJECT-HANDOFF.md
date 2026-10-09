# Quality Gate 项目交接入口

本仓库是 Universal Delivery Gate Framework 的独立项目。目标是把“软件可交付”变成可追溯的 **Claim → Evidence → Gate → Risk → Exception** 证明链。内核应保持智能体平台无关；ZCode Plugin 是第一个可部署适配器，CLI 可独立运行。用户要求按小步实现、小步验证推进，并允许按项目和阶段裁剪 Gate。本体首版使用固定版本 FIBO 小样本，必须继续支持可配置、可替换的 provider。

## 从哪里开始

1. [PRD](docs/PRD.md)：产品需求全貌（问题、目标/非目标、功能概览、路线图）；[RTM](docs/RTM.md)：需求→实现→证据→状态跟踪矩阵；[ADR](docs/adr/)：架构决策记录。docs 分层导读见 [docs/README](docs/README.md)。
2. 设计基线：[原始设计基线 v0.1](docs/context/original-design-v0.1.md)（研究/需求来源，已归档；不代表所有章节已经实现）与[演进设计基线 v0.9](docs/context/original-design-v0.9.md)（2026-09-30 起，全量演进版：现状以 v1.16.0 为实现基线 + Agent 对齐失效防护四轨道设计，取代 v0.1 指导后续开发）；原始讨论档案见 [history/DISCUSSION-AND-DECISIONS.md](docs/history/DISCUSSION-AND-DECISIONS.md)（已归档，活跃内容由 PRD/RTM/ADR 承接）。
3. [RTM 需求跟踪矩阵](docs/RTM.md)：L0–L5 的 31 项任务（2026-10-01 精简轮后口径，另受控表达 X12–X15 增补）+ 横切 + v1.5–v1.7 增补的实现、验证依据、状态与后续；这是实现状态的单一索引（更细的逐项执行语义存档于 [history/DESIGN-COVERAGE-ROADMAP.md](docs/history/DESIGN-COVERAGE-ROADMAP.md)）。
4. [Gate Spec 1.23](docs/GATE-SPEC-v1.23.md)：配置与 runner 协议；[配置功能指引](docs/CONFIG-GUIDE.md)：全部可配置项与逐 kind 机器校验样例；[插件 README](plugins/quality-gate/README.md)：直接调用方法。
5. 近三版发布说明 [2.0.0](docs/release/RELEASE-2.0.0.md)、[1.31.1](docs/release/RELEASE-1.31.1.md)、[1.31.0](docs/release/RELEASE-1.31.0.md)（更早各版见 [docs/release/](docs/release/) 与 [history/VERSION-HISTORY.md](docs/history/VERSION-HISTORY.md) 逐版索引）；客户端实机验收 [LIVE-ACCEPTANCE-1.27](docs/history/LIVE-ACCEPTANCE-1.27.md)（1.24.0–1.27.0 四版同轮收尾，2026-10-06）、[LIVE-ACCEPTANCE-1.23](docs/history/LIVE-ACCEPTANCE-1.23.md)（1.21.0–1.23.0 五版同轮收尾）及更早各轮见 [docs/history/](docs/history/)；1.28.0 起实机验收待新轮。

## 目录

| 路径 | 用途 |
|---|---|
| `plugins/quality-gate/` | 可安装 ZCode 插件、独立 CLI、内核、Gate、测试及示例；持续研发的主要位置 |
| `docs/` | 按五层组织（见 docs/README）：产品层 PRD/RTM/adr、规范层现行 SPEC/CONFIG-GUIDE 等、状态层 PLAN、历史层 `docs/release/`（各版发行说明，按版本递增）+ `docs/history/`（LIVE-ACCEPTANCE/ITERATION/旧版 SPEC/机制评审记录及已归档的讨论档案与实施台账，均只增不改）、上下文层 `docs/context/`（原始设计与 RESEARCH 研究输入） |
| `evidence/` | 各阶段回归、正反例和 ZCode 客户端报告 |
| `acceptance/` | 实机/CLI 复验项目（v1.1 性质项目、v1.5 六域项目、expense-approval-fixture 夹具） |
| `devtools/` | 脱离原工作区的打包和验证脚本 |
| `experiments/` | 效果实验装置与结果（X15）：场景材料、变体呈现、预登记评分键与实验报告；2026-10-06 起为本机留档（gitignore，不入库与交付包，同 evidence/ 惯例） |
| `dist/` | 本机安装包及 SHA256；不进入公开源码，当前公开发行包通过 GitHub Release 提供 |
| `marketplace.json` | ZCode 本地 marketplace 入口 |

## 当前可运行基线

- **2.0.0 终审与事件契约**（[RELEASE-2.0.0](docs/release/RELEASE-2.0.0.md)）：用户三裁定＝L3.5 按现有边界转达成、原始观察记录默认 false 保持、AsyncAPI 纳入。新增 alignment event scope，直接读取 AsyncAPI 3.0 JSON 子集并核验实际消息；本地 TCP 正反例与 692 项回归通过，0 SKIP；37 kinds、49 示例。RTM 六域 20 原生/达成＋11 协议、0 部分；X12 按完成条件结算，v0.9 四轨道采用范围完成。终审证据与证明边界见 [FINAL-REVIEW-2.0.0](docs/history/FINAL-REVIEW-2.0.0.md)。客户端 1.28.0 起仍待新轮。

以下为此前版本的实现记录，按其版本理解。

- **1.31.1 反思轮补丁**（[RELEASE-1.31.1](docs/release/RELEASE-1.31.1.md)）：PNG 重复 tRNS chunk 拒绝（此前静默取后者）、依赖图提取正则字面量语境守卫（`return /…/` 内引号不再吞掉后续 import）、visual 字节一致（exact-bytes＝内核 SHA256 相等）计入核验信号"字节一致"、caseOutcomesOf 通用分支收紧到 behavior kind、GLOSSARY 补登记统一执行预算/用例绑定/无信号、CONFIG-GUIDE 预算边界句（内核内置有界操作不属声明面）、夹具负例矩阵 13→14（用例绑定缺失 acCaseMissing）、PNG 过滤器 0-4 组合 Pillow 交叉核验一致；678 项回归 0 SKIP。
- **1.31.0 证明链补齐**（[RELEASE-1.31.0](docs/release/RELEASE-1.31.0.md)，二轮评审建议第 2 步）：AC→真实用例身份与当轮结果绑定——requirements.json 逐 AC 可选 `cases:[{gateId,caseIds}]`，traceability 当轮逐用例复核（acCaseMissing/acCaseSkipped/acCaseFailed/acCaseUnbound 指名，无关成功门禁不能充当 AC 证据——评审 AC-UNBOUND 反例收敛），新选项 `requireCaseBinding` 强制逐 AC 绑定；来源信号补齐（visual 内核像素重算与 documentation 内容级核验计入核验信号、metrics/scan 归入声明、PASS 无信号门禁显式"无信号"——判定零变化）；夹具自举逐 AC 绑定 behavior 用例并开启 requireCaseBinding（四步全绿）；678 项回归 0 SKIP（+6）。AC 绑定的证明边界：复核证明"这些用例当轮真实执行且通过"，AC 写作与用例设计仍人工负责（L3.5 的"不自动由 PRD 推导"设计边界维持，转正留 v2.0 终审）。
- **1.30.0 二轮评审修复**（[RELEASE-1.30.0](docs/release/RELEASE-1.30.0.md)，evidence/project-review-2026-10-06 六组实现问题收敛）：P1＝F01 登记内 runner（conventions argv 规则/scope.json contentCheck）计入统一执行预算（run/inspect 同源、登记损坏 fail-closed）＋宿主预算即执行期限（剩余期限不足停止启动新任务记 ERROR budget-exhausted）、F02 requireLive:true 要求显式 mode:'live'（缺失＝缺证据 FAIL，三消费路径一致）、F03 semantic-relation 同谓词反向不再自动认可（须显式 inverseOf）；P2＝F04 PNG 逐 chunk CRC/IEND/未知关键 chunk/解压上限＋RGB tRNS 透明键展开（Pillow 交叉核验一致）、F05 依赖图 runner 注释/字符串感知提取（副作用 import 与 export-from 计边、注释/字符串不计）、F06 OpenAPI 提取器子集外操作/组合/深层 $ref fail-closed＋参数 name+in 覆盖＋输出 kind:'api' 可直接作 alignment 期望；672 项回归 0 SKIP（+19 正反例）、评审探针 13 项全部按规范结果收敛。
- **1.29.0 评审后续推进**（[RELEASE-1.29.0](docs/release/RELEASE-1.29.0.md)）：37 kinds/48 示例；653 项回归全过、0 SKIP（+18 正反例）。七工作包：documentation 内容级核验、真实进程故障 runner、依赖图真实测量、像素差内核重算（PNG 子集）、OWL/SHACL 组合对照（修复传递自环内核缺陷）、OpenAPI 子集提取器、多轮延迟分布计时；RTM 部分 7→3（L2.1/L4.1/L4.6/L5.3 按完成条件达成）。
- **1.28.0 评审残余收尾**（[RELEASE-1.28.0](docs/release/RELEASE-1.28.0.md)）：635 项回归全过。2026-10-01 审查 F01–F11 已在 1.24.0 修复（复现脚本本版重跑确认有效）；本版收尾设计差距节剩余可实施项——SKIP 三态区分（未启用/阶段未选中/不适用）、不适用跳过审计行、未验证声明成因区分、symbol-grounding 零文件面可见；判定语义与退出码零变化。
- **1.27.0 受控表达第三批（RTM X14 首轮达成）**：随包零依赖文风检查器（WS-1/2/3，advisory 首轮观察 87 项）经根约定登记 `STYLE-writing` 接入；入口文档历史块迁 [history/VERSION-HISTORY.md](docs/history/VERSION-HISTORY.md)；631 回归。前两批：**1.26.0**（X13→达成：来源列/来源分布、声明关联、Stop 边界表达——协议零变更）与 **1.25.0**（X12：纠正文案与指令＋WRITING-GUIDE）；客户端实机验收 1.24.0–1.27.0 四版同轮收尾（[LIVE-ACCEPTANCE-1.27](docs/history/LIVE-ACCEPTANCE-1.27.md)），1.28.0 起待做。

- **可复用验收基线**（2026-09-26 固化；1.9.0 起 rtm 门禁启用 `requirePrdRefs` 且 REQ-01 绑定 `docs/PRD.md`）：`acceptance/expense-approval-fixture` = 六域 + 登记文件集中 `.quality-gate/registries/` + 逐门禁负例矩阵 + `lifecycle-check` 生命周期脚本（10 步）。每次客户端升级后按其 README 四步复验（单测 → close → 负例矩阵 → 生命周期检查），不再临时编制。

## 本机快速验证

要求 Node.js 20+；部分 SQLite demo 另需 Python 3.10+。在此仓库根目录执行：

```powershell
node devtools/run-suite.mjs plugins/quality-gate/tests/*.test.mjs
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/six-domain-demo release
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/property-demo close
node plugins/quality-gate/bin/qgate.mjs . release
python devtools/build_delivery.py
```

回归套件经 `devtools/run-suite.mjs` 以 `--test-concurrency` 钳制（按物理核 75%≈逻辑核×0.375；超线程下按逻辑核×0.75 会打满物理核——24 逻辑核机器实测并发 9 → 持续段 72%，根门禁 close 15.7s）；直接 `node --test` 仍可用但不受钳制。根门禁 G-TESTS 与打包脚本内建同规则。根项目 close 阶段执行 G-CONVENTIONS＋G-DOCS（活文档约定＋入口文档版本内容级核验，2026-10-06 起），完整回归在 pr/release。

打包脚本按 [显式交付清单](devtools/delivery-files.json) 收集文件，拒绝越界路径及链接；先在临时目录生成候选包、解包运行零 SKIP 全量测试与 28 个清单冒烟示例，通过后才发布 `dist/quality-gate-<版本>.zip` 与 SHA256。未提交时用 `python devtools/build_delivery.py --verify-only` 仅验包；提交后运行 `python devtools/build_delivery.py` 正式重建，并校验 SHA。旧安装包保留用于版本追溯。ZCode 安装以本仓库根目录的 `marketplace.json` 为入口；升级后新建会话。若仍指向旧工作区的 marketplace，需在客户端更新本地源路径。**不应直接编辑 ZCode 安装缓存**。客户端升级固定流程（2026-09-27 起，[LIVE-ACCEPTANCE-1.12](docs/history/LIVE-ACCEPTANCE-1.12.md)）：`python devtools/sync_client_marketplace.py`（同步 marketplace 快照+SHA 校验，"更新"按钮只读快照不读源仓库）→ 客户端插件市场对插件执行"更新"（directory 型本地市场现已支持直接更新，取代旧卸载→安装流程）→ 重跑脚本确认。

## 接下来怎样迭代

当前版本 **2.0.0**，v2.0 需求终审与 AsyncAPI 扩展已完成。下一步是 ZCode 1.28.0–2.0.0 新一轮实机验收：同步 marketplace 快照，经客户端插件行“更新”，用文件系统核验缓存与 Stop 报告，CLI/模拟与实机结果分别记录。此前客户端记录只覆盖其当时版本。

原始观察记录保持按项目显式启用；AC 语义与用例设计仍由人评审。外部真实项目使用验证属进一步需求收集，不作本项目验收条件。第二 adapter 与其他新增能力按新需求另立基线。R13 拓扑推导与容器编排、发布包签名、仓库自有 CI 和双人核准保持出范围。专业扫描器、浏览器、负载与运维工具的证据须标出来源、输入范围和局限。
