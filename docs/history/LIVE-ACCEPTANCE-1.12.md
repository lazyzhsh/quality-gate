# 客户端实机验收 1.12（1.10.1 / 1.11.0 / 1.12.0 三版收口，2026-09-27）

> 只增归档。证据目录 `evidence/zcode-live-v1.12/`；沙箱副本 `E:\DevVault\qg-live-v112`（夹具仓库外拷贝，含注入缺陷旅程）。承接 [LIVE-ACCEPTANCE-1.10](LIVE-ACCEPTANCE-1.10.md)（1.8.0–1.10.0）。

## 1. 客户端插件升级（流程更新）

`python devtools/sync_client_marketplace.py` 快照再同步（1.10.0→1.12.0）后，客户端设置→插件页 Quality Gate 行出现**"可更新"标记**，"更多"菜单出现**"更新"按钮**——directory 型本地市场现已支持直接更新（较 1.10 轮"卸载→重装"流程显著简化；快照再同步仍是前置必需步骤）。点击更新后缓存出现 `1.12.0`。

## 2. 安装完整性

缓存 1.12.0 ↔ 源码 `plugins/quality-gate/` **522/522 文件 SHA256 全等**（adapters/、consumer-matrix 全部随包）。

## 3. 可复用验收基线四步（全部走缓存 1.12.0 内核）

1. 业务单测 **8/8**；
2. 基线正例 close **13/13 PASS 六域**，报告含 v1.10.1 新增的**证据力行**：`证据力: 锚定 · 锚点 双跑一致 1 · 定量 测试 8/8、行为 7 例`（run=ed2982f4）；
3. 逐门禁负例矩阵 **13/13**（输出自认"插件版本 1.12.0"）；
4. 生命周期检查 **10/10**（inspect/update 预检/阈值替换/迁移/重初始化旅程，插件版本 1.12.0）。

## 4. 新声明断言 5/5（缓存内核，临时副本注入）

1. **R12 证据力行**：engineering-demo 呈现 `证据力: 降权 · 锚点 原始输出解析 1 · 定量 测试 4/4、覆盖率 100%…`；
2. **B1 rawOutput 声明即核验**：runner 自报算术自洽但与原始 TAP 不符（passed 3 vs 原始 4）→ check **ERROR** 指名 `rawOutput counts disagree with self-reported: passed reported 3 but raw file says 4`；
3. **B1 requireRawOutput**：runner 不声明 rawOutput → check **FAIL** 指名"缺少原始测试输出"（夹具 unit runner 未声明 rawOutput 走旧语义=零破坏设计，亦在阻断报告中如实呈现 `rawOutput: undefined`）；
4. **E6 consumer-matrix 正例**：demo close PASS，双降权行（static 观察 + settlement-batch declared 使用面）如实可见；
5. **E6 破坏归因**：provider `/payments` amount 类型 integer→string → 仅 orders-web 破坏（typeChanged，attribution.brokenConsumers=['orders-web']），settlement-batch 保持 compatible。

## 5. 客户端运行时旅程（CUA，沙箱副本）

新任务经原生文件夹对话框绑定 `E:\DevVault\qg-live-v112`（夹具拷贝+注入 `APPROVAL_LIMIT_CENTS 100000→99999`）。Stop 报告链（`plugins/data/quality-gate@quality-gate-local/5bd88c0e…/runs/`，已复制到 evidence）：

| # | run | 时间(UTC) | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 11ef3a8a | 13:54:36 | PASS | 第一回合：消息直接要求核查限额，agent 在回合内发现并修复（99999→100000），Stop 放行 13/13 |
| 2 | 7cbaae85 | 13:59:56 | **FAIL（阻断）** | 缺陷重新注入后的无关任务回合：behavior limit 用例 FAIL（expected approved，actual rejected "above limit"）+ engineering unit 1/9 失败 + rtm 关联 FAIL——**1.12.0 Stop hook 真实阻断** |
| 3 | a9e06191 | 14:00:58 | PASS | 阻断后 agent 修复（100000 恢复）+ README 备注任务完成，Stop 放行 |

transcript（rollout/model-io-sess_2a582f63…jsonl）证实 agent 按提示词契约以 **Markdown 正文**呈现分级报告（PASS 贴 brief 行）并引用 skill 指令。沙箱终态：限额 100000、README 末行 `notes: live acceptance v1.12`。

## 6. 边界与说明

- 快照再同步仍是 directory 市场升级的前置步骤（"更新"按钮读快照，不读源仓库）；
- 夹具 unit runner 未声明 rawOutput 属项目侧选择（零破坏：不声明=旧语义放行；B1 的强制由 `requireRawOutput` 项目自选）；
- 本轮 CUA 输入框经 typeText 键盘路径写入（setValue 对 Electron 输入无效，既有经验复现）；一次误触回车触发了排队回合，恰好构成阻断旅程的无关任务回合（README 备注任务按该回合执行）；
- Stop 阻断受客户端重试上限约束的既有结论不变（本轮第 2→3 报告间隔 62 秒内 agent 完成修复）。

## 7. 结论

1.10.1（R12 证据力）/ 1.11.0（B1 rawOutput 声明即核验 + E7 适配器随包 + E5 ORM）/ 1.12.0（E6 consumer-matrix）在真实客户端 1.12.0 运行时全部复验通过；插件侧无验收欠账。下一轮候选择优（L3 复审改进项 / consumer-matrix 观察层深化）。
