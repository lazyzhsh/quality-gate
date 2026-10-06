# RELEASE-1.27.0（2026-10-06，受控表达第三批——确定性文风检查接入＋入口文档重构）

## 主线：RTM X14（应用方案 §9 批次 3）

可判定文风规则接入自动检查（首轮全部 advisory）＋入口文档历史叙述迁移。**判定语义、stdout JSON、退出码零变化**；新增一个随包零依赖脚本与一条根约定登记规则。

## 变更清单

1. **文风检查器** `plugins/quality-gate/scripts/writing-style-check.mjs`（随包、零依赖、统一观察协议 stdin `{schemaVersion,runId,ruleId}` → stdout findings；自身失败＝非零退出 → 门禁 ERROR fail-closed）：
   - **WS-1 长句**（W12）：正文/表格单元格的中文分句 >160 字、英文句 >45 词（阈值可配）；代码块与行内代码不参与（路径/参数/字面量豁免）。
   - **WS-2 模糊词**（W4）：字面量词表 适当处理/按需优化/酌情优化/尽量保证/后续完善；`qgate-style:example` 行标记豁免规则样例与文档自引。
   - **WS-3 多动作步骤**（W4 启发式）：列表行含 ≥2 个动作连接词（然后/接着/同时/并且）。
   - **表格逐单元格检查**（不整表跳过）；**扫描零文件回报 `scope-empty` finding**——零文件不能作为符合规范的证据；findings 封顶 200 并显式标注截断。
2. **根约定登记接入**：`.quality-gate/registries/conventions.json` 新增 advisory 规则 `STYLE-writing`（argv 调用检查器，范围＝活文档 docs 根层与仓库根 `*.md`；历史层 history/release 与上下文层 context 不扫——档案只增不改）。首轮观察实测 87 项命中（长句为主），可见于摘要 advisory 行、不阻断。
3. **摘要层零扫描可见性**：banned-words 规则 `scannedFiles===0` 时 brief/全表显示"扫描零文件"行——范围配置失效不再静默呈现为 PASS。
4. **WRITING-GUIDE「与自动检查的关系」更新**：首轮规则登记表（编号/来源/扫描范围/正例/反例/漏检边界/豁免记录——方案 §8 全要素）；升级为阻断的前提不变（确定性、范围清楚、误报逐条核实）。
5. **入口文档重构**（方案 §7.2，批次 3）：docs/PLAN.md 历史版本记录（18.6K）与 PROJECT-HANDOFF 历史条目迁至 [history/VERSION-HISTORY.md](../history/VERSION-HISTORY.md)（链接按新位置改写，全仓 497 处相对链接 0 断链）——PLAN 收敛为当前状态＋未完成项＋范围决定（1.9K），HANDOFF 只留当前基线＋可复用验收基线；RTM §13 客户端实机验收口径修正（1.24.0 起待做，不再是"全部收尾"旧口径）。

## 验证

- `tests/writing-style-check.test.mjs` 9 项：协议回显/长句正反例/代码块与行内代码出界/表格单元格命中/样例标记豁免/多动作启发式正反例/零文件显式 finding/坏输入与非已知参数 fail-closed/摘要零扫描行正反例。
- 全量回归 631 项全过、0 SKIP（622＋新增 9）；根 close PASS 且 brief 呈现 `advisory 建议命中: 共 87 项`（判定保持 PASS——advisory 不阻断）；根 release 见"版本与证据"。
- 文档迁移后全仓链接 0 断链；PLAN/HANDOFF 现有引用逐一核对。

## 边界与注记

- 首轮规则全部 advisory：命中是观察数据不是质量失败；是否调整阈值/词表待 X15 实验数据与误报逐条核实后再定，升级为阻断须满足 §8 三前提。
- 检查器是确定性计数/字面量匹配，不理解语义；WS-3 为启发式（连接词少而动作多的情况漏报，如实登记）。
- 历史层不扫描是范围决定不是能力缺口；范围变更须同步 WRITING-GUIDE 规则登记表。
- 客户端 1.24.0–1.27.0 实机验收待做（可同轮收尾）。

## 版本与证据

- 版本 ×3 → 1.27.0（package.json / .zcode-plugin/plugin.json / marketplace.json）＋插件 README 版本行 ×2。
- zip `quality-gate-1.27.0.zip` 527 文件，SHA256 `6bae31fa489ed6c2cdb934079737fdbaa35d27f37bad1dbb996f027d452d558a`；解包复验 631 测试 631 PASS 0 SKIP＋25 demo PASS。逐项验证记录（回归/根 release/demo/检查器反例/X15 试点）见 `evidence/v1.27.0/`。
