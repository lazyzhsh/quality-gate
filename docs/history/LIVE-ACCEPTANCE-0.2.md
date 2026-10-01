# ZCode v0.2.0 客户端升级与实机验收

日期：2026-09-23；ZCode 3.14.3.7762；会话 `sess_d8c43e1a-e6ba-4517-a428-ae14cddfc518`。

通过 ZCode 插件市场刷新 `quality-gate-local`，在客户端执行 0.2.0 更新。客户端详情、`installed_plugins.json` 和安装缓存 manifest 均确认为 0.2.0。缓存中的 `lib/persistence.mjs`、Hook adapter 和 SQLite demo runner 与交付源码的 SHA256 逐项相同。

在新建 demo 会话中，暂时使用 L2 persistence 配置，runner 以 `wrong-value` 模式完成真实本地 HTTP POST 和 SQLite 回查。没有手动调用 Gate 命令或技能。Stop Hook 自动生成 FAIL，并将失败信息反馈给模型继续处理。随后将 runner 模式切换为 `normal`，自动检查获得 PASS；另发一轮独立正例请求，自动获得 PASS 并正常结束。

| UTC 时间 | 状态 | `amount_minor` 预期 / 落库实际 | 证据 |
|---|---|---|---|
| 08:54:38 | FAIL | 1250 / 1251 | [082f6a4c](../../evidence/zcode-live-v0.2/082f6a4c-5251-4999-9bc2-d5d1478111a7.json) |
| 08:55:04 | FAIL | 1250 / 1251 | [92288abb](../../evidence/zcode-live-v0.2/92288abb-9069-4b2c-913b-92680ad87ef2.json) |
| 08:55:21 | PASS | 1250 / 1250 | [9cfb11c8](../../evidence/zcode-live-v0.2/9cfb11c8-af56-4545-be66-18dd2edf53fc.json) |
| 08:56:07 | PASS | 1250 / 1250 | [038fb178](../../evidence/zcode-live-v0.2/038fb178-d0f9-4c75-80e9-907d783e6e79.json) |

[脱敏会话摘录](../../evidence/zcode-live-v0.2/session-excerpt.json)仅保留 Hook 反馈、模型可见回复和是否调用工具；本次验收的回复均无工具调用。未保存认证头或模型思考内容。

验收后，demo 原 `.quality-gate.json` 已按字节恢复（SHA256 `4adef182ae78e60c48255050cfc8ae4e268019046c6ca574949f1718fd763c0d`），临时 runner 已移除。本机安装的插件仍为 v0.2.0。

结论：v0.2 的真实客户端安装、自动 L2 错写检测、失败反馈、修复后恢复放行均已验证。Stop Hook 仍受 ZCode 重试上限约束；发布/CI 强制门禁需使用同一内核 CLI 的退出码。
