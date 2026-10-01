# RELEASE 1.7.3（2026-09-26）

补丁：**preflightRefs 嵌套登记引用支持**（0dac311，由夹具基线生命周期检查发现）。1.7.2 的登记引用预检只读取登记文件**顶层**的 `testGateIds`/`verificationGateIds`/`affectsGateIds` 数组，而文档化的真实登记格式是嵌套的（`requirements[].acceptanceCriteria[].testGateIds`）——嵌套引用全部漏检，预检形同虚设。现改为对登记 JSON 深度收集这三个字段（含顶层与任意层级，去重后比对），`tests/templates.test.mjs` 的预检用例同步改为真实嵌套结构断言。

发现路径：用固化后的可复用验收夹具 `acceptance/expense-approval-fixture`（15 门禁/13 kind/六域基线 + 逐门禁负例矩阵 + `lifecycle-check` 生命周期脚本，随本轮入库）跑"禁用被引用门禁 → 预检警告"步骤时未检出——正是基线化自动验证要抓的这类缺陷。367 项回归不变（修改既有用例，无新增计数）。

## 数字

- 367 项本地测试（不变）；40 个示例与 28 个烟测（不变）。
- 安装包 `dist/quality-gate-1.7.3.zip`：462 文件，SHA256 `5c552846dca3fa1fb5118e2f197b57c13f17b747cf91eebb3e1d1ae800291eb9`；解包复验 367 项测试与 28 个烟测 demo 全部 PASS（`evidence/v1.7.3/package-smoke.txt`）。
- 仓库全量回归 367/367（`evidence/v1.7.3/tests.txt`）；夹具侧：close 15/15 六域 PASS、负例矩阵 15/15 检出、lifecycle-check 10/10。

## 证明边界

不因本版收窄；预检仍为只读警告不阻断。夹具基线（acceptance/）不进安装包，属仓库侧验收资产。
