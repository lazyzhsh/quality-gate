# Quality Gate 1.5.0：报销审批夹具与 ZCode 实机复验

日期：2026-09-25。项目：[`acceptance/expense-approval-fixture/`](../../acceptance/expense-approval-fixture)。目标是检验一个有 PRD、进度、源码、测试、决策、运行材料的项目在 L0–L5 六域的门禁链路，以及已安装 ZCode 1.5.0 的 Skill、SessionStart、Stop 行为。所有结果只针对该配置的 11 个 gate；不能外推为 36 项设计任务逐项完成，更不构成生产认证。

## 当前项目状态与研发进度

- 项目内核与 ZCode adapter 仍分离；CLI 可独立运行。v1.5.0 的原则/实践轨道已实现 F2P/P2P、证据纪律、L2 consistency、L4 budget、安全最小集与容量演练。逐项状态及未实现边界见 [`DESIGN-COVERAGE-ROADMAP.md`](DESIGN-COVERAGE-ROADMAP.md)。
- 本次全量回归 `node --test plugins/quality-gate/tests/*.test.mjs`：**304/304 PASS、0 SKIP、0 FAIL**，日志在 [`regression-tests.txt`](../../evidence/fixture-v15/regression-tests.txt)。安装缓存 manifest 为 **1.5.0**；ZCode 插件详情页显示 1 Skill、1 Command、SessionStart/Stop 两 Hook、版本 1.5.0。已安装 `bin/qgate.mjs` 与仓库源码该文件 SHA256 同为 `EF5DF3049458E0C60D5A30BF5857FE72A67EBA312914C7A8D886A7B57404D592`。本轮没有重新比较缓存的全部文件。
- 夹具 F1 需求设计、F2 业务实现、F3 六域负例矩阵、F4 客户端验收均完成。进一步扩展到设计台账全部 gate kind 是后续范围，不计入本轮六域验收。

## 夹具的实物与验证方式

业务：员工提交整数分 CNY 报销申请；同租户非申请人审批，财务报销；服务向隔离 JSON 快照写入一组平衡借贷分录。`docs/PRD.md` 有五类 AC，`requirements.json` 逐条连到源码和同轮门禁。`docs/PLAN.md`/`docs/PROGRESS.md` 记录工作包；`src/`、`tests/`、`scripts/`、决策与债务登记、API 声明、预算、运行和回滚材料均可执行或核验。

| 域 | 本项目门禁 | 正例观察 | 故意失败反例 |
|---|---|---|---|
| L0 | traceability、decisions | 1 需求/5 AC 链接，2 决策关闭 | 断开 AC-03 源文件链接 → requirements FAIL |
| L1 | engineering | 静态检查、非空构建制品、8/8 单元测试 | 放松零金额校验 → engineering FAIL |
| L2 | invariant | 业务操作后独立回读快照，借贷各 12000 分 | 贷方少 1 分 → ledger-invariant FAIL |
| L3 | behavior | 正常、限额、自批、跨租户 5 案例 | 移除自批保护 → approval-behavior FAIL |
| L4 | metrics、api-authz scan、budget | 源码规则/本地计时、API 显式鉴权、预算 2500≥1600ms | 预算降为 1000ms → timeout-budget FAIL |
| L5 | rollback command、readiness、debt | 隔离回滚、三角色材料、债务登记 | 移除 runbook 登记 → readiness FAIL |

负例矩阵在临时副本逐域注入，不改基线；六例均以退出码 1 和对应 gate FAIL 结束，明细见 [`cli-negative-matrix.json`](../../evidence/fixture-v15/cli-negative-matrix.json)。这是仓库 CLI 的可复现自动化验证，**不标记为 ZCode 客户端实机**。

## ZCode 客户端真实会话

在 ZCode 选择该夹具为项目，通过已安装 Quality Gate 插件进入新任务。SessionStart/Stop 在 UI 的钩子卡片可见（首轮耗时约 142ms/1.03s）；对话中加载 `quality-gate:quality-gate` Skill，读取配置，然后以客户端安装缓存中的 `1.5.0/bin/qgate.mjs` 执行。运行命令使用一次性允许，未授予永久权限。各轮 Skill 与 Stop Hook 的完整 JSON 报告已分别复制，原始报告仍在项目 `.quality-gate/runs/` 与 `ZCODE_PLUGIN_DATA/<项目根哈希>/runs/`。

| 阶段 | 发起方 | run ID | 结果与证据 |
|---|---|---|---|
| 基线 | Skill/安装缓存 CLI | `e2c68f41-d87f-434e-a24c-ea520055f9c6` | [11/11 PASS，六域 PASS](../../evidence/fixture-v15/zcode-skill-pass.json) |
| 基线结束 | Stop Hook 独立复跑 | `9dfbf0fe-6ac1-4388-bcfb-fd4ecd23bff4` | [PASS，放行](../../evidence/fixture-v15/zcode-stop-pass.json) |
| 注入预算缺陷 | Skill/安装缓存 CLI | `23087dd1-8016-4824-81e9-31eb0996f441` | [10/11；L4 FAIL](../../evidence/fixture-v15/zcode-skill-fail.json) |
| 尝试结束 | Stop Hook 独立复跑 | `25baab18-8e38-4d8e-b5b2-6cf0f08a458d` | [FAIL 并向会话回传阻断原因](../../evidence/fixture-v15/zcode-stop-fail.json)：`budgetExceeded`，1600ms > 1000ms |
| 恢复 2500ms | Skill/安装缓存 CLI | `1f73d2a0-2e48-45db-8f8b-14c39b5a8376` | [11/11 PASS，六域 PASS](../../evidence/fixture-v15/zcode-skill-restored-pass.json) |
| 恢复后结束 | Stop Hook 独立复跑 | `8ea35793-88d7-41da-82af-78b4f7f17706` | [PASS，放行](../../evidence/fixture-v15/zcode-stop-restored-pass.json) |

失败报告 `unmetRequiredDomains=["L4"]`；十个其他 gate 为 PASS。恢复后该数组为空。客户端对话明确区分了 Skill CLI 报告与 Stop Hook 报告；没有把阻断态称为通过。第一次失败后仍遵循“不在客户端修改项目文件”的本轮指令，由验收方在源码中恢复预算后再发起复验。

## 判断与限制

**结论：在本夹具覆盖的 11 个门禁上，安装在 ZCode 的 Quality Gate 1.5.0 对 L0–L5 的正例、六域 CLI 负例，以及 L4 实机“阻断→修复→放行”均符合预期。** 这证明已配置检查能按同轮证据判定并触发客户端 Hook；没有证据表明设计台账 36 个任务均在此夹具中得到实机覆盖。

以下能力仍按设计台账保留限制：需求场景由项目显式声明，未自动从 PRD 推导；JSON 快照无生产事务能力；OpenAPI 扫描器只检查声明，非专业 SAST/DAST；本地计时不是 P95/P99 负载测试；隔离配置回滚不是生产演练；视觉浏览器、完整 OWL 推理、跨运行签名/有效期与真正的 CI 最终准出不在本轮范围。安装缓存内 `config-guide.test.mjs` 布局缺陷的源码修复尚未随客户端 1.5.0 更新，本轮未重跑缓存内全量测试，不能据仓库 304/304 说缓存内也 304/304。Stop Hook 有客户端重试上限，生产交付应另用 CI 强制执行。
