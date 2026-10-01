# ADR-0011：示例以 examples.manifest.json 为单一事实源

- 状态：已接受（v1.5 发布后同日定案，ee1aa07）
- 日期：2026-09-25

## 背景

38 个示例此前分散被五处使用（回归夹具、打包烟测、README 入门、文档引用、随包分发）但无统一登记：出现过孤儿示例（semantic-profile-demo 无任何引用）与无自动化锚的示例（PASS 与否无人强制）。

## 决策

`examples/examples.manifest.json` 成为全部示例的**单一事实源**（id/role/domains/kinds/smokeStage）；`tests/examples.test.mjs` 强制六项不变量（目录同步、配置有效、kind 覆盖含显式缺口声明、每示例至少一个自动化锚=烟测或测试引用、烟测阶段有效、README 索引同步）；打包烟测清单改由 manifest 驱动。经分析**不合并示例**（每 demo 约 4 文件、一协议一 demo、负例注入隔离是测试设计本身），管理问题用清单解决。

## 后果

- 正面：新增示例必须登记，无锚示例无法再悄悄出现（此前 5 个无锚示例已接入烟测，22→27）；change-scope 无示例成为**显式**已知缺口。
- 负面：新增示例多一步登记；清单与目录的双向同步依赖测试维护。

## 备选方案

合并为单一大示例（拒绝：负例注入互相污染）；按目录约定推断（拒绝：role/smokeStage 无处安放）。

## 关联

[ADR-0010](ADR-0010-zero-dep-packaging.md)、[history/RELEASE-1.5](../release/RELEASE-1.5.md) 工程治理节、[RTM X11](../RTM.md)
