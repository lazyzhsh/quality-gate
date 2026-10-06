# RELEASE-1.31.0（2026-10-06，证明链补齐——AC→真实用例绑定＋来源信号覆盖）

## 主线：二轮评审（evidence/project-review-2026-10-06）"完善顺序"第 2 步

评审确认两条证明链缺口：AC 到实际测试用例的证明链未闭合（traceability 只要求 codeFiles 存在、testGateIds 指向同轮 PASS 门禁——AC-UNBOUND 反例中"转账恰好一次"的 AC 连着只 `process.exit(0)` 的 command 门禁仍 PASS）；来源信号表未识别 visual.diffSource=kernel-recompute 与 documentation.contentCheck（PNG 内核重算已执行仍显示零核验），且"—"同时承担非 PASS 与无信号两种含义。本版两项落地；37 kinds 不变，①为判定收紧（仅对声明了 cases/requireCaseBinding 的配置生效，默认旧语义零变化），②为纯展示层（判定零变化）。评审另列的 transcript 默认政策按既定记录留 v2.0 终审裁决。

## 变更清单

1. **AC→真实用例身份与当轮结果绑定**：requirements.json 逐 AC 可选 `cases:[{gateId, caseIds}]`（gateId 必须在该 AC 的 `testGateIds` 内——用例绑定深化既有门禁关联，不另立关联；1..20 绑定 gateId 唯一；caseIds 1..50 非空唯一；畸形形状 fail-closed ERROR）。运行时 traceability 在**当轮**被绑定门禁的证据中逐用例复核——用例身份取自 behavior `details.cases`（{id,status}）与 engineering unit/test 检查的 `checks[].cases`（{name,status}），同名用例跨检查取更差结果（fail-closed）。三种不通过形态均 FAIL 指名：**acCaseMissing**（被绑定门禁无逐用例身份或未回报该用例——无关成功门禁从此不能充当 AC 证据，评审 AC-UNBOUND 反例收敛）、**acCaseSkipped**（跳过不是通过）、**acCaseFailed**（未通过）。AC 证据新增 `caseBindings` 逐用例结果。新门禁选项 **`requireCaseBinding`**（默认 false，旧语义零变化）：开启后未声明绑定的 AC FAIL **acCaseUnbound**。证明边界如实：绑定复核证明"这些用例当轮真实执行且通过"，AC 与用例的语义对应仍由人工负责（不自动由 PRD 生成——L3.5 设计边界维持，转正留 v2.0 终审）。
2. **来源信号展示补齐**（判定零变化）：来源列/分布/证据力行新增核验信号**内核像素重算**（visual `diffSource=kernel-recompute`）与**内容级核验**（documentation `contentCheck PASS`）；metrics 指标值与 scan findings 归入声明分类（经内核校验形状的自报数值/观察）；PASS 而无任何来源信号的门禁显式显示**无信号**并计入分布第四桶 `none`——与非 PASS 的"—"不再共用同一符号（评审"不让—同时承担多种含义"）。evidenceStrength 信号表同步（kernelRecomputes/contentChecks 计入核验信号计数）。
3. **夹具自举**：expense-approval-fixture 逐 AC 绑定 behavior 用例（AC-01→normal、AC-02→limit/above-limit、AC-03→invalid-amount、AC-04→cross-tenant/self-approval、AC-05→double-approval）且 rtm 门禁开启 `requireCaseBinding`——验收基线自此以最强证明链形态运行（四步全绿；close 的来源分布新显"无信号 8"：8 个无信号门禁此前隐形）。

## 验证

- 全量回归 **678/678 PASS、0 SKIP**（672＋新增 6：traceability×5——正例双门禁绑定/AC-UNBOUND 反例收敛/跳过与未通过用例/requireCaseBinding 开关/登记形状 5 型 fail-closed；summary×1——四类来源单元格＋分布 none＋evidenceStrength 新信号＋未开内容核验不误标核验）。
- 夹具四步：单测 8/8、close 13/13、负例矩阵 13/13、生命周期 10/10。
- 根 CLI close（G-CONVENTIONS＋G-DOCS）PASS；release 见"版本与证据"。

## 边界与注记

- 绑定复核的用例身份来源当前为 behavior 与 engineering unit/test（协议中唯二携带逐用例身份的证据形状）；其他 kind 的 runner 即便回报结构化数据，无逐用例身份协议即落在 acCaseMissing——这是如实边界，不是缺陷（要求 runner 先声明逐用例协议再谈绑定）。
- "AC 语义与用例对应"（这个用例真的证明了这条验收标准吗）仍属人工评审面——绑定复核封的是"凭无关成功门禁放行"，不替代语义审读（评审原文：保留人工写 AC）。
- 必要 Claim 全 SKIP 时"未验证"显式呈现沿用 v1.28 语义，无变化。

## 版本与证据

- 版本 ×4 → 1.31.0（plugins/quality-gate/package.json、.zcode-plugin/plugin.json、marketplace.json、根配置 G-DOCS version 同步递增）＋入口文档版本串（根 README 脉络、PRD 版本基线与 §7、HANDOFF、插件 README ×2）。
- zip `quality-gate-1.31.0.zip` 521 文件，SHA256 `a78c97f4f1be6a2ce5e50fb69204ec2b41da7b0f0e8aeea02b0dd165d8b335da`；解包复验 678 测试 678 PASS 0 SKIP＋27 demo PASS（构建脚本内置打包冒烟）。
- marketplace 快照重镜像至 1.31.0（待客户端"更新"；实机验收 1.28.0 起待新轮——本版未做实机验收）。
