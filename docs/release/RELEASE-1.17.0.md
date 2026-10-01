# RELEASE 1.17.0（2026-10-01）

**主线：任务意图核心 + 符号存在性首轮（对齐防护 A 核心 + C 首轮组合轮）**——来源[演进设计基线 v0.9](../context/original-design-v0.9.md) §41/§43.2，2026-09-30 经 AskUserQuestion 选定（一轮覆盖两类对齐失效：意图漂移/范围蔓延 + 技术幻觉；AC 结构化协议与 Hook 软形态随"A 剩余"轮、API 存在性协议与 Python/Java 参考适配器随"C 剩余"轮）。**零破坏**：全部为可选字段、新登记文件与默认关闭能力，未启用新能力的既有配置行为零变化。

## 首日裁决（2026-10-01 经 AskUserQuestion，与 v0.9 倾向一致）

- **OD-101** 任务意图登记载体 = **registries 单文件**（`.quality-gate/registries/task-intent.json`，活跃意图唯一，任务串行假设；目录制留给并发多任务真实需求出现后）；
- **OD-107** 意图 scope 与项目 allowed 集集成 = **交集**（任务范围只会比项目允许更窄；意图是收紧器，与范围蔓延防护初衷同向）；
- **T3 承载形态** = **独立 kind `symbol-grounding`**（第 35 个，L1/L2；内核原生零 runner 与 consumer-matrix/topology/budget/rerun 先例一致；宽名对齐 GLOSSARY 术语，C 剩余 API 存在性协议后续挂同 kind 可选观察）。

## AL1 任务意图登记与漂移对账（轨道 A 核心）

- **登记协议**（`lib/task-intent.mjs`）：`{taskId, statement, scope: [glob], acceptance?[{text, type?}], constraints?, source?, createdAt, confirmedBy, revisions?}`——结构校验 fail-closed（畸形/缺确认字段/修订链断裂[时间乱序、previousSha256 重复、早于登记]均 ERROR）；内容哈希对解析后 JSON 计算（空白/BOM 不算变更，与 selfGuard 同口径）；`revisions[{revisedAt, reason, confirmedBy, previousSha256}]` 修订链显式留痕。**确认留痕是登记与用户真实意图一致性的唯一背书，框架不判语义**。
- **change-scope 漂移对账**（spec 新键）：`taskIntent:{file, acknowledgedSha256?}` 声明即核验（存在+防逃逸+结构核验 fail-closed+内容哈希入证据）；变更集逐文件与意图 scope **交集**对账，超出 FAIL 指名 `outside-task-scope`（越界清单入证据）；哈希不符 FAIL `intent-file-modified`（selfGuard 思想——修订须显式：补 revisions 并更新哈希重新绑定）；`requireTaskIntent:true` 下无登记 FAIL `no-task-intent`（**没有意图基准的"完成"只是 agent 自述**）；绑定声明而文件缺失（未开 requireTaskIntent）fail-closed ERROR。可判定约束 `no-new-dependencies`：内核对账基准 commit 与工作树 package.json 四依赖段键 diff（新增键即 FAIL）；其余约束登记性呈现。
- **写入通道与问询**（`qgate intent` + `/quality-gate-intent`）：agent 只问询不代写——CLI 结构自校验后写登记文件并同步重绑全部声明 taskIntent 的 spec；`--revise` 修订（reason 必填）追加修订链并重新绑定；静默覆写拒绝（活跃意图须显式修订或显式新任务）；省略 answers 只读渲染基准与绑定核验状态。
- **报告呈现**：summary 全表新增**任务意图基准行**（taskId + 绑定状态 + scope 项数 + 越界/对账）；失败解释按"十秒可判"标准（越界清单+还原或修订指引/修订命令/新增依赖名）。
- **演示**：`examples/intent-drift-demo`（场景驱动临时 Git 项目，v0.9 §41.6 四场景：ok PASS / outside 越界 FAIL / tamper 静默修改 FAIL / revise 显式修订 PASS 且修订链留痕）。

## AL2 符号存在性对账首轮（轨道 C 首轮）

- **新 kind `symbol-grounding`**（第 35 个，L1/L2，纯内核判定无 runner）：
  - 受检文件：`check: "changed-files"`（默认，Git 基准 `baseRef` 默认 HEAD，复用 change-scope 变更集口径——存量问题不拦新账）或 `"all"`（全仓走读，免 Git）；`include` glob 限定扫描面；`node_modules`/`.git`/`.quality-gate` 恒排除；扫描扩展名 `.js/.mjs/.cjs/.ts/.mts/.cts`；
  - 保守词法提取：单状态机双输出（注释剥离+字符串内容掩码，等长对位判定匹配是否落在字符串内——`"select from 'users'"` 类字符串内容不误报）；只认静态字符串说明符（`import`/`export … from`、副作用 `import`、`require()`、动态 `import()` 字面量）；模板字符串/变量拼接等动态形态不覆盖，`dynamicFormsTotal` 计数如实入证据；
  - 三分类解析（Node 解析算法子集）：项目内模块（相对路径+扩展名补全+index 解析；bare 说明符最后尝试项目根相对解析，覆盖 tsconfig baseUrl 类无别名配置）/ 依赖清单（package.json dependencies/devDependencies/optionalDependencies/peerDependencies，含 `@scope/pkg` 子路径与自引用）/ 内置模块（`node:` 前缀+核心枚举）；
  - 三分类均不可解析 → FAIL 指名 `unresolved-import`（文件+行+说明符+尝试路径入证据）；
  - `changed-files` 模式纳入 KNOWN_TOOLS git 预检与安装指引（依赖自动推导）。
- **演示**：`examples/symbol-grounding-demo`（`check:all`+`include src/**`，三分类各一正例——leftpad 只在依赖清单不在安装，对账声明面而非安装状态；测试注入幻觉 import 验证 FAIL）。
- **证明边界（如实）**：存在性证明不判语义正确性（类型/版本/废弃由类型检查器承载）；动态说明符不覆盖；tsconfig `paths` 别名与依赖 `exports` 子路径映射不解析（bare 根相对兜底报告）。

## 其余变更

- 随版修复（收尾期 Stop 门禁定位）：six-domain-demo 四个 runner 门禁 `timeoutMs` 5000→8000（阶段预算 20s→32s 仍 ≤40s）——系统瞬时负载尖峰下 runner 撞 5s 超时被杀导致套件两次单例 ERROR（`six-domain.test` release 场景）；超时为上限不增加正常耗时，真失败仍照常 FAIL；
- 新命令 `quality-gate-intent`（问询命令第 4 个）与 SKILL 3b 任务意图对齐段；CLI `usage` 增 `intent` 子命令；
- `docs/GATE-SPEC-v1.16.md` git-mv 至 `docs/history/`（加已归档横幅），新建 [GATE-SPEC-v1.17](../history/GATE-SPEC-v1.17.md)；
- GLOSSARY 三提案概念码名定稿（任务意图登记/漂移对账/符号存在性对账——登记行从"随实施定稿"转为定稿码名与失败原因名）；CONFIG-GUIDE 登记 scope.json 新键、task-intent.json 协议、symbol-grounding 小节与样例、依赖预检说明（v1.17 前遗留的"32 个 kind"陈旧计数一并修正）；
- RTM §12 AL1/AL2 行更新为原生（2026-10-01）并记录 OD 裁决。

## 验证与证据

- 全量回归 **497 项（496 过/1 skip=pytest 守卫）**，经 `devtools/run-suite.mjs` 并发钳制；kinds **34→35**；示例 **37→39**；测试 **464→497**（+33）；
- 发行包 `dist/quality-gate-1.17.0.zip`：**613 文件**，SHA256 `3b08856ec8d670f23e70ec75484a64e4171c33f930781dc00c0f2db60c255cd7`（两次构建全同）；构建内自验证（全量测试+24 冒烟 demo）与独立解包复验（版本相等+解包内核 six-domain close/release PASS）见 `evidence/v1.17.0/`；
- 零破坏确认：无 taskIntent/requireTaskIntent 的既有 change-scope spec 行为零变化（回归覆盖）；symbol-grounding 为新增 kind，既有配置不受影响；观察协议与 transcript schema 键零改动。

## 残余风险（如实入 RTM）

- 意图登记与用户真实意图的一致性只由确认留痕背书（框架不判语义）；修订链治理宽 scope 确认依赖审计面可见性；
- 漂移对账为路径级：范围内文件改错内容由 F2P/P2P、behavior 等既有门禁承载，本轮不新增内容语义判定；
- import 提取器保守策略：动态说明符（模板/变量拼接）不覆盖（`dynamicFormsTotal` 如实标注）；tsconfig paths 别名与依赖 exports 子路径映射不解析；
- `no-new-dependencies` 对账只覆盖 package.json 四依赖段（npm 生态），其他语言锁文件不在判定范围。

## 升级与迁移

零破坏，无需迁移。启用新能力：change-scope spec 增 `taskIntent` 绑定（经 `qgate intent` 登记后自动绑定哈希）与可选 `requireTaskIntent`；配置增 `symbol-grounding` 门禁（CONFIG-GUIDE 样例可直接经 `/quality-gate-update` add-on 路径或模板增补——本版未新增模板项，按样例手工经 update 通道添加）。
