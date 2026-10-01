# LIVE-ACCEPTANCE-1.20（2026-10-01，五版同轮收口）

**范围**：客户端实机验收 1.17.0/1.17.1/1.18.0/1.19.0/1.20.0 五版同轮（用户决定跨版挂起后的一次性收口，先例 v1.15→v1.16 并入）。客户端插件市场"更新"按钮升至 **1.20.0**，缓存 ↔ 源 **630 文件 SHA 全等**（`devtools/sync_client_marketplace.py` 校验）。验收验证一律文件系统（缓存版本目录、SHA、runs 按 mtime），客户端 UI 仅用于"更新"点击与旅程对话；全程 CUA（computer-control）。

## 一、夹具四步（缓存 1.20.0 内核，`QGATE_CLI` 显式指向缓存）

| 步骤 | 结果 | 证据 |
|---|---|---|
| 1 业务单测 | 8/8 | step1-unit-tests.txt |
| 2 基线 close | **13/13 PASS 六域覆盖**（run=fcab2432，证据力: 核验级） | step2-close.txt |
| 3 负例矩阵 | **13/13 全部检出**（逐门禁注入各自 FAIL；插件版本自识别=1.20.0） | step3-negative-matrix.txt |
| 4 生命周期 | **10/10**（inspect/update 预检/阈值替换/迁移/重初始化旅程） | step4-lifecycle-check.txt |

## 二、五版新声明断言（18/18 全过，缓存内核+随包制品，可重放脚本 `E:\DevVault\qg-live-v120-assert\run-assertions.mjs`）

- **v1.17.0**：intent-drift-demo 四场景（ok PASS/outside 越界清单指名/tamper `intent-file-modified`/revise 修订链留痕 PASS）＋symbol-grounding-demo 正例＋幻觉注入 `unresolved` 清单指名；
- **v1.18.0**：bad-ac 反例 `acceptanceStructure.violations[rule=gherkin:missing-then]` 指名（结构即校验）；
- **v1.19.0**：convention-align-demo 正例＋违禁词注入逐命中指名（banned-words＋argv 双规则）；decisions ADR 绑定三例（`adrRef` 绑定+状态映射 verified / ADR 缺失 `adr-ref-missing` / `requireAdrRefs` 无绑定 `adr-ref-required`）；
- **v1.20.0**：api-surface-demo 正例＋幽灵注入三路指名（端点/配置键/命名成员）；adapter-imports-demo 双语言正例＋裁剪回报观察缺口指名（防瞒报）；YAML 归一往返（缓存 python 适配器归一→openapi-yaml 面→close PASS，pyyaml 在场）；
- **v1.17.1（CLI 侧）**：缓存 hooks.json 四事件注册核验（UserPromptSubmit/PreToolUse/SessionStart/Stop）。

## 三、客户端旅程（CUA，out-of-repo 夹具副本 qg-live-v120 / qg-live-v120b，新会话=更新后 1.20.0 内核）

- **J1 软形态注入＋在 scope 放行**（qg-live-v120，任务意图 v120-acceptance scope=src/**，change-scope 漂移绑定）：转录逐条提示词注入"任务意图基准: v120-acceptance（scope: src/**）…"（UserPromptSubmit，sess_b9ccc9fa）；SessionStart 基线行在场；agent 仅改 src/claims.mjs（+1 行，scope 内）→ **无越界软提示** → Stop 链 close **14/14 PASS**（run=f25bd72，agent 在客户端呈现分级报告；13:54:05 Stop 复跑 PASS）。客户端侧 `plugins/data` runs 目录为空＝v1.14 新鲜归档复用语义（H1a 设计行为，仓库本地新鲜结论复用不落新报告）。
- **J2 越界→阻断→显式修订→放行**：要求改 README.md（scope 外）→ agent 编辑 → 仓库 close **FAIL task-drift**（14:03:32，越界清单指名）→ Stop 反馈回灌 → **agent 自主按登记处指引走 `qgate intent --revise` 显式修订**（"我没有手改登记"——问询不代写纪律在压力下保持），修订链 2 条附理由（README.md 纳入＋scope.json 哈希重绑自指）→ 14:04:14 close **PASS** 放行。PreToolUse 越界软提示为客户端瞬时 UI 呈现（不落 model-io 转录——与 1.16 放行注记同类），以判定链等价证据记录（基准行注入+agent 行为符合指引+修订链留痕）。
- **J3 问询不代写登记**（qg-live-v120b，无登记起步）：agent 读缓存 `/quality-gate-intent` 命令定义确认纪律（"登记文件只能经 CLI qgate.mjs intent 写入"）→ 只读渲染现状 → **AskUserQuestion 四步问询卡片**（taskId 确认/验收标准 自由文本(推荐)点选/scope/确认人）→ 经 CLI 写入通道落登记（`已登记任务意图 j3-dialog（内容哈希 fe8ed5a9…）`，confirmedBy=sacha）→ UserPromptSubmit 基准行随即以 j3-dialog 注入。sess_cc96496d。

## 四、边界与注记（如实）

- 本轮未重做 Stop 注入失败→修复→放行摄影证据（1.10/1.14/1.16 多轮已证，机制未变；J2 的漂移阻断→修订→放行为本轮新增同等强度阻断证据）。
- 夹具副本新增 14th 门禁（change-scope 漂移绑定 scope.json）仅存在于 journey 副本，仓库夹具基线未动。
- 断言脚本首轮 6 例失败经查全部为**脚本自身缺陷**（kebab 原因码 vs 报告 camelCase 字段、scenario 包装形状不一致、A5b 误建"缺失"ADR 文件），插件行为逐例手工复核正确后修正脚本——如实记录，非掩盖。
- 实机验收欠账自本轮起清零；下一轮（v1.21.0 轨道 D）验收回归单版节奏。
