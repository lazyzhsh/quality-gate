# Quality Gate 1.4.0 发布说明

面向原设计 L3.7 八项检查中尚未完成的部分：Relation/Constraint/State Alignment、实例级对齐（纯内建实现）、Semantic Exposure、目录一致性核验与内建 OWL 子集推理；OWL 推理增强按"纯 JS/TS 内建优先、外部 runner 可选"的原则落地为双实现一致性核对协议。配置 schemaVersion 保持 0.1，未使用新门禁的旧项目配置无需修改。

新增六个 L3 门禁 kind（`semantic-relation`、`semantic-constraint`、`semantic-state`、`semantic-instance`、`semantic-exposure`、`semantic-consistency`），GATE_KINDS 从 26 增至 32。

## 增量 1：内建 OWL 子集推理与一致性守卫（0bbf6bf）

- 目录 provider 构建期新增：`disjointWith` 沿 `subClassOf` 传递给后代（A⊥B 且 C⊆A、D⊆B ⇒ 推断 C⊥D），并与包含关系做一致性核验——X⊥Y 且 X 包含 Y、或同一概念落入互斥两侧（菱形继承）均 fail-closed ERROR。
- semantic-alignment 的 Semantic Conflict 判定升级为推断闭包（声明级检查保留为无推理 provider 的回退）。真实 FIBO 证据：Agreements 模块声明 MultilateralAgreement⊥BilateralAgreement，经 Contracts 模块继承结构推断出 **MultilateralContract⊥BilateralContract**（测试断言该推断对）。provider capabilities 新增 `disjoint-inference`。
- 测试 +4；回归 214/214。

## 增量 2：semantic-relation —— Relation Alignment（f627651）

- 目录概念支持 `relations: [{predicate, to}]` 声明（≤50，目标须在目录内，悬垂 ERROR）；门禁配置声明期望三元组（≤100，唯一），runner 从当次代码读取关系注解（协议同 runId 防伪）。
- 三方核对：代码缺失 `missingRelation`、本体未认可 `unsanctionedRelation`、代码存在未声明关系 `undeclaredRelation`、引用未知概念 `unknownConcept` 均 FAIL；支持 `acknowledgedOntology`。符号→概念映射仍归 semantic-alignment，本门禁对齐概念间关系本身。
- 正例 `examples/semantic-relation-demo`；反例覆盖四类规则与协议/校验 fail-closed。测试 +8；回归 222/222。

## 增量 3：semantic-constraint —— Constraint Alignment（7c1010a）

- 目录概念支持 `constraints: [{id, left, operator, right|value, when?}]`（≤20，与 invariant/property 同一断言语义，`when` 条件复用同一求值器）；门禁指定概念，runner 提供真实观察案例（`{schemaVersion, runId, minCases}` → `cases[{id, values}]`）。
- 本体声明的约束在观察案例上执行：不满足即 FAIL 并输出反例（约束/案例/操作数）；`when` 不满足记 SKIP；未知概念/未知约束 id、概念无约束、缺失操作数均 ERROR。可选 `constraintIds` 子集与 `minCases` 下限。
- 正例 `examples/semantic-constraint-demo`（FIBO 风格 capturedAmount≤authorizedAmount 在真实 PaymentObligation 行为上执行）。测试 +7；回归 229/229。

## 增量 4：semantic-state —— State Alignment（b5cbc75）

- 目录概念支持 `lifecycle: {states[≤20], transitions[{from,to}][≤50]}`（from/to 须为已声明状态）；门禁指定概念，runner 观察真实实例转换序列。
- 未声明状态 `unknownState`、未声明转换 `illegalTransition` 均 FAIL；未知概念、概念无 lifecycle 均 ERROR。L3.6 property 门禁继续负责"代码声明的状态机"，本门禁把观察到的状态机与**本体声明**的生命周期对齐。
- 正例 `examples/semantic-state-demo`。测试 +6；回归 235/235。

## 增量 5：semantic-instance —— 实例级对齐，纯内建（5c61ba0）

- 原生门禁（无 runner）：实例样本 `{records[{id, entityId?, typeIri}]}` 逐条类型解析；关键实体期望类型 `entityTypes` 核对（观察类型须等于期望或其子类——特化 typing 视为一致）。
- 同一实体多类型按内建推理闭包判定：互斥 `disjointInstances`（含沿继承传播，如 TermSheet⊥Contract 传播到 WrittenContract）或不可比较 `ambiguousInstanceType` 均 FAIL，仅包含链上的多类型视为一致。
- 正例 `examples/semantic-instance-demo`。测试 +7；回归 242/242。

## 增量 6：semantic-exposure —— Semantic Exposure（9c59384）

- 目录概念支持 `exposure: "public"|"internal"`（目录无任何 exposure 声明即 ERROR fail-closed）；runner 观察项目公共面（`{exposed[{iri, location}]}`，source 字段说明判定依据）。
- 内部概念暴露 `internalConceptExposed`（含位置）、未解析概念 `unknownExposedConcept` 均 FAIL。公共面的定义是项目 runner 的观察，不是内核自行判定的安全边界。
- 正例 `examples/semantic-exposure-demo`。测试 +6；回归 248/248。

## 增量 7：semantic-consistency + 外部 reasoner 协议（2abc3ed）

- 原生部分：目录构建即一致性核验（增量 1 的守卫），证据输出概念数、继承边数、声明/推断互斥对计数（FIBO 上推断对数大于声明对数，测试断言）。
- 可选 `reasoner: {argv, timeoutMs}`（计入 40 秒阶段预算）：**双实现一致性核对协议**——内核经 stdin 交付完整目录事实（iri/subClassOf/disjointWith），外部 reasoner 独立计算推断互斥对集合；集合不一致即 ERROR（无法裁决谁对谁错，只能阻断，列出仅外部声称/仅内核的差集），一致才记 AGREED。内核不采信外部单独声称的任何结论；该协议可对接 pySHACL/owlrl 等包装，但不增加内建规则之外的推理能力。
- 正例 `examples/semantic-consistency-demo`（含协议示例 reasoner）。测试 +7；回归 255/255。

## 定稿验证（2026-09-25）

- 测试基线：**255 项全部通过**（v1.3 的 210 + 推理 4 + relation 8 + constraint 7 + state 6 + instance 7 + exposure 6 + consistency 7）。
- 正例 demo：**34 个全部通过**（`evidence/v1.4/demos.txt`，本轮新增六个语义门禁 demo）。
- 功能实测（`evidence/v1.4/functional-checks.txt`）：FIBO 推断互斥对阻断、relation 三方核对失败摘要、constraint 反例、state 非法转换、instance 实例级互斥、exposure 内部概念暴露、reasoner 分歧 ERROR。
- 打包：`quality-gate-1.4.0.zip`（347 文件，SHA256 `1b1010e2…0a9c`），解包复跑 255 项测试与十八个核心 demo 全部通过（`evidence/v1.4/package-smoke.txt`）；历史安装包原样保留。
- 规范文件更名为 `docs/GATE-SPEC-v1.4.md`；CONFIG-GUIDE 选项表/样例与 `tests/config-guide.test.mjs`、`tests/summary.test.mjs` 强制同步（32 个 kind 全覆盖）。
- **已知待办（需客户端操作，自 v1.2 结转）**：在 ZCode 客户端将本地 marketplace 更新至 1.4.0 后，复验 Command/Skill 调用、L0–L5 六域组合 Stop Hook 与依赖提示注入，并保留客户端报告。

## 证明边界与 L3.7 状态

本轮后原设计 L3.7 八项检查的最小闭环全部落地：Concept Alignment（含 subsumed）、Relation/State/Constraint Alignment、Terminology Ambiguity（最小版）、Semantic Conflict（推断闭包）、Semantic Exposure，以及作为支撑的实例级对齐、一致性核验与可选外部 reasoner。边界：内建推理是 OWL 子集（互斥传播 + 包含一致性），非完整 OWL reasoner；reasoner 协议是双实现一致性核对，不引入新规则；术语检查仍限于已声明 label/altLabels（无多语言、无未声明同义词发现）；约束/状态对齐覆盖观察到的案例与转换，非穷举证明。不得把上述能力表述为生产认证或完整业务正确性证明。
