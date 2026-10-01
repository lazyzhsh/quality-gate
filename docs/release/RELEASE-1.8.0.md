# Release 1.8.0 — 功能裁剪版（scope-trim）

发布日期：2026-09-26。主线：按用户决定，把 L0–L5 六轮机制评审中用户指定"裁剪范围"的插件功能与门禁**从程序中整体移除**。本版为**破坏性配置变更**：引用被删 kind/类别/选项的既有 `.quality-gate.json` 将无法通过校验（fail-closed），迁移见文末。

## 移除清单

- **门禁 kind（3 个，35→32）**：`migration`（L5.2 数据库迁移演练）、`operational`（L5.4 八项运维演练半）、`readiness`（L5.4 制品+同轮验证半）。内核调度顺序的末端元评估随之以 `traceability` 收尾；`testGateIds` 元门禁黑名单相应只剩 `traceability`。
- **scan 类别（4/7，存 sast/api-authz/credential）**：`dependency`/`secret`/`iac`/`dast`（L4.4 后三类 + L4.5 DAST）。`authorizedTarget` 字段与回环目标校验一并移除；附加门禁目录 10→6（删 dependency-scan/secret-scan/iac-scan/dast-local）。
- **metrics 证据纪律（L4.2）**：`evidenceValidity`（CO 纠正前置）、`maxAgeDays`（metrics 侧）、`baselineViolations`（冻结基线棘轮）、`provenance` 观察字段——metrics 收缩为纯 `{min,max}` 阈值判定（L4.1 架构适应度继续使用，architecture-demo 不受影响；resilience 自有的 `maxAgeDays` 保留）。
- **发布证据包（L5.7）**：release 阶段 `releasePackage` 清单（Claim↔Evidence 关联+逐条 SHA256）与顶层 `priorRuns` 跨运行哈希链及其内核重算核验。单次报告仍含完整证据、`configSha256` 与域覆盖。
- **示例（5 个，40→35）**：migration-demo、operational-demo、metrics-demo、capacity-demo、delivery-demo；scan-demo 收缩为 sast 单类（api-authz/credential 演示仍由 api-security-demo 承载）。
- **模版与预检**：six-domain 模版 L5 由 readiness+回滚改为 debt+回滚（release-governed 同步去 readiness）；`preflightRefs` 不再检查 `verificationGateIds`；`KNOWN_REGISTRY_FILES` 移除 release.json/fitness-baseline.json。

## 保留与迁移

- **保留**：`budget`（P5 超时/重试预算，属 L4.6 防重试风暴，不在裁剪范围）、`sast`/`api-authz`/`credential` 三类扫描、metrics 纯阈值判定、configuration/documentation/debt/decisions-L5 等 L5 治理门禁。
- **既有配置迁移**：删除引用 `migration`/`operational`/`readiness` kind 的 gate（连带其 risks/exceptions 与孤儿 claims）；scan 门禁删除或改 `category` 为 sast/api-authz/credential；metrics 门禁移除三个纪律选项；顶层删除 `priorRuns`。配置只经 `qgate.mjs init`/`update` 修改的原则不变。
- **验收基线**：`acceptance/expense-approval-fixture` 同步调整为 13 门禁/12 kind/六域（去 readiness 与 secret-scan，负例矩阵 15→13），四步验收全绿后随本版提交。

## 验证

- 354 项回归全绿（375→354：删 21 项被裁功能测试，改写 scan/metrics/templates/summary/config-guide/init/lifecycle/six-domain 相关断言；新增"被删类别 fail-closed"校验反例）。
- 夹具四步：业务单测 8/8、close 13/13 六域 PASS、负例矩阵 13/13 检出、lifecycle-check 10/10（重初始化旅程随模版改为 rerun-evidence 附加 + debt 登记重建）。
- CONFIG-GUIDE 33 段 jsonc 样例（32 kind + 顶层）全部通过内核 validate；选项表、模版表、附加清单、登记文件表同步；GATE-SPEC-v1.8 为现行规范（v1.7 移入 `docs/history/`）。
- RTM 裁剪行（L4.2/L4.4 部分/L4.5/L5.2/L5.4/L5.7/P6/V5）标注"已裁剪（1.8.0）"，保留历史索引价值。

## 边界与不做

- 本版只做减法：未新增任何门禁能力；判定协议、报告格式、引导初始化与生命周期协议（ADR-0014/0015）不变。
- 单次运行内的证据完整性与防篡改（runId 回显、configSha256）保留；跨运行证据链（priorRuns）不再提供，需要时以 git 历史或外部归档承接。
- docs/history 与 docs/release 按"只增不改"惯例归档，未回改旧版文档正文（链接指向已随文件移动修复）。
