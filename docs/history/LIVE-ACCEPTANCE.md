# ZCode 实机验收 — 通过

时间：2026-09-23；客户端版本：3.14.3.7762；插件：quality-gate 0.1.0。

在本机 ZCode GUI 新建 demo 会话。外部验收程序将 A1 从 confirmed 改为 open，要求 ZCode 仅回复并结束；没有调用技能、CLI 或 adapter。真实 Stop Hook 自动运行，失败反馈进入下一次模型请求。

| UTC 时间 | 状态 | 原始证据 |
|---|---|---|
| 2026-09-23T07:27:59.955Z | FAIL | [3d49299c-3a49-4abd-b48a-4bc3165239ac](../../evidence/zcode-live/3d49299c-3a49-4abd-b48a-4bc3165239ac.json) |
| 2026-09-23T07:28:15.855Z | FAIL | [a62f9968-c3d6-4724-9ba2-5b53ff76b619](../../evidence/zcode-live/a62f9968-c3d6-4724-9ba2-5b53ff76b619.json) |
| 2026-09-23T07:28:25.419Z | FAIL | [82b243d8-5dc9-4df7-b4f1-d5b0ec8f6ec2](../../evidence/zcode-live/82b243d8-5dc9-4df7-b4f1-d5b0ec8f6ec2.json) |
| 2026-09-23T07:28:48.144Z | PASS | [62ff51a3-7575-4060-b50e-d73bf68dbdf5](../../evidence/zcode-live/62ff51a3-7575-4060-b50e-d73bf68dbdf5.json) |
| 2026-09-23T07:29:54.152Z | PASS | [af9cbb0f-79af-45ae-8ac6-66a4f71274bf](../../evidence/zcode-live/af9cbb0f-79af-45ae-8ac6-66a4f71274bf.json) |

前三次 FAIL 的 syntax 均 PASS，assumptions 均 FAIL；报告记录 A1=open。每次失败反馈对应后续模型继续回复。恢复 confirmed 后第一次自动检查 PASS；随后另发独立正例请求，自动检查再次 PASS，界面回到可发送状态。

会话 ID：sess_679076ab-11d9-483c-9acf-0fe12e9583b4。所有验收响应 toolCalls 均为空。[脱敏会话摘录](../../evidence/zcode-live/session-excerpt.json) 保留 Hook 反馈和最终回复，排除认证头、完整系统提示及模型思考。

demo assumptions.json 已按原始字节恢复；SHA256：e493681c35c4f6a9f4838739cf3cd1e040397d911cb72f6eee2af0498705cf69。未更改 Gate 配置、已安装插件或其他项目。

结论：安装后的真实客户端自动触发、失败反馈使模型继续、恢复后正常结束均已验证。不是直接调用 adapter 的模拟结果。

边界：首轮末尾的界面文本仍显示此前失败，因为模型先生成回复，随后才执行 Stop 检查；判定以当次 Evidence 为准。另行正例避免此歧义。Stop 仍受宿主重试上限约束，不是不可绕过的发布门禁。本次没有验证持续失败直到超过上限的强制结束行为。
