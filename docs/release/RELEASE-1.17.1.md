# RELEASE 1.17.1（2026-10-01）

**主线：任务意图软形态——轨道 A 收官步**（小迭代补丁，来源[演进基线 v0.9](../context/original-design-v0.9.md) §30.7/§41；OD-105 经 2026-10-01 AskUserQuestion 裁决＝**登记即激活**）。**零破坏**：纯适配器层＋可选顶层键，内核判定语义零变化；未登记意图的项目完全无感知。

## 内容

- **UserPromptSubmit（意图基准行注入）**：意图登记存在时，每条提示词附加一行任务意图基准（taskId＋statement＋scope＋越界后果与修订指引）——"早期约束被挤出上下文窗口"的结构性对抗；无登记完全静默；
- **PreToolUse（范围软提示）**：Write/Edit/MultiEdit/NotebookEdit 目标路径不在意图 scope 时注入 systemMessage 软提示（指名文件、scope 与修订命令）——**软提示不拦截不决策**（无 decision/permissionDecision 字段），权威判定恒在 close 阶段漂移对账；scope 匹配复用 pathGlob（与 change-scope/stop.inputs 同一 glob 语义）；
- **启用协议（OD-105）**：登记即 opt-in——软形态随意图登记存在自动激活；顶层配置 `intent:{capture?,hooks?}`：`hooks:false` 整体关闭（即使已登记）、`capture:true` 开启未登记项目的引导提示（默认关）；内核 validate 校验形状（坏形状 fail-closed）；
- **失败语义（软形态专用）**：软形态自身故障（登记损坏/配置异常/无法解析的目标路径）一律静默 `{}`——软形态是降低修复成本的提前暴露，不制造会话噪声；对应地 SessionStart/Stop 的 fail-closed 阻断语义不变；
- hooks.json 生命周期事件扩至四个（SessionStart/Stop/UserPromptSubmit/PreToolUse，共用 adapter.mjs，软形态事件 timeoutMs 5000）。

## 验证与证据

- 全量回归 **506 项（505 过/1 skip=pytest 守卫）**（497→506，+9：基准行注入/无登记静默/capture 显式开/hooks:false 静默/越界软提示文案/正常路径静默/坏登记静默/hooks 注册守卫/validate 拒收）；既有 adapter 9 项回归零变化；
- 发行包 `dist/quality-gate-1.17.1.zip`：**618 文件**，SHA256 `3cf58f55d6398083f8f5ab7c03ec7215e889c37ff26f7951872e980c7aa9ceec`（两次构建全同）；构建内自验证（506 测试＋24 冒烟 demo）与独立解包复验见 `evidence/v1.17.1/`；
- 客户端实机验收挂起（用户决定，2026-10-01）：与 1.17.0 同轮补做（先例：v1.15 并入 v1.16 验收）——验收走查含软形态注入实证（登记会话的提示词基准行与越界软提示）。

## 边界（如实）

- 软提示非拦截：agent 可忽略软提示继续写入（close 漂移对账兜底判定）；
- 基准行按提示词逐条注入（token 成本约一行，换取持续可见性）；
- capture 引导提示依赖宿主 UserPromptSubmit 生命周期（ZCode 已具备，见 v0.9 §57）。

## 升级与迁移

零破坏，无需迁移。默认行为：登记即激活；`intent.hooks:false` 可整体关闭。
