# LIVE-ACCEPTANCE-1.27（2026-10-06，四版同轮收尾 v1.24.0–v1.27.0）

**范围**：客户端实机验收 1.24.0/1.25.0/1.26.0/1.27.0 四版同轮（先例 [LIVE-ACCEPTANCE-1.20](LIVE-ACCEPTANCE-1.20.md)、[LIVE-ACCEPTANCE-1.23](LIVE-ACCEPTANCE-1.23.md)）。客户端插件市场"更新"升至 **1.27.0**（缓存版本目录 2026-10-06 11:37 创建，dist 构建 11:30 之后；UI 动作由用户执行，直接证据＝缓存版本目录＋SHA 全等＋验收会话重绑定）。验收会话＝更新后新会话，SessionStart 即绑定缓存 1.27.0 内核（本会话 quality-gate skill 解析路径即缓存 1.27.0）。验证一律走文件系统（缓存版本目录、SHA、runs 按 mtime 轮询）；断言全部对缓存内核与随包制品执行。证据目录：`evidence/zcode-live-v1.27/`（本机证据，不入公开库）。

## 〇、更新链路与缓存全等

- `devtools/sync_client_marketplace.py` 当轮实跑两次（发布后补同步＋幂等复跑）：快照 1.27.0、镜像后一致（robocopy exit 1＝增量无差异）、`cache 1.27.0 vs source: 694 files, SHA-identical`（step0-sync.txt）。本轮两侧零运行时污染，sync 脚本全文件口径即内容级口径（1.23 轮另设 371 文件内容级口径是因当时运行时档案差异；本轮无差异故不重复设口径）。
- 缓存版本目录序列 …→1.23.1→1.27.0：四版同轮一次升至最新，与"同轮收尾"模式一致（1.24.0–1.26.0 不作为独立安装节点验收，其增量以 1.27.0 缓存内核＋随包制品承载断言）。
- 验收会话 SessionStart 注入跨会话基准行："最近一次 close 运行 PASS，时间 2026-10-06T03:31:31.943Z"（上一会话 Stop 归档，runs 目录 11:31:31 档案在案）——基准行注入与跨会话传递在 1.27.0 内核上工作正常。

## 一、夹具四步（缓存 1.27.0 内核，`QGATE_CLI` 显式指向缓存）

| 步骤 | 结果 | 证据 |
|---|---|---|
| 1 业务单测 | 8/8 | step1-unit-tests.txt |
| 2 基线 close | **13/13 PASS 六域覆盖，证据力: 核验级**（run=24325453） | step2-close.txt |
| 3 负例矩阵 | **13/13 全部检出**（插件版本自识别＝1.27.0） | step3-negative-matrix.txt |
| 4 生命周期 | **10/10**（inspect/update 预检/阈值替换/迁移/重初始化；版本自识别＝1.27.0） | step4-lifecycle-check.txt |

## 二、四版新声明断言（26/26 全过；可复跑脚本 `E:\DevVault\qg-live-v127-assert\run-assertions.mjs`，输出 step6-assertions.txt）

- **v1.24.0 开源交付面**：缓存内核携带 MIT LICENSE＋README/README_CN；`.github/` 贡献与安全入口在场（CONTRIBUTING/SECURITY/PULL_REQUEST_TEMPLATE/ISSUE_TEMPLATE）；交付包排除面复核：527 条目零 evidence/dist/.git/凭据命中、LICENSE 在册、.github 5 文件（step7-zip-exclusion.txt）。内核修复面（Stop 复用限纯文件式 kind、OWL 父属性反向推理、零和账本 BigInt 精确累计、SHACL 单边边界）由 615 项回归与打包解包复验承载（[RELEASE-1.24.0](../release/RELEASE-1.24.0.md)），本轮不重做。
- **v1.25.0 纠正文案（缓存随包文件）**：summary 三类失败建议均为修复优先＋"验收要求变更须显式"限定（"属验收要求变更"×2、"不作为默认修复"×1），旧并列放松句式零出现；SKILL 失实表述 "Exception waivers remain unsupported" 零出现、例外登记制语义在册（WAIVED 从不把 FAIL 变 PASS）、"修复只改制品不改验收线"在册、现行协议键 levelCoverage/unmetRequiredLevels 在册，旧键 domainCoverage/unmetRequiredDomains 仅存于兼容垫片禁用语境（各 1 处、同行含 compatibility shim＋never write）。
- **v1.26.0 报告表达（本会话实跑产物）**：夹具 brief 来源分布行"来源 核验 1、声明 2"；`qgate report` 全表呈现声明关联行（C-REQ→rtm 等 12 claim 逐项映射）＋固定边界句"不等于声明全文已被证明"；逐门禁来源列三态（声明×2、核验（双次运行一致）×1、无信号 —）；adapter 三类消息字面量在册（new-only 放行明示"本次报告仍为 FAIL"、复用标记"复用归档 run <id>·原运行 <finishedAt>，未重跑门禁"、外层异常"不构成质量判定"）；advisory 呈现行在册（step5-report-fulltable.txt）。
- **v1.27.0 文风检查**：随包检查器在场且实跑命中三类规则（长句 174 字＞160/模糊词/多动作连接词，runId 回显、scannedFiles=1、detail 前缀 ws-long-sentence/ws-vague-word/ws-multi-action）；fail-closed 实证（坏 schemaVersion 非零退出）；扫描零文件显式 scope-empty finding；仓库与快照两侧 `.quality-gate/registries/conventions.json` 的 STYLE-writing 登记（advisory/argv/指向随包检查器）对称在册；WRITING-GUIDE「与自动检查的关系」含 WS-1/2/3 登记表。
- **断言脚本缺陷如实记录**（与 1.20/1.23 轮同类）：首轮 2 例失败经查均为脚本自身缺陷——D2 按 `findings[].ruleId` 取规则标识，实际形状为 `{path,line,detail,category}`（规则身份在 detail 前缀，插件行为正确）；zip 排除检查未剥顶层 `quality-gate/` 前缀且以路径含 "client" 误筛示例源码 client.mjs。逐例复核插件行为后修正脚本，复跑 26/26。

## 三、Stop 实机走查（阻断→修复→放行，根工作区）

- **阻断**：验收探针——向 docs/README.md 临时注入一个 TERM-no-deprecated 弃用词后结束会话轮，Stop 钩子在缓存 1.27.0 内核真实阻断（run=e362f66c，0.4s，档案 12:05:31 落盘）。阻断消息（逐字转录见 step8-stop-block.md）呈现四版客户端可见增量：FAIL 指名到 `收口 @ docs/README.md:58`；建议列为 1.25 纠正后文案（"修复制品用词；更新豁免属调整规则，须核对约定来源后显式变更登记，不作为默认修复"）；1.26 advisory 行（共 45 项，不阻断判定）与声明关联行（C-REGRESSION → 未验证——其关联门禁 G-TESTS 不在 close 阶段执行；C-CONVENTIONS → FAIL）＋固定边界句；SKIP/FAIL 门禁来源列如实显示 —；修复指引给出 CLI 重跑命令并明示"不要通过禁用门禁来放行"。
- **修复**：`git checkout -- docs/README.md` 还原探针注入（`git status` 复核零残留）。
- **放行**：CLI close 复跑 **PASS**（run=83e45a8c，1/1 通过，0.4s，12:08:41 落盘）；PASS brief 亦呈现"未验证声明: C-REGRESSION（无关联门禁执行）"。runs 目录按 mtime 轮询：阻断 FAIL 档案与修复后 PASS 档案相邻落盘（12:05:31 / 12:08:41）。
- **未在本轮实机触发的 Stop 分支（如实）**：new-only 放行消息（需会话开始前既有 FAIL＋声明输入未变——根配置未声明 stop.inputs 且本轮基线为 PASS，不构成触发条件）与复用归档标记（复用面限纯文件式 kind：根配置 G-TESTS 为 command、G-CONVENTIONS 为 convention-alignment，均恒重跑）——两者由 adapter 回归测试承载（1.26.0 新增 2 用例）。本轮未做 CUA 多工作区走查：客户端侧增量＝更新按钮＋内核重绑定＋Stop 呈现，前两者由缓存目录/SHA/SessionStart 绑定实证，Stop 呈现已由本节阻断事件实证（1.23 轮同类裁量）。

## 四、边界与注记（如实）

- advisory 计数漂移：87 项为 1.27.0 发行时（文档收敛迁移前）实测；本会话实测 45 项（迁移后现行文档）——均为当时记录，随文档演化漂移属预期，advisory 不阻断判定。
- 夹具四步与断言均以缓存内核执行；负例矩阵与生命周期在临时副本运行，不污染基线与缓存。
- 根门禁 G-TESTS 仅 pr/release 阶段执行（close 只做 G-CONVENTIONS）；Stop 执行预算 50 秒内本轮实际核验对象 G-CONVENTIONS 实测 0.4s，完整回归不在 Stop 承载（1.24.0 阶段划分）。
- 工具来源：本仓库源码、随包脚本与本机 dist 包；本地夹具与演示不构成生产认证，各报告边界句随行。
