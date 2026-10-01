# Release 1.9.0 — 信任边界收敛版（trust-boundary convergence）

发布日期：2026-09-26。主线：六域机制评审（L0–L5，2026-09-26）总敞口清单驱动的 W1–W5 五个工作包全量落地——三类声明式信任锚（登记完备性/runner 诚实性/注解=行为）与两处空转、两处自指软化的收敛。收敛项以**新增显式声明**为主，仅空登记/未声明/未覆盖场景才 FAIL/ERROR；五次独立增量提交（W1 7646653 → W2 7a1d48d → W4 9e540ab → W3 5fce4c5 → W5 673ffdb），逐包正反例与证据见 `evidence/v1.9.0/`。

## W1 空转封堵（敞口 A4/A5/A6/A7）

- `assumptions.json`/`debt.json` 顶层可选 `"none": true`：裸空数组 FAIL"空登记未显式声明"；`none:true` 与非空条目矛盾 FAIL；非布尔 ERROR。
- `decisions` 新增门禁选项 `requireProvenance`（布尔）：开启后每条决策 `evidence` 必须为 `{file}`/`{gateId}` 结构化引用，纯文本该项 FAIL 指名 `provenance-required`。
- deferred 决策必须携带 `revisitBy: YYYY-MM-DD`：缺期限校验层 ERROR（fail-closed）；期限已过该项 FAIL 指名 `revisit-overdue`。

## W2 自指保护（敞口 D1/D2/D3/D4）

- change-scope spec 可选 `selfGuard.acknowledgedSpecSha256`：内核对**去掉 selfGuard 字段后**的 spec JSON 串（原键序）计算 sha256 比对，不符 FAIL `spec-changed`——allowedPaths/baseRef/protectedPaths 的静默修改立即失效。
- spec 可选 `pinnedBase.commit`：与 baseRef 解析出的基准 commit 不一致即 FAIL `base-moved`（基线前移使 diff 清空的路径被封死）。
- R/C 变更（rename/copy）**源路径**以 `R-source`/`C-source` 类型进入变更集参与 allowed/protected/required 判定（未暂存改名的 D+A 形态同样覆盖）。
- engineering/consistency 新增可选 `excludedChecks:[{id,reason}]`（reason 必填）：**每个 check 必须 required 或显式 excluded**，否则配置 ERROR；被排除项仍执行并记录、不参与判定；未知 id/兼有/缺 reason 均 ERROR。

## W3 观察可信度（敞口 B2/B4/B5；观察数值仍自报，只封来源声明）

- 基线来源协议（behavior 门禁级 / engineering unit check 级，凡声明 expected 即适用；共享 `lib/baseline.mjs`）：runner 回报 `baselineSource:{type: git-commit|embedded, ref?}`——git 型内核在项目根 `git rev-parse --verify` 核验（捏造/非仓库 ERROR）；embedded 放行但报告**降权标注**。新配置 `baselineMode: any|git`（默认 any 兼容旧 runner）：git 模式下 embedded/缺失即 FAIL 指名。
- alignment 观察可选 `mode: live|static`（static=未发真实请求仅静态读取）：默认放行+降权标注；新配置 `requireLive:true` 下 static 即 FAIL；畸形值 ERROR。
- consistency append-only 观察**必须**回报 `sourceType: binlog|wal|audit-log|declared`（缺失/未知 ERROR）；新配置 `acceptedSourceTypes`（默认全收）——不在列表即 FAIL；declared 降权标注。
- 报告新增**"证据降权"行**（brief 与全表均显示，PASS 也显示）：汇总 embedded 基线/static 观察/declared 来源三类弱来源声明。
- Demo 真基线改造：behavior-demo/engineering-demo 基线优先 git 真历史（`QGATE_BASELINE_REF`，默认 legacy；`git show <ref>:<file>` 双跑），无该 ref 时如实回退 embedded；ledger-demo append-only 如实回报 declared。

## W4 登记完备性（敞口 A1/A2/A3）

- requirements[] 新增可选 `prdRef:{file, section}`：`file` 存在性+防逃逸核验（声明即核验：缺失 FAIL 指名、逃逸 ERROR），`section` 记录性文本；门禁新增 `requirePrdRefs:true` 强制每条需求绑定 PRD。证明边界：只核验 PRD 文件存在，不证需求涵盖 PRD 全部内容。
- traceability 新增 `defaultRequiredTypes`（1..5 唯一类型）：未自带 `requiredTypes` 的需求按默认集判定缺失类型（声明后这些需求的 AC 必须带 type）。

## W5 语义-行为桥（敞口 C1）

- semantic-alignment 观察 mapping 新增可选 `origin: annotation|runtime`（annotation=静态注解读取/缺省同；runtime=执行符号所在用例后的运行时绑定）；非法枚举 ERROR。
- 门禁新增 `requireRuntimeOrigin:true`：每个映射符号须至少一条与 expectedIri 一致的 runtime 候选，否则 FAIL 指名 `runtime-unbound`（注解≠运行时行为）；finding 新增 `origins` 计数。Demo 扩展双来源（实例 `ontologyBinding()` 运行时自报 + 注解静态读取）。

## 破坏性收紧（预期内，迁移指引）

| 旧形态 | 新行为 | 迁移 |
|---|---|---|
| 裸空 assumptions/debt 登记（vacuous PASS） | FAIL"空登记未显式声明" | 补顶层 `"none": true` 或真实条目 |
| deferred 决策无 `revisitBy` | 校验层 ERROR | 补 `revisitBy` 期限；已过期的先复审再改期 |
| engineering/consistency 存在既未 required 也未 excluded 的 check | 配置 ERROR | 移入 `requiredChecks` 或补 `excludedChecks:[{id,reason}]` |
| append-only 观察缺 `sourceType` | ERROR | runner 回报真实来源枚举（内嵌实现如实报 declared） |

本仓示例、模版与夹具基线已随版更新，零迁移残留。其余配置与 runner 输出向后兼容（新协议均为可选声明；any 模式下未回报 baselineSource/mode 放行）。

## 验证

- 376 项回归全绿（354→376：+22 个正反例，覆盖五个工作包全部验收标准）；CONFIG-GUIDE 33 段 jsonc 样例通过内核 validate，选项表/登记文件字段/协议说明同步；summary 提取器新增 14 类失败原因与降权标注。
- 夹具四步：业务单测 8/8、close 13/13 六域 PASS（rtm 门禁已启用 `requirePrdRefs`+REQ-01 绑定 `docs/PRD.md`，随版固化新声明）、负例矩阵 13/13、lifecycle-check 10/10。
- demo：behavior-demo/engineering-demo git 真基线（测试内 legacy 提交→切回双跑）与 embedded 回退降权、ledger-demo declared 降权、semantic-alignment-demo 双来源均实测；GATE-SPEC-v1.9 为现行规范（v1.8 移入 `docs/history/`）。
- 打包：`python devtools/build_delivery.py` 解包复验（全量测试 + 清单驱动烟测），见 `evidence/v1.9.0/unpack-verify.txt`。

## 边界与不做

- 全部收敛项均为**声明式**：none/revisitBy/selfGuard/pinnedBase/baselineSource/mode/sourceType/origin/excludedChecks 防的是**静默**空转、自扩与来源含糊，不防蓄意伪造（伪造者可重算哈希/谎报来源）；报告以降权行与 resolvedCommit/origins 等字段给读者判断依据。
- 观察数值仍自报（B 系敞口只封来源声明）；B1 原始证据内核解析与 E 系列能力缺口维持候选区不排期（见 PLAN v1.9"本轮不做"）。
- 客户端实机验收（ZCode）按惯例在本版 CLI 回归后另轮执行记录，与本 CLI/脚本验证分别归档。
