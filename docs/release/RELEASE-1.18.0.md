# RELEASE 1.18.0（2026-10-01）

**主线：AC 结构化协议内核化——轨道 A 收官**（来源[演进基线 v0.9](../context/original-design-v0.9.md) §41.3/§53；三项首日裁决 2026-10-01 经 AskUserQuestion：**映射机制=@type 标签权威**[采纳推荐]、**原子性=允许多场景**[用户覆盖"一 AC 一场景"推荐]、**EARS=双支持**[用户覆盖"仅 Gherkin"推荐——v0.9 §41.3 原设计全量落地]）。**零破坏**：全部为可选字段 `format` 与新判定分支，自由文本 AC（不声明 format）行为零变化。

## 内容

- **新模块 `lib/ac-structure.mjs`**（只校验结构不判语义——Deterministic First 在需求阶段的应用）：
  - **Gherkin 验证器**：场景关键字（场景/场景大纲/Scenario/Scenario Outline）＋步骤关键字中英双语（假如/当/那么/而且/但是 与 Given/When/Then/And/But），And/But 继承上一关键字的行为类型；每场景经继承后至少一个 when 与一个 then；**允许多场景**（用户裁决）——AC 类型=各场景 `@类型` 标签并集；示例表（Examples/示例 + `|` 行）结构放行并计数；场景外步骤/空场景/起手 And/But/未识行逐条指名；
  - **EARS 验证器**：五模板中英词表随本轮定稿（EN：The…shall / When…, the…shall / While…, the…shall / If…, then the…shall / Where…, the…shall；中文：`<主语>应当…` / `当…时…应当` / `在…期间…应当` / `如果…则…应当` / `其中…应当`）；逐行恰好匹配一模板，多语句允许；**模板→AC 类型映射集**：无处不在/事件驱动→normal、状态驱动→state-transition、不需要行为→negative|exception（显式 type 二选一收窄）、可选特征→normal；
  - `evaluateAc` 统一入口（文本字段兼容 task-intent `text` 与 traceability `statement`；format 缺省=自由文本不校验不派生）＋`acTypeConflict`（显式 type 不在派生集即冲突）；
- **接入三处**：task-intent 形状校验增 `format:'gherkin'|'ears'` 枚举；**change-scope 漂移对账**增 acceptanceStructure 判定（结构违规 FAIL 指名 `ac-structure-invalid`，类型冲突 FAIL 指名 `ac-type-conflict`，证据逐条含规则与场景名/行内容）；**traceability** 增 criteria format 校验＋类型覆盖集（派生集为准、显式 type 在集内时收窄为该类型、无派生回退显式 type）——`defaultRequiredTypes` 缺失类型检查按覆盖集判定，声明 format 的 AC 可不带显式 type；
- summary 两提取器新增原因文案（逐条规则＋场景/行指名＋修正指引："修正 Gherkin/EARS 结构，或去掉 format 改回自由文本"）；
- intent-drift-demo：ok 场景升级为真 Gherkin `@negative` AC（随登记过漂移对账），新增 **bad-ac 反例**（缺 then → FAIL 指名）；
- CONFIG-GUIDE 双登记段落（task-intent.json/requirements.json）、GLOSSARY 码名定稿（`acceptance[].format`＋`ac-structure-invalid`/`ac-type-conflict`＋双支持裁决记录）、/quality-gate-intent 问询步骤③协议说明。

## 验证与证据

- 全量回归 **515 项（514 过/1 skip=pytest 守卫）**（506→515，+9）；kinds/示例数不变（35/39）；
- 发行包 `dist/quality-gate-1.18.0.zip`：**620 文件**，SHA256 `29b6d8a1bd09308bbcf889cd4836605b8e9b137c8c0d81f39c198d49237036ee`（两次构建全同）；解包复验含 AC 结构端到端（ok/bad-ac 场景），见 `evidence/v1.18.0/`；
- 客户端实机验收挂起（沿用户决定：1.17.0/1.17.1/1.18.0 同轮补做）。

## 边界（如实）

- 只校验结构不判语义：Gherkin/EARS 骨架齐备 ≠ 表达了用户真实意图（一致性靠确认留痕）；
- 类型派生是结构性的：@标签与 EARS 模板映射，不做措辞推断（Then 写"拒绝"不会自动变 negative——须打 `@negative` 标签或选 EARS 不需要行为模板）；
- Gherkin 示例表（Examples）行数与单元格结构不校验（放行计数）；中文关键字词表为本轮定稿的五组对应，未覆盖 Gherkin 全部本地化关键字（如 而且/但是 之外的代词变体）。

## 升级与迁移

零破坏，无需迁移。启用：AC 条目加 `format:'gherkin'`（建议打 @类型 标签）或 `format:'ears'`；自由文本不加 format 则一切如旧。

## 轨道 A 收官声明

至此 v0.9 轨道 A（任务意图）四件套全部落地：任务意图登记＋漂移对账（v1.17.0 T1/T2）、问询通道与报告（v1.17.0 T4/T5）、Hook 软形态（v1.17.1）、AC 结构化协议（本版）——意图漂移与范围蔓延两类对齐失效获得任务级判定闭环。
