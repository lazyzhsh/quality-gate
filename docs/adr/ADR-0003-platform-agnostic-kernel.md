# ADR-0003：平台无关内核 + ZCode 首个适配器，CI 为最终准出

- 状态：已接受（v0.1 §4.8/§2.1 定案，v1.5 实机验收后强化）
- 日期：2026-09-23；复核 2026-09-25

## 背景

同一套门禁逻辑未来要挂载 ZCode、Claude Code、Codex、CI 等多宿主。宿主事件格式（hook payload、camelCase/snake_case、插件数据目录）各不相同；客户端的 Stop 阻断存在重试上限（三轮），不能当作不可绕过的发布门禁。

## 决策

1. 判定与执行全部在**独立 Node CLI/内核**（`plugins/quality-gate/lib`+`bin/qgate.mjs`），零宿主依赖；宿主只经薄适配层接入。ZCode adapter（hooks/adapter.mjs）只做事件名/cwd/报告目录归一。
2. 报告落盘双轨：无宿主环境变量时写项目 `.quality-gate/runs/`；客户端 Hook 设置 `ZCODE_PLUGIN_DATA` 时写插件数据目录按工作区根 SHA256 隔离的 runs。
3. 客户端 Stop 阻断定位为**反馈回路**（agent 修复循环），最终强制准出用同一 CLI 的非零退出码在 CI 执行。

## 后果

- 正面：CLI 与客户端行为可分别验证（v1.5 双栈交叉复验成立的基础）；换宿主不动内核。
- 负面：每个宿主都要重做实机验收；客户端报告位置不直观（需要文档说明，已入 PRD/验收文档）。

## 备选方案

把逻辑写进 ZCode hook 脚本（拒绝：不可移植、不可独立回归）；以客户端阻断为发布门禁（拒绝：重试上限可被耗尽绕过）。

## 关联

[ADR-0010](ADR-0010-zero-dep-packaging.md)、[history/LIVE-ACCEPTANCE-1.5](../history/LIVE-ACCEPTANCE-1.5.md)、[RTM X7](../RTM.md)
