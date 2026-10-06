# 分阶段计划与验收

目标:Agent 无关内核,ZCode 为首个适配器;Quality Domain 与执行阶段分离;每增量本地可出真实正反例,小步节奏"分析→确认→正反例→实现→全量回归→证据"。历史轮次的规划细节由 [docs/release/](release/) 各版发行说明与 [docs/history/](history/) 承接,本文只保留逐版一行完成记录,不再展开已完成规划。

## 当前状态（2026-10-06，v1.31.1）

1.31.0 为证明链补齐（[RELEASE-1.31.0](release/RELEASE-1.31.0.md)，二轮评审建议第 2 步）：AC→真实用例身份与当轮结果绑定——逐 AC 可选 cases:[{gateId,caseIds}]＋新选项 requireCaseBinding，traceability 当轮逐用例复核（acCaseMissing/Skipped/Failed/Unbound 指名——无关成功门禁不再能充当 AC 证据，评审 AC-UNBOUND 反例收敛；用例身份取自 behavior cases 与 engineering unit/test cases）；来源信号展示补齐（内核像素重算/内容级核验计入核验信号、metrics/scan 归声明、PASS 无信号门禁显式"无信号"——判定零变化）；夹具自举逐 AC 绑定 behavior 用例（四步全绿）；678 回归全过、0 SKIP；37 kinds/48 示例不变。L3.5 技术差距关闭（AC 绑定），"不自动由 PRD 推导"设计边界维持、转正留 v2.0 终审。**1.31.1 反思轮补丁**（[RELEASE-1.31.1](release/RELEASE-1.31.1.md)）：PNG 重复 tRNS 拒绝、依赖提取正则语境守卫、visual 字节一致核验信号、夹具负例 13→14、GLOSSARY 术语补登记、PNG 过滤器 Pillow 交叉核验、陈旧口径清理；678 回归 0 SKIP。

1.30.0 为二轮评审修复（[RELEASE-1.30.0](release/RELEASE-1.30.0.md)，evidence/project-review-2026-10-06 六组实现问题按 P1→P2 分阶段收敛）：F01 登记内 runner（conventions argv 规则/scope.json contentCheck）计入统一执行预算＋宿主预算即执行期限（剩余期限不足停止启动记 ERROR budget-exhausted，run/inspect 同源、登记损坏 fail-closed）、F02 requireLive 要求显式 mode:'live'（缺失＝缺证据 FAIL，三消费路径一致）、F03 semantic-relation 反向认可须显式 inverseOf（组合对照扩展认可 oracle＋覆盖面健全性＋verdict 一致性）、F04 PNG 逐 chunk CRC/IEND/未知关键 chunk/解压上限＋tRNS 透明键展开（Pillow 交叉核验一致）、F05 依赖图提取注释/字符串感知（副作用 import 与 export-from 计边、副作用边入环）、F06 OpenAPI 提取器子集外操作/组合/深层 $ref fail-closed＋参数 name+in 覆盖＋输出 kind:'api'；评审 13 项探针全部按规范结果收敛；672 回归全过、0 SKIP；37 kinds/48 示例不变。

1.29.0 为评审后续推进（[RELEASE-1.29.0](release/RELEASE-1.29.0.md)）：七工作包——documentation 内容级核验（L5.3→达成）、真实进程故障 runner（L4.6→达成）、依赖图真实测量（L4.1→达成）、像素差内核重算（PNG 声明子集）、OWL/SHACL 组合对照（发现并修复传递自环内核缺陷）、OpenAPI 子集提取器（L2.1→达成）、多轮延迟分布计时；653 回归全过、0 SKIP；37 kinds/48 示例。剩余部分 3 行（L2.2/L3.4/L3.5）——其中 L2.2/L3.4 后经同日需求跟踪口径裁定转达成（RTM 裁定节留痕），余 L3.5 一行。

1.28.0 为评审残余收尾（[RELEASE-1.28.0](release/RELEASE-1.28.0.md)）：2026-10-01 审查 F01–F11 已在 1.24.0 修复（本版发布前复现脚本重跑确认仍全部有效），本版收尾"设计差距"节剩余可实施项——SKIP 原因显式化（未启用/阶段未选中/不适用三态，`evidence[].details` 结构化）、不适用跳过审计行、未验证声明成因区分、symbol-grounding all 模式零文件面可见；判定语义与退出码零变化；635 回归全过、0 SKIP；37 kinds/46 示例不变。

1.27.0 为受控表达第三批（RTM X14 首轮达成）：确定性文风检查接入——随包检查器 WS-1 长句/WS-2 模糊词/WS-3 多动作（advisory，首轮观察 87 项）、扫描零文件可见、入口文档历史迁移 history/VERSION-HISTORY.md；631 回归全过、0 SKIP。

1.26.0 为第二批（RTM X13→达成）：报告表达——逐门禁来源列＋来源分布、advisory 可见、例外不隐藏、声明关联、Stop 边界表达；协议零变更。1.25.0 为第一批（RTM X12）：纠正文案与指令＋WRITING-GUIDE。1.24.0 为首次 GitHub 早期开源发行＋审查 F01–F11 修复（支持范围见 [OPEN-SOURCE-STATUS](OPEN-SOURCE-STATUS.md)）；客户端实机验收 1.24.0–1.27.0 已于 2026-10-06 四版同轮收尾（[LIVE-ACCEPTANCE-1.27](history/LIVE-ACCEPTANCE-1.27.md)）。

完整回归实测（多轮分布，v1.29 起 devtools/measure-timing.mjs）：1.24.0 口径 77.5 秒、1.25.0 17.8 秒、1.26.0 19.9 秒、1.28.0 19.5 秒、1.29.0 五常规轮 20.7–21.4 秒＋2 负载轮 21.6/21.8 秒（全 PASS，逐轮记录见 evidence/v1.29.0/timing-release.log）；任一计时都是当时记录，不能作为永久满足预算的依据。根 close 做 G-CONVENTIONS（含 advisory 文风观察）＋G-DOCS（入口文档版本内容级核验，2026-10-06 起自举接入），完整回归在 CLI pr/release 执行；G-TESTS timeoutMs=60000（2026-10-06 自 1.24.0 轮的 180000 回调——180000 领先了安装版 1.23.1 的内核上限 60000，Stop 全量校验 ERROR；约束：根配置不得领先安装客户端版本，客户端升到 ≥1.24 后如需负载裕量可再上调）。Stop 配置执行预算 50 秒，为宿主 55 秒期限保留核验与落盘余量；不靠重启或单次达标结算期限问题。

## 下一步与未完成项

2026-10-06 [受控表达应用方案](context/RESEARCH-CONTROLLED-EXPRESSION-2026-10-06.md)立项（RTM X12–X15）。第一至三批已随 1.25.0/1.26.0/1.27.0 实施（X14 为首轮达成）；第四批＝效果对照实验（X15）已全部执行完毕：试点＋全量轮（144 受试＋评分者间复核 98.4%）＋人类盲测（[结果](../experiments/controlled-expression/blind-test/RESULTS-2026-10-06.md)）同日完成，RTM X15 行已结算（测量边界登记在案，不外推为通用结论）。

1. 逐 Claim 证明范围与混合来源显示已随 1.26.0/1.28.0 落地；证明链补齐已随 1.31.0 落地（AC→真实用例绑定＋来源信号覆盖新增核验能力——缺用例/被跳过/指向无关成功门禁均不得作为 AC 通过依据，总体 PASS 不再能被理解为所有意图已证明的"用例级"缺环）。
2. v2.0 收尾终审：剩余"部分"行（L3.5）终审（技术可及升级或"边界即达成"转正，另裁决 L2.1 AsyncAPI 纳入与否）、transcript 强制化默认裁决、RTM 终版清算、v0.9 演进基线标记完成。
3. 新版本 ZCode 实机验证单独记录；CLI/模拟与以前版本记录不能代替——1.24.0–1.27.0 已于 2026-10-06 四版同轮收尾（[LIVE-ACCEPTANCE-1.27](history/LIVE-ACCEPTANCE-1.27.md)），后续新版本仍须单独记录。
4. 以上完成后再评估第二 adapter 等新基线事项。

范围决定保留：R13 拓扑推导/编排、签名、仓库自有 CI、1.8.0 裁剪项和双人核准不因开源发布恢复；2026-10-06 裁定——外部真实项目使用验证属进一步需求收集，不作为本项目需求跟踪与验收条件（RTM L2.2/L3.4 据此转达成，使用方反馈作为后续新需求来源）。

历史版本完成记录（v0.1 起，含 1.24.0–1.26.0 逐版一行）已迁至 [history/VERSION-HISTORY.md](history/VERSION-HISTORY.md)——按当时版本与环境理解，只增不改。
