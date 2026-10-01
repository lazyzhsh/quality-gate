# Quality Gate 1.2.0 发布说明

面向 v1.1 之后的六域增强、摘要输出层、配置功能指引与外部依赖提示。配置 schemaVersion 保持 0.1，旧项目配置无需修改。

## 摘要输出层（增量 0）

每次运行后 CLI 在 stderr 输出 brief 与 Markdown 表（总体结论、阶段、通过/跳过计数、域覆盖、未满足必需域、逐门禁状态与按 kind 提取的失败原因）；stdout 仍是规范 JSON。Stop Hook 阻断 reason 附带同一摘要。报告与 releasePackage 的每条证据记录 `kind` 与 `domain`。摘要是展示层，不改变判定语义。失败原因提取器覆盖全部 25 个 kind（L0–L5 六域无遗漏），并由测试强制：kernel 导出 `GATE_KINDS` 白名单，新增 kind 而未注册提取器会使回归失败；每个 kind 的提取输出均有独立断言。

## 增量 4.1：摘要层全域覆盖保证

- kernel 导出 `GATE_KINDS`（25 个 kind 的唯一白名单，`validate` 复用），summary 暴露 `hasFailureExtractor`。
- 新增"每个 kind 必有提取器"强制测试与 25 个 kind 的逐域提取断言（每个 kind 一条真实失败细节与期望原因文本）。
- 修复由此发现的 assumptions 提取器缺陷：`unresolved` 为纯 ID 数组，此前误按对象取 `.id` 导致原因渲染为空串（该路径此前无测试覆盖）。
- 回归：136/136 通过。

## L1 增量：工程检查增强

- unit 子检查新增可选 `blockOnSkipped: true`（skipped>0 即 FAIL，对齐"SKIP 非 PASS"的框架哲学）与 `minTotal` 最小测试数；默认行为不变。
- structure/convention 子检查新增可选分严重度阈值 `maxBySeverity: {low|medium|high: n}`，与总数上限 `maxFindings` 叠加；证据新增逐严重度计数 `severityCounts` 与超限项 `severityBreaches`，补齐与 L4 scan 的严重度阻断不对称。
- mutation 观察新增可选 `survivors` 存活明细（id/description），内核核验其与 killed/total 算术一致，不一致即 ERROR；阻断仍由 score/min 决定。
- 构建可复现二次验证与结构化工具身份字段经确认不做。
- demo：`examples/engineering-demo` 新增 requirements.json（五类 AC 全部链接 engineering 门禁），演示 L0.2 requiredTypes × L1 同次闭环；runner 的 mutation 分支报告真实存活变异明细；unit 子检查示范 blockOnSkipped+minTotal，findings 子检查示范 maxBySeverity。
- 测试：engineering 测试 4→9（skipped 阻断与兼容、minTotal、分严重度阈值、存活明细与算术 fail-closed、RTM 五类联动）。
- 回归：141/141 通过。

## 增量 1：L0.3 假设检查

- `assumptions` 从 kernel 内联迁移为独立模块 `lib/assumptions.mjs`，行为除以下新增外不变。
- `source`/`evidence` 支持结构化引用并强制核验：`{file}` 核验项目内存在性并做词法防逃逸预检（逃逸即 ERROR）；`{gateId}` 须为配置中的真实门禁且同次运行 PASS，否则 FAIL；未知门禁、畸形引用对象即 ERROR。纯文本引用保持登记不核验，向后兼容。
- 该门禁改为在关联门禁之后评估（同 traceability/readiness 的 PENDING 模式），引用的是同次证据。
- 正例：`examples/demo`（A1 使用 `{file:'adr-1.md'}` 与 `{gateId:'syntax'}`，A2 保持纯文本）。反例：`tests/assumptions.test.mjs` 五组正反例（引用缺失文件 FAIL、链接门禁失败 FAIL、未知门禁 ERROR、畸形/逃逸引用 ERROR、open 状态 FAIL）。
- 新增共享引用核验模块 `lib/references.mjs`，供后续决策/追溯复用。
- 回归：126/126 通过（v1.1 基线 114 + 摘要 7 + 本增量 5）。

## 增量 2：L0.4 决策检查

- `evidence` 支持结构化引用并强制核验：`{file}` 存在性 + 防逃逸（逃逸 ERROR）；`{gateId}` 须为真实门禁且同次 PASS，否则 FAIL；未知门禁、畸形引用 ERROR。纯文本保持兼容。
- 新增可选 `affectsPaths`（项目内文件，存在性核验，缺失 FAIL、逃逸 ERROR）与 `affectsGateIds`（未知即 ERROR，已知记录同次状态仅作登记）影响链接，使"未决策事项影响哪些代码/门禁"成为可检查的结构化事实。
- `decisions` 改为在关联门禁之后评估（PENDING 模式），引用同次证据；L5 关闭语义不变。
- 正例：新增 `examples/decisions-demo`（D-1 使用 `{gateId:'syntax'}` 证据与双影响链接，D-2 保持纯文本）。反例：`tests/decisions.test.mjs` 新增两组（证据文件缺失 FAIL、影响路径缺失 FAIL、未知影响门禁 ERROR、逃逸 ERROR、链接门禁失败 FAIL）。
- 回归：129/129 通过。

## 增量 3：L0.1 需求追溯与 AC 覆盖

- `testGateIds` 从仅限 `command`/`persistence` 扩展为除 `traceability`/`readiness` 外的任意 kind：journey/property/invariant/behavior/engineering/assumptions/decisions 等同次 PASS 证据均可充当 AC 测试证据。元门禁（traceability/readiness）在 RTM 之后评估，引用它们即 ERROR。
- 新增可选 `coverage: {argv, timeoutMs}` 运行器协议：内核把当次 runId 与逐 AC 的 codeFiles 清单发给 runner，runner 回报每个文件 `covered` 布尔；结果必须与配置的 AC/文件精确匹配，未覆盖即 FAIL（证据逐文件记录 `covered`），runner 缺失/过期 runId/格式错/超时/非零退出即 ERROR。coverage 超时计入阶段预算。
- 正例：`examples/traceability-demo` 新增 `scripts/coverage.mjs`（demo echo 型 runner，文档明示需替换为真实覆盖率工具）。反例：`tests/traceability.test.mjs` 新增两组（非元 kind 链接 PASS/readiness 链接 ERROR；covered 标记、uncovered FAIL 及其摘要原因、stale runId ERROR、缺 criterion ERROR）。
- 回归：131/131 通过。

## 增量 4：L0.5 变更范围

- 逐文件变更类型：diff 改用 `--name-status`，证据中每个文件记录 `changeType`（A/M/D/R/C/T，未跟踪为 A）；重命名仅报告目标路径。
- 确认绑定基线：protectedPaths 规则可选 `acknowledgedBase`（commit SHA）；当次解析的 `baseCommit` 与之不符时确认失效，进入 `unacknowledgedProtected` 并标注 `reason:'stale-base'`，消除粘滞 ack。纯布尔旧形态保持兼容（无基线即长期有效）。
- 内容级检查协议：scope.json 可选 `contentCheck: {argv, timeoutMs}` 运行器（协议与其他 runner 一致：stdin 收 runId/baseRef/baseCommit/逐文件变更类型，stdout 回结构化 findings `{path, category, detail}`）；配置 `acceptedFindings: [{path, category, reason}]` 显式接受，任何未接受 finding 一律 FAIL——检测权归 runner，接受权归配置。runner 缺失/过期/格式错/超时/非零退出即 ERROR；`acceptedFindings` 不能脱离 `contentCheck` 存在。
- 正反例：change-scope 依赖真实 git 仓库，沿用测试内临时 git 项目的交付方式——`tests/change-scope.test.mjs` 新增三组（ack 基线错值 FAIL `stale-base`/正确值 PASS；A/M/D 类型证据；finding 未接受 FAIL、接受后 PASS、stale runId ERROR）。
- 回归：134/134 通过。

## 配置功能指引与文档归位

- 新增 `docs/CONFIG-GUIDE.md`：全部可配置项的模板样例与说明——顶层字段、门禁通用字段、数据登记文件（assumptions/decisions/scope/requirements）选项，以及 25 个 kind 各一段**完整 `jsonc` 样例**（覆盖该 kind 全部选项，含 blockOnSkipped、minTotal、maxBySeverity、coverage、contentCheck、acknowledgedBase 等研发新增项）。
- 新增 `tests/config-guide.test.mjs` 自动同步保证：① 全部 jsonc 样例剥注释后必须通过内核 `validate()`（选项被删除/改名/收紧即回归失败）；② 样例 kind 集合必须等于 `GATE_KINDS`（新增 kind 必须配样例）；③ 样例中使用的门禁级/check 级/coverage 选项键必须在指南中反引号文档化。已知边界：仅在表中登记、不出现在任何样例的选项（如 DAST 的 `authorizedTarget`）不受机制③约束。
- 版本文档归位：`RELEASE-*`、`LIVE-ACCEPTANCE-*`、`PLAN.md`、`VALIDATION.md` 共 11 个文件移入 `docs/`，全部交叉链接已修复；根目录仅保留 `AGENTS.md`、`PROJECT-HANDOFF.md`、`README.md`。
- `AGENTS.md` 新增约定：新增/调整可配置项必须同步 CONFIG-GUIDE；版本文档放 `docs/`；回归命令以命令本身表述，不再硬编码测试数。
- 回归：144/144 通过。

## L2 增量：接口、数据与系统一致性

- `alignment` 新增可选 `ignorePaths`（JSON Pointer 模式，`*` 匹配一段）：命中的差异跳过并计入证据 `ignoredDifferences`，未声明的差异照常 FAIL——易变字段（时间戳/请求 ID）的豁免权在配置不在 runner。
- `persistence` 新增可选 `expectedRecordCount`（默认 1，行为不变）：0=断言必须不落库（记录为 null 且逐字段"应当缺失"，此时期望 HTTP 状态放宽为任意状态码，支持拒绝场景）；>1=批量协议（runner 回 `records` 数组，逐条按 expected 模板核对，证据含 `recordResults`；与 `requireSnapshots` 互斥）。
- `invariant` 操作符扩展 `neq`/`lt`/`gt`（与现有语义一致，带操作数证据）；`when` 条件扩展 `notEquals`/`in` 列表与数组 AND 组合，条件不满足仍 SKIP。多源对账指引：每服务一个 gate 另配对账 gate（台账已记录）。
- 经确认不做：semantic-profile 概念冲突规则（保持结构约束，概念冲突由 L3 semantic-alignment 承担）。
- demo：alignment-demo 观察如实上报 `serverTime` 并由 `ignorePaths` 豁免；persistence-demo 新增幂等（duplicate 模式，INSERT OR IGNORE 后仍 1 条）与拒绝（422 后零落库）两个真实 HTTP+SQLite gate；invariant-demo 追加 lt/neq/gt、in/notEquals 与 AND 条件断言。
- 测试：+6（忽略清单正反例、count 0/N 正反例与互斥校验、新操作符/条件矩阵、幂等+拒绝真实集成）。
- 回归：150/150 通过。

## 外部依赖提示与安装指引

- L0–L2 依赖回顾结论：内核零 npm 依赖（纯 Node 20+ 标准库、不联网）；框架直接调用的外部程序仅 `git`（change-scope）；`python`/`python3`/`py` 为登记的示例 runner 命令；项目侧专业工具（lint/类型/覆盖率/变异/扫描器/DB 客户端）经 runner 协议由项目接入，内核刻意不捆绑。
- 新增 `lib/dependencies.mjs`：`KNOWN_TOOLS` 登记表（含安装指引 URL）、从配置静态推导依赖（change-scope→git；runner/check/coverage argv 首参为登记表裸命令名）、仅 `--version` 预检。
- 三处提示：① 报告新增 `dependencies`（required/missing/hint/url）；② SessionStart 在新项目读取配置后预检，缺失即注入安装链接（Node <20 也提示升级）；③ CLI/Stop Hook 摘要输出"缺少外部依赖"行，登记表命令 ENOENT 的失败原因追加安装指引；`git` 缺失时 change-scope 给出专属报错与链接。
- 边界（如实声明）：项目自定义命令不做预检（内核不执行未知命令）；Windows Store 的 python 别名可能造成误报可用；探测仅在配置引用登记工具时发生。
- 测试：+6（依赖推导、可执行探测、报告携带、提示文案、ENOENT 指引、SessionStart 注入）。
- 回归：156/156 通过。

## L3 增量：功能与业务语义正确性

- 共享化：新增 `lib/assertions.mjs`（invariant/property 统一断言语义）与 `lib/diff.mjs`（alignment/journey/behavior 统一深比较差异与 ignorePaths 过滤），alignment 重构复用。
- journey/behavior 新增可选 `ignorePaths`（步骤/案例级 JSON Pointer 豁免，`*` 匹配一段）：跳过的差异入证据 `ignoredDifferences`；失败步骤/案例现始终输出 `differences` 明细（此前只有布尔结果，属证据增强）。
- property 断言与 invariant 完全对齐：操作符 eq/neq/le/lt/ge/gt、`when` 条件（in/notEquals/AND）；修复两套断言语义漂移。
- visual 新增可选 `maxDiffPixels`/`maxDiffRatio` 像素容差协议：runner 回报 `diff:{pixels,totalPixels}` 度量，内核按阈值判定，字节一致恒 PASS，比较模式与度量入证据；不配置则保持严格字节比较。基线保护指引：将基线文件列入 change-scope `protectedPaths` 即可实现"改基线须显式确认"。
- semantic-alignment 支持 Semantic Conflict 最小版：观察允许多候选注解（同一符号多个 IRI），local-catalog 概念新增可选 `disjointWith`；候选与声明 IRI 互斥即 FAIL 并输出 `disjointPairs`。新增正例 `examples/semantic-conflict-demo`；FIBO 固定目录不受影响。
- 经确认不做：journey 异步轮询协议（runner 职责，文档指引）、property 自动收缩（shrink）、完整关系推理。
- 测试：+8（journey/behavior 忽略正反例、property 操作符/条件矩阵、visual 容差正反例与缺度量 ERROR、semantic 冲突正反例与目录校验）。
- 回归：164/164 通过。

## L0–L3 正反例覆盖审计与补全

对 L0–L3 全部门禁特性逐项盘点"正例 + 故意失败反例"后补齐 8 个缺口：

- **例外提案阻断语义**（框架招牌不变量，此前只有畸形例外 → ERROR 的测试）：有效 proposed 例外 + 全部门禁 PASS → 整体 FAIL；移除例外后同配置 PASS。这是"提议即阻断、不存在自动豁免"的直接证明。
- engineering build 双反例：runner 谎报制品 SHA256 → FAIL；制品为空 → ERROR。
- engineering 咨询性语义锁定：失败的子检查不在 `requiredChecks` 时门禁仍 PASS（失败仍记录在证据），列入后才 FAIL。
- visual 基线文件缺失 → ERROR。
- traceability coverage runner 崩溃（非零退出）→ ERROR。
- change-scope contentCheck runner 崩溃 → ERROR。
- invariant 全部断言条件不满足 → 门禁 SKIP（报告层 SKIP、退出码 2），其他门禁照常放行——锁定"SKIP 不是 PASS"。
- semantic-profile `allowedValues` 违规 → FAIL（此前只测过 minCount/valueType）。

其余特性经盘点确认已有正反例成对覆盖（见 `evidence/v1.2/tests.txt`）。
- 回归：172/172 通过。

## L4 正反例补全

- 补齐 scan 门禁自身的基础负例：stale runId → ERROR、畸形 findings（非法严重度）→ ERROR、acceptedFindings 非法 expiresAt → ERROR（其余 runner 类门禁此前均有 stale 反例，唯 scan 漏测）。
- 回归：177/177 通过。

## L5 增量：交付、运行与治理完整性

- `documentation` 制品存在性核验：runner 回报的 path 由内核核验存在且非空（`fileStatus` FOUND/MISSING/EMPTY 入证据，缺失即 FAIL，词法防逃逸 ERROR）——与 readiness/RTM 对齐，runner 无法再报告不存在的文件。
- `debt` resolved 项可选 `evidence`：`{file}`/`{gateId}` 结构化引用强制核验（复用 references.mjs；gateId 引用同次 PASS 证据），纯文本仅登记；debt 门禁改为延后评估。demo 新增 DEBT-2（resolved + `{file:'repayment-note.md'}`）。
- `configuration` 的 `allowedDifferences` 支持 `*` 段通配（如 `features.*.enabled`）；demo 以 canary 开关漂移示范；CONFIG-GUIDE 补非 JSON 配置（YAML/env 经 JSON 镜像）接入指引。
- 经确认保持现状：readiness 制品 expectedSha256 pin、发布包签名/跨运行汇总/有效期、migration 耗时上限。
- 测试：+3（documentation 假路径 FAIL/逃逸 ERROR、通配只匹配声明段、debt 引用缺失 FAIL/未知门禁 ERROR）。
- 回归：180/180 通过。

## L4 增量：架构、非功能与安全

- `scan` 新增可选 `acceptedFindings: [{rule, location, reason, expiresAt?}]`：按 rule+location 精确匹配豁免已审计 finding，reason 必填；`expiresAt` 过期后自动恢复阻断并在证据/摘要标注 `acceptanceExpired`——安全豁免不可永久。测试覆盖：豁免放行（acceptedBy 入证据）、错误 location 不匹配仍 FAIL、过期豁免恢复阻断。
- `resilience-demo` 新增 external-timeout 场景：真实注入外部依赖超预算挂起（150ms > 100ms 预算），验证超时守卫 503 + 恢复后重试成功 + 三类信号；反例：移除守卫后场景 FAIL。CONFIG-GUIDE 新增六类故障（DB/Redis 不可用、外部超时、重复消息、重试风暴、网络分区）的 runner 模式指引。
- 新增 `examples/architecture-demo`：把项目约定的四条架构原则（实时链路无单点依赖、关键后台服务平等多活、核心链路支持并跑试算/灰度、批量任务支持重跑并跑）转成拓扑度量的 metrics 门禁；正例全过，反例逐原则注入（单实例依赖/单副本/关灰度/去重跑）各自命中命名指标。
- CONFIG-GUIDE 新增"架构适应度模式库"：四原则 + 十余项可选模式（分层单向依赖、循环依赖禁止、扇出/超时/重试预算、SLO 与错误预算、N+1 冗余、RPO/RTO、资源隔离、幂等/降级覆盖率、密钥轮换、慢查询预算）。
- metrics 协议保持不变（经确认不做 unit 记录与基线回归阈值）。
- 测试：+4（scan 豁免三态、超时守卫反例、架构适应度正反例）。
- 回归：176/176 通过。

## 定稿验证（2026-09-25）

- 测试基线：**180 项全部通过**（v1.1 的 114 + 摘要 7 + L0 增量 13 + 提取器全域覆盖 2 + L1 增强 5 + 配置指引同步 3 + L2 增强 6 + 依赖提示 6 + L3 增强 8 + 正反例补全 8 + L4 增强 4 + L4 反例补全 1 + L5 增强 3）。
- 正例 demo：**21 个全部通过**（`evidence/v1.2/demos.txt`）；打包必验清单十个核心 demo。
- 功能实测（`evidence/v1.2/functional-checks.txt`）：scan 豁免过期自动恢复阻断并在摘要标注；SessionStart 依赖预检注入安装指引；多域失败摘要表（域覆盖、未满足必需域、逐门禁原因）。
- 打包：`quality-gate-1.2.0.zip`（287 文件，SHA256 `6e5574c4…59a9`），解包复跑 180 项测试与十个核心 demo 全部通过（`evidence/v1.2/package-smoke.txt`）；历史 v0.1–v1.1 安装包原样保留。
- 既有验收项目（acceptance/zcode-v11-acceptance*）在新内核下复验通过。
- **已知待办（需客户端操作）**：在 ZCode 客户端将本地 marketplace 更新至 1.2.0 后，复验 Command/Skill 调用、L0–L5 六域组合 Stop Hook 与依赖提示注入，并保留客户端报告（v1.1 的 L3 实机证据不能代替）。



