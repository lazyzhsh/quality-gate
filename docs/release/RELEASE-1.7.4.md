# Release 1.7.4 — 报告可见性（分级人读报告）

发布日期：2026-09-26。补丁主线：让门禁结果在对话 turn 中**可见**。来源：用户 1.7.3 实机使用反馈——agent 跑完门禁后对话正文没有任何表格，看不到检查了什么、结果怎样、有什么建议；方案经 AskUserQuestion 选定（报告可见化三件套 + 分级呈现 + 补丁版本，RTM O5）。

## 问题链条

1. `renderSummary` 早已产出 Markdown 表，但打在 stderr——经终端工具执行时藏在被折叠的工具块里，SKILL/命令提示词只要求"Report status and evidence path"，agent 从不复述进回复正文。
2. Stop Hook 按 CLIENT 平台行为在 PASS 时输出 `{}`（放行即静默），FAIL 时才把摘要回传 agent 作阻断反馈——正常通过的回合用户端零输出。
3. 旧表缺建议列与耗时，历史 run 无法不重跑就重渲染。

## 改动

- **分级 stderr**（`bin/qgate.mjs` + `lib/summary.mjs`）：整体 PASS 输出一行 brief（`✅ **Quality Gate PASS** · close · 15/15 通过 · 耗时 0.9s · run=…`、域覆盖行、证据路径与全表提示），不再附带全表；非 PASS 输出全量 Markdown 表，新增**建议列**（FAIL→按原因修复后重跑；ERROR→检查 runner/配置输入；SKIP→不在本阶段执行），标题行含报告级耗时（startedAt→finishedAt）。stdout JSON 与判定语义不变；Stop Hook 非 PASS 阻断 reason 仍用全量摘要。
- **`qgate.mjs report <project-root> [runId]`**（缺省取 `.quality-gate/runs/` 最新）：不重跑门禁重渲染归档运行的全量报告，前置「归档运行 · 生成于 … · 非当前状态；重跑: …」守卫行，避免历史输出被误读为当前状态；未知 runId / 无档案 fail-closed 退出码 2。
- **提示词层强制呈现**：SKILL.md 新增第 5 步（分级呈现规则 + 修复循环后更新 + `report` 引用历史 + 禁止裸口头宣称）；`/quality-gate`、`/quality-gate-init`、`/quality-gate-update` 三条命令与 SessionStart 注入文案同步要求把分级报告贴进回复正文。

## 验证

- 373 项回归（367→+6：brief 无表/建议列四态/耗时格式/`tests/report.test.mjs` 3 项分级与 fail-closed）。
- 夹具正例：`expense-approval-fixture close` PASS → stderr 仅 3 行 brief；`report` 重渲染全表含建议列与归档守卫（evidence/v1.7.4/）。
- 夹具负例（临时副本注入 `APPROVAL_LIMIT_CENTS` 99999）：exit 1，全表含建议列，级联可见（rtm→behavior、engineering unit、behavior limit；未满足必需域 L0/L1/L3）。
- SessionStart 新文案经 adapter 实调确认。

## 边界与不做

- stdout JSON 报告、退出码、判定语义、Stop Hook 判定路径全部不变；本补丁只动展示层与提示词层。
- Stop Hook PASS 静默是客户端平台行为，插件无法在放行时向用户端注入可见消息——对话内可见性由提示词层（agent 运行后呈现）承接，Stop 钩子作为兜底。
- brief 的"全表提示"指向 `qgate.mjs report`；不含每门禁耗时（表宽权衡，报告级耗时在标题）。

安装包：`dist/quality-gate-1.7.4.zip`（493 文件，SHA256 `bf1529322025d77b3cf1fd9911ea4c999becbf082966d0253e091a468c7e5bec`；打包复验 373 项测试与 28 个烟测 demo）。
