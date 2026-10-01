# 验证记录 — 2026-09-23

迁移后状态（2026-09-24）：v1.1.0 已在本机 ZCode 中完成 L3 性质 Gate 自动 Stop Hook 的失败→修复→通过实机验收。独立项目入口见 [PROJECT-HANDOFF.md](../../PROJECT-HANDOFF.md)，证据见 [LIVE-ACCEPTANCE-1.1.md](LIVE-ACCEPTANCE-1.1.md)。下文包含各早期阶段的历史原文，日期与“待验收”等表述应按其当时语境理解。

最新开发版 v1.1：逐项实施台账、114 项回归与官方校验见 [RELEASE-1.1.md](../release/RELEASE-1.1.md)。v1.0 六域原型及 64 项历史回归见 [RELEASE-1.0.md](../release/RELEASE-1.0.md)；1.0.0 客户端升级及自动 Stop Hook 六域负例/恢复正例见 [LIVE-ACCEPTANCE-1.0.md](LIVE-ACCEPTANCE-1.0.md)。v0.3 固定 FIBO 目录见 [RELEASE-0.3.md](../release/RELEASE-0.3.md)；v0.2 持久化与真实 API/SQLite 证据见 [RELEASE-0.2.md](../release/RELEASE-0.2.md)。以下保留历史记录。

P0 完成：查阅 ZCode 官方插件教程和 Hooks 协议；采用 .zcode-plugin manifest、本地 marketplace、process executor、SessionStart/Stop。plugin-creator 的 Codex 专有 manifest 不适用于目标宿主，未创建 Codex marketplace。

P1 完成：先执行 6 个内核测试，全部通过，覆盖 PASS、FAIL、timeout ERROR、非法配置、SKIP 不放行和证据写入错误。

P2 完成：之后执行内核和 3 个适配器测试，共 9 个全部通过。真实启动 Node 子进程传入 JSON，验证 SessionStart、Stop 放行/阻止以及无效输入。路径包含空格；同时验证 snake_case 和 camelCase 事件字段。

P3 完成：新增 4 项测试，验证 open→confirmed、文件错误、例外不得豁免、自定义本体目录替换。整理测试 fixture 后最终为 **13 项独立测试全部通过**，无重复计数。原始输出见 evidence/tests.txt。

P4 本地完成：运行官方仓库 scripts/validate.py 与 scripts/build_dist.py，输出 `OK: 1 plugin(s) validated` 和 `Built dist/ with 1 plugin artifact(s)`。使用导入方式仅将 ROOT/PLUGINS_ROOT/DIST/ASSETS_DIR 指向本交付目录和临时构建目录，未改变验证逻辑；官方构建生成的远程 CDN marketplace 未作为本地安装源发布。交付 ZIP 使用本地 marketplace。

两个 Gate 的实际 demo CLI 运行均 PASS，报告见 evidence/demo-pass.json。ontology CLI 返回 fibo / NOT_IMPLEMENTED。报告包含本地运行路径，这是验证证据，不是安装配置。

**历史状态（本轮已完成，见 LIVE-ACCEPTANCE.md）**：当前 PATH 未发现 zcode 命令，本轮未操作 ZCode GUI，不能宣称插件已在客户端安装或 Hook 已实机触发。按照 README 完成安装、启用、新会话、失败→修复闭环，并记录客户端版本。下一迭代优先完成此项，再实现 L2 真实 API 调用后持久化逐字段比对及固定版本 FIBO 数据导入。

已知边界：配置与报告都在本地信任域；未实现证据签名、快照绑定、Exception 审批或 OWL 推理。命令 timeout 终止直接子进程，不提供跨平台进程树隔离；首版仅配置有界静态检查，不运行后台服务。Stop 外层超时/重试上限由客户端控制。测试不证明业务语义正确或 ISO 26262 合规。

## 实机验收补充

2026-09-23 在 ZCode 3.14.3.7762 完成自动 Stop Hook 的负例与恢复正例。3 次 FAIL 反馈后恢复，再获得 2 次 PASS（含独立正例轮次）。所有验收响应未调用工具。demo 原文件按字节恢复。完整记录见 [LIVE-ACCEPTANCE.md](LIVE-ACCEPTANCE.md)。

## v0.2 客户端升级补充

本机已通过插件市场将 quality-gate 更新为 0.2.0，并在新会话自动触发 L2 持久化错写 FAIL 与恢复 PASS。详见 [LIVE-ACCEPTANCE-0.2.md](LIVE-ACCEPTANCE-0.2.md)。

## v0.3 固定 FIBO 目录原型

确定性导入九个 Agreements 概念，官方校验/构建通过；源码与解包插件各 41 项测试全部通过。CLI 案例分别得到已知术语 PASS/0、未知术语 FAIL/1、目录指纹错误 ERROR/2。证据见 [RELEASE-0.3.md](../release/RELEASE-0.3.md) 与 `evidence/v0.3/`。本机 ZCode 客户端仍为 0.2.0，v0.3 实机升级受 Windows Computer Use 输入拒绝访问阻断，尚未完成。
