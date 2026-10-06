# RELEASE-1.28.0（2026-10-06，评审残余收尾——SKIP 原因显式化与不适用跳过审计）

## 主线：2026-10-01 全项目审查"设计差距"节的剩余可实施项

审查（[evidence/project-review-2026-10-01/REVIEW.md](../../evidence/project-review-2026-10-01/REVIEW.md)）确认的 F01–F11 已全部在 1.24.0 修复并以 `tests/release-correctness.test.mjs` 回归在册（本版发布前原样复现脚本重跑确认仍全部有效）。本版收尾审查"不应混同为已证实缺陷的设计差距"节中尚未落地的可实施建议：**必要检查和不适用理由的显式审计**。**判定语义、stdout JSON 顶层协议、退出码零变化**；`evidence[].details` 的 SKIP 条目由字符串改为结构化对象（旧归档由摘要层兼容呈现）。

## 变更清单

1. **SKIP 原因显式化**（`lib/kernel.mjs`）：未执行门禁的 `evidence[].details` 由合并字符串 `'Disabled or stage not selected'` 改为 `{reason:'disabled'}`（`enabled:false`）或 `{reason:'stage-not-selected',stages:[…]}`（配置阶段不含当前阶段）——两种不执行形态在报告协议中可区分。
2. **摘要建议列按 SKIP 成因区分**（`lib/summary.mjs`）：未启用→"未启用（enabled:false）"；阶段未选中→"不在本阶段执行"（原文案）；已执行但断言 `when` 条件全部未命中→"断言条件未命中（不适用）——视为必要证据属验收要求调整，须显式决策"；旧归档合并字符串→泛化文案"未执行（未启用或不在本阶段）"。
3. **不适用跳过审计行**：brief/全表按存在性追加 `不适用跳过: <gateId>（断言条件未命中 N 项）`——门禁已执行而断言条件全部未命中是"合法不适用"的显式审计面（此前该形态在表中显示"不在本阶段执行"，与事实不符）。
4. **未验证声明成因区分**（`claimCoverage`）：claim 无活跃门禁时区分"无关联门禁执行"与"关联门禁未执行或全部不适用"（此前一律写"无关联门禁执行"，对关联门禁存在但全部 SKIP 的 claim 不准确）。
5. **symbol-grounding 零文件面可见**：`mode:'all'` 且 include/exclude 过滤后零文件时呈现扫描零文件行（与 X14 的 banned-words 零扫描同类——范围配置失效不得静默呈现为已检查）；`changed-files` 模式零文件属"没有变更"，不提示。零扫描行文案改为中性措辞（"零文件不构成检查证据"，不再限定"符合规范"语境）。
6. **术语登记**：新概念"不适用跳过"入 [GLOSSARY](../GLOSSARY.md) §3；SPEC 摘要输出节与新增"v1.28 SKIP 原因显式化"节同步（含 v1.27 已有但 SPEC 漏记的扫描零文件行补记）。

## 验证

- `tests/summary.test.mjs` 新增 3 项：SKIP 建议三态区分（含旧归档字符串与无 reason 对象的兼容反例）；invariant 全条件未命中呈现为不适用跳过行而非阶段跳过（且有活跃门禁的 claim 不误报未验证）；symbol-grounding all 模式零扫描呈现、changed-files 零文件不呈现（约定登记零扫描行为保持）。
- `tests/kernel.test.mjs` 新增 1 项：disabled 与 stage-not-selected 的 details 结构化断言。
- 全量回归 635 项全过、0 SKIP（631＋新增 4）；根 close/release 与示例、构建解包验证见"版本与证据"。
- 审查复现脚本（`evidence/project-review-2026-10-01/reproduce.mjs`）在本版源码重跑：FRESH-DELETE/DURING/EXPIRY 三探针 Stop 全部阻断（不复用旧 PASS）、OWL-SUPERPROPERTY FAIL（missingRelation）、SHACL-INVALID-SINGLE-BOUND ERROR、LEDGER-UNSAFE-INTEGER ERROR、SYMBOL-ROOT-DEFAULT FAIL、两条 SYMBOL-BUILTIN 各自正确、OWL-REASONER-FACTS 双侧 AGREED、ADR-DEFERRED PASS、CONFIG-EQUAL-ARRAYS PASS——与 1.24.0 修复结论一致。

## 边界与注记

- 不适用跳过行是呈现层审计面：合法不适用与必要证据缺失的裁决仍由读者结合声明关联行判断，本行不改变 requiredLevels 语义（invariant 条件未命中而 requiredLevels 命中该层级时，同层级须另有活跃门禁，否则内核已有未满足必需层级判定）。
- claim 级强度聚合不再新增（本轮记录在案）：逐门禁来源列＋来源分布＋声明关联已可推导 claim 的证明构成，再聚合一级不产生新信号。
- 审查"剩余 7 项部分需求"的最终支持面确认、transcript 强制化档位、真实项目接入基线属 v2.0 终审与后续基线节奏（[OPEN-SOURCE-STATUS](../OPEN-SOURCE-STATUS.md) 完善顺序第 1/3 项），不在本版强行结算——理由：其完成条件依赖真实工具与项目（OpenAPI provider、ORM、渲染环境、故障演练、接入成本数据），无这些输入的"达成"即审查所指"仅通过改状态把未实现效果变成已达成"。
- 客户端实机验收待做（1.28.0 起待做，可与后续版本同轮收尾）。

## 版本与证据

- 版本 ×3 → 1.28.0（package.json / .zcode-plugin/plugin.json / marketplace.json）＋插件 README 版本行 ×2。
- zip `quality-gate-1.28.0.zip` 571 文件，SHA256 `390a2079e4035b40a1056b2c5db84d54470822f81b81b316b484b04988e9ec03`；解包复验 635 测试 635 PASS 0 SKIP＋25 demo PASS。
- 根 CLI：close 呈现 G-CONVENTIONS PASS＋G-TESTS SKIP（pr/release 阶段未选中——建议列"不在本阶段执行"、声明关联行按成因区分）；release G-TESTS＋G-CONVENTIONS 2/2 PASS（套件在门禁内 19.8 秒，60 秒预算内）。
- marketplace 快照已重镜像至 1.28.0（`sync_client_marketplace.py` 输出），待客户端"更新"按钮动作。
- 逐项验证记录见 `evidence/v1.28.0/`（全量回归、根 close/release、7 代表示例、构建解包、marketplace 同步、复现脚本输出）。
