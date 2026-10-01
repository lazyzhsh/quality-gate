# ADR-0008：F2P/P2P 双向测试协议

- 状态：已接受（v1.5 工作包 A，来源 R18/SWE-bench 教训）
- 日期：2026-09-25

## 背景

"agent 声称修复了 X"的传统判据是新测试全绿，这无法区分**真修复**与两种假象：新用例在基线上本来就通过（伪交付）；顺手损坏了别处的既有行为（回归被掩盖）。

## 决策

测试类 Gate（engineering unit、behavior）支持可选 `expected:{f2p:[],p2p:[]}` 声明：**fail-to-pass** 用例必须在基线上失败（证明新行为真的未交付过）、当前通过；**pass-to-pass** 用例必须双版本通过（防回归）。skipped 不计通过。六类违规全部指名（missingCase/skippedCase/f2pStillFailing/f2pPassedOnBaseline/p2pRegressed/p2pFailedOnBaseline）。behavior 的基线判定由内核执行（见 ADR-0007）。

## 后果

- 正面："resolved"判据可机器复核，后续所有正反例增量共享这套判定基建。
- 负面：runner 必须报告逐用例 baseline 状态（协议成本）；基线本身已坏时 p2pFailedOnBaseline 只能提示而非阻断。

## 备选方案

只看当前全绿（拒绝：正是要防的假象）；对 agent 输出做语义审查（拒绝：非确定性）。

## 关联

[ADR-0007](ADR-0007-kernel-authority.md)、[PLAN](../PLAN.md) 工作包 A、[RTM P1](../RTM.md)
