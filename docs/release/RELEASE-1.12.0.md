# Release 1.12.0 — API 消费者链层（E6 落地：consumer-matrix kind）

发布日期：2026-09-27。E6 实现方向经用户选定：**方案 B（独立 kind）+ 分层来源协议（声明层先行、观察层可选）**；零破坏（纯新增 kind，既有配置零迁移）；GATE-SPEC-v1.12 现行（v1.11 归档 history）。

## 新增：第 34 个 kind `consumer-matrix`（L2，runner 观察 + 内核逐消费者判定）

- **声明层（必需）**：`consumers:[{id, expectedFile, compatibilityLevel?}]`（1..20，id 唯一）。期望文件 `{schemaVersion:'0.1', kind:'consumer-matrix', consumer:<须与声明 id 绑定>, items:[{path, method, fields?:{字段:类型}}]}`——类型词汇为项目自有字符串，内核比较相等性。runner 观察 provider 当前契约（同形状 items，stdin 收 `{runId, consumers}` 并回显 runId），内核逐消费者比对：missingEndpoint / missingField / typeChanged；`compatibilityLevel:"exact"` 另将期望端点上的多出字段计 `unexpectedField`。产出：
  - `details.matrix`——兼容矩阵（consumer × compatible/broken × 违规/忽略计数 × 使用面来源）；
  - `details.attribution`——**破坏归因表**（provider 项 → brokenConsumers[]，直接回答"这次变更破坏了谁"）。
- **观察层（可选，分层来源协议）**：runner 可回报 `consumerUsage:[{consumer, usage:'scanned'|'contract-test'|'declared', items:[{path,method,field?}]}]`——
  - 使用面**超出**该消费者声明期望即 FAIL 指名"使用面超出声明期望——期望文件已过期"（期望过期不可静默通过）；
  - `declared` 来源（runner 自报，无扫描/契约测试佐证）摘要降权标注；`contract-test`（消费者契约测试产物）为最强来源；`scanned` 介于其间。
- **豁免与观察可信度**：`ignoreRoutes`（`/` 起路由模式、`*` 通配一段）只豁免声明的路由，被忽略项留在证据 `ignoredBreaking`；`mode:live|static` + `requireLive`、`sourceFingerprint` 声明即核验——全部沿用 alignment 协议，零新概念。
- 正反例见 `examples/consumer-matrix-demo`（最小 OpenAPI 3 归一 runner：static 观察 + 指纹声明核验 + 双来源使用面 contract-test/declared，烟测 close PASS 且两条降权行如实可见）与 `tests/consumer-matrix.test.mjs`（8 项：兼容矩阵+指纹锚、类型变更仅破坏依赖消费者并归因、端点删除、exact 多出字段、超面使用 FAIL、ignoreRoutes 留证据放行、requireLive、畸形矩阵含 consumer 绑定不符/空 items/非法 usage 枚举/非法 compatibilityLevel）。

## 验证

- 415 项回归（407→415：consumer-matrix 8 项；406+8 过/0 败/1 skip=pytest 守卫）；CONFIG-GUIDE 新节+jsonc 样例（config-guide 测试过，样例数=GATE_KINDS+1）；summary per-kind 提取器覆盖（矩阵归因逐消费者原因+超面使用+requireLive/指纹）；examples 清单/索引同步（36 示例）；GATE-SPEC-v1.12 现行；RTM E6 行转原生、§9 刷新。
- 打包：`quality-gate-1.12.0.zip`（527 文件，SHA256 `c57a63ce9b353e5899950e465945a73901630c20dbfdd6241fc47a13f9966f6a`）解包复验全量测试+烟测通过，见 `evidence/v1.12.0-unpack-verify.txt`。

## 边界

消费者期望仍为**声明式**（期望本身的正确性由消费者侧测试保障，本门禁证 provider↔期望的兼容性）；类型词汇项目自有、内核比较相等性（不解释 OpenAPI 类型系统语义）；观察层 `declared` 来源仅降权不阻断（防静默不防自报）；`contract-test` 来源的产物格式由各项目 runner 归一，本框架不强制 Pact 等特定工具。客户端实机验收（1.10.1/1.11.0/1.12.0）待下一轮次。

下一轮候选：L3 复审改进候选（behavior/journey raw-transcript、baseline 内容内核重放、visual 浏览器接入、C6 语义深化，见 [MECHANISM-REVIEW-L3R-2026-09-27](../history/MECHANISM-REVIEW-L3R-2026-09-27.md)）。
