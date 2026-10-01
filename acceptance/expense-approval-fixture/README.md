# Expense Approval：可复用实机验收夹具基线

这是一个可运行的报销申请审批小项目，不是只返回预制 PASS 的 runner。业务代码把申请和账本写入临时 JSON 存储；门禁分别读取需求追踪、源码测试、落盘状态、业务行为、度量/扫描/预算/重跑与发布材料。

**基线定位（2026-09-26 固化）**：本夹具是 quality-gate 插件实机验收的可复用基线快照——每次客户端升级（marketplace 安装新版本、新开会话）后按本 README「验收步骤」执行即可，不需要临时编制项目。基线 = 13 个门禁（12 种 gate kind）× L0–L5 全六域 + 全套登记文件 + 负例矩阵 + 生命周期检查脚本。1.9.0 起 rtm 门禁启用 `requirePrdRefs`，REQ-01 绑定 `prdRef:{file:"docs/PRD.md"}`（随版固化登记完备性声明）。

## 门禁矩阵（13 门禁 / 12 kind / 六域）

| 域 | 门禁（kind） | 输入 |
|---|---|---|
| L0 | rtm（traceability）、design-decisions（decisions） | registries/requirements.json、registries/decisions.json |
| L1 | syntax（command）、engineering（static/build/unit） | src/、scripts/engineering-runner.mjs |
| L2 | profile（semantic-profile，FIBO fibo-pinned 钉扎）、ledger-invariant（invariant） | registries/profile.json+records.json、scripts/invariant-runner.mjs |
| L3 | behavior（7 用例：正常/边界/越界/自批/跨租户/非法金额/重复审批） | scripts/behavior-runner.mjs |
| L4 | metrics（3 阈值）、api-authz（scan）、timeout-budget（budget）、rerun-evidence（rerun） | scripts/metrics-runner.mjs、openapi.json、registries/budget.json、registries/rerun.json |
| L5 | rollback-drill（command）、technical-debt（debt） | scripts/rollback-drill.mjs、registries/debt.json |

其余 20 种 gate kind 的覆盖在插件侧：`examples/examples.manifest.json`（35 示例）与打包烟测（`python devtools/build_delivery.py`）+ 插件回归测试，与本夹具互补。

登记文件集中在 `.quality-gate/registries/`（随库提交）；`.quality-gate/runs/` 为运行数据（已 gitignore）。`openapi.json` 留在根目录（authz runner 直接读取）。

## 验收步骤（每次实机验收复用）

**前提（客户端升级，2026-09-28 更新）**：客户端插件缓存停在旧版时先升级——`python devtools/sync_client_marketplace.py` 同步 marketplace 快照并校验（"更新"按钮读快照不读源仓库），再在客户端插件市场对 Quality Gate 行执行"更新"（2026-09-27 起支持，取代旧卸载→安装流程），重跑同一脚本确认 SHA 全等。四步可经 `QGATE_CLI=<缓存>/bin/qgate.mjs` 显式跑在缓存内核下（脚本已支持，负例矩阵版本自识别读缓存 plugin.json）。验收验证一律走文件系统（缓存版本、SHA、Stop 报告按 mtime 轮询），不用截图探索；客户端旅程（Stop 阻断→修复→放行）在 out-of-repo 夹具副本上做，见 docs/history/LIVE-ACCEPTANCE-1.13.md。

在**仓库根**执行（也可在 ZCode 会话内经 `/quality-gate`、`/quality-gate-init`、`/quality-gate-update` 驱动同一 CLI）：

```powershell
node --test acceptance/expense-approval-fixture/tests/*.test.mjs        # 1. 业务单测 8/8
node plugins/quality-gate/bin/qgate.mjs acceptance/expense-approval-fixture close      # 2. 基线正例：13/13 PASS 六域覆盖
node acceptance/expense-approval-fixture/scripts/negative-matrix.mjs   # 3. 逐门禁负例：13 个注入各自 FAIL
node acceptance/expense-approval-fixture/scripts/lifecycle-check.mjs   # 4. 生命周期：inspect/update/预检/迁移/重初始化旅程
```

全部通过即基线在当前插件版本可用。实机验收时另记录：SessionStart 首运行/残留指引、引导对话（init/update）、Stop 阻断→修复→放行，证据归 `evidence/zcode-live-<版本>/`（与 CLI/脚本验证分别记录）。

## 脚本说明

- `scripts/negative-matrix.mjs`：复制项目到临时目录，**逐门禁**注入一个真实缺陷并断言该门禁 FAIL、整体退出码 1；不改基线文件。注入清单见脚本内 `mutations`（含各 kind 的失败机理注释）。
- `scripts/lifecycle-check.mjs`：复制项目到临时目录验证配置生命周期——inspect 现状、update 增量（阈值替换/预检警告）、migrateRegistries 迁移、删除配置后的重初始化旅程（leftovers 清单 → `init --fresh`（含 ontology 钉扎与自有阈值 answers）→ 登记重建 → 预检修复 → close 六域 PASS）。

## 制品索引

- `docs/PRD.md`：需求、验收标准和范围；`registries/requirements.json`：可执行追踪矩阵。
- `docs/PLAN.md` 与 `docs/PROGRESS.md`：研发工作包、状态和证据。
- `docs/ARCHITECTURE.md`、`registries/decisions.json`：设计与已关闭决策。
- `src/` 与 `tests/`：业务实现和测试；`scripts/`：项目工具适配、负例矩阵与生命周期检查。
- `docs/RUNBOOK.md`、`docs/ROLLBACK.md`、`config.example.json`：交付材料。
- `.quality-gate.json`：基线配置（13 门禁，close/release 阶段，requiredDomains 六域全要求；rerun-evidence 仅 close）。

## 证明边界

这是受控的本地项目夹具。它验证插件对项目制品和工具结果的协议、证据链、失败定位、配置生命周期及 ZCode adapter 的运行；本地 JSON 文件并非生产数据库，源码扫描规则并非专业 SAST，计时循环并非负载测试，回滚脚本只演练隔离目录，rerun 哈希由夹具作业真实双跑产生但作业本身是金标准样本。门禁 PASS 仅适用于本配置和本次运行范围。
