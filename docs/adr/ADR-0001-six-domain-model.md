# ADR-0001：六质量域 × 生命周期阶段两维正交

- 状态：已接受（v0.1 设计定案，持续有效）
- 日期：2026-09-23（原始设计 §5）

## 背景

传统流水线把"检查什么"和"何时检查"混在一起，导致每次提交跑全量或漏跑关键检查。用户要求可裁剪且不因裁剪产生"漏检即默认通过"。

## 决策

L0–L5 六个质量证明域（范围需求/工程正确性/系统一致性/行为语义/架构非功能安全/交付治理）与触发阶段（edit、close、pr、release）作为**正交两维**：Gate 通过 `enabled`、`stages` 与 `requiredDomains` 裁剪；被裁剪或未执行的 Gate 产生 SKIP，**SKIP 不计 PASS**；requiredDomains 缺域整体 FAIL。

## 后果

- 正面：裁剪表达力强，六域组合（six-domain-demo）可强制全域覆盖；语义与"no evidence ≠ PASS"一致。
- 负面：配置面变大，需要 CONFIG-GUIDE 与机器校验样例兜底（tests/config-guide.test.mjs）；尚无变更影响驱动的自动推荐（RTM X3 后续）。

## 备选方案

按阶段硬编码检查集（拒绝：不可裁剪、无法表达域要求）；每次全量执行（拒绝：40s 阶段预算下不可行且违反可裁剪目标）。

## 关联

[ADR-0002](ADR-0002-proof-chain.md)、[GATE-SPEC（现行）](../history/GATE-SPEC-v1.15.md)、[RTM X3](../RTM.md)
