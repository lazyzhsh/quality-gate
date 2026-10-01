# ADR-0013：L2 持久化验证必须独立回读，响应回显不构成落库证据

- 状态：已接受（原始对话中用户明确定案，v0.2 落地为 persistence 门禁；本记录自讨论档案迁入）
- 日期：2026-09-23（决策）；2026-09-25（补记为 ADR）

## 背景

用户在需求讨论中特别强调：L2 不能只做 Schema Semantic Check——必须执行真实案例或接口调用，随后**独立读取持久化数据**，逐字段比较预期与实际。接口响应回显、ORM 声明或迁移脚本都不能证明数据已按约定落库。

## 决策

persistence 门禁采用三段协议：runner 实际调用被测接口（真实 HTTP/命令）→ 独立回查已提交存储（如 SQLite 实表）→ 内核对逐字段 expected/actual 判定。`expectedRecordCount` 支持反向断言（0=必须不落库，允许非 2xx 拒绝场景）；幂等性用同 runner 双 gate 模式（两次提交+比对）覆盖；可强制 before/after 快照并由内核生成字段 delta。运行输入输出以唯一 runId 关联，防跨运行拼贴。

## 后果

- 正面："数据写对了"成为可复核证据而非推断；B 类数据正确性（v1.5 consistency 零和/对账）沿同一思路扩展。
- 负面：每个项目要提供真实存储的回读 runner（协议成本）；生产库不可直连时需隔离副本或镜像核对。

## 备选方案

比较 API 响应与预期（拒绝：回显≠落库）；只校验 schema/迁移（拒绝：结构对不等于数据对）。

## 关联

[ADR-0004](ADR-0004-deterministic-first.md)、[PERSISTENCE-GATE](../PERSISTENCE-GATE.md)、[RTM L2.4](../RTM.md)、[history/RELEASE-0.2](../release/RELEASE-0.2.md)
