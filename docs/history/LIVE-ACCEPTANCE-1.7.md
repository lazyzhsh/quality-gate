# Quality Gate 1.6.0–1.7.3 ZCode 客户端实机验收

验收日期：2026-09-26。用户已将 ZCode 客户端插件升级至 **1.7.3**（缓存内仅存 0.1.0/0.2.0/1.7.3，当前启用 1.7.3）并要求使用"电脑控制"执行。本轮一次性收口 1.6.0、1.7.0、1.7.1、1.7.2、1.7.3 五个版本累积的客户端实机验收欠账（各版 CLI/模拟侧证据见 [docs/release/](../release/) 与 `evidence/v1.6`–`v1.7.3`）。证据目录：[evidence/zcode-live-v1.7/](../../evidence/zcode-live-v1.7)。

与前次验收（[LIVE-ACCEPTANCE-1.5](LIVE-ACCEPTANCE-1.5.md)）的关键差异：本轮首次以 **expense-approval-fixture 可复用基线** 复验（不再临时编制项目），并首次完整走通 1.7 系引导对话（init/update）的客户端 UI 全问答链。

## 1. 安装一致性

客户端缓存 `…\plugins\cache\quality-gate-local\quality-gate\1.7.3` 与仓库 `plugins/quality-gate` **534 文件 SHA256 逐文件全等**（`cache-identity.txt`）。命令面板中 `/quality-gate-init`、`/quality-gate-update` 均由 1.7.3 缓存提供（命令卡片可见）。1.5 轮发现的"缓存内 config-guide.test.mjs ENOENT 崩溃"已随 1.5.1+ 发布消除（本轮缓存 534 文件全等即含修复后的测试文件）。

## 2. 可复用基线四步（夹具基线首次实战复用）

按 `acceptance/expense-approval-fixture` README 四步在仓库根执行（CLI=1.7.3）：

1. 业务单测 **8/8**；
2. close 基线正例 **15/15 PASS**，六域全覆盖（run=b429065f）；
3. 负例矩阵 **15/15 注入全部检出**（每例目标门禁 FAIL、退出非零、整体非 PASS；语法级缺陷按 fail-closed 级联）；
4. lifecycle-check **10/10**（inspect/update 预检/阈值替换/migrateRegistries 迁移/完整重初始化旅程）。

另以**安装缓存内** qgate 对夹具复跑 close：**15/15 PASS**（run=543b204f），证明客户端实际加载的字节与仓库行为一致。基线四步作为夹具 README 固化流程首次被真实复用即全绿，"可复用验收基线"定位成立。

## 3. 客户端 /quality-gate-init 重初始化旅程（残留场景）

工作区：夹具**副本** `E:\DevVault\qg-live-v173`（保留 `.quality-gate/registries/` 8 个登记文件作残留、删除 `.quality-gate.json`，仓库内夹具基线零改动）。新任务经原生"选择文件夹"对话框绑定该工作区后发送 `/quality-gate-init`，全链真实客户端运行：

1. **SessionStart 注入**（转录取证）：无配置引导指针（"No .quality-gate.json means onboarding is required…"）+ **残留指引（O2）**："检测到 1 处残留：、.quality-gate/ 目录。经用户确认后用 qgate.mjs init --fresh 清理并全新初始化。"（钩子内部执行 qgate leftovers）。
2. **残留确认对话**：列出 8 个残留登记文件，明示 `--fresh` 永久删除不可恢复；选"确认删除并继续"。
3. **引导对话三层定制**（AskUserQuestion UI 逐题）：档位 pro → 模板 six-domain → 附加门禁多选（secret-scan + rerun-evidence + debt-register，agent 依据项目 runner/登记探测推荐"全选以重建 README 基线覆盖"）→ 不禁用任何门禁 → 替换项（预填 argv 指向项目自有 runner、behavior 7 用例、metrics 阈值 0/0/1000）→ 本体 fibo-pinned（对话中给出与 `qgate templates` ontologyHint 一致的 sha）。
4. **写盘**：`init --fresh` 生成 `.quality-gate.json`（template 溯源 six-domain、根级 `ontology:{type:fibo-pinned, expectedCatalogSha256:eb9795a2…}` 与内核 FIBO_CATALOG_SHA 全等、阈值按选择落位）并删除 `.quality-gate/` 整目录（含 8 个残留登记——文档语义"fresh 清空登记"如实发生）。
5. **登记重建**：agent 从项目自有制品重新编制 6 个登记（requirements 含 PRD AC 映射、profile/records、release、debt、rerun——其中 rerun 哈希由 `scripts/rerun-job.mjs` **真实同 seed 双跑**产生）。
6. **fail-closed 闭环**：首次 close **ERROR**（rtm 报"testGateId 不得引用 meta 门禁"，unmetRequiredDomains L0，整体 ERROR）→ 按报错修复登记 → close **PASS**（10 门禁：9 PASS + debt-register release 阶段 SKIP 属设计）。
7. **Stop Hook 放行**：回合结束客户端 Stop 钩子对该工作区 close **PASS**（报告落入 `plugins\data\quality-gate@quality-gate-local\<sha256(工作区根)>\runs\`，本轮该路径规则再次验证）。

## 4. 客户端 /quality-gate-update 增量更新旅程

同一会话继续发送 `/quality-gate-update`：

1. **inspect**：配置有效（10 门禁全启用）、模版溯源 six-domain 无漂移（3 个附加门禁为预期差异）、预算充足（close 25s/40s）、登记文件 6/6 齐全、可用附加 7 项；agent 还识别出项目存在未接入的 `scripts/authz-runner.mjs`（读 openapi.json）。
2. **增量对话**：勾选推荐附加 `api-authz-scan`（runner 就绪、README 基线成员）→ 不禁用 → 无其他调整。
3. **update 写盘 +1 门禁（=11）**；随后 **preflightGateRefs 检出嵌套断链**——本验收驱动方在 update 前向 `requirements.json` 注入了 `requirements[].acceptanceCriteria[].testGateIds` 对不存在门禁 `engineering` 的引用（1.7.2 顶层扫描会漏、1.7.3 深度收集应报），客户端如实警告"requirements.json 的 testGateIds 引用了配置中不存在的门禁 engineering"，并给出重映射（移除引用，AC-01 已由 behavior 覆盖）与保留（close 将 fail-closed）两个选项。
4. **重映射修复**：移除引用后以空变更重跑 update 确认警告清零；最终 close **PASS，11 门禁**（10 PASS + debt SKIP 按设计，新增 api-authz-scan PASS）。
5. **Stop Hook 放行**：回合结束 close **PASS（11 门禁）**。

第 3 步即为 1.7.3 补丁（preflightRefs 深度收集嵌套登记引用）的客户端实证——该缺陷正是夹具基线 lifecycle-check 在 1.7.2 上发现的。

## 5. 电脑控制执行说明（CUA）

全部 UI 操作经 computer-use 无障碍路径完成：新任务（Ctrl+N）→「选择项目→打开文件夹」原生对话框绑定工作区（地址栏直填路径）→ 命令面板选命令（`/quality-gate-init` 输入后匹配卡片可见，证明命令来自 1.7.3 缓存）→ 逐题作答（单选 row 点击即选即交、多选 checkbox + 继续/提交）→ qgate 命令权限确认（选"始终允许此命令"，项目域）。已知 UI 特性：问题卡片重渲染会使 row 索引漂移（Group→ListItem），需全量观察重置基线后再点击；窗口偶发隐藏时截图不可用但无障碍树与元素操作不受影响（06 号本体问题截图缺失即此因，内容已被其他证据覆盖）。

## 6. 证明边界

- 本轮实机覆盖：安装一致性（534 文件 SHA 全等）、缓存 CLI 行为等价、SessionStart 两变体注入（含 O2 残留指引）、Stop Hook 两回合放行（报告路径规则复验）、init/update 引导对话客户端全问答链、增量写盘与嵌套引用预检告警、fail-closed→修复→放行闭环、权限门控与钩子并存。
- 未在本轮重复取证（前轮已有）：Stop 阻断→重试→放行的故障注入三连（1.5 轮已实证，本轮两次 Stop 均为放行路径）；插件详情页视觉（1.5 轮已截）。1.6 新门禁（canaryAnalysis/rerun/priorRuns/waiver）的客户端路径经夹具 rerun-evidence 门禁与 close 报告间接覆盖，未逐项 UI 复演。
- 夹具副本为受控本地项目：本地 JSON 非生产库、扫描规则非专业 SAST、计时非负载测试；rerun 哈希由夹具作业双跑产生但作业为金标准样本。门禁 PASS 仅适用于当前配置与本次运行范围，不构成生产认证。
