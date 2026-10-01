# 客户端实机验收 1.13（v1.13.0，2026-09-28）

> 只增归档。证据目录 `evidence/zcode-live-v1.13/`；沙箱副本 `E:\DevVault\qg-live-v113`（夹具仓库外拷贝，含注入缺陷旅程）。承接 [LIVE-ACCEPTANCE-1.12](LIVE-ACCEPTANCE-1.12.md)（1.10.1–1.12.0）。

## 1. 客户端插件升级（"更新"按钮流程第二次实战）

`python devtools/sync_client_marketplace.py` 快照再同步（1.12.0→1.13.0，robocopy 整库镜像）后，客户端设置→插件页 Quality Gate 行出现**"可更新"标记与行内"更新"按钮**（较 1.12 轮无需展开"更多"菜单）；电脑控制点击"更新"后缓存出现 `1.13.0`。快照再同步仍是前置必需步骤。

## 2. 安装完整性

缓存 1.13.0 ↔ 源码 `plugins/quality-gate/` **544 文件 SHA256 全等**（sync 脚本自校验；adapters/consumer-usage/visual-browser-demo 全部随包）。

## 3. 可复用验收基线四步（全部走缓存 1.13.0 内核，QGATE_CLI 覆盖口）

夹具脚本本轮新增 `QGATE_CLI` 环境变量覆盖（可复用基线演进：显式指定被测 CLI；负例矩阵的插件版本自识别同步改读缓存 plugin.json）：

1. 业务单测 **8/8**；
2. 基线正例 close **13/13 PASS 六域**，证据力行 `证据力: 锚定 · 锚点 双跑一致 1 · 定量 测试 8/8、行为 7 例`（run=04eda373，缓存 CLI 直跑）；
3. 逐门禁负例矩阵 **13/13**（输出自认"插件版本 1.13.0"）；
4. 生命周期检查 **10/10**（inspect/update 预检/阈值替换/迁移/重初始化旅程，插件版本 1.13.0）。

## 4. 新声明断言 6/6（缓存内核，临时副本/临时工程注入）

1. **A1 rawTranscript 声明即核验（behavior）**：behavior-demo close PASS，`证据力: 降权 · 锚点 原始输出解析 1 · 定量 行为 4 例`（run=afd3b4c）——转录交叉核验一致计入锚点；
2. **A2 rawTranscript（journey）**：journey-demo close PASS，`证据力: 锚定 · 锚点 原始输出解析 1`（run=74bb937）；
3. **A3 浏览器参考 runner**：visual-browser-demo close PASS 字节一致（run=bb958ce，缓存内核经 headless CLI 真实截图对比随包基线）；
4. **A4 consumer-usage 三来源**：consumer-matrix-demo close PASS，orders-web 经 Pact 归一（contract-test）+ orders-cli 真实源码扫描（scanned）+ settlement-batch（declared），双降权行如实（run=5b3099e）；
5. **A5 篡改转录 ERROR**：转录与自报不符（boundary 自报 reject vs 转录 accept）→ **ERROR** 指名 `rawTranscript disagrees with self-reported: case boundary actual reported … but transcript says …`（run=b6ea7f0）；
6. **A6 requireRawTranscript 强制**：runner 不声明 → **FAIL** 指名"缺少原始用例转录（requireRawTranscript）"，证据 `missingRawTranscript:true`（run=db3dcd0）。

## 5. 客户端运行时旅程（CUA，沙箱副本）

新任务经"选择项目→打开文件夹"原生对话框绑定 `E:\DevVault\qg-live-v113`（夹具拷贝+注入 `APPROVAL_LIMIT_CENTS 100000→99999`）；绑定后、首条消息前按规程预设**完全访问**模式。消息为**无关任务**（README 备注行），不提示缺陷存在。Stop 报告链（`plugins/data/quality-gate@quality-gate-local/dc7a2b08…/runs/`，已复制到 evidence）：

| # | run | 时间(UTC) | 状态 | 说明 |
|---|---|---|---|---|
| 1 | 3ccaa05d | 06:24:30 | **FAIL（阻断）** | README 备注回合结束被 1.13.0 Stop hook 阻断：behavior limit 用例 FAIL（expected approved，actual rejected "above limit"）+ engineering unit 1/8 失败（7/8）+ rtm 级联——13 门禁 10/13 |
| 2 | 0a3b34f6 | 06:25:13 | PASS | 阻断后 agent **43 秒内**回合内修复（限额 100000 恢复）→ close 13/13 → Stop 放行 |

transcript（rollout/model-io-sess_572b5dbb…jsonl）证实 agent 按提示词契约以 **Markdown 正文**呈现分级报告（`Quality Gate FAIL · close · 10/13 通过 · run=27cffd3…` 全表含证据力行"锚定 · 锚点 双跑一致 1"、建议列与重跑页脚）。沙箱终态：限额 100000、README 末行 `notes: live acceptance v1.13`。

## 6. 边界与说明

- 快照再同步仍是 directory 市场升级的前置步骤（"更新"按钮读快照）；
- 本轮桌面一度处于全窗口隐藏/未渲染态（0 active apps，截图与键盘原始事件被拒）——经验：**getScreenshot 成功一次即恢复渲染与前台**，此后 a11y 与键盘均可用（1.5 轮"窗口恢复"观察的机理确认与可复用化）；原生文件夹对话框在无键盘时可直接点"选择文件夹"确认路径框内容（无需双回车导航）；
- composer setValue 仍无效（读回为空、发送键不启用），click+typeText 键盘路径有效（复现）；失败时 typeText 原始事件同样要求前台；
- 夹具四步经 `QGATE_CLI` 显式指向缓存内核（版本自识别读缓存 plugin.json），与"CLI 直跑缓存 qgate"双重印证。

## 7. 结论

v1.13.0（T1–T3 rawTranscript 声明即核验 / T4 浏览器参考 runner / T5 consumer-usage 工具化）在真实客户端 1.13.0 运行时全部复验通过；插件侧无验收欠账。下一轮首选：baseline 内容内核重放（L3R 候选 2，C2 残余闭合——transcript 基建已就绪）。
