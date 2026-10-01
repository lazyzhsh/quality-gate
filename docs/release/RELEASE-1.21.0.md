# RELEASE-1.21.0（2026-10-01）

**主线：轨道 D 收官——验收可观测（trace 贯通核验＋回放资产）**（来源：[original-design-v0.9](../context/original-design-v0.9.md) §44；37 kinds，零破坏）。**对齐防护四轨道 A/B/C/D 本版全部收官。**

## 首日裁决（2026-10-01 经 AskUserQuestion 三问逐轴利弊）

- **OD-106=B 独立 kind**（用户覆盖倾向案 A resilience 可选字段）：trace 贯通核验独立为第 37 个 kind `trace-continuity`——可单独挂 close 阶段；代价=协议样板独立一份（argv/超时/防重放各自维护）；
- **OD-112=A contentSha256 内容绑定**（采纳推荐）：`replayBaseline:{file, contentSha256}`——基线被改动而配置未同步即 FAIL，换基线须显式重 pin（文件与哈希成对更新）；与 taskIntent/baselineSource 内容绑定先例同构；
- **OD-113=B 容忍自报对照**（用户覆盖推荐 A 强制当次记录）：replayBaseline 声明而当次无观察记录时以 runner 自报数据对照——弱一档路径，`replay.source:"self-reported"` 如实呈现，不静默。

## 内容

1. **新纯判定 kind `trace-continuity`（第 37 个，L4）**：统一观察协议（stdin `{schemaVersion,runId,links}` → stdout `propagation:[{call, parent/child 两端 trace/span id, traceparent?}]`，两端 id 形状 fail-closed）。内核对每个**声明调用对**核验：无传播记录 `missing-link`；child 新开 traceId `trace-id-discontinuity`；child.parentSpanId 与 parent.spanId 不衔接 `span-id-mismatch`；traceparent 回报即在核验——非 W3C 传播格式 `invalid-traceparent`、与 parent 两端不一致 `traceparent-mismatch`，可选 `requireTraceparent:true` 强制每对回报（`missing-traceparent`）。单条调用对问题**逐项列全**（畸形头现实中同时引发新开 traceId，只报首中会掩盖另一半）；未声明回报入审计面 `extraLinks` 不判 FAIL（核验面由声明决定）。resilience 核验信号**存在性**，本 kind 核验**贯通性**。
2. **journey/behavior 可选 `replayBaseline`（回放资产）**：以某次归档观察记录为期望基线（qgate-transcript 格式含旧 runId——归档即录制）。当次执行对照：journey=**步骤序**（`replay-sequence-drift`：旅程步骤按 id 匹配不判序，回放对照补上序——乱序场景 id 预期全 PASS 而步骤序 FAIL，语义分野有专测）＋逐步骤 actual 关键字段；behavior=逐用例 actual。值差异 `replay-drift` 指名 JSON Pointer 路径、基线缺 `replay-missing`、当次多出 `replay-extra`；易变字段走既有 `ignorePaths`；对照面不含 runId/source/基线块等包络。内容绑定＝`replay-baseline-modified`（问题文案含期望/实际哈希前 8 位＋重 pin 指引）。
3. **demo×2（42→44）**：trace-continuity-demo（W3C trace-context 传播模拟器 gateway→orders→payments＋四类断链故障注入 drop-context/wrong-parent-span/skip-payments/bad-traceparent，故障为接收方行为只作用当跳）；replay-baseline-demo（确定性结账旅程＋归档基线＋五类故障 drift/reorder/drop-step/改基线/no-transcript；requestId 易变字段 ignorePaths 豁免示范）。
4. **测试 +20**：trace-continuity 10 项（正例＋四故障＋traceparent 三规则合成 runner＋审计面＋陈旧观察 fail-closed＋validate 反例）；replay-baseline 10 项（journey 五故障＋behavior 合成基线三例＋双 kind validate 反例）。
5. **同轮附带根因修复**：semantic-alignment"篡改 FIBO 源"用例曾直接改写共享内核资产再还原——`node --test` 文件级并行多进程下 terminology 进程在篡改窗口读到脏文件即哈希失配（555→565 项调度移位后撞窗近乎必现，连续两轮复现定位；v1.20 收尾记录的"FIBO 瞬时失败"实为此因）。提取 `loadPinnedFiboCatalog(dir)`（生产路径恒用内核资产目录），用例改在临时副本上篡改＋生产目录完好断言。
6. **文档**：GLOSSARY 登记 trace 贯通核验/回放资产（借词 trace/span/traceparent；保留词"回放"与"重放"二分）；GATE-SPEC v1.21（v1.20 归档）；CONFIG-GUIDE 三处（trace-continuity 小节＋behavior/journey replayBaseline 选项表与样例——漏闭花括号被 config-guide 测试逮出）；RTM §12.1 AL5＋L4.3 部分→原生＋§13；PRD §7；双语 README 计数 37/575/44；随轮全仓 markdown 相对链接卫生（21 断链清零——含 v1.20 spec 继承自归档副本的 3 条 `../` 前缀存量缺陷与历轮移动后漏修的归档内链接；剩余 2 处指向本文件）。

## 证明边界（如实）

trace 贯通为声明式对账——内核只核验 runner 回报的传播对，不采集流量、不做 APM（生产 OpenTelemetry 接入属项目工程，KNOWN_TOOLS 纪律提示安装指引）；traceparent 一致性核验的是回报的头与两端 id 自洽，非线上真实传播。回放为行为回归对照——不是性能/时序回放；自报对照路径无交叉核验（弱一档，如实标注）；基线陈旧（需求变更后）须显式重 pin，框架不判基线是否仍合意图。

## 验收与证据

- 全量回归 **575 项（574 过/1 skip=pytest 守卫）**，`evidence/v1.21.0/regression.txt`；
- 发行包 `dist/quality-gate-1.21.0.zip`：**691 文件**，SHA256 `39d2478b6dfc34279c55a7d258d0d4bf4976026b42e56c79c6ea5c0d002a3bf1`（两次构建全同）；解包复验＝版本三处相等＋两 demo 正例 PASS＋四负例注入 FAIL 指名（drop-context/skip-payments/drift/reorder，包内核执行），见 `evidence/v1.21.0/`；
- 根门禁 close 2/2（G-TESTS＋G-CONVENTIONS——后者本版第五次实战命中，逮住本提交自写文案"随版"短形单用弃用词，当即改写"同轮附带"）。

## 版本边界

- 客户端实机验收 **v1.21.0 待做**（回归单版节奏：快照同步→"更新"→缓存 SHA 全等→夹具四步→新声明断言[trace-continuity 断链矩阵/replayBaseline 漂移＋重 pin＋自报容忍]）。
- 路线位置：**轨道 D 收官——四轨道 A/B/C/D 全部完成**；下一轮 v1.22.0/v1.23.0=C6 语义深化上下（SHACL Core 内核化＋推理深化/双人核准），再后 v2.0.0 收尾终审轮。
- 范围红线不变：R13/编排、签名+CI 永久出范围；1.8.0 裁剪项不回潮。
