# Quality Gate 项目交接入口

本仓库是 Universal Delivery Gate Framework 的独立项目。目标是把“软件可交付”变成可追溯的 **Claim → Evidence → Gate → Risk → Exception** 证明链。内核应保持智能体平台无关；ZCode Plugin 是第一个可部署适配器，CLI 可独立运行。用户要求按小步实现、小步验证推进，并允许按项目和阶段裁剪 Gate。本体首版使用固定版本 FIBO 小样本，必须继续支持可配置、可替换的 provider。

## 从哪里开始

1. [PRD](docs/PRD.md)：产品需求全貌（问题、目标/非目标、功能概览、路线图）；[RTM](docs/RTM.md)：需求→实现→证据→状态跟踪矩阵；[ADR](docs/adr/)：架构决策记录。docs 分层导读见 [docs/README](docs/README.md)。
2. 设计基线：[原始设计基线 v0.1](docs/context/original-design-v0.1.md)（研究/需求来源，已归档；不代表所有章节已经实现）与[演进设计基线 v0.9](docs/context/original-design-v0.9.md)（2026-09-30 起，全量演进版：现状以 v1.16.0 为实现基线 + Agent 对齐失效防护四轨道设计，取代 v0.1 指导后续开发）；原始讨论档案见 [history/DISCUSSION-AND-DECISIONS.md](docs/history/DISCUSSION-AND-DECISIONS.md)（已归档，活跃内容由 PRD/RTM/ADR 承接）。
3. [RTM 需求跟踪矩阵](docs/RTM.md)：L0–L5 的 36 项任务 + 横切 + v1.5–v1.7 增补的实现、验证依据、状态与后续；这是实现状态的单一索引（更细的逐项执行语义存档于 [history/DESIGN-COVERAGE-ROADMAP.md](docs/history/DESIGN-COVERAGE-ROADMAP.md)）。
4. [Gate Spec 1.23](docs/GATE-SPEC-v1.23.md)：配置与 runner 协议；[配置功能指引](docs/CONFIG-GUIDE.md)：全部可配置项与逐 kind 机器校验样例；[插件 README](plugins/quality-gate/README.md)：直接调用方法。
4. 近三版发布说明 [1.23.1](docs/release/RELEASE-1.23.1.md)、[1.23.0](docs/release/RELEASE-1.23.0.md)、[1.22.1](docs/release/RELEASE-1.22.1.md)（更早各版见 [docs/release/](docs/release/)）；客户端实机验收 [LIVE-ACCEPTANCE-1.23](docs/history/LIVE-ACCEPTANCE-1.23.md)（1.21.0–1.23.0 五版同轮收尾，过渡三步＋夹具四步＋五版断言 26/26）、[LIVE-ACCEPTANCE-1.20](docs/history/LIVE-ACCEPTANCE-1.20.md)（1.17.0–1.20.0 五版同轮收尾）、[LIVE-ACCEPTANCE-1.14](docs/history/LIVE-ACCEPTANCE-1.14.md)（1.14.0 收尾，Stop 复用与 SessionStart 基线行实证）与 [LIVE-ACCEPTANCE-1.13](docs/history/LIVE-ACCEPTANCE-1.13.md)（1.13.0 收尾，升级流程"更新"按钮）；更早版本证据见 [docs/release/](docs/release/) 与 [docs/history/](docs/history/)。

## 目录

| 路径 | 用途 |
|---|---|
| `plugins/quality-gate/` | 可安装 ZCode 插件、独立 CLI、内核、Gate、测试及示例；持续研发的主要位置 |
| `docs/` | 按五层组织（见 docs/README）：产品层 PRD/RTM/adr、规范层现行 SPEC/CONFIG-GUIDE 等、状态层 PLAN、历史层 `docs/release/`（各版发行说明，按版本递增）+ `docs/history/`（LIVE-ACCEPTANCE/ITERATION/旧版 SPEC/机制评审记录及已归档的讨论档案与实施台账，均只增不改）、上下文层 `docs/context/`（原始设计与 RESEARCH 研究输入） |
| `evidence/` | 各阶段回归、正反例和 ZCode 客户端报告 |
| `acceptance/` | 实机/CLI 复验项目（v1.1 性质项目、v1.5 六域项目、expense-approval-fixture 夹具） |
| `devtools/` | 脱离原工作区的打包和验证脚本 |
| `dist/` | 本机安装包及 SHA256；不进入公开源码，当前公开发行包通过 GitHub Release 提供 |
| `marketplace.json` | ZCode 本地 marketplace 入口 |

## 当前可运行基线

- **1.24.0 开源发行**：37 kinds/46 示例；615 项回归全过、0 SKIP。11 组审查问题修复与支持边界见 [RELEASE-1.24.0](docs/release/RELEASE-1.24.0.md)、[开源状态](docs/OPEN-SOURCE-STATUS.md)。根 close 只做 G-CONVENTIONS；完整回归在 pr/release（180 秒 command）执行。CLI 长阶段支持 300 秒，Stop 的 55 秒期限仅接受 50 秒配置执行预算。以前 47 秒计时是当时记录，不能代表持续满足 Stop 预算；本轮全量 77.5 秒。客户端尚未对 1.24.0 做新实机验收。

以下为历史版本记录，按当时版本与环境理解：

- 前一版本 **1.23.1**（2026-10-01 晚，[RELEASE-1.23.1](docs/release/RELEASE-1.23.1.md)；小迭代补丁——回归套件瘦身[用户裁决"重启＋瘦身提前"]：瓶颈为进程生成而非 CPU（spawn 单价 103–110ms，总 spawn 数为杠杆），leanFixture 零 spawn 基础门禁（19 文件）＋symbol-grounding 常规期基础门禁（延后引用型三文件）＋engineering/consistency 检查聚焦 27 处；602 测试不变、判定语义零变化；套件墙钟 60.0–62.5s→47.6s，根门禁 close 2/2 PASS 47.7s run=ca3d1334（余量 12.3s，负载未复位实测）；zip 735 文件 SHA `08883d27…` 双构建全同（evidence/v1.23.1/）；内核零变更——客户端更新可选）。
- 前一版本 **1.23.0**（2026-10-01，[RELEASE-1.23.0](docs/release/RELEASE-1.23.0.md)；主线"C6-2 语义深化·下——OWL 推理深化·确定性子集更大集"（RTM L3.7→达成；在册 31 项＝原生含达成 13/协议 11/部分 7——2026-10-01 精简轮删裁剪行后重算），37 kinds 零破坏，两裁决 Q1=C 更大集[用户覆盖]/Q2=双人核准取消[移出范围]）：等价类（单边即对称，互达/互斥传播/建时矛盾 fail-closed）＋并类＋属性注册表（subPropertyOf DAG/inverseOf 单边即双向/transitive）＋semantic-relation 推理满足判定（子属性/逆属性/传递链＋链边覆盖＋inferred 证据）；alignment/consistency 经 provider 免费继承。602 项回归（601 过/1 skip）；37 kinds/46 示例；zip 721 文件 SHA `db9b343c…` 双构建全同（evidence/v1.23.0/——解包正例 PASS＋断链负例指名）。实机验收 v1.21.0–v1.23.0 五版同轮已收尾（[LIVE-ACCEPTANCE-1.23](docs/history/LIVE-ACCEPTANCE-1.23.md)：过渡三步＋根门禁 60000 校准 2/2 PASS／缓存内容级 371 文件 SHA 全等／夹具四步全绿／五版新声明断言 26/26）。
- 前一版本 **1.22.1**（2026-10-01，[RELEASE-1.22.1](docs/release/RELEASE-1.22.1.md)；小迭代补丁——SHACL 组件全集内核原生化【OD-116=默认零外部依赖，用户裁决：默认插件不依赖外部环境工具安装；pyshacl 保留为环境就绪时的可选第二实现（并集判定）】；592 项回归（591 过/1 skip）；zip 711 文件 SHA `84f1266c…` 双构建全同（evidence/v1.22.1/——解包三腿：引擎 PASS/原生零依赖 PASS/原生违规指名））。
- 前一版本 **1.22.0**（2026-10-01，[RELEASE-1.22.0](docs/release/RELEASE-1.22.0.md)；C6-1 语义深化·上——SHACL 引擎协议＋深度匹配＋terminology 多语言，RTM L2.3→达成；590 回归/37 kinds/45 示例；zip 707 文件 SHA `815f03bb…` 双构建全同）。
- 前一版本 **1.21.1**（2026-10-01，[RELEASE-1.21.1](docs/release/RELEASE-1.21.1.md)；小迭代补丁——内核预算上限 40000→60000（kernel/阶段总和/templates/engineering/consistency/inspect 六处）；578 回归/37 kinds/44 示例；zip 696 文件 SHA `287cbfd4…` 双构建全同）。
- 前一版本 **1.21.0**（2026-10-01，[RELEASE-1.21.0](docs/release/RELEASE-1.21.0.md)；轨道 D 收官——新 kind `trace-continuity`（trace 贯通核验）＋journey/behavior `replayBaseline` 回放资产，**对齐防护四轨道全部收官**；575 回归/37 kinds/44 示例；zip 691 文件 SHA `39d2478b…`；同轮根因修复 semantic-alignment 共享内核资产写竞态）。
- 前一版本 **1.20.0**（2026-10-01，[RELEASE-1.20.0](docs/release/RELEASE-1.20.0.md)；轨道 C 收官——symbol-grounding 三扩展（命名成员/apiSurface 声明面/双向对账）＋Python/Java 参考适配器；555 回归/36 kinds/42 示例；zip 664 文件 SHA `18ff04c9…`）。
- 前一版本 **1.19.0**（2026-10-01，[RELEASE-1.19.0](docs/release/RELEASE-1.19.0.md)；轨道 B 收官——新 kind `convention-alignment`＋decisions ADR 绑定＋根门禁 G-CONVENTIONS 自举；525 回归/36 kinds/40 示例；zip 636 文件 SHA `e078967d…`）。
- 前一版本 **1.18.0**（2026-10-01，[RELEASE-1.18.0](docs/release/RELEASE-1.18.0.md)；轨道 A 收官——AC 结构化协议（Gherkin＋EARS 双验证器）；515 回归/35 kinds/39 示例；zip 620 文件 SHA `29b6d8a1…`）。
- 前一版本 **1.17.1**（2026-10-01，[RELEASE-1.17.1](docs/release/RELEASE-1.17.1.md)；任务意图软形态（UserPromptSubmit 基准行＋PreToolUse 越界软提示）；506 回归/35 kinds/39 示例；zip 618 文件 SHA `3cf58f55…`）。
- 前一版本 **1.17.0**（2026-10-01，[RELEASE-1.17.0](docs/release/RELEASE-1.17.0.md)；任务意图登记＋漂移对账＋新 kind `symbol-grounding`；497 回归/35 kinds/39 示例；zip 613 文件 SHA `3b08856e…`）。
- 前一版本 **1.16.0**（2026-09-30，[RELEASE-1.16.0](docs/release/RELEASE-1.16.0.md)；统一语言治理（GLOSSARY 唯一登记处＋概念拆义＋协议键迁移 schemaVersion 0.2）；464 回归/34 kinds/37 示例；zip 576 文件 SHA `d6e7901a…`；实机验收含 v1.15.0 并入已收尾）。
- 前一版本 **1.15.0**（2026-09-28，[RELEASE-1.15.0](docs/release/RELEASE-1.15.0.md)；基线内容绑定＋两源一致核验＋inspect 建议块＋consumer-matrix 字段级使用面；460 回归/34 kinds/37 示例）。
- 前一版本 **1.14.0**（2026-09-28，[RELEASE-1.14.0](docs/release/RELEASE-1.14.0.md)；Stop Hook 摩擦优化（归档复用/SessionStart 基准行/new-only 降级）；445 回归/34 kinds；实机验收已收尾）。
- 前一版本 **1.13.0**（2026-09-28，[RELEASE-1.13.0](docs/release/RELEASE-1.13.0.md)；主线"L3 证据链延伸 + 观察工具链"，候选 1+3+5，零破坏）：behavior/journey 观察可选 `rawTranscript` **声明即核验**（自有协议观察记录形状，当次 runId 绑定防重放、内核逐例交叉核验不符 ERROR、判定以观察记录为准、计入"原始输出解析"证据信号——C3 开放→部分闭合）；`adapters/visual/screenshot.mjs` 参考浏览器 runner（系统 Chrome/Edge headless CLI 零 npm 依赖、`QGATE_BROWSER` 显式指定、KNOWN_TOOLS 登记 chrome/msedge、visual-browser-demo 同机 pin 基线——C4 开放→部分闭合）；`adapters/consumer-usage/`（Pact 契约产物归一→contract-test 最强使用面来源；源码调用面静态扫描→scanned 弱来源，漏扫边界如实；consumer-matrix-demo 三来源真实派生）。433 项回归（432 过/1 skip）；37 示例。
- 前一版本 **1.11.0/1.12.0**（2026-09-27，[RELEASE-1.12.0](docs/release/RELEASE-1.12.0.md)+[RELEASE-1.11.0](docs/release/RELEASE-1.11.0.md)）：1.12 新纯判定 kind `consumer-matrix`（第 34 个，L2）——逐消费者期望文件声明层+内核比对兼容矩阵/破坏归因+使用面来源协议（scanned|contract-test|declared，越界使用 FAIL、declared 降级）；1.11 B1 `lib/raw-evidence.mjs` TAP/JUnit 无依赖内核解析+unit `rawOutput` 声明即核验（计数以内核重算为准，门禁级 `requireRawOutput`）+E7 Python/Java 参考适配器+E5 Entity↔ORM persistence 参考；E6 设计经用户选型（方案 B）落地 1.12。407→415 项回归。
- 前一版本 **1.10.x**（2026-09-26/27，[RELEASE-1.10.1](docs/release/RELEASE-1.10.1.md)+[RELEASE-1.10.0](docs/release/RELEASE-1.10.0.md)）：1.10.1 小迭代补丁 R12 摘要层"证据力"行（`evidenceStrength` 只读聚合证据信号/定量信号，等级实测推导，无信号不显示；390 项回归）；1.10.0 主线"拓扑语义深化"——新纯内核 kind `topology` 承载 R1–R4 + E3 persistence `requireSnapshots` 默认强制（破坏性；386 项回归）。
- 前一版本 **1.9.1**（2026-09-26，[RELEASE-1.9.1](docs/release/RELEASE-1.9.1.md)；小迭代补丁，零破坏）：change-scope `requireContentCheck`（受保护路径变更而无内容级检查 FAIL 指名）与 alignment 观察端 `sourceFingerprint`（声明即核验磁盘哈希）；378 项回归。
- 前一版本 **1.9.0**（2026-09-26，[RELEASE-1.9.0](docs/release/RELEASE-1.9.0.md)；主线"信任边界收敛"）：六域机制评审敞口清单 W1–W5 全量落地——空登记直通阻断、自引用保护、观察可信度（`baselineSource`/`mode`/`sourceType` 与报告"证据降级"行）、登记完备性（`prdRef`）、语义-行为桥（`origin`）；破坏性收紧四类，迁移指引见发布说明；376 项回归。
- 前一版本 **1.8.0**（2026-09-26，[RELEASE-1.8.0](docs/release/RELEASE-1.8.0.md)；主线"功能裁剪"）：按用户决定移除 migration/operational/readiness 门禁、scan 的 dependency/secret/iac/dast 类别、metrics 证据纪律与 releasePackage/priorRuns（35→32 kind、40→35 示例，破坏性配置变更，迁移指引见发布说明）；354 项回归。
- 前一版本 **1.7.x**（2026-09-26，[RELEASE-1.7](docs/release/RELEASE-1.7.md)–[1.7.5](docs/release/RELEASE-1.7.5.md)）：1.7.0 首运行引导初始化（档位模板库+CLI 确定性装配+`/quality-gate-init`，[ADR-0014](docs/adr/ADR-0014-guided-onboarding.md)）；1.7.1 配置生命周期分权与登记文件集中 `.quality-gate/registries/`（[ADR-0015](docs/adr/ADR-0015-config-lifecycle.md)）；1.7.2 引导收尾（answers/changes `ontology` 与 metrics `thresholds` 替换、登记引用预检 preflightGateRefs）；1.7.3 preflightRefs 深度收集+expense-approval-fixture 固化为可复用验收基线；1.7.4/1.7.5 分级 stderr 人读报告、`qgate report` 归档重渲染与耗时列。
- 前一版本 **1.6.0**（2026-09-25，[RELEASE-1.6](docs/release/RELEASE-1.6.md)；主线"R 系与治理混编"）：R5 灰度判定协议（canaryAnalysis）、R6 `rerun` 重跑确定性门禁、priorRuns 跨运行哈希链（后随 1.8.0 裁剪）、approved Exception WAIVED 呈现、change-scope 独立示例、unit `minCoverageRatio` 覆盖率协议；330 项回归。
- 602 项本地测试（601 过/1 skip=pytest 守卫）与 46 个示例 demo 通过；1.23.0 安装包（721 文件，SHA256 `db9b343cfb006567501c2ba5816312edae6636ea000fb3edd9ebb4e3114562df`，两次构建全同）解包复验见 `evidence/v1.23.0/`；根门禁 G-TESTS 实测校准 60000ms＝内核上限；v1.23.1 套件瘦身后墙钟 47.6s、close 2/2 PASS（run=ca3d1334，负载未复位实测余量 12.3s）——墙钟事项已销项（重启后 spawn 单价回落余量再扩）。
- **可复用验收基线**（2026-09-26 固化；1.9.0 起 rtm 门禁启用 `requirePrdRefs` 且 REQ-01 绑定 `docs/PRD.md`）：`acceptance/expense-approval-fixture` = 六域 + 登记文件集中 `.quality-gate/registries/` + 逐门禁负例矩阵 + `lifecycle-check` 生命周期脚本（10 步）。每次客户端升级后按其 README 四步复验（单测 → close → 负例矩阵 → 生命周期检查），不再临时编制。
- 实机证据（按轮收尾，细节见各 LIVE-ACCEPTANCE 与对应 evidence/zcode-live-* 目录）：**1.21.0–1.23.0** 五版同轮 2026-10-01（[LIVE-ACCEPTANCE-1.23](docs/history/LIVE-ACCEPTANCE-1.23.md)：过渡三步＋根门禁校准 60000＋缓存内容级 371 文件全等＋夹具四步全绿＋断言 26/26）；**1.17.0–1.20.0** 五版同轮 2026-10-01（[LIVE-ACCEPTANCE-1.20](docs/history/LIVE-ACCEPTANCE-1.20.md)：缓存 630 文件全等＋四步全绿＋断言 18/18＋CUA 三旅程[意图修订/问询不代写]）；**1.16.0**（含 1.15.0 并入，2026-09-30，[LIVE-ACCEPTANCE-1.16](docs/history/LIVE-ACCEPTANCE-1.16.md)：568 文件全等＋断言 8 组＋Journey C 补做）；**1.14.0/1.13.0**（2026-09-28：Stop 复用与基准行实证/更新按钮流程）；**1.10.1–1.12.0**（2026-09-27：CUA 三报告链）；**1.8.0–1.10.0**（2026-09-27 四版一次收尾）；**1.6.0–1.7.3**（2026-09-26：init/update 走查）；**1.5.0**（2026-09-25：双驱动栈交叉复验）。
- `releasePackage`/`priorRuns` 跨运行证据链已于 1.8.0 裁剪（单次报告仍含完整证据与 configSha256）。Stop Hook 有客户端重试上限，最终强制准出需要 CI。

## 本机快速验证

要求 Node.js 20+；部分 SQLite demo 另需 Python 3.10+。在此仓库根目录执行：

```powershell
node devtools/run-suite.mjs plugins/quality-gate/tests/*.test.mjs
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/six-domain-demo release
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/property-demo close
node plugins/quality-gate/bin/qgate.mjs . release
python devtools/build_delivery.py
```

回归套件经 `devtools/run-suite.mjs` 以 `--test-concurrency` 钳制（按物理核 75%≈逻辑核×0.375；超线程下按逻辑核×0.75 会打满物理核——24 逻辑核机器实测并发 9 → 持续段 72%，根门禁 close 15.7s）；直接 `node --test` 仍可用但不受钳制。根门禁 G-TESTS 与打包脚本内建同规则。

打包脚本在 `dist/` 生成可独立解包的 `quality-gate-<版本>.zip`、SHA256，并在临时目录中重跑全量测试与清单驱动的冒烟测试 demo。旧安装包保留用于版本追溯。ZCode 安装以本仓库根目录的 `marketplace.json` 为入口；升级后新建会话。若仍指向旧工作区的 marketplace，需在客户端更新本地源路径。**不应直接编辑 ZCode 安装缓存**。客户端升级固定流程（2026-09-27 起，[LIVE-ACCEPTANCE-1.12](docs/history/LIVE-ACCEPTANCE-1.12.md)）：`python devtools/sync_client_marketplace.py`（同步 marketplace 快照+SHA 校验，"更新"按钮只读快照不读源仓库）→ 客户端插件市场对插件执行"更新"（directory 型本地市场现已支持直接更新，取代旧卸载→安装流程）→ 重跑脚本确认。

## 接下来怎样迭代

当前版本 1.24.0 为早期开源发行，公开仓库 lazyzhsh/quality-gate，采用 MIT；本机开发历史保留，公开版本从干净快照开始，evidence/dist 不上传。下一步先完成真实业务项目接入与 7 条部分需求逐项补证，再评估 v2.0，不能仅以“边界即达成”修改状态。逐 Claim 证明范围、混合来源显示、AC 与真实用例绑定和客户端 1.24.0 实机验证仍待完善。贡献与安全入口见 .github/。范围决定（2026-09-27）：R13 拓扑推导器与容器编排接入永久出项目范围；（2026-09-26）发布包签名与仓库自有 CI 出范围；（2026-10-01）双人核准移出范围。生产项目接入专业扫描器、浏览器、负载和运维环境时，应让 Evidence 清楚写出工具、范围和局限。不得把“项目工具协议存在”写成“已自动证明真实业务正确”。
