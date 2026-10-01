# ADR-0009：证据纪律四件套（有效性/新鲜度/冻结/来源分级）

- 状态：已接受（v1.5 工作包 B；泛化 v1.3 acknowledgedOntology 语义）
- 日期：2026-09-25

## 背景

证据会"变质"：closed-loop 延迟测量没做 CO 纠正就与阈值比较（测量无效）、演练报告是三年前的（过期）、存量违背清单被悄悄改写（篡改）、拓扑"事实"只是口头声明（来源不明）。单项治理（acknowledgedOntology）已证明模式可行。

## 决策

metrics/resilience 门禁落地四个正交机制：`evidenceValidity`（延迟测量必须声明起点/加载模型/CO 纠正工具，不合格证据不参与阈值比较直接 FAIL）；`maxAgeDays`+observedAt（过期 FAIL）；`baselineViolations:{frozenAt,snapshotSha256}`（只拦新增违背，冻结清单哈希防篡改，减少提示重建基线）；`provenance:{declared|derived|drilled}`（纯 declared 声明在摘要中显式降权）。旧配置缺字段兼容不阻断（渐进采用）。

## 后果

- 正面：证据可信度成为可判定属性而非口头承诺；各机制独立可用。
- 负面：生产接入要真实登记来源与时间戳；跨运行汇总与签名仍在界外（开放项）。

## 备选方案

一刀切要求全字段（拒绝：破坏渐进接入）；信报告生成时间（拒绝：可伪造）。

## 关联

[ADR-0004](ADR-0004-deterministic-first.md)、[PLAN](../PLAN.md) 工作包 B、[RTM P2](../RTM.md)
