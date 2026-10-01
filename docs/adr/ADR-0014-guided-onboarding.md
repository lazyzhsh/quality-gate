# ADR-0014：首运行引导采用"静态模版库 + 确定性装配"，agent 只问询、写入仅在 CLI 层

- 状态：已接受（用户 2026-09-26 提出"首次运行先引导对话，推荐&选择定制初始化 .quality-gate.json"，档位/三层定制经 AskUserQuestion 选定；v1.7.0 落地）
- 日期：2026-09-26

## 背景

v1.6 及以前，缺 `.quality-gate.json` 时只有三处提示文字（SessionStart 一句话、SKILL 步骤 2、命令正文），靠 agent 手工改编 `examples/demo` 完成接入：无结构化选项、无校验前置、易复制演示成功条件。用户要求首次运行先跑引导对话：按模版内可选择内容以推荐&选择方式定制初始化。

## 决策

1. **模版库是内核侧静态数据**（`lib/templates.mjs`，零依赖纯数据+装配函数）：7 个模版按 lite/pro/max 档位累积（入门最小、Node 工程、Web API；数据账本、安全加固、六域全量；发布治理），另附 10 个可勾选附加门禁（扫描类/change-scope/debt/rerun）。项目相关处以 `__PLACEHOLDER__` 占位，装配后残留即报错并定位路径（fail-closed）。
2. **agent 只问询不代写**：`/quality-gate-init` 命令规程为"探测项目 → AskUserQuestion 逐层推荐选择（档位→模版→附加/禁用→真实 argv/claims）→ 汇总 answers 文件"；answers 契约 `{templateId, addOns?, disable?, substitutions, requiredDomains?}` 受严格校验（未知字段/目标即拒绝）。
3. **写入仅在 CLI 层**：`qgate.mjs init <root> <answers> [--force]` 调 `assembleConfig`（克隆→禁用级联清理→合并附加→替换→占位符扫描→内核 `validate()`）后写盘；kernel `run()` 保持只读。已有配置无 `--force` 拒绝覆盖，`--force` 须先经用户复核（命令规程第 1 步）。
4. **缺配置指引可行动化**：SessionStart 区分 ENOENT（指向 `/quality-gate-init`）与配置损坏；kernel 缺配置报错指向 `qgate.mjs templates/init`，宿主中立。

## 后果

- 正面：首运行从"读文档手工改编"变为有限选择的推荐对话；配置必然过 `validate()`，杜绝手写 JSON 拼错；模版 hints/notes 直接驱动问询选项，agent 无需自行发明菜单。
- 负面：模版是骨架协议——runner 与登记文件仍需项目按 CONFIG-GUIDE 补齐（首跑 close 按设计 FAIL/ERROR）；模版库需随 kind 演进维护（35 kinds 的新增不自动获得模版席位）。

## 备选方案

纯 CLI 交互向导（拒绝：ZCode 会话内体验割裂，用户不直接跑 stdin 问答）；agent 直接手写配置再校验（拒绝：LLM 自由生成绕过确定性装配，违背 ADR-0004）；以 examples 目录为模版源（拒绝：示例需可运行锚与烟测，模版含占位符不可直接运行，混入会破坏 manifest 单一事实源约定）。

## 关联

[ADR-0003](ADR-0003-platform-agnostic-kernel.md)、[ADR-0004](ADR-0004-deterministic-first.md)、[ADR-0011](ADR-0011-manifest-single-source.md)、[CONFIG-GUIDE 引导初始化与模版库](../CONFIG-GUIDE.md)、[RTM O1](../RTM.md)、[release/RELEASE-1.7](../release/RELEASE-1.7.md)
