# 配置功能指引

适用 schemaVersion `0.1`。项目在根目录放置 `.quality-gate.json`；执行方式见插件 README（CLI `node bin/qgate.mjs <项目根> [edit|close|pr|release]`，退出码 0=PASS、1=FAIL、2=ERROR/SKIP）。本文是全部可配置项的模板样例与说明：每个门禁 kind 附一段**完整可校验**的 `jsonc` 样例（`tests/config-guide.test.mjs` 会剥除注释后交给内核 `validate()` 校验，并检查 kind 全覆盖与选项均有文档）；数据登记文件选项单独列出。新增或调整可配置项时必须同步本文，回归会强制样例不失效。

全部 35 个示例的单一事实源是 [examples/examples.manifest.json](../plugins/quality-gate/examples/examples.manifest.json)（角色/门禁 kind/冒烟测试阶段；[examples/README.md](../plugins/quality-gate/examples/README.md) 为索引表）——`tests/examples.test.mjs` 强制清单、索引、目录与每个 gate kind ≥1 示例、每个示例 ≥1 自动化依据保持同步。

规模与预算约束：`claims` ≥1；门禁 1..32 个。CLI edit/close 阶段总预算 ≤60000ms，pr/release ≤300000ms（含 `coverage`、`reasoner`、`shacl`）；runner `timeoutMs` 默认仍为 1..60000ms，仅阶段全为 pr/release 的 `command` 可到 300000ms。Stop 宿主期限 55 秒，adapter 只接受 close 已声明预算 ≤50000ms，超出落盘 ERROR 并阻断，长检查移到 CLI pr/release；`exceptions` ≤20，proposed 登记即阻断、已审批且未过期呈现 WAIVED（不豁免任何 FAIL 门禁）；`requiredLevels` 每阶段最多 6 个域。

## 顶层字段

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 必须为 `0.2`（v1.16 起；0.1 旧键 fail-closed 迁移） |
| `claims` | `{id, statement}` 数组，门禁必须引用其一 |
| `gates` | 门禁数组，见下文各 kind |
| `risks` | `{id, gateId, description}`，gateId 须指向存在的门禁 |
| `exceptions` | `{id, gateId, riskId, reason, owner, expiresAt: YYYY-MM-DD, status: proposed\|approved}`；`approved` 须带 `approvedBy` + `approvedAt`（不晚于 expiresAt）。proposed 登记即阻断；**已审批且在有效期内 → 报告呈现 WAIVED**（单独列示，不改变任何门禁判定，仅免于"登记即阻断"）；过期/未生效回退阻断。审批为声明字段，不防伪造 |
| `requiredLevels` | 可选；`{edit/close/pr/release: ["L0".."L5"]}`，声明的域未 PASS 即整体 FAIL |
| `ontology` | L2/L3 本体类门禁必需；`{"type":"fibo-skeleton"}` 或 local-catalog；local-catalog 概念支持可选 `altLabels`（terminology 术语解析）、`subClassOf`（semantic-alignment `subsumed` 包含判定，无环且目标须在目录内）与 `disjointWith` 互斥声明（Semantic Conflict 检测；见 docs/FIBO-PROVIDER.md） |
| `template` | 可选（v1.7.1）；溯源 `{"id": 模板id, "generatedAt": ISO 时间}`——init 装配时写入、update 刷新 generatedAt（id 保持来源），内核校验形状；`qgate.mjs inspect` 据此识别模板漂移，手写配置可省略 |
| `stop` | 可选（v1.14）；ZCode Stop Hook 行为 `{"blockMode": "all\|new-only", "inputs": {<门禁id>: ["glob", ...]}}`——`all`（默认）非 PASS 一律阻断；`new-only` 将**会话开始前已 FAIL 且声明输入未变**的 FAIL 降级为非阻断警告（详见下节）。`inputs` 的门禁 id 须存在、每门禁 1..20 个模式（相对路径 glob，禁绝对路径/`..`/反斜杠） |
| `intent` | 可选（v1.17.1，OD-105 裁决=登记即激活）；任务意图软形态 `{"capture": true?, "hooks": false?}`——意图登记存在时自动激活：UserPromptSubmit 每条提示词注入意图基准一行（taskId+scope+修订指引，对抗"早期约束被挤出窗口"）、PreToolUse 对 Write/Edit 类工具越 scope 目标注入 systemMessage 软提示（**软提示不拦截**，权威判定在 close 漂移对账）；`hooks:false` 整体关闭（即使已登记）；`capture:true` 开启未登记时的引导提示（默认关——未接入意图纪律的项目零感知）。软形态自身故障（登记损坏/配置异常）一律静默 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Deliverable meets configured gates"}],
  "gates": [
    {"id": "smoke", "kind": "command", "level": "L1", "enabled": true, "stages": ["close", "pr", "release"], "claimId": "CL-1", "argv": ["$NODE", "--check", "app.mjs"], "timeoutMs": 5000}
  ],
  "risks": [{"id": "RS-1", "gateId": "smoke", "description": "Syntax check cannot prove behavior"}],
  // 例外只登记且始终阻断；expiresAt 过期同样不豁免
  "exceptions": [{"id": "EX-1", "gateId": "smoke", "riskId": "RS-1", "reason": "Demo exception entry", "owner": "team", "expiresAt": "2026-12-31", "status": "proposed"}],
  // close 阶段要求 L0 与 L1 均有 PASS 证据，否则整体 FAIL
  "requiredLevels": {"close": ["L0", "L1"]},
  // 溯源（可选）：init 写入、update 刷新 generatedAt；inspect 据此输出模板漂移
  "template": {"id": "minimal", "generatedAt": "2026-09-26T00:00:00.000Z"},
  // Stop Hook（可选，v1.14）：new-only 时会话前既有且 smoke 声明输入（src/tests）未变的 FAIL 降级为警告
  "stop": {"blockMode": "new-only", "inputs": {"smoke": ["src/**", "tests/**"]}},
  "ontology": {"type": "fibo-skeleton"}
}
```

## Stop Hook 行为（v1.14）

ZCode Stop Hook（`hooks/adapter.mjs`）在会话收尾执行 `close` 阶段门禁，行为从 v1.14 起分四层，全部只影响 **Hook 呈现与拦截**，不改变门禁判定与 CLI 退出码：

1. **证据复用**：仅纯文件式 ontology-map、无外部引擎的 semantic-profile/semantic-consistency、configuration 可复用。配置哈希与阶段一致，报告含运行前输入内容快照，运行前后和当前内容一致，且无例外登记才允许；新增/删除/重命名/内容改动均失效。argv、Git/运行时检查、时间政策、外部观察重新执行；旧报告不复用。目录超过 100k 项、128MiB、遍历 2 秒、符号链接或不可读均回退重跑；`.git`、项目 runs 与指定报告目录不计入快照，因此 Git 相关结论不复用。runner 生成文件也参与比较，造成不稳定时重新执行。CLI 永远执行当前阶段门禁。
2. **基线前置**：SessionStart 注入最近一次归档 run 的结论与新鲜度（"Baseline: 最近一次 close 运行 FAIL（此后有文件变更…），失败门禁: …"），既有红灯在任务中修复而不是在 Stop 被撞上；同时在插件数据目录绑定会话基准（配置哈希 + 逐门禁结论），供 new-only 判定。
3. **`stop.blockMode`**：`all`（默认）维持旧语义——非 PASS 一律阻断。`new-only` 满足全部条件才放行为 systemMessage 警告：报告为 FAIL（ERROR 永不降级）、每个 FAIL 门禁在会话基准中已为 FAIL（SessionStart 时无归档则全部视为新失败）、该门禁在 `stop.inputs` 声明了输入 glob、且归档运行输入内容快照之后的变更文件（含删除）无一命中这些 glob；配置哈希漂移后基线失效（全部视为新失败）。未声明 inputs 的既有 FAIL 不降级——保守优先，不误放行。
4. **不阻断面收窄**：项目无 `.quality-gate.json`（未接入，SessionStart 已给引导）与 adapter 自身错误（模型无法通过改项目文件修复）不再阻断，改为 systemMessage 提示；门禁/配置 ERROR 仍阻断（可修复信号）。

证据输出位置：v1.14 起 Stop 运行与 CLI 同轨写入项目 `.quality-gate/runs/`（项目目录不可写时回退插件数据目录）。重跑提示按 qgate.mjs 绝对路径渲染，任意 cwd 复制即用。边界：new-only 的放行不代表通过——报告仍为 FAIL、CI 强制不受影响；内容快照不感知外部状态（网络门禁、仓库外文件）；new-only 依赖使用者声明完整输入范围，无法取得快照时不降级。

## 引导初始化与模板库（`qgate.mjs templates` / `qgate.mjs init`，v1.7）

项目缺 `.quality-gate.json` 时，推荐经 `/quality-gate-init` 引导对话（agent 问询、CLI 装配写入，架构见 [adr/ADR-0014](adr/ADR-0014-guided-onboarding.md)）初始化配置，也可在终端直接使用 CLI。模板库为内核侧静态数据（`lib/templates.mjs`），每个模板都是**可过 `validate()` 的完整骨架**，项目相关处以 `"__PLACEHOLDER__"` 占位——装配后仍残留占位符即拒绝写入并定位路径（fail-closed）。

```
node bin/qgate.mjs templates [lite|pro|max]      # 列出档位内可用模板与全部附加门禁
node bin/qgate.mjs init <项目根> <answers.json> [--force] [--fresh]   # 装配→校验→写入 .quality-gate.json
node bin/qgate.mjs leftovers <项目根>             # 只读列出重初始化残留（登记文件 + .quality-gate/ 目录）
node bin/qgate.mjs report <项目根> [runId]        # 不重跑门禁，重渲染归档运行的人读报告（runId 接受唯一前缀；缺省取最新）
```

**重初始化（v1.7.1）**：`.quality-gate.json` 被删除但残留仍在时，`leftovers` 确定性列出待清理项（根目录已知登记文件名启发层；旧配置尚在时并入其 file/dataFile/files/ontology.file 引用彻底层），经用户逐项看清并确认后 `init --fresh` 删除（不可恢复、不备份）并全新引导——残留登记**不作为**新配置的分析输入。装配失败不删除任何文件；已有配置需 `--force --fresh` 双确认；删除清单记入 stdout JSON 的 `fresh` 字段。

档位按 lite ⊂ pro ⊂ max 累积（选高档位可见低档位全部模板）：

| 档位 | 模板 id | 构成（域） | 必答替换 |
|---|---|---|---|
| lite | `minimal` | command + assumptions（L0/L1） | syntax 命令 |
| lite | `node-engineering` | traceability + engineering（static/unit/structure）（L0/L1） | 三条子检查命令 |
| lite | `web-api` | alignment + behavior + scan(sast)（L2/L3/L4） | 契约/行为 runner、行为用例、SAST runner |
| pro | `ledger-service` | persistence + consistency + invariant（L2） | 回读/零和/对账/审计/不变式 runner |
| pro | `security-hardened` | scan(sast) + behavior fail-secure（L3/L4） | SAST runner、行为 runner 与用例 |
| pro | `six-domain` | traceability/command/semantic-profile/behavior/metrics/debt+回滚（L0–L5，requiredLevels 全域） | 语法/行为/度量/回滚命令、行为用例；可选：metrics 阈值替换、ontology（默认 fibo-skeleton 仅占位，正式用 answers 换 fibo-pinned/local-catalog） |
| max | `release-governed` | 回滚 command + configuration + debt（L5，release 阶段） | 回滚演练命令 |

附加门禁（各模板的 `availableAddOns` 限定可选项，扫描类需提供 runner 命令）：`change-scope`、`sast-scan`、`api-authz-scan`、`credential-scan`、`debt-register`、`rerun-evidence`。禁用模板门禁用 `disable`（级联清理其 risks/exceptions 与孤儿 claims；附加门禁项是主动勾选，不支持 disable）。

answers 文件选项（未知字段/未知目标即拒绝；`init` 对已有配置无 `--force` 拒绝覆盖）：

| 字段 | 类型/默认 | 作用 |
|---|---|---|
| `templateId` | string，必填 | 模板 id（见上表） |
| `addOns` | string[]，可选 | 勾选的附加门禁 id，须在该模板 `availableAddOns` 内 |
| `disable` | string[]，可选 | 禁用的模板门禁 id（附加门禁项不可 disable） |
| `substitutions.gates` | object，可选 | 键为门禁 id：`argv`（非空字符串数组）、`file`、`timeoutMs`（1..60000）、`cases`（behavior 用例数组）、`thresholds`（metrics 自有指标阈值 `{<指标名>:{min?,max?}}`，1..20 个、min≤max，替换模板演示指标）、`checks`（engineering/consistency 子检查：`{<checkId>: {argv, timeoutMs≤20000}}`） |
| `substitutions.claims` | object，可选 | 键为 claim id：`{statement}`（恰好一个字段） |
| `requiredLevels` | object，可选 | 整体替换模板值，形状同顶层 `requiredLevels` |
| `ontology` | object，可选（v1.7.2） | 整体替换模板 ontology：`{"type":"fibo-skeleton"}`（仅占位，L2 语义门禁运行会 ERROR）｜`{"type":"local-catalog","file":"<项目相对目录文件>"}`｜`{"type":"fibo-pinned","expectedCatalogSha256":"<64位hex>"}`（随包目录 sha 见 `qgate.mjs templates` 输出的 `ontologyHint.fiboPinnedCatalogSha256`）。键集严格（多带字段即拒绝） |

```json
{
  "templateId": "six-domain",
  "addOns": ["sast-scan"],
  "substitutions": {
    "gates": {
      "metrics": {"argv": ["$NODE", "metrics-runner.mjs"], "thresholds": {"approvalLatencyMs": {"max": 500}}},
      "sast-scan": {"argv": ["$NODE", "scanners/sast-scan.mjs"]}
    },
    "claims": {"C4": {"statement": "项目度量的架构与安全指标达标"}}
  },
  "ontology": {"type": "fibo-pinned", "expectedCatalogSha256": "eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e"},
  "requiredLevels": {"close": ["L0", "L1"]}
}
```

写入后首跑 `close`：模板是骨架协议，runner 与登记文件（assumptions.json、requirements.json、scope.json、debt.json 等，默认集中在 `.quality-gate/registries/`，见下表）未提供前按 fail-closed 报 FAIL/ERROR——按本文对应 kind 协议补齐，不要为通过而禁用门禁。ZCode 会话内优先用 `/quality-gate-init` 引导对话（agent 只问询、配置一律经 `init` 写入，不手写手改绕过校验）。

## 检查与增量更新（`qgate.mjs inspect` / `qgate.mjs update`，v1.7.1）

配置已存在时的升级、修复与增量调整走独立入口（[ADR-0015](adr/ADR-0015-config-lifecycle.md)），不与首次/重初始化混用。`inspect <项目根>` 只读输出：有效性（validate 结果与错误）、门禁清单、各阶段预算用量（60s 上限，v1.21.1 起）、`requiredLevels`、`template` 溯源、模板匹配（有溯源=按来源模板输出双向 gate 集差异；无溯源=按 kind 集相似度给出最近模板）、可用附加门禁项（与既有 gate id 无冲突）、登记文件存在性，以及 **变更影响驱动的建议块 `suggestions`**（v1.15：附加门禁库 `suggest` 元数据 × 未提交变更面 `git status --porcelain -uall` 的路径匹配——`'**'` 任意/`'*.<ext>'` 扩展名/段通配三种语义；`.quality-gate/` 运行数据不计入；非 git 仓库如实 `available:false` 不做无依据推荐；**建议性输出，不代写配置**，采纳与否经 `/quality-gate-update` 对话由项目决定）。ZCode 会话内经 `/quality-gate-update` 引导：inspect 呈现（含建议块）→ 选择增量 → changes 文件 → `update` 写入 → close 验证。

changes 文件选项（未知字段/未知目标/gate id 冲突/残留占位符一律拒绝且不写盘；`update` 无需 `--force`——其目的即增量修改）：

| 字段 | 类型/默认 | 作用 |
|---|---|---|
| `addOns` | string[]，可选 | 勾选附加门禁 id；update 允许目录任意 id（模板档位限定仅 init 生效），与既有 gate id 冲突即拒 |
| `disable` | string[]，可选 | 禁用既有门禁 id（含级联清理其 risks/exceptions 与孤儿 claims；附加门禁项再次加入前先 disable 同名 gate） |
| `substitutions` | object，可选 | 与 answers 同构：`gates:{<id>:{argv,file,timeoutMs,cases,thresholds,checks}}`、`claims:{<id>:{statement}}`，可作用于本次新增的附加门禁 |
| `requiredLevels` | object，可选 | 整体替换，形状同顶层 `requiredLevels` |
| `ontology` | object，可选（v1.7.2） | 整体替换本体 provider，形状同 answers 的 `ontology` |
| `migrateRegistries` | boolean，可选 | 把配置 file 类字段指向的**根目录**登记文件移入 `.quality-gate/registries/` 并改写路径（内存改写→校验通过→才移动+写盘；目标已存在跳过并在结果 `skipped` 报告；runner 自用文件不迁移） |

init/update 写盘后自动做**登记文件门禁引用预检**（v1.7.2）：requirements.json 的 `testGateIds`、decisions.json 的 `affectsGateIds` 若引用了配置中不存在的门禁 id（旧配置残留、或 update 禁用了被引用门禁），以 `preflightGateRefs` 警告输出——重映射登记引用或补齐门禁后再跑 close，不要靠禁用放行。

```json
{
  "addOns": ["sast-scan"],
  "substitutions": {"gates": {"sast-scan": {"argv": ["$NODE", "scanners/sast-scan.mjs"]}}},
  "migrateRegistries": true
}
```

## 门禁通用字段

| 字段 | 说明 |
|---|---|
| `id` / `kind` / `level` / `enabled` / `stages` / `claimId` | 标识、kind 白名单（见 `GATE_KINDS`）、`L0`–`L5`、启停、`edit/close/pr/release`、所属 Claim |
| `argv` / `timeoutMs` | command 是退出码协议，不收观察 stdin；仅 pr/release 的 command 超时可到 300000ms，其他 runner 仍为 1..60000ms。runner 类门禁（command/persistence/behavior/metrics/alignment/invariant/journey/visual/property/semantic-alignment/scan/resilience/documentation/trace-continuity）：`$NODE` 展开为当前 Node；stdin 收当次 `runId`，stdout 须回带同一 `runId` 的结构化观察 |
| `file` / 数据文件 | 登记类门禁（assumptions/decisions/change-scope/traceability/debt/ontology-map/semantic-profile） |

## 外部依赖与安装指引

内核（全部 37 个 kind 的核验逻辑）只用 Node 20+ 标准库，零 npm 依赖、不联网。框架登记并**自动预检**的外部工具只有下表四种：配置中出现 `change-scope` 门禁、`symbol-grounding` 门禁（`changed-files` 模式）或 runner `argv` 首参为这些裸命令名时，内核在每次运行前探测（仅执行其 `--version`），结果写入报告 `dependencies`（required/missing/hint）。

| 工具 | 使用方 | 安装指引 |
|---|---|---|
| `git` | `change-scope` 门禁（框架直接调用） | https://git-scm.com/downloads |
| `python` / `python3` | 多个示例 runner（仅标准库，需 3.10+） | https://www.python.org/downloads/ |
| `py` | Windows Python 启动器，可替代 python | https://www.python.org/downloads/ |

提示出现在三处：SessionStart 注入文本（新项目会话开始即提示缺失依赖与安装链接；Node 低于 20 也会提示升级）、CLI/Stop Hook 摘要的"缺少外部依赖"行、报告 `dependencies` 字段；`git` 缺失时 change-scope 与 symbol-grounding（changed-files 模式）给出专属报错与链接。**边界**：项目自定义工具（eslint、tsc、覆盖率/变异/扫描器、DB 客户端等）不在登记表内、不做预检——它们经 runner 协议由项目自行接入并报错；绝对路径与 `$NODE` 不算外部依赖。新增框架级前置依赖时，在 `lib/dependencies.mjs` 的 `KNOWN_TOOLS` 登记（含安装指引），三处提示自动生效。

## 数据登记文件选项（非门禁配置，放在各 gate 指定的 `file` 中）

**目录约定（v1.7.1）**：登记文件默认集中在 `.quality-gate/registries/`（可提交，模板默认路径均指向该目录）；`.quality-gate/runs/` 为运行数据，gitignore 只需忽略 runs/。存量根目录文件可经 `qgate.mjs update` 的 `migrateRegistries` 收纳；路径本身不限定目录（项目相对路径均可，如 `contracts/current-api.json`）。

**assumptions.json**：`assumptions[{id, statement, status: confirmed|open|rejected, source, evidence, impact, risk, resolution}]`；`source`/`evidence` 可用结构化引用 `{file: "adr/1.md"}`（存在性核验+防逃逸）或 `{gateId: "xxx"}`（须同次 PASS），纯文本不核验。顶层可选 `"none": true`（v1.9 W1）：空登记必须显式声明 none 才 PASS（裸空数组 FAIL"空登记未显式声明"）；`none:true` 与非空条目矛盾即 FAIL。

**decisions.json**：`decisions[{id, question, status: resolved|open|deferred, owner, resolution, evidence, revisitBy, affectsPaths: [], affectsGateIds: []}]`；`evidence` 同上支持结构化引用；`affectsPaths` 核验存在性（缺失 FAIL、逃逸 ERROR）；`affectsGateIds` 未知即 ERROR。`status: deferred` 必须携带 `revisitBy: YYYY-MM-DD` 复审期限（v1.9 W1，缺期限 ERROR fail-closed；期限已过该决策 FAIL"暂缓决策已过复审期限"）。

**conventions.json**（convention-alignment，v1.19 轨道 B）：`rules[{id, type, source:{file, section?}, severity?: fail|advisory, …}]` 1..50 条，id 唯一，每条必带溯源 `source`（约定的文档形态与可执行形态双向可追）。`type:"banned-words"`：`words[]`（1..100，字面词）＋`scope[]`（glob 扫描面；`.git`/`node_modules`/`.quality-gate`/`dist` 恒排除）＋可选 `exemptions[]`——每条恰用一种机制键：`lineContains`（行含标记即该行豁免，`word` 可选限定词）、`precededBy`（前一字符等于该值则豁免）、`followedBy`（命中后紧跟该值则豁免）；映射记法（命中后紧跟 `→` 的对照行）恒豁免；逐命中（含豁免命中）入证据呈审计面。`type:"argv"`：`argv[]`＋`timeoutMs` 复用统一观察协议（stdin `{schemaVersion,runId,ruleId}` → stdout `{schemaVersion,runId,source,findings:[{path,detail,category?,line?}]}`，runner 无权自判放行；扫描型 runner 注意自引用陷阱——应跳过自身文件，参考 convention-align-demo）。`severity:"advisory"` 命中只记录不阻断（默认 fail 阻断）。边界：只对账字面词/结构化条目，不核验约定文件全文语义。本仓库自举：根 `.quality-gate/registries/conventions.json` 承载 GLOSSARY §6 弃用词扫描（v1.19 起，glossary 防回归测试整体退役——两处清单同步为人工纪律，用户裁决 2026-10-01）。

**scope.json**（change-scope）：`baseRef`（Git 基准引用）、`allowedPaths`（glob，超出即 FAIL）、`requiredPaths`（必须出现的变更）、`protectedPaths[{id, patterns, acknowledged, acknowledgedBase}]`（确认可绑定基准 commit，基准移动后失效）、`contentCheck{argv, timeoutMs}`（内容级 finding 检查 runner）、`acceptedFindings[{path, category, reason}]`（未显式接受的 finding 一律 FAIL）。v1.9 W2 新增：`selfGuard:{acknowledgedSpecSha256}`（spec 自绑定——内核对**去掉 selfGuard 字段后**的 spec JSON 串（原键序）计算 sha256 比对，不符即 FAIL `spec-changed`，allowedPaths/baseRef/protectedPaths 的任何静默修改立即失效，须重新确认并更新哈希）；`pinnedBase:{commit}`（基准绑定——内核解析 baseRef 得基准 commit，与 pinned 不一致即 FAIL `base-moved`，基准前移使 diff 清空的路径被封死）。R/C 变更（rename/copy）的**源路径**以 `R-source`/`C-source` 类型一并进入变更集参与 allowed/protected 判定——受保护文件改名挪走时删除侧不再绕过确认。`requireContentCheck:true`（v1.9.1 E4，可选）：开启后受保护路径发生变更而未配置 `contentCheck` 即 FAIL"缺少内容级检查"——确认覆盖路径变更，内容语义另需内容级检查；配置了 contentCheck 则由其协议接管。v1.17 轨道 A 新增（漂移对账，OD-107 裁决=交集——任务范围只会比项目允许更窄）：`taskIntent{file, acknowledgedSha256?}`（绑定任务意图登记——`file` 指向下方 task-intent.json，存在性+防逃逸+形状核验 fail-closed，内容哈希入证据；`acknowledgedSha256`（64 位十六进制，可选）绑定后与登记当前内容哈希比对，不符即 FAIL `intent-file-modified`——意图被修改必须显式修订：登记内补 `revisions` 留痕并更新本哈希重新绑定）；`requireTaskIntent:true`（可选）：开启后无意图登记（未绑定 taskIntent 或登记文件不存在）即 FAIL"缺少任务意图登记"——没有意图基准的"完成"只是 agent 自述。对账语义：变更集逐文件与意图 `scope` glob 对账（交集——先过项目 allowed 再过任务 scope），超出即 FAIL 指名越界文件清单；可判定约束 `no-new-dependencies`（constraints 数组中的字面量）由内核对账基准 commit 与工作树的 package.json 依赖清单 diff，新增依赖键即 FAIL；其余约束登记性呈现（由 alignment/consumer-matrix 等既有门禁自然承载）。

**task-intent.json**（任务意图登记，v1.17 轨道 A，OD-101 裁决：registries 单文件、活跃意图唯一）：`{taskId, statement, scope: [glob…], acceptance?[{text, type?}], constraints?: [], source?: {kind, ref?}, createdAt, confirmedBy, revisions?[]}`——`scope` 为任务级变更范围（1..100 个 glob，规则同 allowedPaths：项目相对、`**` 跨段、禁绝对路径/`..`/反斜杠）；`acceptance` 为验收条件——缺省 `format` 为自由文本（`type` 可选取 normal/boundary/negative/exception/state-transition，登记性）；可选 `format:'gherkin'|'ears'` 声明即校验（v1.18 AC 结构化协议）：Gherkin 须含场景（场景/Scenario[ Outline]/场景大纲）与步骤关键字（假如/当/那么/而且/但是 或 Given/When/Then/And/But，And/But 继承上一关键字），每场景经继承后至少一个 when 与一个 then，允许多场景（AC 类型=各场景 `@类型` 标签并集，标签取五枚类型词）；EARS 逐行匹配五模板（英文 The/When/While/If…then/Where…shall 与中文 `<主语>应当…`/`当…时…应当`/`在…期间…应当`/`如果…则…应当`/`其中…应当`，允许多语句，类型=模板映射集：无处不在/事件→normal、状态→state-transition、不需要行为→negative|exception、可选特征→normal）；结构违规或显式 `type` 与派生类型集不一致 → 漂移对账 FAIL 指名 `ac-structure-invalid`/`ac-type-conflict`（`lib/ac-structure.mjs` 只校验结构不判语义）；`constraints` 登记性文本数组（唯一可判定项 `no-new-dependencies`）；`source` 为登记性来源（如 `{kind:"user-prompt", ref:"任务首轮"}`，不回读对话）；`createdAt`（ISO 8601）与 `confirmedBy` 必填——确认留痕是登记与用户真实意图一致性的唯一背书（框架不判语义）；`revisions[{revisedAt, reason, confirmedBy, previousSha256}]` 修订链——修订=新内容+理由+确认人+前一版本内容哈希（对解析后 JSON 串计算，空白不算变更），须按时间升序、previousSha256 不得重复（链断裂 fail-closed），旧版本内容留档于 git 历史与 run 归档。写入走确定性通道（agent 只问询不代写）：`qgate.mjs intent <project-root> <answers-file>` 登记 / `--revise`（answers 须含 `reason`）修订——CLI 结构自校验后写登记文件，并同步更新所有声明了 `taskIntent` 的 change-scope spec 的 `acknowledgedSha256`（重新绑定）；省略 answers 文件即只读渲染当前基准与绑定核验状态。close PASS 后意图内容哈希随 run 归档，新任务须新登记或显式修订。

**requirements.json**（traceability）：`requirements[{id, statement, requiredTypes: [normal|boundary|negative|exception|state-transition], prdRef: {file, section}, acceptanceCriteria[{id, type, statement, format?, codeFiles, testGateIds}]}]`——`acceptanceCriteria` 可选 `format:'gherkin'|'ears'`（v1.18）：结构校验同 task-intent（违规 FAIL 指名 ac-structure-invalid）；AC 类型覆盖集=标签/模板派生类型（显式 `type` 在派生集内时收窄为该类型，不一致 FAIL `ac-type-conflict`）——`defaultRequiredTypes` 的缺失类型检查按覆盖集判定，声明 format 的 AC 可不带显式 type（标签/模板即类型来源）；v1.9 W4 起可选 `prdRef`——`file` 走结构化引用核验（存在性+防逃逸，缺失 FAIL 指名、逃逸 ERROR），`section` 为记录性文本不核验；门禁选项 `defaultRequiredTypes` 声明后，未自带 `requiredTypes` 的需求按默认集判定缺失类型。

**catalog.json**（ontology local-catalog）：`{id, version, concepts[{iri, label, altLabels?, subClassOf?, disjointWith?, relations?}]}`；`altLabels`/`subClassOf`/`disjointWith` 均为可选非空唯一字符串数组，`relations` 为可选 `[{predicate, to}]`（≤50，谓词建议 IRI，目标须在目录内）；`subClassOf` 目标必须存在于目录且无环，且不得与 `disjointWith` 推理闭包矛盾（互斥沿继承传播；违规/矛盾即 ERROR fail-closed）。provider 证据含 `catalogSha256`（文件内容摘要）。

**ontology-proposals.json**（提案登记，`qgate.mjs proposals <项目根> [文件]` 审计）：`{schemaVersion: "0.1", proposals[{id, symbol, candidateIri, confidence: 0..1, source, status: proposed|accepted|rejected, note?}]}`。提案-确认-pin 工作流：LLM/匹配工具只产出 `proposed` 提案；人工 `accepted` 后必须把对应 `{symbol, expectedIri}` 写进 semantic-alignment `mappings`，否则审计报 `accepted-not-pinned` 漂移（退出码 1）。**门禁不读取该文件，confidence 不构成证据**——semantic-alignment 始终只核对 pinned 声明。

## L0 范围、需求与生成完整性

### assumptions
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 假设登记文件 |
| `requireProvenance` | bool，默认 false | 强制六字段（source/evidence/impact/risk/resolution）非空 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Assumptions are closed"}],
  // 在关联门禁之后评估，引用的是同次运行证据
  "gates": [{"id": "asm", "kind": "assumptions", "level": "L0", "enabled": true, "stages": ["close"], "claimId": "CL-1", "file": "assumptions.json", "requireProvenance": true}],
  "risks": [], "exceptions": []
}
```

### decisions
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 决策登记文件 |
| `allowDeferred` | bool，默认 false | 仅 L0 有效；允许 deferred 状态（L5 恒不允许） |
| `requireProvenance` | bool，默认 false | 开启后每条决策的 `evidence` 必须是结构化引用（`{file}` 存在性核验/`{gateId}` 同次 PASS），纯文本不再放行（该项 FAIL 指名） |
| `requireAdrRefs` | bool，可选（v1.19） | 决策条目可选 `adrRef:{file}` 绑定 ADR 文档（声明即核验：存在+防逃逸+frontmatter 解析——平面 YAML 子集，已知键 `status/date/deciders/supersedes/superseded-by`，畸形/未知键/缺 status 均 ERROR fail-closed）；状态映射对账 open↔proposed、resolved↔accepted、deferred↔deferred（ADR status 接受 proposed/accepted/deferred/deprecated/superseded；L5 仍不允许 deferred），不符 FAIL `adr-status-mismatch`；supersedes/superseded-by 引用须存在（`adr-chain-missing`）且按文件基名互指（`adr-chain-mismatch`）；开启本项后无 adrRef 的决策 FAIL `adr-ref-required` |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Design decisions are closed"}],
  // deferred 决策须带 revisitBy 期限；requireProvenance 下 evidence 必须结构化
  "gates": [{"id": "dec", "kind": "decisions", "level": "L0", "enabled": true, "stages": ["close"], "claimId": "CL-1", "file": "decisions.json", "allowDeferred": true, "requireProvenance": true}],
  "risks": [], "exceptions": []
}
```

### change-scope
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 指向上表 scope.json（含 v1.17 起的 `taskIntent`/`requireTaskIntent` 漂移对账键与 task-intent.json 登记协议，见数据登记文件一节） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Actual changes match the requested scope"}],
  "gates": [{"id": "scope", "kind": "change-scope", "level": "L0", "enabled": true, "stages": ["close"], "claimId": "CL-1", "file": "scope.json"}],
  "risks": [], "exceptions": []
}
```

### convention-alignment
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 指向上表 conventions.json（约定登记：banned-words 内建规则族+argv 规则） |

纯内核扫描型（L0）：仓库自声明的约定条目 ↔ 制品对账——与 engineering convention 子检查的差别在判定语义（前者原生对账自声明约定，后者为生态工具执行协议），二者并存不冲突。正例见 `examples/convention-align-demo`（banned-words+argv 双规则+映射记法豁免）。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Declared repo conventions hold in the scanned artifacts"}],
  "gates": [{"id": "conventions", "kind": "convention-alignment", "level": "L0", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "file": "conventions.json"}],
  "risks": [], "exceptions": []
}
```

### traceability
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 指向上表 requirements.json |
| `coverage` | `{argv, timeoutMs}`，可选 | 覆盖证据协议：runner 按逐 AC 文件清单回报 `covered`；未覆盖 FAIL；超时计入阶段预算 |
| `requirePrdRefs` | bool，默认 false（v1.9 W4） | 开启后每条需求必须携带 `prdRef`（缺绑定 FAIL"缺少 PRD 绑定"）。证明边界：只核验引用的 PRD 文件存在，不证需求涵盖 PRD 全部内容（后者靠评审） |
| `defaultRequiredTypes` | string[] 1..5 唯一，可选（v1.9 W4） | requiredTypes 默认集（normal/boundary/negative/exception/state-transition）：未自带 requiredTypes 的需求按默认集判定缺失类型；声明后这些需求的 AC 必须携带 type |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Every AC links code and same-run passing tests"}],
  "gates": [{"id": "rtm", "kind": "traceability", "level": "L0", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "file": "requirements.json",
    // 可选：AC↔代码执行覆盖核验；argv/timeoutMs 语义与其他 runner 一致
    "coverage": {"argv": ["$NODE", "scripts/coverage.mjs"], "timeoutMs": 5000},
    // 可选（v1.9 W4）：强制每条需求绑定 PRD 引用；未自带 requiredTypes 的需求按默认集判定
    "requirePrdRefs": true, "defaultRequiredTypes": ["normal", "negative"]}],
  "risks": [], "exceptions": []
}
```

## L1 代码与工程正确性

### command
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `argv` / `timeoutMs` | 见通用 | 退出码 0 才 PASS；stdout/stderr 入证据 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Module parses"}],
  "gates": [{"id": "syntax", "kind": "command", "level": "L1", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "--check", "app.mjs"], "timeoutMs": 5000}],
  "risks": [], "exceptions": []
}
```

### engineering
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `requiredChecks` | string[]，必填 | 参与判定的子检查（其余仅记录） |
| `excludedChecks` | `[{id, reason}]`，可选（v1.9 W2） | 显式排除的子检查（reason 必填）。**每个 check 必须出现在 requiredChecks 或 excludedChecks 之一**，否则配置 ERROR（防白名单静默放行）；同一 id 两者兼有、未知 id、缺 reason 均 ERROR；被排除的 check 仍执行并记录，不参与判定 |
| `checks` | array，必填 | 六类子检查，每项含 `id`、`type`、`argv`、`timeoutMs`；`type` 对应 static=exit、build=artifact、unit=test、mutation=metric、structure/convention=findings |
| `timeoutMs`（门禁级） | 1..60000 | 必须 ≥ 各子检查超时之和；核验制品 SHA256 |
| `requireRawOutput` | bool，默认 false（门禁级，v1.11 B1） | unit 原始证据强制：开启后 unit 观察未声明 `rawOutput` 即 FAIL 指名"缺少原始测试输出"。观察可选 `rawOutput:{format:'tap'\|'junit', file}`——**声明即核验**：内核解析原始测试输出文件（TAP 面向 node --test、JUnit XML 面向 pytest/surefire/gradle）、自行重算 total/passed/failed/skipped 并与自报交叉核验，不符 ERROR fail-closed；核验一致后判定计数即内核重算值，证据记 `rawOutput:{file,format,parser,...,crossCheck:'match'}` 并计入摘要"证据力·信号"（原始输出解析）。畸形声明（未知格式/多余字段）、文件缺失、路径逃逸、原始文件结构矛盾均 ERROR |
| `blockOnSkipped` | bool，默认 false | unit：skipped>0 即 FAIL |
| `minTotal` | int>0，可选 | unit：最小测试数 |
| `expected` | `{f2p?: string[], p2p?: string[]}`，可选 | unit：F2P/P2P 双向测试协议。f2p=新行为用例（当前须 pass 且**基线须 fail**，否则疑似伪修复）；p2p=防回归用例（当前与基线均须 pass）。两集合不得交叠；声明后 runner 须回报逐用例 `cases:[{name,status,baselineStatus}]`（status/baselineStatus ∈ pass/fail/skip），声明名缺失、被跳过、方向不符均 FAIL 并指名 |
| `baselineMode`（check 级） | `any`（默认）/`git`，可选（v1.9 W3；v1.15 起支持内容绑定） | unit 声明 expected 时的基线来源协议，与 behavior 同语义：runner 应回报 `baselineSource:{type,ref?,file?,contentSha256?}`，git 型内核核验 ref、可选 file+contentSha256 内容绑定（`git show` 内容比对，不符 ERROR，核验一致计"基线内容核验"证据信号），embedded 放行但摘要降级；`git` 模式下 embedded/缺失即该 check FAIL。正例见 `examples/engineering-demo`（`QGATE_BASELINE_REF` 指定基线 ref 双次运行） |
| `requireBaselineRawOutput` | bool，默认 false（门禁级，v1.15；须所有 test 检查声明 expected） | 基线原始证据强制：unit 观察可选 `baselineRawOutput:{format:'tap'\|'junit', file}`——**声明即核验**：内核解析基线实现的原始测试输出文件、逐用例重算基线状态（pass/fail/skip）与自报 `cases[].baselineStatus` 交叉核验，不符/用例缺失/基线输出内重名均 ERROR fail-closed；核验一致后 F2P/P2P 方向审计的基线侧取内核重算值，证据记 `baselineRawOutput:{...,crossCheck:'match'}` 并计入证据力信号"原始输出解析"。`true` 下缺声明 FAIL 指名"缺少基线原始输出"；显式 `false` 保留旧语义 |
| `minCoverageRatio` | 0<r≤1，可选 | unit：最低覆盖率阈值。runner 观察可选回报 `coverage:{tool, ratio}`（ratio 0..1；另带 `total`/`covered` 整数计数时内核交叉核验比值，不一致 ERROR）。声明阈值而观察缺 coverage → ERROR（fail-closed）；ratio<阈值 → FAIL 并给出差距；阈值未声明时缺 coverage 不阻断（旧输出兼容） |
| `min` | 0..1，mutation 必填 | 变异分数阈值 |
| `maxFindings` | int≥0，findings 必填 | 违规总数上限 |
| `maxBySeverity` | `{low/medium/high: int}`，可选 | 分严重度阈值，与总数上限叠加 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Engineering checks pass"}],
  "gates": [{"id": "eng", "kind": "engineering", "level": "L1", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "timeoutMs": 30000,
    "requiredChecks": ["static", "build", "unit", "mutation", "structure", "convention"],
    "requireRawOutput": true,
    // 可选（v1.15）：unit 观察须声明 baselineRawOutput:{format:'tap'|'junit', file} 指向基线实现的
    // 原始测试输出文件，内核逐用例重算基线状态与自报 baselineStatus 交叉核验（不符 ERROR，
    // F2P/P2P 基线侧判定以内核重算为准）
    "requireBaselineRawOutput": true,
    "checks": [
      {"id": "static", "type": "exit", "argv": ["$NODE", "--check", "calc.mjs"], "timeoutMs": 2000},
      {"id": "build", "type": "artifact", "argv": ["$NODE", "scripts/check.mjs", "build"], "timeoutMs": 3000},
      // skipped>0 即 FAIL，且至少 3 个测试；expected 声明 F2P（新行为，基线须失败）与 P2P（防回归，双版本须通过），
      // runner 须回报 cases 逐用例 {name, status, baselineStatus}，伪修复/回归/跳过均按名 FAIL；
      // minCoverageRatio 强制覆盖率证据：runner 须回报 coverage:{tool, ratio}，缺证据 ERROR、低于阈值 FAIL；
      // requireRawOutput（门禁级）：unit 观察须声明 rawOutput:{format:'tap'|'junit', file} 指向原始测试输出文件，
      // 内核自行解析重算计数并与自报交叉核验（不符 ERROR fail-closed，判定以内核重算值为准），缺声明 FAIL 指名
      {"id": "unit", "type": "test", "argv": ["$NODE", "scripts/check.mjs", "unit"], "timeoutMs": 5000, "blockOnSkipped": true, "minTotal": 3, "minCoverageRatio": 1,
        "expected": {"f2p": ["large amount discount rate"], "p2p": ["normal fee", "zero is invalid", "rounding boundary"]}},
      // score < min 即 FAIL；runner 可报 survivors 存活明细（须与 killed/total 算术一致）
      {"id": "mutation", "type": "metric", "argv": ["$NODE", "scripts/check.mjs", "mutation"], "timeoutMs": 10000, "min": 1},
      // 总数与分严重度阈值叠加：任何 high 违规、超过 5 条 medium 都 FAIL
      {"id": "structure", "type": "findings", "argv": ["$NODE", "scripts/check.mjs", "structure"], "timeoutMs": 3000, "maxFindings": 10, "maxBySeverity": {"high": 0, "medium": 5}},
      {"id": "convention", "type": "findings", "argv": ["$NODE", "scripts/check.mjs", "convention"], "timeoutMs": 3000, "maxFindings": 0, "maxBySeverity": {"low": 0, "medium": 0, "high": 0}}
    ]}],
  "risks": [], "exceptions": []
}
```

### symbol-grounding
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `check` | `changed-files`（默认）/`all`，可选 | 受检文件集：`changed-files`=Git 基准（`baseRef`，同 change-scope 口径：跟踪+未跟踪、`.quality-gate/` 除外——存量问题不拦新账）；`all`=全仓库扫描（不需要 Git） |
| `baseRef` | string，默认 `HEAD`，可选 | `changed-files` 模式的 Git 基准引用 |
| `include` | string[] glob，可选 | 扫描范围限定（默认全部；`node_modules`/`.git`/`.quality-gate` 恒排除）。扫描扩展名固定 `.js/.mjs/.cjs/.ts/.mts/.cts` |
| `apiSurface` | `{file}`，可选 | 绑定 API 存在性声明面登记文件（OD-109 登记 文件，如 `.quality-gate/registries/api-surface.json`）：`openapi`/`openapi-yaml`/`json-schema` 三类声明面（openapi-yaml 需适配器归一 JSON＋mtime 新鲜度哨兵）。绑定即启用端点/配置键对账：调用位端点引用（`fetch('/x')` 与 `axios.<verb>('/x')` 两族路径形字面量；完整 URL 不提取，方法不判——如实边界）×OpenAPI paths 面（`{param}` 段级通配）；`process.env.KEY`/`process.env['KEY']`×schema properties 键面（递归点分键含中间对象键）。对应类型声明面缺席则该类引用只计数不对账。另：命名 import 成员对账**默认启用无需此选项**（目标模块即声明面；`export *`/CJS 目标 opaque 计数豁免），缺成员 FAIL `unresolved-member` |
| `importObservations` | `[{language,file}]`，可选（1..10） | 绑定 Python/Java import 观察文件（参考适配器产出，见 adapters/python、adapters/java）：内核词法提取 py（`import x[, y]`/`from .x import y`，`#` 注释剥离）/java（`import a.b.C;`/`import static`，注释剥离）引用集×适配器回报**双向对账**（OD-111）——提取集无回报 FAIL `observation-coverage-gap`（防瞒报，runner 无权决定引用集）；回报 `unresolved` FAIL 指名；回报多出的条目进审计面不阻断（多报疑点）。绑定对应语言即扩大扫描扩展名（`.py`/`.java`）。java 按需 `.*` 导入不覆盖（如实边界） |

纯内核判定（零 runner、零 argv）：对受检文件做**保守词法提取**（注释剥离+字符串内容掩码的状态机；只认静态字符串说明符——`import`/`export … from`、副作用 `import`、`require()`、动态 `import()` 字面量），每个说明符按**三分类**对账：项目内模块（Node 解析算法子集：相对路径+扩展名补全+index 解析；bare 说明符最后尝试项目根相对解析，覆盖 tsconfig baseUrl 类无别名配置）/ 依赖清单（package.json 四个依赖段，含 `@scope/pkg` 子路径与自引用）/ 内置模块（`node:` 前缀+核心枚举）。三分类均不可解析 → FAIL 指名 `unresolved-import`（文件+行+说明符+尝试路径入证据）。**证明边界**：存在性证明不判语义正确性（类型/版本/废弃由类型检查器承载）；动态说明符（模板字符串、变量拼接）不覆盖，`dynamicFormsTotal` 计数如实入证据；tsconfig `paths` 别名与依赖 `exports` 子路径映射不解析（命中即按根相对兜底报告）。**v1.20 API/符号存在性扩展（轨道 C）**：命名 import 成员对账默认启用（`import {x}` 的 x 对账目标模块词法导出枚举——`export *`/CJS 目标 opaque 豁免计数，缺成员 FAIL `unresolved-member`）；`apiSurface` 绑定后启用端点与配置键对账（缺即 FAIL `unresolved-reference`，endpoint/config-key 指名）。正例见 `examples/symbol-grounding-demo`。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Every static import resolves to a declared face"}],
  "gates": [{"id": "ground-imports", "kind": "symbol-grounding", "level": "L1", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "check": "changed-files", "include": ["src/**"], "apiSurface": {"file": ".quality-gate/registries/api-surface.json"}, "importObservations": [{"language": "python", "file": ".quality-gate/observations/imports-python.json"}]}],
  "risks": [], "exceptions": []
}
```

**api-surface.json（声明面登记文件，v1.20/OD-109）**：`{surfaces:[{id 唯一, type:'openapi'|'openapi-yaml'|'json-schema', file, normalizedFile?（恰 openapi-yaml 必填，mtime 新鲜度哨兵）, source:{file, section?} 溯源必填}]}`（1..50 面，路径防逃逸，畸形 fail-closed）。openapi 面枚举 `paths`×八方法（`$ref`/servers basePath 不展开——面只取显式声明，方向=不虚报）；json-schema 面递归枚举 `properties` 为点分键（含中间对象键；patternProperties/条件组合不展开）。

**import 观察文件（适配器产出，v1.20/OD-111）**：`{schemaVersion:'0.1', language:'python'|'java', tool 溯源字符串, entries:[{module, resolution:'stdlib'|'third-party'|'project'|'unresolved', detail?}]}`——module 为源码字面说明符（python 含相对点前缀原样）；形状/language 与绑定不符 fail-closed ERROR。

## L2 接口、数据与系统一致性

### persistence
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `expectedHttpStatus` | 2xx，必填 | runner 真实调用 API 后回显的状态；`expectedRecordCount` 为 0 时允许非 2xx（拒绝场景） |
| `correlationField` | string，必填 | 关联字段，`expected` 中须为 `"$RUN_ID"` |
| `expected` | object，必填 | 独立回查数据库记录的逐字段预期 |
| `requireSnapshots` | bool，**默认 true**（1.10.0 E3 默认强制） | 强制 before/after 快照并生成字段 delta（仅单记录）；退出须显式 `false`（可见声明）；批量 `expectedRecordCount>1` 必须显式 `false`（与快照互斥，未显式退出即配置 ERROR） |
| `expectedRecordCount` | int ≥0，默认 1 | 0=断言必须不落库；>1=批量：runner 须回 `records` 数组（每条按 `expected` 模板逐字段核对，与 `requireSnapshots` 互斥） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Payments persist exactly once with expected fields"}],
  "gates": [{"id": "pay", "kind": "persistence", "level": "L2", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["python", "runner.py"], "timeoutMs": 10000,
    "expectedHttpStatus": 201, "correlationField": "requestId",
    "expected": {"requestId": "$RUN_ID", "status": "captured", "amount": 1250},
    "requireSnapshots": true,
    // 默认 1；0=必须不落库（配非 2xx）；N=批量写入，runner 回 records 数组逐条核对
    "expectedRecordCount": 1}],
  "risks": [], "exceptions": []
}
```

### ontology-map
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | `{mappings:[{id, iri}]}`；IRI 须存在于所选 provider |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Domain terms resolve in the ontology"}],
  "gates": [{"id": "onto", "kind": "ontology-map", "level": "L2", "enabled": true, "stages": ["close"], "claimId": "CL-1", "file": "mappings.json"}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "fibo-skeleton"}
}
```

### semantic-profile
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | shapes 约束文件 `{shapes[{id, targetClass, closed?, properties[{path, minCount, maxCount, valueType, allowedValues?, pattern?, minLength?, maxLength?, minInclusive?, maxInclusive?, languageIn?}]}]}`。**v1.22 深度匹配**：记录类型是 targetClass 或其后代（subClassOf 链）即套用该 shape——真子类套用入 `deepMatches` 证据。新组件 `pattern`（合法正则）/`minLength`/`maxLength`/`minInclusive`/`maxInclusive`/`languageIn`（语言标签数组）/`closed`（形状级，未声明属性即违规）**全部内核原生判定**（v1.22.1 起 OD-116——默认零外部依赖，无需引擎即可用） |
| `dataFile` | string，必填 | 记录样本 `{records[{id, typeIri, properties}]}`；属性值可为 `{value, lang}` 语言标签条目（与 `languageIn` 配套，原生判定按其载荷） |
| `shacl` | `{argv, timeoutMs}`，可选（v1.22；v1.22.1 起为环境就绪时的可选第二实现） | 外接 SHACL 引擎（OD-114=B runner 协议；OD-116 后默认不接也完整可用——组件全集已内核原生）：统一观察协议 stdin 交付形状/记录/子类边（子类边→rdfs:subClassOf 三元组，引擎原生深度匹配），引擎回报 `findings`＋`conformance`——内核核验（runId 失配/未知记录/未知组件/自报矛盾均 ERROR fail-closed，不采信自报放行）并与原生判定**并集**（任一侧发现违规即 FAIL）。参考适配器 `adapters/shacl/pyshacl_runner.py`（真引擎 pyshacl；缺依赖给 pip 安装指引，不装不影响默认判定） |

组件注册表与 W3C SHACL Core 对齐（`minCount`/`maxCount`/`allowedValues`/`pattern`/`minLength`/`maxLength`/`minInclusive`/`maxInclusive`/`languageIn`/`closed` 十组组件）；组件全集内核零依赖原生判定（v1.22.1 起）并在逐条 violation 标注 `shacl` 字段（`valueType`→`sh:datatype`：string→`xsd:string`、number→`xsd:decimal`、boolean→`xsd:boolean`；object 仅近似 `sh:nodeKind`）；七组新组件的完整 SHACL 语义由外接引擎承载（pyshacl）——内核翻译 JSON 声明（不含 SPARQL 约束/路径表达式/sh:node 递归），object 型 valueType 在 RDF 图中无对应（近似 nodeKind，与内核同口径）。正例：`examples/semantic-profile-demo`（深度匹配原生腿）；`examples/shacl-engine-demo`（8 组件全声明＋closed＋引擎接线，无 pyshacl 环境 skip 带指引）。

单边 `minLength`/`maxLength` 各自必须为 0..1000 整数，单边 `minInclusive`/`maxInclusive` 各自必须为有限数值；双边另检查顺序。字符串长度为 Unicode 码点数。引擎组件注册表接受 DatatypeConstraintComponent/NodeKindConstraintComponent 的标准违规，作为 FAIL 证据。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Sample records satisfy declared shapes"}],
  "gates": [{"id": "profile", "kind": "semantic-profile", "level": "L2", "enabled": true, "stages": ["close"], "claimId": "CL-1", "file": "profile.json", "dataFile": "records.json"}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "fibo-skeleton"}
}
```

### alignment
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `scope` | `"api"` / `"schema"` / `"contract-diff"`，必填 | api/schema：与 runner 观察对比的声明契约；contract-diff：契约兼容阻断（`file` 为当前契约 `{fields}`，runner 须 diff 基线并回报 `breaking:[{path,rule}]`+`checked:true`，未执行即 ERROR、breaking 非空即 FAIL 指名；加可选字段兼容、删字段/改类型阻断） |
| `compatibilityLevel` | backward/forward/full，contract-diff 必填 | 声明兼容方向并传给 runner；方向语义由 runner 按声明判定，内核只消费结构化结论 |
| `file` | string，必填 | 预期契约文件 `{kind, items}` |
| `ignorePaths` | string[]，可选 | JSON Pointer 模式（`*` 匹配一段，如 `/items/*/serverTime`）；命中的差异跳过并计入证据 `ignoredDifferences`，未声明的差异照常 FAIL |
| `requireLive` | bool，默认 false（v1.9 W3） | 观察模式声明：runner 观察可回报 `mode: live\|static`（static=未发真实请求/未连真实存储，仅静态读取）。static 默认放行但摘要**降级标注**（观察为静态读取）；`requireLive:true` 下 static 即 FAIL 指名；畸形 mode 值 ERROR |
| `requireSourceFingerprint` | bool，默认 false（v1.9.1） | 观察端来源指纹：观察可回报 `sourceFingerprint:{file, sha256}`——**声明即核验**（存在性+防逃逸+与磁盘文件哈希比对，不符 FAIL 指名，畸形/逃逸 ERROR），把观察绑定到具体项目制品；开启后未声明即 FAIL。适用于文件型观察面（如迁移后 schema 快照）；live HTTP 面走 mode+requireLive，附指纹（如服务实现文件哈希）同样有效 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Deployed API matches the declared contract"}],
  "gates": [{"id": "api", "kind": "alignment", "level": "L2", "enabled": true, "stages": ["close"], "claimId": "CL-1", "scope": "api", "file": "api.expected.json", "argv": ["$NODE", "api-observe.mjs"], "timeoutMs": 5000,
    // 易变字段（时间戳/请求ID）在此显式豁免；豁免记录进证据，不放行未声明的漂移
    "ignorePaths": ["/items/*/serverTime"]}],
  "risks": [], "exceptions": []
}
```

### consumer-matrix
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `consumers` | `[{id, expectedFile, compatibilityLevel?}]`，必填（1..20，id 唯一） | 消费者声明层：每个消费者声明期望文件（`{schemaVersion:'0.1', kind:'consumer-matrix', consumer:<须与 id 绑定>, items:[{path, method, fields?:{字段:类型}}]}`，path 以 `/` 起、类型词汇为项目自有字符串，内核比较相等性）。runner 观察 provider 当前契约（items 同形状），内核逐消费者比对产出兼容矩阵与破坏归因表（attribution：provider 项 → 被破坏消费者列表，回答"一次变更破坏了谁"） |
| `compatibilityLevel`（consumer 级） | `backward`（默认）/`exact` | backward：期望端点/字段须存在且类型相等（provider 新增自由）；exact：另将期望端点上的多出字段计 `unexpectedField`（不容忍加字段的消费者） |
| `ignoreRoutes` | string[]，可选（1..50，`/` 起路由模式，`*` 通配一段） | 只豁免声明的路由模式（如 `/internal/*`）；被忽略项留在证据 `ignoredBreaking`，不放行未声明的漂移 |
| `consumerUsage`（观察字段，非配置） | 可选观察 | 分层来源协议观察层：runner 可回报逐消费者使用面 `[{consumer, usage: scanned\|contract-test\|declared, items:[{path,method,field?}]}]`——使用面超出该消费者声明期望即 FAIL"使用面超出声明期望"（期望过期不可静默）；`declared` 来源无扫描/契约测试佐证，摘要降级标注（W3 模式）；contract-test=消费者契约测试产物（最强来源） |
| `requireLive` / `requireSourceFingerprint` | bool，可选（同 alignment） | 观察可信度：static 观察（mode 声明）默认放行但降级标注，requireLive 下 FAIL；观察可选 `sourceFingerprint:{file,sha256}` 声明即核验（不符 FAIL、强制缺声明 FAIL） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "API-1", "statement": "provider 契约满足全部声明消费者"}],
  "gates": [{"id": "api-matrix", "kind": "consumer-matrix", "level": "L2", "enabled": true, "stages": ["close", "release"], "claimId": "API-1", "timeoutMs": 8000,
    "argv": ["$NODE", "scripts/observe.mjs"],
    // 逐消费者期望文件（声明层）；runner 回报 provider 当前 items + 可选 consumerUsage（观察层：
    // usage 来源 scanned|contract-test|declared，declared 降级、越界使用 FAIL）
    "consumers": [
      {"id": "orders-web", "expectedFile": "consumers/orders-web.json", "compatibilityLevel": "backward"},
      {"id": "settlement-batch", "expectedFile": "consumers/settlement-batch.json"}
    ],
    "ignoreRoutes": ["/internal/*"]}],
  "risks": [], "exceptions": []
}
```

### invariant
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `assertions` | 1..50，必填 | `{id, left, operator: eq/neq/le/lt/ge/gt, right | value, when}`；operand 由 runner 观察提供。`when` 条件支持 `{field, equals/notEquals/in}`，数组表示 AND 组合；条件不满足时该断言 SKIP |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Ledger balances hold after every operation"}],
  "gates": [{"id": "inv", "kind": "invariant", "level": "L2", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["python", "runner.py"], "timeoutMs": 10000,
    "assertions": [
      {"id": "totals-match", "left": "paymentsTotal", "operator": "eq", "right": "ledgerTotal"},
      // neq/lt/gt 与 le/ge 同语义；数值操作符要求双方为有限数
      {"id": "refund-strictly-below", "left": "refund", "operator": "lt", "right": "captured"},
      {"id": "status-not-failed", "left": "status", "operator": "neq", "value": "FAILED"},
      // 条件断言：in 列表 / notEquals / 数组 AND
      {"id": "credit-positive", "when": {"field": "status", "in": ["posted", "pending"]}, "left": "credit", "operator": "gt", "value": 0},
      {"id": "active-balanced", "when": [{"field": "status", "notEquals": "FAILED"}, {"field": "mode", "in": ["live"]}], "left": "debit", "operator": "ge", "right": "credit"}
    ]}],
  "risks": [], "exceptions": []
}
```

### consistency
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `checks` | 1..6，必填 | 五类支付一致性子检查，每项含 `id`、`type`、`argv`、`timeoutMs`（1..20000） |
| `requiredChecks` | string[]，必填 | 参与判定的子检查（其余仅记录）；门禁级 `timeoutMs` 1..60000 须覆盖各子检查之和 |
| `excludedChecks` | `[{id, reason}]`，可选（v1.9 W2） | 与 engineering 同语义：每个 check 须 required 或显式 excluded（reason 必填），否则配置 ERROR；被排除的 check 仍执行并记录，不参与判定 |
| `requirePreCommitCheck` | true，zero-sum 可选 | 要求 runner 回报 `preCommitValidated:true`（写前零和校验已执行）；如实回报 false 即 FAIL |
| `acceptedSourceTypes` | string[] 1..4 唯一，append-only 可选（v1.9 W3） | 观察来源枚举：append-only runner **必须**回报 `sourceType: binlog\|wal\|audit-log\|declared`（缺失/未知枚举 ERROR）。默认全收；`declared`（runner 自报、无外部日志佐证）放行但摘要降级标注；不在接受列表即该 check FAIL 指名 |
| `pairs` / `breakSlaHours` | reconciliation 必填/可选 | `pairs:[{id}]` 1..20；runner 回报每对 `compared/matched/diffs[{key,ageHours}]`，差异按账龄分桶 p0(<24h)/p1(<72h)/p2，超过 SLA 标注 `slaBreached` |
| `maxReceiveCount` / `requireDrill` | dlq 必填 / 可选 | 队列观察须满足 `dlqRetentionSec>=sourceRetentionSec`（违者=静默丢数据）且重投上限不超配置；requireDrill 时毒消息演练须 `landedInDlq+mainQueueRecovered+alertFired` 全真 |
| `stateChangingOperations` / `minRetentionDays` | audit-chain 必填 / 可选 | 关键操作须全部有审计事件（缺失即 FAIL 指名）；**hash 链由内核按 `sha256(prev:seq:actor:action)` 重算验证**，伪造/断裂即 FAIL；留存天数不足即 FAIL |

金额为最小货币单位的正安全整数（1..9007199254740991）；超界或畸形观察即 ERROR。零和累计使用精确整数算术；输出差额 `balance` 在安全范围内为 number，超界为十进制字符串，避免总和舍入。正例见 `examples/ledger-demo`（零和+append-only+对账+DLQ+审计链，负例经 `QGATE_SCENARIO` 注入）。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Payment ledger invariants hold"}],
  "gates": [{"id": "ledger", "kind": "consistency", "level": "L2", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "timeoutMs": 10000,
    "requiredChecks": ["orders", "mutations", "reconciliation", "dlq", "audit"],
    "checks": [
      {"id": "orders", "type": "zero-sum", "argv": ["$NODE", "check.mjs"], "timeoutMs": 2000, "requirePreCommitCheck": true},
      {"id": "mutations", "type": "append-only", "argv": ["$NODE", "check.mjs"], "timeoutMs": 2000},
      {"id": "reconciliation", "type": "reconciliation", "argv": ["$NODE", "check.mjs"], "timeoutMs": 2000, "pairs": [{"id": "ledger-vs-bank"}], "breakSlaHours": 72},
      {"id": "dlq", "type": "dlq", "argv": ["$NODE", "check.mjs"], "timeoutMs": 2000, "maxReceiveCount": 3, "requireDrill": true},
      {"id": "audit", "type": "audit-chain", "argv": ["$NODE", "check.mjs"], "timeoutMs": 2000, "stateChangingOperations": ["appendMoneyOrder"], "minRetentionDays": 365}
    ]}],
  "risks": [], "exceptions": []
}
```

## L3 功能与业务语义正确性

### behavior
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `cases` | 1..20，必填 | `{id, input, expected}`；runner 回报 `actual` 逐例深比较 |
| `ignorePaths` | string[]，可选 | 作用于每例 expected/actual 比较的 JSON Pointer 豁免；失败案例的差异明细始终进入证据 |
| `expected` | `{f2p?: string[], p2p?: string[]}`，可选 | F2P/P2P 双向协议，值为**用例 id**（必须存在于 cases）。声明后 runner 须为相关用例回报 `baselineActual`（基线实现的实际值），通过与失败由内核按同一期望判定：f2p=新行为（当前须 PASS 且基线须 FAIL，否则疑似伪修复）；p2p=防回归（双版本均须 PASS）。基线值缺失、方向不符均 FAIL 并指名用例 |
| `baselineMode` | `any`（默认）/`git`，可选（v1.9 W3；v1.15 起支持内容绑定） | 基线来源协议：声明 expected 时 runner 应回报 `baselineSource:{type: git-commit\|embedded, ref?, file?, contentSha256?}`——git 型内核在项目根 `git rev-parse --verify <ref>^{commit}` 核验 ref 真实存在（捏造/非仓库即 ERROR）；embedded 型放行但摘要**降级标注**（基线为内嵌实现，非真实历史）。`git` 模式下 embedded/缺失即 FAIL 指名；F2P/P2P 方向审计语义不变，仅加固基线证据来源。**内容绑定（v1.15，可选升级路径）**：git 型可加 `file`+`contentSha256`（必须成对；sha 为 runner 实际取用基线内容的 64 位十六进制 sha256）——内核 `git show <ref>:<file>` 取该 ref 树中的真实内容内容比对，不符或路径不在 ref 树中即 ERROR；核验一致记 `contentVerified` 并计入证据力信号"基线内容核验"。正例见 `examples/behavior-demo`（git 真基线优先、无历史时如实回退 embedded） |
| `requireRawTranscript` | `false`（默认），可选（v1.13 T2） | 原始用例观察记录强制：观察可选 `rawTranscript:{format:"qgate-transcript", file}`——runner 把当次逐用例观察原样落盘（`{schemaVersion:"0.1", kind:"behavior", runId, baseline?, cases:[{id, actual, baselineActual?}]}`，runId 必须是当次运行的），内核解析后与自报逐例交叉核验，不符 ERROR 指名逐项分歧（含 baselineActual 出现与否），核验一致后判定以观察记录为准并计入证据力信号"原始输出解析"；旧观察记录因 runId 失配不可重放。`true` 下缺声明 FAIL 指名"缺少原始用例观察记录"；显式 `false` 保留旧语义。边界：不防蓄意伪造两份一致的记录。正例见 `examples/behavior-demo` |
| `requireBaselineTranscript` | `false`（默认），可选（v1.15，须声明 expected） | 基线观察记录强制：观察记录顶层可承载 `baseline` 块（与观察 `baselineSource` 同形同值——git 型含 `ref`，可选 `file`+`contentSha256` 内容绑定；embedded 型仅 type）。观察记录声明 baseline 时内核核验**两源一致**（观察记录 ↔ 观察不符、观察缺失均 ERROR 指名），内容哈希经 `git show` 内容比对（不符 ERROR）。`true` 下观察记录未承载 baseline 块（或未声明观察记录）即 FAIL 指名"缺少基线观察记录声明"；显式 `false` 保留旧语义。与 `requireRawTranscript` 正交（后者强制观察记录本身，前者强制其中的基线声明） |
| `replayBaseline` | `{file, contentSha256}`，可选（v1.21 轨道 D） | 回放资产：以某次归档观察记录为期望基线（qgate-transcript 格式，含其自身旧 runId——归档即录制）。当次执行逐用例对照基线 `actual`（易变字段走既有 `ignorePaths`；对照面不含 runId/基线块等包络）：值差异 `replay-drift` 指名路径、基线缺用例 `replay-missing`、当次多出 `replay-extra`。`contentSha256` 内容绑定＝基线被改动而配置未同步即 FAIL `replay-baseline-modified`，换基线须显式重 pin（改文件＋改哈希）。当次无观察记录时以自报数据对照（容忍自报，弱一档——报告 `replay.source:"self-reported"` 如实呈现）。行为回归对照，非性能/时序回放。正例见 `examples/replay-baseline-demo` |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Business rules produce expected outputs"}],
  "gates": [{"id": "behavior", "kind": "behavior", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000, "ignorePaths": ["/evaluatedAt"],
    "cases": [{"id": "normal-fee", "input": {"amount": 100}, "expected": 2}, {"id": "eur-fee", "input": {"amount": 100, "currency": "EUR"}, "expected": 2}],
    // f2p：eur 在基线（仅 USD）上失败、当前通过；p2p：normal 双版本都须通过
    "expected": {"f2p": ["eur-fee"], "p2p": ["normal-fee"]},
    // 可选：要求 runner 落盘当次逐用例观察记录并在观察中声明 rawTranscript（内核交叉核验）
    "requireRawTranscript": true,
    // 可选：要求观察记录承载 baseline 块并与观察 baselineSource 同形同值（两源一致核验；
    // git 型含 ref，file+contentSha256 内容绑定经内核 git show 内容比对）
    "requireBaselineTranscript": true,
    // 可选（v1.21）：归档观察记录为回放基线——当次逐用例对照，差异即行为漂移；
    // 换基线须显式重 pin（文件与哈希成对更新）
    "replayBaseline": {"file": "baseline/behavior-baseline.transcript.json", "contentSha256": "6b2f14a16456650955a7aafb912aabcd86fd85990eab27598a6026f09ff9e417"}}],
  "risks": [], "exceptions": []
}
```

### journey
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `scenarios` | 1..20，必填 | `{id, level: smoke/integration/e2e, input?, expectedSteps[{id, expected}]}` |
| `ignorePaths` | string[]，可选 | 作用于每步 expected/actual 比较的 JSON Pointer 豁免（`*` 匹配一段，如 `/serverTime`）；失败步骤的差异明细始终进入证据 |
| `requireRawTranscript` | `false`（默认），可选（v1.13 T3） | 原始旅程观察记录强制（与 behavior 同构）：观察可选 `rawTranscript:{format:"qgate-transcript", file}`——runner 把当次逐场景逐步骤观察原样落盘（`{schemaVersion:"0.1", kind:"journey", runId, source, scenarios:[{id, steps:[{id, actual}]}]}`，runId 绑定当次运行），内核解析后与自报逐步骤交叉核验（source 一并核验），不符 ERROR 指名逐项分歧，核验一致后判定以观察记录为准并计入证据力信号"原始输出解析"。`true` 下缺声明 FAIL 指名"缺少原始旅程观察记录"；显式 `false` 保留旧语义。正例见 `examples/journey-demo` |
| `replayBaseline` | `{file, contentSha256}`，可选（v1.21 轨道 D） | 回放资产（与 behavior 同构，journey 多一层**步骤序**对照）：以某次归档旅程观察记录为期望基线。当次执行对照——步骤序漂移 `replay-sequence-drift`（旅程步骤按 id 匹配不判序，回放对照补上序）、逐步骤 `actual` 值差异 `replay-drift` 指名路径、基线缺场景/步骤 `replay-missing`、当次多出 `replay-extra`；`contentSha256` 内容绑定＝不符即 `replay-baseline-modified`（换基线须显式重 pin）；当次无观察记录时以自报数据对照（`replay.source:"self-reported"` 如实呈现）。正例见 `examples/replay-baseline-demo`（含漂移/乱序/掉步/改基线/自报五类故障注入） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "End-to-end journey behaves as specified"}],
  "gates": [{"id": "e2e", "kind": "journey", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 8000,
    // 步骤响应中的易变字段在此显式豁免
    "ignorePaths": ["/serverTime"],
    // 可选：要求 runner 落盘当次逐场景逐步骤观察记录并在观察中声明 rawTranscript（内核交叉核验）
    "requireRawTranscript": true,
    // 可选（v1.21）：归档旅程观察记录为回放基线——步骤序+关键字段对照，差异即行为漂移
    "replayBaseline": {"file": "baseline/journey-baseline.transcript.json", "contentSha256": "6b2f14a16456650955a7aafb912aabcd86fd85990eab27598a6026f09ff9e417"},
    "scenarios": [{"id": "checkout", "level": "e2e", "input": {"amount": 100},
      "expectedSteps": [{"id": "create", "expected": "created"}, {"id": "pay", "expected": "captured"}, {"id": "read", "expected": "paid"}]}]}],
  "risks": [], "exceptions": []
}
```

### visual
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `baselineFile` | string，必填 | 基线制品；runner 产出 actualFile 后默认做严格字节比较 |
| `maxDiffPixels` / `maxDiffRatio` | int ≥0 / 0..1，可选 | 配置任一即切换像素容差模式：runner 须回报 `diff: {pixels, totalPixels}`，超过阈值才 FAIL（字节一致恒 PASS）；两侧 SHA 与度量均入证据。基线变更保护：把基线文件列入 change-scope 的 `protectedPaths` 即可实现"改基线须显式确认" |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Rendered UI matches the approved baseline"}],
  "gates": [{"id": "ui", "kind": "visual", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "baselineFile": "baseline.svg", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000,
    // 可选像素容差：不配则严格字节比较
    "maxDiffPixels": 10, "maxDiffRatio": 0.01}],
  "risks": [], "exceptions": []
}
```

### property
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `seed` / `minCases` | int，必填 | 固定种子与最少案例数（1..500），保证可复现 |
| `assertions` | 1..20，必填 | `{id, left, operator: eq/neq/le/lt/ge/gt, right | value, when}`，与 invariant 同一语义（`when` 支持 in/notEquals/AND，条件不满足即 SKIP） |
| `allowedTransitions` | 1..50，必填 | `{from, to}` 状态机白名单 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Refund never exceeds capture across generated cases"}],
  "gates": [{"id": "pay-props", "kind": "property", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 10000,
    "seed": 42, "minCases": 100,
    "assertions": [
      {"id": "refund-le-capture", "left": "refund", "right": "capture", "operator": "le"},
      // 与 invariant 一致的操作符与条件形式
      {"id": "positive-authorization", "left": "authorized", "operator": "gt", "value": 0},
      {"id": "when-captured", "when": {"field": "status", "in": ["settled", "captured"]}, "left": "refund", "operator": "lt", "right": "capture"}
    ],
    "allowedTransitions": [{"from": "CREATED", "to": "AUTHORIZED"}, {"from": "AUTHORIZED", "to": "CAPTURED"}]}],
  "risks": [], "exceptions": []
}
```

### semantic-alignment
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `mappings` | 1..100，必填 | `{symbol, expectedIri}`；runner 从代码读取符号实际 IRI 后与 provider 核对 |
| `requireRuntimeOrigin` | bool，默认 false（v1.9 W5） | 运行时来源协议：观察 mapping 可带 `origin: annotation\|runtime`（annotation=静态读取注解，缺省同；runtime=执行符号所在用例后回报的运行时绑定）。开启后每个映射符号须至少有一条 runtime 来源候选且与 expectedIri 一致，否则 FAIL 指名 `runtime-unbound`（注解≠运行时行为）。证明边界：核验运行时绑定与声明一致，非完整行为语义验证。正例见 `examples/semantic-alignment-demo`（注解+运行时双来源） |
| `matchMode` | `strict` / `subsumed`，默认 `strict` | `strict` 候选 IRI 必须与声明完全一致；`subsumed` 另允许候选为声明概念经目录 `subClassOf` 传递闭包的子类，包含链（BFS 最短路径）入证据。互斥对检测两种模式下均执行。仅 RDFS 子集闭包，非 OWL 推理 |
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 映射确认所依据的本体指纹（语义同 change-scope `acknowledgedBase`）：目录升级/替换后与 provider 实际指纹不符即 `staleOntologyAck` FAIL，须人工重审映射并更新确认。升级评审可用 `plugins/quality-gate/scripts/ontology_diff.py <旧目录> <新目录>` 分类加法/破坏性变更 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Code symbols align with ontology concepts"}],
  "gates": [{"id": "sem", "kind": "semantic-alignment", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000, "matchMode": "subsumed",
    "mappings": [{"symbol": "PaymentObligation", "expectedIri": "https://spec.edmcouncil.org/fibo/ontology/MASTER/2026Q1/FND/Agreements/Agreements/PaymentObligation"}]}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "fibo-skeleton"}
}
```

### terminology
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `terms` | 0..100 `{term, lang?}`，可选 | 项目业务术语表；逐条按 label/altLabels 精确解析，零命中 `unmatchedTerm`、多命中 `ambiguousTerm`。**v1.22 多语言**：术语可选 `lang`（BCP47 子集）——严格同语言匹配（只命中同语言已标注条目）；不带 `lang` 跨语言匹配，重名即歧义如实暴露。目录 altLabels 条目可为 `{value, lang}`（纯字符串＝语言未定，旧目录零改动兼容）；S14 唯一性按 (语言, 值) 分域——跨语言同形词合法。缺省时仅检查目录完整性，目录违规即 `duplicateLabel`。全部规则为 FAIL |
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 术语确认所依据的本体指纹；与 provider 实际指纹不符即 `staleOntologyAck` FAIL，须重审术语并更新确认（语义同上） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Business terms resolve unambiguously in the ontology"}],
  "gates": [{"id": "terms", "kind": "terminology", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1",
    "terms": [{"term": "agreement"}, {"term": "commitment"}]}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

### semantic-relation
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `relations` | 1..100 `{from, predicate, to}`，必填，唯一 | 期望关系三元组。**v1.23 推理深化满足判定**：被观察满足当且仅当——直接/子属性（Q⊑*P，经目录 `properties` 层级闭包）/逆属性（观察 Q(b,a) 且互逆）/传递链（P 或祖先 transitive，观察链可达，链上边记已覆盖）；本体认可＝from 概念声明更强属性（D⊒P）或 to 概念互逆反向声明；推断满足入 `inferred`（via/trail）。目录概念可声明 `equivalentClass`/`unionOf`，顶层 `properties:[{predicate, subPropertyOf?, inverseOf?, transitive?}]`（subPropertyOf DAG、逆属性单边即双向、建时矛盾 fail-closed）。正例 `examples/owl-reasoning-demo` |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Code-level concept relations match the ontology"}],
  "gates": [{"id": "rel", "kind": "semantic-relation", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000,
    "relations": [{"from": "urn:demo:Contract", "predicate": "hasParty", "to": "urn:demo:ContractParty"}]}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

### semantic-constraint
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `concept` | string，必填 | 目标概念 IRI；其目录 `constraints` 声明（`[{id, left, operator, right|value, when?}]`，≤20，与 invariant/property 同一断言语义）即被检约束集 |
| `minCases` | 1..500，默认 1 | runner 至少须提供的观察案例数 |
| `constraintIds` | 0..20 id，可选 | 只检查概念约束的指定子集（未知 id 即 ERROR） |
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 同其他本体门禁的指纹确认 |

runner 协议：stdin `{schemaVersion, runId, minCases}`，stdout `{schemaVersion, runId, source, cases[{id, values}]}`；案例值来自真实代码/系统观察。缺失操作数、未知概念/约束、概念无约束均 ERROR fail-closed；约束不满足即 FAIL 并输出反例。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Observed behaviour satisfies ontology-declared constraints"}],
  "gates": [{"id": "constraint", "kind": "semantic-constraint", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000, "concept": "urn:demo:PaymentObligation", "minCases": 5}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

### semantic-state
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `concept` | string，必填 | 目标概念 IRI；其目录 `lifecycle` 声明 `{states[≤20], transitions[{from,to}][≤50]}` 即被检状态机 |
| `minCases` | 1..500，默认 1 | runner 至少须提供的观察实例数 |
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 同其他本体门禁的指纹确认 |

runner 协议：stdin `{schemaVersion, runId, minCases}`，stdout `{schemaVersion, runId, source, cases[{id, transitions[{from,to}]}]}`。观察到未声明状态 `unknownState`、未声明转换 `illegalTransition` 均 FAIL；未知概念、概念无 lifecycle 声明均 ERROR fail-closed。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Observed instance state transitions conform to the ontology lifecycle"}],
  "gates": [{"id": "state", "kind": "semantic-state", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000, "concept": "urn:demo:Contract", "minCases": 3}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

### semantic-instance
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `dataFile` | string，必填 | 实例样本 `{records[{id, entityId?, typeIri}]}`（1..100，record id 唯一） |
| `entityTypes` | 0..100 `{entityId, typeIri}`，可选 | 声明关键实体的期望类型；实体缺观察 `missingEntity`、观察类型不都在期望概念之下（等于或其子类，`typeMismatch`）均 FAIL |
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 同其他本体门禁的指纹确认 |

原生门禁（无 runner，纯内建判定）：记录类型未解析 `unknownConcept` FAIL；同一实体多类型时按目录推理闭包判定——互斥（`disjointInstances`，含沿继承传播的推断互斥）或不可比较（`ambiguousInstanceType`）均 FAIL，仅在包含链上的多类型（特化 typing）视为一致。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Data instances align with the ontology typing"}],
  "gates": [{"id": "instances", "kind": "semantic-instance", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "dataFile": "records.json",
    "entityTypes": [{"entityId": "contract-1", "typeIri": "urn:demo:Contract"}]}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

### semantic-exposure
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 同其他本体门禁的指纹确认 |

目录概念用 `exposure: "public"|"internal"` 声明暴露策略（目录无任何 exposure 声明即 ERROR fail-closed）。runner 协议：stdin `{schemaVersion, runId}`，stdout `{schemaVersion, runId, source, exposed[{iri, location}]}`——runner 的 `source` 说明公共面判定依据（如"api 模块导出符号"）。内部概念出现在公共面 `internalConceptExposed`、未解析概念 `unknownExposedConcept` 均 FAIL。公共面的定义是项目 runner 的观察，不是内核自行判定的安全边界。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Internal concepts are not exposed on the public surface"}],
  "gates": [{"id": "exposure", "kind": "semantic-exposure", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

### semantic-consistency
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `reasoner` | `{argv, timeoutMs≤20000}`，可选 | 外部 reasoner 增强（双实现一致性核对协议） |
| `acknowledgedOntology` | `{id, version, catalogSha256}`，可选 | 同其他本体门禁的指纹确认 |

原生部分（无 runner 也可用）：目录构建即做一致性核验（互斥与包含矛盾、subClassOf 环/悬垂目标均 ERROR fail-closed），证据输出概念数、继承边数、声明/推断互斥对计数（互斥沿继承传播的内建 OWL 子集推理）。

外部 reasoner 协议：内核经 stdin 交付完整目录事实 `{schemaVersion, runId, facts:{concepts[{iri, subClassOf?, disjointWith?, equivalentClass?, unionOf?}]}}`；runner 独立计算推断互斥对并回报 `{schemaVersion, runId, source, tool, entailedDisjointPairs[[a,b]]}`。**集合不一致即 ERROR（无法裁决谁对谁错，只能阻断）**；一致才记 AGREED——内核不采信外部单独声称的任何结论，可对接 pySHACL/owlrl 等外包装。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "The catalog is consistent and both reasoners agree on inferred disjointness"}],
  "gates": [{"id": "consistency", "kind": "semantic-consistency", "level": "L3", "enabled": true, "stages": ["close"], "claimId": "CL-1",
    "reasoner": {"argv": ["$NODE", "reasoner.mjs"], "timeoutMs": 3000}}],
  "risks": [], "exceptions": [],
  "ontology": {"type": "local-catalog", "file": "catalog.json"}
}
```

## L4 架构、非功能与安全

### metrics
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `thresholds` | 1..20，必填 | `{name: {min?, max?}}`；runner 观察数值逐一比较（阈值判定外的证据纪律已于 1.8.0 随 L4.2 裁剪移除） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Architecture and performance stay within thresholds"}],
  "gates": [{"id": "arch", "kind": "metrics", "level": "L4", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000,
    "thresholds": {"layer-violations": {"max": 0}, "p95ms": {"max": 500}}}],
  "risks": [], "exceptions": []
}
```

### scan
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `category` | sast/api-authz/credential，必填 | 扫描类别（dependency/secret/iac/dast 类别已于 1.8.0 裁剪）。api-authz：逐 operation 显式鉴权声明（anonymous 合法但必须显式，缺省即拒，complete mediation）；credential：凭据登记 issuedAt 轮换上限（≤90 天）+ vault 来源 + CI 无长期静态凭据。二者复用同一 findings 协议，正例见 `examples/api-security-demo`（含 BOLA 与 fail-secure 行为反例） |
| `blockAt` | info/low/medium/high/critical，必填 | 达到该严重度的 finding 阻断 |
| `acceptedFindings` | `[{rule, location, reason, expiresAt?}]`，可选 | 已审计 finding 的显式豁免：按 rule+location 精确匹配、reason 必填；`expiresAt` 过期后自动恢复阻断并在证据标注 `acceptanceExpired` |

#### 架构适应度模式库（L4.1）

把架构原则转成 metrics 门禁的数值指标（正例见 `examples/architecture-demo`：拓扑 → 四项原则违背数）。已内置表达的原则：实时链路无单点依赖、关键后台服务平等多活（副本≥2）、核心链路支持并跑试算/灰度、批量任务支持重跑并跑。其他常用可选模式（同样以"runner 数违背数 + max:0/阈值"表达）：

- 分层单向依赖（如 controller→service→repository）与禁止循环依赖；
- 实时链路同步调用扇出上限、每跳超时预算与重试上限；
- 错误率/可用性 SLO 与错误预算；
- 容量冗余度（N+1）、数据 RPO/RTO 目标；
- 资源隔离上限（连接池/线程池/队列长度）；
- 幂等覆盖率与降级开关覆盖率；
- 背压有界与准入控制（A4）：通道 `unboundedQueues max:0`；过载演练 `shedUnderOverloadViolations max:0`（高优先级不被拒、拒绝可区分于超时、恢复无残留）；
- 关键依赖分舱隔离（A7）：`criticalDependenciesWithSharedPool max:0` + 干扰演练 `interferenceViolations`（打满 A 依赖池，断言 B 路径时延变化在预算内）；
- 负载阶梯单调（A8）：`loadStepThroughputDrops max:0`（0.5/0.75/1.0 × 标称容量吞吐不下降并采集饱和信号；过载行为由 A4 覆盖）；
- **灰度判定协议（R5，正例见 `examples/architecture-demo` 的 order-api）**：服务拓扑可选结构化 `canaryAnalysis:{verdict: promote|rollback|inconclusive, judge, sampleSize, window, sequentialMethod, guardrailViolations[], srmDetected?}`，runner 推导三个指标配 `max:0`——`canaryNotPromoted`（**inconclusive/marginal 不计 PASS**，证据不足即违背）、`canaryGuardrailContradiction`（verdict=promote 却带 guardrail 违背=自相矛盾证据）、`canarySrmVoided`（**SRM 检出即作废该服务全部灰度结论**，多次窥视下其余指标一律不可信）；`canarySupported` 布尔保留为最低档，结构化结论 promote 且无违背可独立满足原则三；违背服务的明细由 runner 写入 stderr（随执行证据入报告）；
- 密钥轮换周期、慢查询/慢事务预算。

生产项目应从真实依赖图或编排清单推导这些数值；demo 拓扑读取器仅证明协议与判定链路。

#### 六类故障演练指引（L4.3/L4.6）

设计基线列出的故障模式与 runner 写法（`examples/resilience-demo` 已示范前两类 + external timeout）：DB 不可用（开关注入 + 恢复重试）、重复消息（同 correlation 二次提交 + 幂等核对）、外部依赖超时（注入延迟超过预算 + 超时守卫 + 恢复）、Redis 不可用（同 DB 模式换依赖）、重试风暴（并发多次失败调用 + 退避核对）、网络分区（模拟超时/拒绝 + 最终状态核对）。每类都要求恢复时长、最终状态与必需信号三重证据。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "No blocking static findings"}],
  "gates": [{"id": "sast", "kind": "scan", "level": "L4", "enabled": true, "stages": ["close", "release"], "claimId": "CL-1", "category": "sast", "blockAt": "high", "argv": ["$NODE", "scanner.mjs"], "timeoutMs": 10000,
    // 已审计豁免：精确匹配 + 理由必填 + 过期自动恢复阻断
    "acceptedFindings": [{"rule": "no-eval", "location": "legacy/util.mjs", "reason": "Audited dynamic dispatch", "expiresAt": "2026-12-31"}]}],
  "risks": [], "exceptions": []
}
```

### resilience
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `scenarios` | 1..20，必填 | `{id, maxRecoveryMs, expectedFinalState, requiredSignals: [log/metric/trace/alert]}`；可选 `requiredTransitions:[closed,open,half-open,closed]`（熔断全路径演练：runner 回报 `transitions` 序列须与期望完全一致且 `breakerEventsLogged:true`，序列不符或跳变未记日志即 FAIL——配置存在但路径未走过不算证据） |
| `maxAgeDays` | int 1..3650，可选 | 演练证据新鲜度：runner 须回报 `observedAt`（ISO），缺失即 ERROR；超过窗口即 FAIL 标注 `evidenceExpired`（演练记录不是永久证据） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Service recovers from injected faults in time"}],
  "gates": [{"id": "res", "kind": "resilience", "level": "L4", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 15000,
    "scenarios": [{"id": "db-down", "maxRecoveryMs": 3000, "expectedFinalState": "degraded-healthy", "requiredSignals": ["log", "metric"]}],
    // 演练证据 365 天内有效，runner 回报 observedAt
    "maxAgeDays": 365}],
  "risks": [], "exceptions": []
}
```

### trace-continuity
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `links` | string[] 1..40，必填，唯一 | 声明须核验贯通的跨服务调用对 id（如 `gateway->orders`）；runner 回报每个调用对的传播记录 `{call, parent:{service?, traceId, spanId}, child:{service?, traceId, spanId, parentSpanId}, traceparent?}` |
| `requireTraceparent` | boolean，可选 | `true` 时每个调用对必须回报 traceparent 头（缺即 `missing-traceparent`） |

判定（轨道 D trace 贯通核验，v1.21）：每个声明调用对——child 与 parent 同 traceId（违即 `trace-id-discontinuity`，child 新开 traceId）、child.parentSpanId 与 parent.spanId 衔接（违即 `span-id-mismatch`）、无传播记录即 `missing-link`（child 缺失）；traceparent 回报即在核验——W3C 传播格式 `00-<32hex>-<16hex>-<2hex>`（违即 `invalid-traceparent`）且与 parent 两端一致（违即 `traceparent-mismatch`）；单条调用对的问题逐项列全（畸形头现实中同时引发新开 traceId）。未声明的回报记录入审计面 `extraLinks` 不判 FAIL（核验面由声明调用对决定）。边界：内核只对账 runner 回报的传播对，不采集流量、不做 APM——生产 OpenTelemetry 接入属项目工程；resilience 核验信号**存在性**，本 kind 核验**贯通性**。正例 `examples/trace-continuity-demo`（W3C trace-context 传播模拟器＋四类断链故障注入）。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Declared cross-service calls stay on one trace"}],
  "gates": [{"id": "trace-links", "kind": "trace-continuity", "level": "L4", "enabled": true, "stages": ["close"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 15000,
    "links": ["gateway->orders", "orders->payments"],
    // 每个调用对还必须回报 W3C traceparent 头
    "requireTraceparent": true}],
  "risks": [{"id": "RS-1", "gateId": "trace-links", "description": "Reconciles runner-reported pairs only; no traffic capture or APM"}],
  "exceptions": []
}
```

### budget
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 声明文件（纯内核算术，无 runner）：`{hops:[{caller,callee,timeoutMs,retries?}], budgets:{service:budgetMs}, retryPolicies?:[{client,budgetPercent,jitterMode,backoffBaseMs,backoffCapMs}]}` |

判定：每个 hop 的调用方必须声明预算（缺即 `missingCallerBudget`）；`Σ timeoutMs×(retries+1) ≤ budgetMs`（超即 `budgetExceeded` 并给出需求合计——5 层×3 重试=243 倍放大的守恒防线）；`budgetPercent ≤ 20`、`jitterMode ∈ full/equal/decorrelated`、`cap ≥ base`（违即 `retryBudgetExceeded` 等）。并发演练（重试占比/同步尖峰）以 metrics 门禁承载，正例见 `examples/budget-demo`。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Timeout budgets cover downstream attempts"}],
  "gates": [{"id": "timeout-budget", "kind": "budget", "level": "L4", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "file": "budget.json"}],
  "risks": [], "exceptions": []
}
```

### rerun
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 重跑确定性证据文件（纯内核校验，无 runner）：`{jobs:[{id, hashAlgorithm:"sha256", idempotencyKeyStrategy, runs:[{seed, outputSha256}×≥2 次同 seed], doubleEntry?:{debits,credits}}]}` |

判定（R6 重跑确定性协议）：`runs ≥2`、全部同 seed、`hashAlgorithm` 必须声明 sha256，任一不满足即 ERROR（fail-closed——单次运行不是重跑证明，异 seed 不是同 seed 证明）；双次运行 `outputSha256` 不一致 → `outputDivergence` FAIL 指名任务；可选 `doubleEntry` 借贷合计不等 → `unbalancedDoubleEntry` FAIL。内核只核验证据结构与跨 run 一致性，不重执行任务；runs 哈希须由真实作业双次运行产出（正例 `examples/rerun-demo`：settlement.mjs 同 seed 双次运行 + 复式恒等式，测试会重跑核验哈希真实性）。metrics 拓扑中的 `rerunnable/parallelizable` 布尔保留为最低档声明，本门禁为结构化高档。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Same-seed reruns are bit-identical"}],
  "gates": [{"id": "rerun-determinism", "kind": "rerun", "level": "L4", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "file": "rerun.json"}],
  "risks": [{"id": "RS-1", "gateId": "rerun-determinism", "description": "Declared evidence; kernel does not re-execute the job"}],
  "exceptions": []
}
```

### topology
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | 拓扑声明文件（纯内核判定，无 runner）：`{services:[{name, layer: realtime\|background\|batch, critical, replicas, stateModel?, faultModel?, faultTolerant?, transientLeadership?, leaderLeaseSec?, replicaDetails?:[{failureDomain:{region?,zone?,host?}, role}], domainVerification?, dependencies?:[{name, instances}]}]}` |

判定（v1.10 主线，四原则拓扑语义 R1–R4；核验**声明文件一致性**，非真实部署编排态）：R1——关键服务自身副本与关键依赖的 `distinct(failureDomain)>=2`（必存活服务= critical ∪ 被关键服务依赖者；无 `replicaDetails` 须显式 `domainVerification:"unavailable"` 降级，否则 FAIL `failureDomainsUndeclared`，显式降级 PASS 但报告"证据降级"标注）；R2——副本阈值按状态模型分型：stateless≥2 / consensus≥3 且奇数 / standby≥3 / byzantine≥3f+1（**2 副本共识集群是常见误配**：Raft 多数派浪费一票）；R3——一阶最小割集 `minCutOrder1Count` 与"无单点"严格等价（节点侧：必存活服务全部副本同域或单副本；边侧：关键依赖 `instances=1`；天然覆盖共享依赖与同域副本），二阶割集仅计数登记不阻断；R4——副本 role 集合须对称（全同）或存在 leader 语义（role 含 primary/leader 或 stateModel:standby），后者必须声明 `transientLeadership:true` + `leaderLeaseSec`（存在不可轮转的永久 primary 即 FAIL）。依赖名须在 services 内可解析、instances ≤ 目标 replicas、自依赖 ERROR。metrics 拓扑协议（`canarySupported`/`rerunnable` 等，architecture-fitness 门禁）保留为对照；正例 `examples/architecture-demo`（同一 topology.json 同时供两个门禁消费）。

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "The declared topology has no single points and honors replica thresholds"}],
  "gates": [{"id": "topology-semantics", "kind": "topology", "level": "L4", "enabled": true, "stages": ["close", "pr"], "claimId": "CL-1", "file": "topology.json"}],
  "risks": [{"id": "RS-1", "gateId": "topology-semantics", "description": "Kernel verifies the declared file, not the live orchestration state"}],
  "exceptions": []
}
```

## L5 交付、运行与治理完整性

### configuration

数组按 JSON 结构值比较，顺序有意义、对象键顺序无意义；null、数组与对象类型区分，空对象也参与存在性核对。
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `files` | ≥2 环境，必填 | `{envName: path}`；首个为基准，多环境比对 |
| `allowedDifferences` | string[]，必填 | 允许存在差异的键路径，支持 `*` 段通配（如 `features.*.enabled`）；未声明的差异 FAIL；疑似秘密键值脱敏。非 JSON 配置（YAML/env）建议由构建步骤生成 JSON 镜像后接入 |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Environment configurations only differ where declared"}],
  "gates": [{"id": "config", "kind": "configuration", "level": "L5", "enabled": true, "stages": ["close", "release"], "claimId": "CL-1",
    "files": {"staging": "staging.json", "production": "production.json"}, "allowedDifferences": ["log.level", "database.port"]}],
  "risks": [], "exceptions": []
}
```

### documentation
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `version` | string，必填 | 四类制品（code/api/user/operator）须一致的版本 |
| `requiredTopics` | string[]，必填 | 每类制品必须覆盖的主题；runner 回报的制品 path 由内核核验存在且非空（缺失 FAIL、逃逸 ERROR） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "Documents stay versioned and cover required topics"}],
  "gates": [{"id": "docs", "kind": "documentation", "level": "L5", "enabled": true, "stages": ["release"], "claimId": "CL-1", "argv": ["$NODE", "runner.mjs"], "timeoutMs": 5000, "version": "1.1.0", "requiredTopics": ["setup", "rollback"]}],
  "risks": [], "exceptions": []
}
```

### debt
| 选项 | 类型/默认 | 作用 |
|---|---|---|
| `file` | string，必填 | `{items[{id, description, owner, impact, repayment, severity, status, dueDate, evidence?}]}`，顶层可选 `"none": true`（v1.9 W1：空登记须显式声明 none 才 PASS，裸空数组 FAIL；与非空条目矛盾 FAIL）；高严重度或逾期的未结项阻断；resolved 项可选 `evidence`（`{file}`/`{gateId}` 结构化引用强制核验，纯文本仅登记） |

```jsonc
{
  "schemaVersion": "0.2",
  "claims": [{"id": "CL-1", "statement": "No release-blocking technical debt"}],
  "gates": [{"id": "debt", "kind": "debt", "level": "L5", "enabled": true, "stages": ["release"], "claimId": "CL-1", "file": "debt.json"}],
  "risks": [], "exceptions": []
}
```
