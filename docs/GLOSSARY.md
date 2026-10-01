# GLOSSARY：统一语言术语表

状态：**v1.16 定稿**（2026-09-30：T1 草案产出，T2 经 AskUserQuestion 六项裁决后定稿，裁决记录见 §7；数据底稿=同日三轮术语盘点）。§6 弃用词清单由约定对齐门禁（根配置 convention-alignment，扫描面=`.quality-gate/registries/conventions.json`）在活文档集强制零出现（v1.19 起自 glossary 防回归测试自举迁移；v1.16–v1.18 由该测试承载）。本表是全项目**概念的唯一登记处**（统一语言 / ubiquitous language）：新增概念先入本表，再进文档与代码。

## 1. 使用规则

1. **一概念一名**：每个概念在每个限界上下文（§2）内只有一个规范名；跨上下文同名必须同义，否则加限定词拆义。
2. **双轨映射制**：中文文档用规范中文，代码与协议保持英文命名，本表持双向映射；中文文档内嵌英文仅限代码字面量（字段/枚举/文件名/命令）与 §9 借词清单。
3. **弃用词零出现**：§6 弃用词不得出现在活文档（docs 根活文档、AGENTS/PROJECT-HANDOFF/README、插件双语 README、SKILL/commands、adapters/examples README）与代码人读文案；docs/history、docs/release、evidence/ 与 ADR-0001–0015 正文为历史档案，旧词按"历史称谓"理解（§10），不回写。活文档中的**历史性小节**（RTM §1–§10 增补行、PLAN 历史版本记录、PRD §7 已达成段、HANDOFF 前一版本与实机证据行）：其中的**版本主题名按专名保留**（如 v1.15 主线"baseline 内容内核重放"），其余 generic 术语用法在 T3 做词级替换（不改事实内容）。
4. **替换判定三问**（新词入表前合规检查）：① 软件/项目管理惯用词→可用；② 描述性复合词（字面即义，如"声明即核验"）→可用；③ 比喻/类比/跨领域借词→改用惯用语。
5. 盘点计数（§10）是 2026-09-30 快照，仅作清扫规模参考；文档中一切计数以当期实测为准。
6. **提案概念例外**：上下文层设计基线文档（docs/context/original-design-v*.md）中的新概念可以**提案态**行文（文档头部须声明提案概念清单，正文标注提案），正式登记发生在对应能力立项实施时；提案概念在实施定稿前不进入活文档与代码命名。2026-09-30 随演进基线 v0.9 增补。

## 2. 限界上下文

| 上下文 | 范围 | 语言边界 |
|---|---|---|
| 内核产品域 | `plugins/quality-gate/lib`（配置 schema、判定、run 报告、观察协议、摘要） | §3 概念总表；协议键名以表中代码名为准 |
| 宿主适配上下文 | `hooks/`、`commands/`、`skills/`（ZCode 插件层） | 复用内核语言；宿主专有概念（Hook/Command/Skill、市场快照）在 §3 单列 |
| 参考工具适配器 | `adapters/`（visual/consumer-usage/python/java 参考实现） | 复用内核观察协议语言；"参考非认证"边界固定 |
| 演示上下文 | `examples/`（46 个 demo） | 复用内核语言；demo 场景词汇不入本表 |
| 过程管理域 | PLAN/RTM/PRD/HANDOFF 的迭代管理词汇 | §3 标"过程"；不与产品域词汇互借 |
| 历史档案 | docs/history、docs/release、evidence/、ADR-0001–0015 正文 | 只读；旧词=历史称谓（§10） |

## 3. 概念总表

| 概念 | 规范中文 | 代码名 | 定义 | 弃用别名 |
|---|---|---|---|---|
| input snapshot | 输入内容快照 | `inputSnapshot` | 运行前文件路径与内容摘要清单；用于检测新增/删除/重命名/内容变更，不证明外部状态 | — |
| input stability | 输入稳定性 | `inputsStable` | 运行前后内容快照完整且一致；复用的必要条件，非业务判定 | — |
| gate | 门禁 | `gates[]`、`GATE_KINDS` | 单个可执行质量检查单元，按 kind 分型、属一个层级、可按 stage 裁剪 | — |
| kind | 门禁类型 | `gate.kind`（37 种） | 门禁分型（command/behavior/engineering/…），中文行文直接用借词 kind | — |
| level | 层级 | `gates[].level`、`requiredLevels`、`levelCoverage`、`evidence[].level`（v1.16 起；原 domain/requiredLevels/domainCoverage/evidence[].domain） | L0–L5 质量域轴上的位置；配置与 run 报告旧键 v1.16 T5 迁移（fail-closed+迁移表，归档读兼容） | 域（该义）、代码旧键 domain 族 |
| quality domain | 质量域 | —（模型概念） | 六域模型整体，名称见 §3.1 | 六域/六质量域（叙述简称可用） |
| stage | 执行阶段 | `edit/close/pr/release` | 门禁运行的时机切面 | — |
| claim | 声明 | `claims[]` | 待证明的交付断言 | — |
| risk | 风险 | `risks[]` | 登记的风险及其关联门禁 | — |
| exception | 例外 | `exceptions[]`、WAIVED | 已审批例外在有效期内的呈现（不改变门禁判定） | — |
| evidence | 证据 | `evidence[]` | run 报告内逐门禁结构化执行记录 | — |
| run report | 运行报告 | `.quality-gate/runs/<uuid>.json`、`schemaVersion`（0.1→0.2 于 v1.16） | 单次运行全部判定与证据的归档 | — |
| summary | 摘要 | `renderSummary`/`renderBrief` | stderr 分级人读报告（PASS 一行 brief，非 PASS 全表） | — |
| evidence strength | 证据力 | `evidenceStrength` | 只读聚合 PASS 门禁的信号与定量证据得出的强度行（无信号不显示） | — |
| strength tier | 强度等级 | 显示文案：核验级＞声明级＞降级（原"锚定"，T4 随批改文案与测试针） | 证据力等级的实测推导 | 锚定（等级义） |
| signal | 证据信号 | 内部键 `anchors`→`signals`（T4 随批） | 内核可独立核验的证据标记，六个：git 基线核验/来源指纹/双次运行一致/持久化快照/原始输出解析/基线内容核验 | 锚点（该义） |
| runner | runner | 观察协议的对端命令 | 项目经 argv 配置的真实工具执行者，按协议回报观察（§9 借词） | 运行器 |
| observation | 观察 | runner stdout JSON | runner 回报的结构化结果 | — |
| transcript | 观察记录 | `rawTranscript`、`parseTranscript`、`qgate-transcript` | behavior/journey 逐用例/逐步骤结构化观察文件，当次 runId 绑定 | 转录 |
| baseline | 基线 | `baselineMode`/`baselineSource`/`baselineStatus`/`baselineActual`/`baselineRawOutput`、visual `baselineFile` | F2P/P2P 判定所对照的已验证实现（git 型或 embedded） | —（代码族自洽，保留） |
| base reference | 基准 | change-scope `baseRef`/`pinnedBase`/`acknowledgedBase` | 变更范围判定的 git 变更参照点 | 基线（该义）、Git 基线、基线移动 |
| session reference | 会话基准 | `session-baseline.json`（v1.16 起；原 `baseline.json`） | SessionStart 注入的最近一次 close 通过运行记录（配置哈希+逐门禁结论） | 会话基线 |
| content binding | 内容绑定 | `file`+`contentSha256`、`contentVerified` | baselineSource 声明与内核 `git show` 取得内容的 sha256 一致性 | — |
| declare-and-verify | 声明即核验 | —（模式名） | runner 声明原始证据文件、内核解析重算交叉核验的模式（描述性复合词，保留） | — |
| cross-check | 交叉核验 | `crossCheck:'match'` | 两源比对一致（声明↔内核重算、观察记录↔观察） | — |
| content compare | 内容比对 | `contentVerified` 链路 | git show 取内容与声明 sha256 的比对 | 对拍 |
| downgrade | 降级 | `downgradeNotes` | 弱来源（embedded/static/declared/显式降级）在报告中的降级标注 | 降权、证据降权、双降权（→双重降级） |
| anti-replay | 防重放 | runId 绑定 | 观察记录与当次运行绑定防复用；**"重放"一词仅此语境** | — |
| kernel recompute | 内核重算 | `parseRawOutput`/`parseTranscript` 重算 | 内核解析原始证据自行重算判定值，判定以内核值为准 | 内核重放、重放（重算义） |
| beyond-expectation usage | 越界使用 | consumer-matrix 超面判定 | 消费者使用面超出声明期望（FAIL"期望文件已过期"） | 超面 |
| usage surface | 使用面 | `consumerUsage` items | 消费者对 provider 契约的实际使用记录（scanned/contract-test/declared 三来源） | — |
| add-on | 附加门禁 | `ADDONS`、answers `addOns`（update 契约 `addOns`→`addOns`，v1.16 T5） | 可选并入配置的门禁扩展包；`ADDONS` 常量整体称**附加门禁库** | 附加库、附加项 |
| template | 模板 | `templates`/`TEMPLATES` | 引导初始化用的档位化配置模板（7 个） | 模版（错字） |
| tier | 档位 | `lite/pro/max` | 模板库分层 | — |
| registry file | 登记文件 | `.quality-gate/registries/` | 集中管理的声明类输入文件 | — |
| leftover | 残留 | `leftovers`/`scanLeftovers` | 旧配置遗留的登记文件（重初始化确认后删除） | —（与"残余风险"为两个概念） |
| vacuous register | 空登记直通 | 顶层 `none:true` | 空登记未显式声明时静默满足门禁的问题形态（W1 已阻断） | 空转 |
| task intent register | 任务意图登记 | `task-intent.json`（v1.17 定稿；CLI `qgate intent`） | 任务开始时结构化落盘的任务范围/验收条件/约束声明；问询不代写、修订显式留痕、内容哈希可守护（v0.9 §41 提案，v1.17 落地） | — |
| drift check | 漂移对账 | change-scope `taskIntent` 绑定（v1.17 定稿；失败原因 `outside-task-scope`/`intent-file-modified`/`no-task-intent`） | 变更集相对任务意图基准的对账判定——越界变更与意图文件静默变更均 FAIL 指名（v0.9 §41.4 提案，v1.17 落地） | — |
| symbol grounding | 符号存在性对账 | kind `symbol-grounding`（v1.17 定稿；失败原因 `unresolved-import`/`unresolved-member`） | 受检文件静态 import 说明符与声明面（项目内模块/依赖清单/内置模块）的确定性对账（v0.9 §43 提案，v1.17 落地 JS/TS 首版）；v1.20 扩展命名成员/端点/配置键三面+观察输入口（轨道 C 收官） | — |
| | api existence protocol | API 存在性协议 | `apiSurface:{file}`+`registries/api-surface.json`（v1.20 定稿；失败原因 `unresolved-reference`） | 超出 import 粒度的引用（端点/配置键）对声明面登记的确定性对账——调用位引用×OpenAPI paths 面（{param} 段通配）、process.env×schema 键面（v0.9 §43.3 提案，v1.20 落地；OD-109=B 登记文件） | — |
| declaration face | 声明面 | 声明即核验输入（v1.20 定稿） | 存在性对账所对账的项目声明依据——OpenAPI 端点面/JSON Schema 键面/目标模块导出面/依赖清单/内置模块；声明即核验=runner 无权自判存在 | — |
| observation input port | 观察输入口 | `importObservations[{language,file}]`（v1.20 定稿；失败原因 `observation-coverage-gap`） | 适配器产出的解析观察文件进入内核对账的声明通道——Python/Java import 由参考适配器以真实工具链探测后回报，内核核验形状与覆盖（OD-108=C 协议部分） | — |
| bidirectional reconciliation | 双向对账 | OD-111=A（v1.20 定稿） | 内核词法提取集×适配器回报集的恰好覆盖对账——提取无回报=瞒报 FAIL、回报 unresolved 汇入失败面、多出回报进审计面；runner 无权决定引用集 | — |
AC structure protocol | AC 结构化协议 | `acceptance[].format`（'gherkin'|'ears'）+失败原因 `ac-structure-invalid`/`ac-type-conflict`+`lib/ac-structure.mjs`（v1.18.0 定稿） | 验收条件声明结构化格式（Gherkin+EARS 双支持[2026-10-01 用户裁决双支持]），内核做结构校验（骨架齐备性：Gherkin 场景/步骤关键字/@类型标签、EARS 五模板中英词表）并派生 AC 类型（Gherkin=场景标签并集[映射机制 2026-10-01 裁决=标签权威]、EARS=模板映射集）；只校验结构不判语义，与真实意图的一致性靠确认留痕（v0.9 §41；v1.18.0 落地） | 形状协议（旧称） |
| convention register | 约定登记 | `.quality-gate/registries/conventions.json`（v1.19 定稿） | 仓库自声明约定条目的登记文件：banned-words 规则（字面词+扫描面+豁免机制）与 argv 规则（项目自配 runner 统一观察协议）；每条带 source 溯源绑定来源约定文件（文档形态与可执行形态双向可追）。本仓库自举承载 GLOSSARY §6 弃用词扫描（v1.19 起） | — |
| convention alignment | 约定对齐 | kind `convention-alignment`（第 36 个，L0，v1.19 定稿） | 约定登记条目 ↔ 制品的对账判定：只写 markdown 靠自觉遵守的约定在内核判定下持续生效（OD-103 裁决=独立 kind——与 engineering convention 子检查判定语义不同，并存不冲突） | — |
| ADR binding | ADR 绑定 | decisions `adrRef:{file}`＋`requireAdrRefs`（v1.19 定稿） | 决策登记与 ADR 文档的双向绑定：frontmatter 平面 YAML 子集（status/date/deciders/supersedes/superseded-by）声明即核验＋状态映射对账＋取代链互指核验——决策史一处事实一处索引 | — |
| trace continuity verification | trace 贯通核验 | kind `trace-continuity`（第 37 个，L4，v1.21 定稿；失败原因 `trace-discontinuity`） | 演练 runner 回报跨服务调用传播对（调用对＋两端 trace/span id＋可选 traceparent），内核对每个声明调用对核验同 traceId、child.parentSpanId 与 parent.spanId 衔接、traceparent W3C 传播格式与一致性——核验贯通性而非信号存在性；声明式对账，不做 APM/流量采集（v0.9 §44.1 提案，v1.21 落地；OD-106=B 独立 kind，用户覆盖倾向案——可单独挂 close） | — |
| replay asset | 回放资产 | `replayBaseline:{file,contentSha256}`（v1.21 定稿；失败原因 `replay-drift`/`replay-baseline-modified`） | journey/behavior 以归档观察记录为期望基线的逐步骤/逐用例对照（步骤序＋关键字段，易变字段走 ignorePaths），差异即行为漂移；contentSha256 内容绑定＝换基线须显式重 pin；当次无观察记录时容忍自报对照（弱一档如实呈现）；行为回归对照，非性能/时序回放（v0.9 §44.2 提案，v1.21 落地） | — |
| SHACL engine protocol | SHACL 引擎协议 | semantic-profile `shacl:{argv,timeoutMs}`＋`adapters/shacl/pyshacl_runner.py`（v1.22 定稿；OD-114=B runner 协议外接，用户覆盖内核自研案） | 外接 SHACL 真引擎的统一观察协议——内核经 stdin 交付形状/记录/子类边，引擎回报 findings＋conformance，内核核验观察形状并判定（未知记录/未知组件/自报矛盾均 fail-closed，不采信自报放行）；组件全集内核原生判定（v1.22.1 起 OD-116=默认零外部依赖——插件默认不依赖外部环境工具安装）；pyshacl 为环境就绪时的可选第二实现（并集判定），完整 SHACL 语义属其承载 |
| deep matching | 深度匹配 | sh:targetClass 语义（v1.22 起 semantic-profile 内核承载） | 记录类型是 shape 目标类或其后代（subClassOf 链）即套用该 shape——真 SHACL 的 rdfs:subClassOf* 目标语义；真子类套用入 deepMatches 证据（旧精确匹配为缺陷面） |
| multilingual terminology | 多语言术语 | 目录 altLabels `{value,lang}` 条目＋terms 可选 `lang`（v1.22 定稿；OD-115=A SKOS 语言标签） | SKOS 语言标签制——纯字符串条目＝语言未定（旧目录零改动兼容），S14 唯一性按 (语言, 值) 分域（跨语言同形词合法）；术语带 lang 严格同语言匹配，不带 lang 跨语言匹配重名即歧义如实暴露 |
| deterministic OWL subset | 确定性 OWL 子集（推理深化） | 目录 `equivalentClass`/`unionOf`/`properties[{subPropertyOf,inverseOf,transitive}]`＋semantic-relation 推理满足判定（v1.23 定稿；Q1=C 用户裁决） | 闭世界声明推理四件套——等价类（单边即对称，物化进扩展包含图：互达/互斥传播/建时矛盾 fail-closed）、并类（操作数⊑并类）、子属性层级（Q⊑*P 蕴含，须 DAG）、逆属性（单边声明即双向）与传递链（观察链前向可达）；无开世界假设/反例推理/unionOf 外类表达式——与"完整 OWL reasoner"的边界如实 |
| onboarding | 引导初始化 | `templates`/`init` 命令、`/quality-gate-init` | 档位→模板→附加门禁→替换的确定性装配流程 | — |
| preflight | 预检 | `preflightRefs` | init/update 写盘后的登记引用只读检查（不阻断） | — |
| allowlist | 白名单 | `acceptedFindings`/`allowedTransitions`/文档顶层键白名单等 | 显式允许集合 | 允许清单（该义；2026-09-30 用户裁决保留白名单） |
| snapshot | 快照 | `details.snapshots`/`requireSnapshots` | persistence 前后数据库状态捕获（与"市场快照"按上下文区分，两者均保留） | — |
| smoke test | 冒烟测试 | examples.manifest 烟测集合 | 打包后清单驱动的 demo 快速验证 | 烟测 |
| fixture | 夹具 | `expense-approval-fixture` | 可复用实机验收基线项目 | — |
| live acceptance | 实机验收 | `LIVE-ACCEPTANCE-*` | 在真实 ZCode 客户端上的验收（与 CLI/模拟测试分别记录）；另义 `mode:live`＝真实请求模式，按上下文区分 | — |
| walkthrough | 客户端走查 | —（过程） | 实机验收中的客户端操作场景 | 旅程（该义） |
| journey | 旅程 | `journey` kind | L3 旅程门禁（冒烟/集成/E2E 逐步骤预期） | — |
| proof boundary | 证明边界 | — | 报告须声明的证据能证明的范围（工具来源、输入范围、局限） | — |
| residual risk | 残余风险 | — | 证明边界之外承认未证的事项 | 残差、诚实边界（并入"证明边界+残余风险"表述） |
| untrusted runner | 不可信 runner | — | 可能伪造执行记录的 runner（残余风险典型来源） | 合谋 runner |
| exposure item | 敞口 | 机制评审清单 | 机制评审发现的未闭合信任缺口 | 暴露项（该义；同日裁决保留敞口） |
| self-reference guard | 自引用保护 | `selfGuard` | change-scope spec 对自身改动的哈希守护 | 自指 |
| host adapter | 宿主适配器 | `plugins/quality-gate`（ZCode 插件层） | 内核到 ZCode 宿主的适配（Hook/Command/Skill 触发同一 CLI） | adapter（未加限定词单用） |
| reference adapter | 参考工具适配器 | `adapters/` | 各生态工具的参考实现（visual 截图/consumer-usage/python/java），"参考非认证" | — |
| marketplace snapshot | 市场快照 | `sync_client_marketplace` 镜像目录 | 客户端"更新"按钮读取的本地 marketplace 目录镜像（"更新"只读快照不读源仓库） | — |
| blocking | 阻断 | Stop `decision:'block'` | Stop Hook 阻止会话结束并回传失败摘要 | 封堵（该义） |
| mainline（过程） | 主线 | — | 版本的主要工作主题 | — |
| with-release（过程） | 随版发布 | — | 搭同一版本交付的次要工作 | 随版（短形） |
| work package（过程） | 工作包 | — | 版本内独立验收的任务单元（T 编号） | — |
| quick win（过程） | 快赢补丁 | — | 小步独立发布的修补版本 | — |
| release close-out（过程） | 版本收尾 | — | 版本完成的文档/构建/验收收尾动作；stage 名 `close` 不变 | 收口、收尾（与"收尾"统一为"收尾"） |
| version record（过程） | 历史版本记录 | PLAN"历史版本记录"节 | 已发布版本的完成状态一行记录 | 历史基线/完成基线（该义） |
| status flip（过程） | 状态更新 | RTM 行 | 需求行状态改为已实现 | 翻转 |
| same-round carry（过程） | 同轮附带 | — | 遗留小项随下一轮一起做 | 搭车 |
| deferred（过程） | 暂缓 | decisions `deferred`+`revisitBy` | 决策显式延后（须期限） | 悬置 |
| output location（过程） | 输出位置 | — | 证据/报告文件的写入位置 | 落点 |
| postmortem（过程） | 复盘 | — | 实机会话的事后评审（惯用词，保留） | — |
| last link（过程） | 最后一环 | — | 多轮同构链条的最后一个环节 | 末环 |

**多义词消歧备注**：快照＝持久化快照（产品）或市场快照（宿主适配），按上下文；live＝实机验收（过程）或 `mode:live` 真实请求（协议枚举）；命令＝runner argv（运行命令）、CLI 子命令、`command` 门禁，精确语境加限定词；基线/基准二分见 §7-1；登记＝中文统一词，英文按语义分层——**清单/台账本体＝register**（assumption register、debt-register、task intent register、convention register），**存储载体＝registry**（`.quality-gate/registries/` 目录、registry file、`REGISTRY_DIR`）。

### 3.1 L0–L5 质量域名称（规范名=长名，短名为叙述简称）

| 层级 | 规范名（长名） | 叙述简称（可用） |
|---|---|---|
| L0 | 范围、需求与生成完整性 | 范围与需求 |
| L1 | 代码与工程正确性 | 工程正确性 |
| L2 | 接口、数据与系统一致性 | 系统一致性 |
| L3 | 功能与业务语义正确性 | 行为与业务语义 |
| L4 | 架构、非功能与安全 | —（同名） |
| L5 | 交付、运行与治理完整性 | 交付与治理 |

## 4. 验证动词分工

| 动词 | 代码对应 | 语义 |
|---|---|---|
| 校验 | `validate()` | schema/静态形状合法性检查 |
| 核验 | `contentVerified`、声明即核验 | 内核对声明内容真实性的检验 |
| 交叉核验 | `crossCheck` | 两源比对一致 |
| 核对 | diff/期望 vs 实际 | 逐项比对 |
| 验证 | —（泛称） | 泛指时可用；精确语境用上三者 |
| 审计 | `proposals` 漂移检查 | 离线对账检查 |

## 5. ID 前缀注册表（按层次与目标分组；2026-09-30 用户裁决分层规范）

规范原则：**一个前缀命名空间只服务一个层次×目标**；前缀字母由该版主题选定并随登记位置可追溯；跨层同形（如 T 编号、R1）靠登记位置区分，不靠记忆。

| 层次 | 目标 | 前缀/形状 | 登记位置 | 备注 |
|---|---|---|---|---|
| 需求跟踪层（RTM） | 原始设计任务行 | `L<0-5>.<n>`（L0.1–L5.7） | RTM §1 | 与层级 L0–L5 以小数点区分 |
| 需求跟踪层（RTM） | 横切需求行 | `X<n>`（X1–X11） | RTM §2 | — |
| 需求跟踪层（RTM） | 版本增补行 | 主题双字母+`n`：P/V/O/C/E/H/T/BR/TS/CD/UL… | RTM §3–§11 各版增补节 | 字母随该版主题选定，随行登记；同字母异版按节区分 |
| 需求跟踪层（RTM） | 溯源编号（机制评审敞口） | `W<n>`（W1–W5） | RTM §6 溯源列 | 与工作包 T 编号区分 |
| 需求跟踪层（RTM） | 四原则研究项 | `R<n>`（R1–R13；R13 已出范围） | RTM §7；研究输入 docs/context | R1–R4 兼作 topology 门禁规则名（同源同义） |
| 规划工作包层（发行说明） | 版本内任务包 | `T<n>`（T1–T7…） | docs/release/ 各版发行说明（PLAN 规划节已随 2026-10-01 精简轮移除，规划细节由发行说明承接） | 与 RTM 增补 T 编号按文档位置区分 |
| 配置样例层（CONFIG-GUIDE） | 样例 claim/risk/exception id | `CL-n` / `RS-n` / `EX-n` | CONFIG-GUIDE jsonc 样例 | 2026-09-30 起让位，避免与 RTM 的 C/R/X 命名空间撞名 |
| 配置与运行层（项目） | 项目自有 claim/risk/exception/gate id | 建议 `<主题缩写>-<n>` 带连字符（如 G-TESTS、C-REGRESSION） | 各项目 .quality-gate.json | 内核只验唯一性，前缀不作强制 |
| 配置与运行层（内核） | 运行标识 | `runId`＝UUID | run 报告 | 内核生成、不可自定义，非命名空间 |

## 6. 弃用词清单（已确认；防回归扫描源）

本表左列在活文档集扫描零出现由约定对齐门禁强制（历史档案除外；v1.19 起自 glossary 防回归测试迁移——两处清单同步为人工纪律，2026-10-01 用户裁决）。

| 弃用词 | 替换为 |
|---|---|
| 收口 | 收尾 |
| 对拍 | 内容比对 |
| 超面 | 越界使用 |
| 降权 | 降级 |
| 双降权 | 双重降级 |
| 残差 | 残余风险 |
| 自指 | 自引用 |
| 空转 | 空登记直通 |
| 封堵 | 阻断 |
| 落点 | 输出位置 |
| 末环 | 最后一环 |
| 搭车 | 同轮附带 |
| 悬置 | 暂缓 |
| 双跑 | 双次运行 |
| 烟测 | 冒烟测试 |
| 翻转 | 状态更新 |
| 自证放行 | 自行放行 |
| 附加库 | 附加门禁（库义=附加门禁库） |
| 附加项 | 附加门禁 |
| 模版 | 模板 |
| 运行器 | runner（借词） |
| 会话基线 | 会话基准 |
| 诚实边界 | 证明边界+残余风险 |
| 合谋 runner | 不可信 runner |
| 随版（短形单用） | 随版发布 |
| 历史基线/完成基线（PM 义） | 历史版本记录 |
| 旅程（客户端走查义） | 客户端走查 |
| 转录 | 观察记录 |
| 锚点（证据信号义） | 证据信号 |
| 锚定 | 核验级（等级义）/绑定（动词义） |
| 验证锚（RTM 列名） | 验证依据 |
| Git 基线 / 基线移动（baseRef 义） | Git 基准 / 基准移动 |
| 首个为基线（configuration 义） | 首个为基准 |
| 快赢 | 小迭代 |
| 内核重放 / 重放（重算义） | 内核重算（"防重放"安全语境与 v1.15 主题专名除外） |
| 形状协议 | AC 结构化协议 |

### 6.1 保留词清单（惯用词/描述性复合词，附理由）

| 保留词 | 理由 |
|---|---|
| 主线、工作包 | 项目管理惯用词（mainline/work package） |
| 复盘 | 国内研发管理惯用词（postmortem） |
| 落盘 | 中文开发者通行说法（写入文件） |
| 档位、命中、摩擦、裁剪、收紧、收窄、同构、剥离 | 软件/架构语境惯用词 |
| 实机、夹具、冒烟测试 | QA 惯用词 |
| 声明即核验、证据纪律 | 描述性复合词（字面即义，litmus ②） |
| 白名单 | 2026-09-30 用户裁决保留：协议/配置语境的显式允许集合，领域惯用（白名单/黑名单对偶） |
| 台账 | 同日裁决保留：登记性清单的通用说法（例外台账；归档文档名『设计覆盖台账/实施台账』为专名） |
| 灰度 | 同日裁决保留：发布工程标准词（灰度发布/灰度判定，对应 canary；代码 `canaryAnalysis` 不变） |
| 口径 | 同日裁决保留：统计/判定口径惯用（如 L3R2 口径、降级口径） |
| 敞口 | 同日裁决保留：风险暴露的固定隐喻（机制评审敞口清单/敞口编号） |
| 回放 | 2026-10-01 裁决保留（v1.21 起）：回放资产语境（replayBaseline 对照义）；与"重放"二分——重放已按义弃用（防重放安全语境与 v1.15 主题专名除外） |

## 7. T2 决策记录（2026-09-30 经 AskUserQuestion 裁决）

1. **基线/基准二分**：确认——基线＝F2P/P2P 对照实现（代码族自洽保留）；基准＝change-scope baseRef 变更参照、会话基准、首环境基准；PM 义改"历史版本记录"。
2. **L0–L5 名称**：确认——规范名=长名（CONFIG-GUIDE/SPEC 现行），PRD 短名降为叙述简称（§3.1）。
3. **转录→观察记录**：确认（与既有"观察"词汇对齐）。
4. **锚族**：确认——锚点→证据信号、锚定（等级）→核验级、锚定（动词）→绑定、RTM"验证锚"列→"验证依据"；六个信号标签本身描述性、保留。
5. **保留清单终裁**：落盘保留；**快赢→小迭代（用户指定，未采用推荐案"小步补丁"）**；口径→判定标准；灰度→金丝雀；复盘未单独提及、按推荐保留（惯用词）。
6. **样例 id 改名**：按批准计划执行——CONFIG-GUIDE 样例 C1→CL-1、R1→RS-1（消除与 RTM 概念 id 撞名）。
7. **2026-09-30 追加裁决（用户消息直接下达，同日落地）**：① §5 ID 前缀注册表按**层次**（需求跟踪/规划工作包/配置样例/配置与运行）与**目标**重新分组规范（见 §5 新表）；② **白名单、台账、灰度、口径、敞口 五词保留**——从 §6 弃用清单移出并入 §6.1，回滚此前对其的全部替换（活文档+代码注释+测试共 44 处，歧义短语精准回滚、自然用法不动），弃用清单 41→36 项。

## 8. 命名谱系（不改名的名字）

`qgate`（CLI 二进制）、`quality-gate`（插件与包名）、`quality-gate-local`（marketplace 名）、`qgate-transcript`（transcript 格式 id）、`QGATE_*`（环境变量前缀）为发行身份与协议格式标识，属命名谱系而非术语混用，v1.16 不改；谱系关系：同一工具家族的安装名/命令名/格式名分层。

## 9. 借词清单（中文文档直接使用的英文词）

runner、kind、runId、stage 名（edit/close/pr/release）、状态词（PASS/FAIL/ERROR/SKIP/PENDING/WAIVED）、F2P/P2P、seed、TAP/JUnit、OpenAPI、Pact、git/sha256/commit、argv、jsonc、EARS、Gherkin（AC 结构化格式名，2026-09-30 起；首选 Gherkin）、trace、span、traceparent（W3C Trace Context 术语，v1.21 起）、pyshacl（SHACL 引擎实现）、BCP47（语言标签规范，v1.22 起）。新增借词须入本清单。

## 10. 历史称谓

docs/history、docs/release、evidence/ 与 ADR-0001–0015 正文中出现的旧词（含"收口/锚点/转录/降权/附加库"等及其历史版本名如"baseline 内容内核重放"）均为**历史称谓**：记录当时语境，不回写、不追溯清理；本表弃用别名列即为其向规范名的映射。

