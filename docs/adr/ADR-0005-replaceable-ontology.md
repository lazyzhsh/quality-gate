# ADR-0005：本体 Provider 可替换，FIBO 固定版本离线钉扎

- 状态：已接受（v0.1 §4.6 定案；v1.3 升级为 vendored 双模块）
- 日期：2026-09-23；修订 2026-09-25（v1.3 FIBO 手动升级工作流）

## 背景

金融领域语义对齐需要领域本体；但把 FIBO 写死进核心违反平台无关与可替换原则，且运行时联网拉取不可复现、不可审计。

## 决策

本体作为 **Provider 接口**：`fibo-pinned`（固定版本目录，随包 vendored Agreements/Contracts 52 概念，逐源 SHA256 核验、运行不联网）与 `local-catalog`（项目自带 JSON 目录，支持 altLabels/subClassOf/disjointWith）。代码内常量钉扎目录 SHA；目录升级走手动工作流（scripts/import-fibo.py 重建 + ontology_diff.py 分类变更 + `acknowledgedOntology` 指纹重确认，映射不重审即 staleOntologyAck FAIL）。

## 后果

- 正面：语义判定完全离线可复现；升级有强制重审闸门；非金融项目可整体替换。
- 负面：FIBO 版本推进需人工执行；只有子集，不含跨模块边（记录于目录 manifest）。

## 备选方案

运行时 SPARQL 端点（拒绝：联网+不可复现）；完整 FIBO 导入（拒绝：体积与噪音，52 概念已够首个金融域样例）。

## 关联

[ADR-0006](ADR-0006-builtin-owl-subset.md)、[FIBO-PROVIDER](../FIBO-PROVIDER.md)、[RTM X6](../RTM.md)
