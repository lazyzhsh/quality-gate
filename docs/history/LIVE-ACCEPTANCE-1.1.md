# Quality Gate 1.1.0 ZCode 实机验收

验收日期：2026-09-24。本机 ZCode 插件详情页显示 `quality-gate` 版本 1.1.0，提供 1 个 Skill、1 个 Command，以及 SessionStart、Stop 两个 Hook。安装缓存中的 `lib/property.mjs` 与交付源码 SHA256 一致；安装缓存的 114 项回归全部通过，记录见 [installed-cache-tests.txt](../../evidence/v1.1/installed-cache-tests.txt)。

验收项目：`work/zcode-v11-acceptance`，配置要求 close 阶段的 L3 `payment-properties` Gate。通过 ZCode 正常新建任务并让模型回复，客户端自动调用 Stop Hook，没有在会话中手动执行门禁命令。

| 场景 | ZCode 中的行为 | 客户端生成的报告 |
|---|---|---|
| 故意错误的退款样例 | Stop Hook 显示“已阻止”；`payment-properties` FAIL；第 8 个样例的退款 300 大于扣款 299 | [stop-fail.json](../../evidence/zcode-live-v1.1/stop-fail.json) |
| 修复验收样例后 | Stop Hook 正常完成，模型回复“恢复验证完成”；100/100 个性质样例 PASS，反例为空 | [stop-pass.json](../../evidence/zcode-live-v1.1/stop-pass.json) |

首次尝试使用 GLM-5.3 时遇到 ZCode 模型额度限制；随后客户端切换至 Minimax/MiniMax-M3，完成上述自动 Hook 验收。首次任务的 SessionStart Hook 在客户端记录中可见。错误配置恢复时只移除了验收项目 `argv` 中的 `wrong-refund` 参数，没有禁用 Gate 或更改必需域。

本次**实机**验证覆盖插件安装状态、SessionStart 触发、L3 性质 Gate 的 Stop Hook 自动阻断与修复放行。L0、L1、L2、L4、L5 在本次实机会话中为 SKIP，不能把此记录当作六域全部通过的实机证据；六域的可执行正反例及本地回归见 [1.1 发布说明](../release/RELEASE-1.1.md)。CLI 和打包验证也不等同于 ZCode 内 Command/Skill 的本次交互验收。
