# RELEASE 1.19.0（2026-10-01）

**主线：轨道 B 约定对齐——约定登记＋约定对齐 kind＋ADR 绑定＋自举迁移**（来源[演进基线 v0.9](../context/original-design-v0.9.md) §42；两项首日裁决 2026-10-01 经 AskUserQuestion：**OD-103 承载=独立 kind**[采纳推荐]、**自举=glossary 防回归测试整体退役**[用户覆盖"迁移+同步守卫"推荐]）。**零破坏**：全部为可选字段、新登记文件与新 kind。

## 内容

- **新 kind `convention-alignment`**（第 36 个，L0，纯内核扫描）：约定登记 `conventions.json` `rules[{id, type, source, severity?}]` 1..50 条（id 唯一，`source:{file,section?}` 溯源必填——约定的文档形态与可执行形态双向可追）：
  - **banned-words 内建规则族**：`words`（字面词）＋`scope`（glob 扫描面，`.git`/`node_modules`/`.quality-gate`/`dist` 恒排除）＋`exemptions` 三机制键（`lineContains` 行内标记[可限定 word]、`precededBy` 前缀跳过、`followedBy` 后缀跳过）＋映射记法（"词→替换"对照行）恒豁免——机制泛化本仓库 glossary 防回归测试的成熟实践；逐命中（含豁免命中）入证据呈审计面；
  - **argv 规则**：复用统一观察协议（stdin `{schemaVersion,runId,ruleId}` → stdout `{schemaVersion,runId,source,findings}`，runner 无权自判放行）；
  - `severity:"advisory"` 命中只记录不阻断（默认 fail 阻断）；
- **decisions ADR 绑定**：条目可选 `adrRef:{file}`（声明即核验——存在＋防逃逸＋frontmatter 平面 YAML 子集解析[已知键 `status/date/deciders/supersedes/superseded-by`，畸形/未知键/缺 status ERROR fail-closed]）；状态映射对账（open↔proposed、resolved↔accepted、deferred↔deferred，不符 FAIL `adr-status-mismatch`）；supersedes/superseded-by 存在性（`adr-chain-missing`）与按文件基名互指核验（`adr-chain-mismatch`）；门禁选项 `requireAdrRefs`（无绑定 FAIL `adr-ref-required`）——决策史从"两处平行记录"变为"一处事实一处索引"；
- **自举迁移（用户裁决整体退役）**：根 `.quality-gate/registries/conventions.json`（39 弃用词快照自 GLOSSARY §6＋8 条豁免＋glob 化扫描面）＋根门禁 **G-CONVENTIONS**（L0 close）；`tests/glossary.test.mjs` 退役——顺带修复旧测试两处覆盖洞（GATE-SPEC 固定文件名漏扫现行版、`quality-gate-intent` 命令文件不在清单）；**两处弃用词清单（GLOSSARY §6 ↔ conventions.json）同步为人工纪律**（同步守卫方案被覆盖，边界如实记录）；
- demo `examples/convention-align-demo`（banned-words＋argv 双规则＋映射记法豁免＋自引用陷阱示范——扫描型 runner 跳过自身文件）；CONFIG-GUIDE（conventions.json 段落＋新 kind 小节样例＋decisions `requireAdrRefs` 行）；GLOSSARY 正式登记三概念（约定登记/约定对齐/ADR 绑定）。

## 验证与证据

- 全量回归 **525 项（524 过/1 skip=pytest 守卫）**（515−3 退役＋13 新增）；kinds **35→36**；示例 **39→40**；根门禁 **2/2 PASS**（G-TESTS＋G-CONVENTIONS 自举首跑即绿）；
- 发行包 `dist/quality-gate-1.19.0.zip`：**632 文件**，SHA256 `e078967d62578f5873c4d453808542cd0a35d8fa12852f0853e15ba006d1b5e7`（两次构建全同）；解包复验含约定对齐端到端（demo close PASS＋注入弃用词 FAIL 指名），见 `evidence/v1.19.0/`；
- 客户端实机验收挂起（沿用户决定：1.17.0–1.19.0 同轮补做）。

## 边界（如实）

- 只对账字面词/结构化条目，不核验约定文件全文语义；无法退化为确定性规则的条目留在提示词层；
- ADR frontmatter 为平面 YAML 子集（`key: value` 行级解析，非完整 YAML 解析器）；
- 自举后弃用词防线执行时点自套件移至 close（根门禁强制）；GLOSSARY §6 与 conventions.json 两处清单靠人工同步；
- 豁免机制可被滥用——逐命中（含豁免）入证据呈审计面。

## 路线位置

v0.9 四轨道进度：**A 任务意图 ✅（v1.17.0/1.17.1/1.18.0）、B 约定对齐 ✅（本版）**；剩余 C 剩余（v1.20：API 存在性协议＋Python/Java 参考适配器）、D 验收可观测（v1.21）、C6 上下（v1.22/v1.23）、v2.0 收口终审。
