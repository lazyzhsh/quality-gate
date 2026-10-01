# ZCode 客户端实机验收 1.8.0 → 1.10.0（四版收口）

验收日期：2026-09-27。覆盖自 1.7.3 客户端收口以来的全部欠账版本：**1.8.0（功能裁剪）、1.9.0（信任边界收敛）、1.9.1（快赢补丁）、1.10.0（拓扑语义深化）**。驱动方式与历史轮一致：电脑控制（CUA）驱动的真实客户端运行时 + 缓存内核 CLI 驱动的夹具与新声明旅程，分别记录。

## 1. 插件升级与安装一致性

- 客户端插件缓存自 **1.7.4** 升级至 **1.10.0**（客户端插件详情页信息节原版本 1.7.4，高级信息根路径绑定 1.7.4 缓存目录）。
- 升级路径（真实客户端 UI 操作）：插件市场搜索 → Quality Gate"…"菜单**卸载**（确认对话框"将删除该插件的缓存文件、数据目录"）→ marketplace 快照同步（`plugins/marketplaces/quality-gate-local/` 为源目录 `E:\DevVault\quality-gate` 的整库镜像，登记见 `known_marketplaces.json` source.directory；以 robocopy /MIR 重同步至 1.10.0——等效客户端重添加市场时的整库拷贝，不触碰安装缓存）→ 插件市场"**安装**"→ 缓存出现 `quality-gate-local/quality-gate/1.10.0/`。
- **SHA 全等**：缓存 1.10.0 与源码 `plugins/quality-gate/` 逐文件 SHA256 比对——**489/489 文件全等**（0 缺失、0 多余、0 不符；1.5 轮 512 文件、1.7.3 轮 534 文件，1.8.0 裁剪后 489 合理）。
- 发现并记录（技术债性质）：客户端对 directory 型 marketplace 无"更新"按钮（详情菜单仅禁用/恢复/卸载），重装始终读快照——快照停更则版本停更。本次以镜像同步收口；后续版本发布建议在 release 流程中追加"同步客户端 marketplace 快照"步骤。

## 2. 夹具基线四步（缓存 1.10.0 内核驱动，out-of-repo 沙箱副本）

沙箱：`%TEMP%\qg-live-v110\`（缓存插件置于 `plugins/quality-gate/` + 源 marketplace.json + 夹具副本，脚本相对路径原样可用）。四步全绿：

| 步骤 | 结果 |
|---|---|
| 1. 业务单测 `node --test tests/*.test.mjs` | **8/8 PASS** |
| 2. 基线正例 `qgate.mjs … close` | **13/13 PASS 六域覆盖**（含 1.9.0 固化的 rtm `requirePrdRefs`+prdRef） |
| 3. 负例矩阵 | **13/13 全部检出**（输出自报"插件版本 1.10.0"） |
| 4. 生命周期检查 | **10/10 通过**（inspect/update 预检/迁移/重初始化旅程，自报 1.10.0） |

## 3. 新声明实机旅程（v1.9/v1.10 语义，缓存 CLI 驱动，11 项断言全过）

对 demo 副本逐项注入缺陷 → 缓存 CLI 断言（结果文件 `declaration-journey-results.txt`）：

| 场景 | 断言 |
|---|---|
| A behavior-demo | 原地运行 PASS 且报告**"证据降权"行**：`证据降权: quote-cases: 基线为内嵌声明（embedded，非真实历史）` |
| B1/B2/B3 decisions | deferred 缺 revisitBy → **ERROR**（表格行"Deferred decision requires revisitBy"）；过期 revisitBy → **FAIL 指名**"悬置决策已过复审期限（revisitBy 2000-01-01）"；未到期+allowDeferred → **PASS** |
| B4 requireProvenance | 纯文本 evidence → **FAIL 指名**"evidence 需结构化引用（{file}/{gateId}），纯文本不再放行" |
| C1/C2 assumptions | 裸空登记 → **FAIL**"空登记未显式声明: 需要 \"none\": true"；补 none:true → **PASS** |
| D1/D2 persistence | runner 恒报快照 → PASS；缺快照 → **ERROR 指名**"Before and after snapshots required (persistence snapshots are mandatory by default; opt out with \"requireSnapshots\": false)"（E3 默认强制） |
| E1/E2 topology | 2 副本共识 → **FAIL 双违规指名**"副本数低于状态模型阈值（2 < 3）"+"共识服务副本数为偶数（多数派浪费一票）"（R2）；修复为 3 副本 → **PASS** |

## 4. 客户端运行时旅程（CUA，真实新任务会话）

新任务（Ctrl+N → 打开文件夹 → 原生对话框选沙箱夹具）绑定 `expense-approval-fixture` 沙箱工作区，模型 GLM-5.3（最高），注入真实缺陷（`APPROVAL_LIMIT_CENTS` 100000→99999）：

- **Stop 阻断**：agent 完成 turn → 1.10.0 Stop Hook 阻断。客户端 Stop 报告 `runs/stop-1-block-first.json`（root=沙箱夹具，**FAIL**：rtm/engineering-unit/behavior 级联，与 CLI 注入预期一致）。agent 在对话中如实呈现 Stop 注入的全表原因并自主定位根因（引用 PRD 与 AC-02），列出三失败域表格与修复方案，**等待用户确认**（截图 `stop-block-report.png`）。agent 自动重试轮再次被阻断（`stop-2-block-retry.json` FAIL，其自述"第三次以完全相同的结果失败(run=4ffc551)"与报告链吻合——客户端重试上限机制可见）。
- **修复→放行**：批准修复后 agent 复跑 close → **PASS**（`stop-3-pass-after-restore.json`）→ 最终放行 **PASS**（`stop-4-pass-final.json`，13 门禁全绿）。agent 收尾回复以 **Markdown 正文**（不包代码围栏）呈现 `✅ Quality Gate PASS · close · 13/13 通过 · run=57fdb70…` 完整 brief——1.7.4/1.7.5 的报告可见性约定在 1.10.0 客户端持续生效（截图 `stop-pass-final.png`）。agent 诚实说明发现 claims.mjs 已被外部修复且与项目目标一致、未再动文件。
- Stop 报告按 workspace 路径 sha256 键控于 `plugins/data/quality-gate@quality-gate-local/adad7888…/runs/`（与 1.5 轮记录的机制一致）。

## 5. 范围与证明边界

本轮覆盖：安装链路（marketplace 快照→缓存→SHA 全等）、夹具基线（1.8.0 裁剪后形态 + 1.9.0 声明）、v1.9/v1.10 全部新声明的门禁语义（CLI 级）与 Stop Hook 阻断/放行/报告呈现（客户端级）。**未逐一实机重演**：1.8.0 的裁剪类目（负例矩阵已覆盖其 fail-closed 行为）与 `/quality-gate-init`、`/quality-gate-update` 引导对话全流程（1.7 轮已收口，其后未变更引导协议；夹具 lifecycle-check 的重初始化旅程在 1.10.0 缓存内核下 10/10 通过即为其 CLI 级等价证据）。生产强制准出仍需使用方 CI（本仓库范围决定不含自建 CI）。

## 6. 结论

**1.8.0/1.9.0/1.9.1/1.10.0 四版客户端实机验收收口完成**。当前客户端缓存 1.10.0 与源码 489 文件全等；夹具四步、新声明 11 断言、Stop 阻断→修复→放行回路全绿。实机验收欠账清零。
