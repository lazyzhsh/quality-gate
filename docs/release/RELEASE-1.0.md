# Quality Gate 1.0.0：L0–L5 六域原型

本版完成六域可运行原型：L0 显式 RTM，L1 命令正确性，L2 持久化字段/本体术语/项目声明约束，L3 业务用例，L4 数值工程指标，L5 交付制品与同次演练。九种 Gate 可按 `enabled` 和 `stages` 裁剪；`requiredDomains` 可在 close/release 强制六域都有通过证据。Claim、Evidence、Gate、Risk、Exception 都进入同次报告；Exception 仅支持 proposed 登记并阻断交付，不具备审批豁免。

## 阶段自测

| 阶段 | 核心增量 | 正反例证据 | 累计测试 |
|---|---|---|---:|
| v0.4 | L0 RTM | [matrix](../../evidence/v0.4/matrix.json) | 45 |
| v0.5 | L2 本体关联样例约束 | [matrix](../../evidence/v0.5/matrix.json) | 48 |
| v0.6 | L3 业务行为 | [matrix](../../evidence/v0.6/matrix.json) | 51 |
| v0.7 | L4 工程指标阈值 | [matrix](../../evidence/v0.7/matrix.json) | 54 |
| v0.8 | L5 制品与演练 | [matrix](../../evidence/v0.8/matrix.json) | 57 |
| v0.9 | 六域覆盖与例外提案 | [matrix](../../evidence/v0.9/matrix.json) | 60 |
| v1.0 | 六域组合正例、逐域负例与 Stop 适配器修复闭环 | [完整测试](../../evidence/v1.0/tests.txt) | 64 |

v1.0 全量源码测试 64/64，通过 [ZCode 官方结构校验与构建](../../evidence/v1.0/official-validation.txt)；官方构建插件 ZIP 解包后 [同样 64/64](../../evidence/v1.0/package-smoke.txt)。六域组合示例的 release 运行记录六域均 PASS，逐域故障注入和禁用必需域均不能通过；Stop 适配器也验证了失败阻断与修复放行。详见 `tests/six-domain.test.mjs` 与 [组合正例](../../evidence/v0.9/pass.json)。

## 适用边界

这是可部署的质量门禁框架原型，不是 ISO 26262 合规认证或自动完整测试平台。RTM 关联不证明每条 AC 被测试内部断言覆盖；FIBO 小样本只包含固定 Agreements 九个类；semantic-profile 是项目声明的 JSON 约束而非 SHACL 推理；示例安全扫描、耗时测量与回滚演练不代表生产保证。正式项目须选择可信 runner、真实案例、隔离环境及阈值，并在 CI 的 `pr`/`release` 阶段以退出码强制。

配置规范见 [Gate Spec 1.0](../history/GATE-SPEC-v1.0.md)，全链路样例见 [six-domain-demo](../../plugins/quality-gate/examples/six-domain-demo/.quality-gate.json)。ZCode 客户端已升级到 1.0.0，并通过真实自动 Stop Hook 的 L2 负例阻断、修复后六域 PASS；详见 [实机验收](../history/LIVE-ACCEPTANCE-1.0.md)。
