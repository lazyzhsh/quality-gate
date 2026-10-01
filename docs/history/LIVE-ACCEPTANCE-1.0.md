# ZCode 1.0.0 客户端升级与六域实机验收

日期：2026-09-23 至 2026-09-24。ZCode 插件管理页及 `installed_plugins.json` 均显示 `quality-gate@quality-gate-local` 版本 1.0.0；安装目录为客户端缓存中的 `quality-gate/1.0.0`。通过 ZCode 插件市场的“更新”操作完成客户端升级，随后在新的 demo 会话中测试自动 Stop Hook，未手动调用 Gate 命令或技能。

验收时将完整六域样例暂时放入已登记的 demo 工作区，保留原文件备份。负例仅删除样例记录的 `partyIds` 字段；其余七个 Gate 和 `requiredDomains` 配置不变。Stop Hook 连续生成四份 FAIL 报告，其中 L0/L1/L3/L4/L5 均 PASS，L2 `semantic-profile` 指出 `partyIds` 的 `minCount=2`，实际数量为 0；`unmetRequiredDomains=["L2"]`。客户端将失败反馈给模型，模型回复中报告了证据文件，未修改配置。

恢复 `partyIds` 原始值后，于 2026-09-24 新建正例会话。自动 Stop Hook 生成 PASS 报告，七个 Gate 全部 PASS，L0–L5 六域覆盖全部 PASS，会话正常结束。

| 结果 | 报告 | 关键事实 |
|---|---|---|
| FAIL | [c69da2e8](../../evidence/zcode-live-v1.0/c69da2e8-9668-4612-b718-213e493ad20f.json) | L2 `partyIds` 缺失 |
| FAIL | [46207da9](../../evidence/zcode-live-v1.0/46207da9-caad-446c-9a6e-f338ab628a0e.json) | 客户端自动重试仍阻断 |
| FAIL | [c2d1b5a9](../../evidence/zcode-live-v1.0/c2d1b5a9-c674-4bbc-9c1d-7aec06fc5f26.json) | 模型收到失败证据路径 |
| FAIL | [ddfae128](../../evidence/zcode-live-v1.0/ddfae128-914f-4343-980b-447c59a40c5f.json) | L2 仍未放行 |
| PASS | [590729e3](../../evidence/zcode-live-v1.0/590729e3-a507-4b46-af1c-eee11c937bc4.json) | 修复后七项检查、六域覆盖全部通过 |

客户端在负例首轮发生模型使用限额提示并自动从 GLM-5.3-Flash 切换为 MiniMax-M3；后续 Hook 仍执行且产生上述失败报告。该限额属于模型服务，与 Gate 结果分开记录。

验收后 demo 工作区中临时加入的六域文件已逐项移除，原 `.quality-gate.json`、`app.mjs`、`assumptions.json` 按 SHA256 与事前备份一致。原配置 SHA256 为 `4adef182ae78e60c48255050cfc8ae4e268019046c6ca574949f1718fd763c0d`。客户端继续安装 1.0.0。

结论：1.0.0 的客户端安装、六域自动 Stop Hook、L2 负例阻断、修复后放行均获实机证据。Stop Hook 仍受 ZCode 重试上限约束；发布阻断须在 CI 中调用同一内核 CLI 的退出码。
