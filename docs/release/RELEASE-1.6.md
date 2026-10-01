# RELEASE 1.6.0（2026-09-25）

主线"R 系与治理混编"（2026-09-25 用户逐项选定，范围见 [PLAN](../PLAN.md) 完成状态）：R 系选取 R5/R6 判定协议，治理收尾取跨运行汇总与审批/到期 Exception，签名仍暂缓；R1–R4 拓扑语义整体留 v1.7 主线候选。先决增量 v1.5.1 补丁包（[RELEASE-1.5.1](RELEASE-1.5.1.md)，仅 config-guide 安装布局修复）已先行发布，1.6.0 包含其全部内容。

## 变更清单（先决增量 + 四个工作包，逐项独立提交 1e16598 → fa5a3ae）

1. **v1.5.1 补丁**：客户端安装缓存内 `config-guide.test.mjs` 布局崩溃修复随包送达；版本三处同步，无功能变更。
2. **A1 change-scope 独立示例**（`examples/change-scope-demo`）：`scenario.mjs` 在临时 Git 项目（baseline 标签）中套用随包模板配置，四场景正反例——ok 通过；over-scope（README.md 超范围 FAIL 指名）、protected（package.json 未确认 FAIL）、content（debugger 遗留被内容检查拦截）。`knownKindsWithoutExamples` 清空，全部 35 个 kind 均有独立示例锚。
3. **A2 unit 覆盖率协议**（L1.3 收口）：unit 检查可选 `minCoverageRatio`（0<r≤1）；runner 观察可选 `coverage:{tool, ratio}`（带 total/covered 计数时内核交叉核验，不一致 ERROR）；声明阈值而缺证据 ERROR（fail-closed）；低于阈值 FAIL 并给出差距。engineering-demo 以 `node --test --experimental-test-coverage` 采集真实行覆盖率（旧版 Node 自动降级不报 coverage）。
4. **B R5 灰度判定协议**：拓扑声明升级为结构化 `canaryAnalysis:{verdict, judge, sampleSize, window, sequentialMethod, guardrailViolations[], srmDetected?}`；runner 推导三指标（max:0）——`canaryNotPromoted`（inconclusive/marginal 不计 PASS）、`canaryGuardrailContradiction`（promote 却带 guardrail 违背=矛盾证据）、`canarySrmVoided`（SRM 多次窥视检出即作废该服务灰度结论）；`canarySupported` 布尔保留最低档。违背服务明细由 runner 写入 stderr 随执行证据入报告。
5. **C R6 重跑确定性门禁**（新 kind `rerun`，第 35 个）：文件式纯内核校验——每任务 ≥2 次同 seed `runs`（sha256 输出哈希，逐位一致才 PASS）+ `idempotencyKeyStrategy` + 可选 `doubleEntry` 复式恒等式；runs<2、异 seed、算法未声明即 ERROR。`examples/rerun-demo` 附确定性结算作业，测试会重跑核验随包哈希真实。
6. **D1 跨运行汇总**：顶层可选 `priorRuns:[{reportPath, reportSha256, generatedAt, verdict}]`；release 阶段内核**重算**引用报告文件哈希，不符或缺失整链 ERROR；releasePackage 清单携带链核验结论。`examples/delivery-demo` 附真实历史报告夹具链。
7. **D2 审批/到期 Exception**：exception 支持 `status:"approved"` + `approvedBy/approvedAt`（不晚于 expiresAt）；已审批且在有效期内 → 报告呈现 WAIVED（单独列示、不改变任何门禁判定、releasePackage 记录豁免状态）；proposed、过期（expired）、未生效（not-yet-effective）一律回退阻断。豁免从不把 FAIL 门禁变成 PASS（X1 不变）；审批为声明字段，不防伪造。

同步：GATE-SPEC 更名 v1.6；CONFIG-GUIDE 新增 rerun 章节、unit 覆盖率、priorRuns 与 exception 审批选项（`tests/config-guide.test.mjs` 强制 36 段样例全通过）；摘要层新增覆盖率差距、rerun 违规与未决/已豁免例外行（`tests/summary.test.mjs` 强制逐 kind 提取器）；RTM 增补 V1–V6 行并更新 X1/X2/L5.7。

## 数字

- 35 个 gate kind（新增 `rerun`）；330 项本地测试（v1.5.1 时 304 → +26）；40 个示例（+change-scope-demo、rerun-demo），28 个进打包烟测（+rerun-demo）。
- 安装包 `dist/quality-gate-1.6.0.zip`：437 文件，SHA256 `9cbb62c593465609f0594134049324cc551ce03f39b02fb7af4747bf24d0ce87`；解包复验 330 项测试与 28 个烟测 demo 全部 PASS（`evidence/v1.6/package-smoke.txt`）。
- 仓库全量回归 330/330（`evidence/v1.6/tests.txt`）。

## 证明边界（不因本版收窄）

- R5/R6/coverage 的证据来自声明文件与项目 runner/作业；内核只核验结构、一致性与算术，不重执行作业、不推导真实依赖图；demo 结果不构成生产灰度/重跑/覆盖率认证。
- priorRuns 哈希链防篡改可检出、防伪造不在范围（无签名）；Exception 审批为声明字段。
- 1.6.0 客户端实机验收待执行：marketplace 升级 → 新会话验证 SessionStart/Skill/Stop 与缓存内 config-guide 修复，记录于 `evidence/zcode-live-v1.6/`（与 CLI 回归分别记录）。
