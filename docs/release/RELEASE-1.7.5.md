# Release 1.7.5 — 报告可见性细化（Markdown 呈现 / 耗时列 / 相对路径 / 前缀解析）

发布日期：2026-09-26。补丁主线：1.7.4 实机截图反馈的四点收口（RTM O5 细化）。用户在测试项目实跑 1.7.4 确认"基本符合预期"，同时暴露：报告被 agent 包进 `text` 代码围栏（`**加粗**` 显示原文、表格不渲染）、brief 绝对路径过长撑出横向滚动、全表无逐门禁耗时、全表提示命令要抄 36 位 run id。

## 改动（全部展示层，判定语义与 stdout JSON 不变）

- **Markdown 呈现**：SKILL 第 5 步、三条命令、SessionStart 文案由 "verbatim paste" 改为「以 Markdown 正文粘贴、**不得包代码围栏**（否则加粗与表格不渲染）、正文说明控制在一两句」。
- **每门禁耗时列**：全表新增 `耗时`（evidence 的 startedAt→finishedAt，`durationText` 复用；无效为 —）——正例即可见 `syntax 0.1s / engineering 0.5s` 的差异，便于定位慢门禁与预算调优。
- **相对化展示路径**：`完整证据:`、全表 `report` 提示、非 PASS 页脚重跑命令均按当前工作目录相对化（`stripCwd`，仅显示层；`root===cwd` 显示 `.`）。
- **runId 前缀解析**：`qgate.mjs report <root> [runId]` 在精确文件名未命中时按唯一前缀（≥4 字符）匹配归档运行——0 命中报 not found、多命中报 ambiguous 并列出候选（fail-closed）；brief 的全表提示因此缩短为 8 位短 id。
- **非 PASS 页脚**：`修复失败项后重跑: node bin/qgate.mjs "<root>" <stage>；不要通过禁用门禁来放行。`

## 验证

- 375 项回归（373→+2：stripCwd 单元、report 前缀解析/过短/歧义三态；既有断言随耗时列更新）。
- 夹具正例：PASS brief 三行（相对路径 + 8 位短 id 提示）；`report <root> <前缀>` 命中并渲染含耗时列的全表。
- 夹具负例（临时副本注入 `APPROVAL_LIMIT_CENTS` 99999）：exit 1，全表含耗时列与重跑页脚，级联可见（rtm→behavior、engineering unit、behavior limit）。
- 提示词改动覆盖 SKILL、`/quality-gate`、`/quality-gate-init`、`/quality-gate-update`、SessionStart。

## 边界与不做

- stdout JSON、退出码、门禁判定、Stop Hook 判定路径不变；相对化只作用于显示字符串，`report` 子命令仍接受绝对/相对 root。
- Stop Hook PASS 静默仍是客户端平台行为，由提示词层承接。
- 前缀匹配要求唯一与 ≥4 字符，是为防止误引历史运行；需要精确时仍可传完整 36 位 id。

安装包：`dist/quality-gate-1.7.5.zip`（497 文件，SHA256 `caa8ca7acdaaf7052803cd983dfae8f7d12533f31e97fc5e3c3fb141413adf2e`；打包复验 375 项测试与 28 个烟测 demo）。
