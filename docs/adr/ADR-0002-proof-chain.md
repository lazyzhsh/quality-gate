# ADR-0002：Claim→Evidence→Gate→Risk→Exception 证明链元模型

- 状态：已接受（v0.1 §12–§17 定案）
- 日期：2026-09-23

## 背景

需要让"可交付"成为可审计的声明而非印象：谁声称什么、凭什么、由什么规则判定、哪些敞口未证明、哪些例外被记录。

## 决策

核心元模型五元组：**Claim**（要证明什么）→ **Evidence**（可复核事实，含工具来源与观察值）→ **Gate**（按策略判定 PASS/FAIL/SKIP/ERROR）→ **Risk**（明示未证明敞口，随报告输出）→ **Exception**（受控例外）。Exception **只登记并阻断，不存在自动豁免**；声明式豁免仅限扫描类 `acceptedFindings`（rule+location+reason+expiresAt，过期自动恢复阻断）。原始设计 §20 的 INCONCLUSIVE/WAIVED/NOT_APPLICABLE 有意简化为 ERROR/SKIP（fail-closed），豁免语义收敛到显式登记。

## 后果

- 正面：报告即审计线索；release 阶段产出含逐条 SHA256 的 releasePackage；"把 SKIP/ERROR 当 PASS"在协议层不可能。
- 负面：无审批流的 Exception 意味着例外只能靠人工在配置层处理（登记在案的开放项，见 RTM X1/X2）。

## 备选方案

完整实现 WAIVED+审批链（拒绝：首版无审批设施，先保 fail-closed）；三态判定（拒绝：模糊态会弱化阻断语义）。

## 关联

[ADR-0001](ADR-0001-six-domain-model.md)、[ADR-0004](ADR-0004-deterministic-first.md)、[RTM X1/X2](../RTM.md)

## 后续变迁（2026-10-06 补注，不改写上方原始决策）

- **Exception 审批呈现**：v1.6 起 Exception 增补 `status: proposed|approved`＋`approvedBy/approvedAt/expiresAt`——已审批且在有效期的例外在报告中呈现 **WAIVED**（不改变任何门禁判定、不豁免任何 FAIL）；未审批/过期仍阻断。原始"只登记并阻断"是首版形态，X1 语义未变：豁免不放松验收。
- **releasePackage**：随 v1.11 证据归档统一，release 阶段不再产出独立 releasePackage 文件——逐门禁证据（含 SHA256）一律写入 `.quality-gate/runs/<uuid>.json`，交付包核验改由 `devtools/build_delivery.py` 的打包冒烟（解包复验全量回归＋示例冒烟）承载。原文"release 阶段产出含逐条 SHA256 的 releasePackage"按此理解。
- 逐条演进见 [VERSION-HISTORY](../history/VERSION-HISTORY.md) 与各版 [RELEASE](../release/)；本 ADR 元模型五元组本身未变。
