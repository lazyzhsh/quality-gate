# RELEASE-1.25.0（2026-10-06，受控表达第一批——纠正文案与指令）

## 主线：RTM X12 第一批（应用方案 §9 批次 1）

来源：[受控表达应用方案](../context/RESEARCH-CONTROLLED-EXPRESSION-2026-10-06.md)（用户 2026-10-06 立项）。第一批只纠正影响下一步行动的文案，**判定、退出码与检查范围零变化**——不新增 gate kind、不改配置协议、不改报告 JSON 结构。

## 变更清单

1. **summary 失败建议改修复优先**（`lib/summary.mjs`，渲染层）：
   - change-scope 的 AC 结构/类型违规、traceability 的 structureViolations：由"修正 Gherkin/EARS 结构，或去掉 format 改回自由文本"改为"修正 Gherkin/EARS 结构；改回自由文本属验收要求变更，须显式修订（任务意图/需求）登记，不作为修复动作"——去掉 format 不再作为并列修复选项，防止 Agent 为得到 PASS 直接放松 AC 结构要求。
   - convention-alignment 命中：由"修复用词或更新豁免"改为"修复制品用词；更新豁免属调整规则，须核对约定来源后显式变更登记，不作为默认修复"——区分修复制品与调整规则。
2. **插件 SKILL 三处纠正**（`skills/quality-gate/SKILL.md`）：
   - 第 9 项 "Exception waivers remain unsupported" 为失实表述：例外是登记制——proposed/过期例外阻断运行；已审批且在窗口内呈现 WAIVED，仅免于登记阻断、从不把 FAIL 门禁变 PASS（该语义自 v1.6.0 起即为实现行为）。
   - 第 10 项 `domainCoverage`/`unmetRequiredDomains` 为 v1.16 协议键迁移（schemaVersion 0.2）前的旧键：现行报告键为 `levelCoverage`/`unmetRequiredLevels`，旧键仅存在于 pre-1.16 归档 run 的重渲染兼容垫片中，不得写入新配置或报告。
   - 第 4 项新增核心规则：修复只改制品不改验收线——禁用门禁、放宽阈值、新增豁免、改写 AC 属验收变更，须显式决策与记录。
3. **"豁免命中入证据呈审计面"三处失实修正**（CONFIG-GUIDE conventions 段、GATE-SPEC convention-alignment 行、`convention-alignment.mjs` 头注释）：`scanBannedWords` 实际将被豁免命中完全排除在 `hits` 之外——证据只含未豁免命中，被豁免命中不入证据、无审计面。完整豁免审计属后续独立增量（X14 评估），本版只修正文档事实，不改扫描行为。
4. **建立 `docs/WRITING-GUIDE.md`**（规范层新活文档）：按用途的约束强度表＋核心规则 W1–W12——GLOSSARY 管术语、WRITING-GUIDE 管表达，互不复制；明确硬约束（状态/条件/范围/证据）与提示级建议（句长/词汇/语气）的分界，不设"STE 合规分数"；文风自动检查与效果实验如实标注为未实施（X14/X15）。AGENTS.md 增加简短核心规则引用；docs/README 规范层登记。

## 验证

- `tests/summary.test.mjs` 新增正反例用例：三类建议必须含修复动作与"验收要求变更须显式"限定；旧并列句式（"或去掉 format""或改回自由文本""修复用词或更新豁免"）零出现。
- 全量回归 616 项全过、0 SKIP（615＋新增 1）；37 kinds/46 示例不变；判定语义与退出码零变化（无 kernel/runner/validate 改动——仅渲染文案、注释与文档）。
- 根门禁与受影响 demo 见下方"版本与证据"；打包结构未变。

## 边界与注记

- 本版不改受控表达的行为收益主张：是否降低 Agent 错误率属 X15 实验，尚未执行。
- SKILL/summary 为随包文件，客户端更新到 1.25.0 后生效；客户端实机验收 1.24.0/1.25.0 均待做（可同轮收尾）。
- 插件 README 的例外与 WAIVED 表述本就正确（提案阻断/审批 WAIVED 从不豁免 FAIL 门禁），仅版本行更新；README_CN 复用说明句去除版本号前缀（版本无关事实）。

## 版本与证据

- 版本 ×3 → 1.25.0（package.json / .zcode-plugin/plugin.json / marketplace.json）＋插件 README 版本行 ×2。
- zip `quality-gate-1.25.0.zip` 494 文件，SHA256 `db0146a711d89c933d3c5e1fb3d4ba6e28f43f39ab70c3d9643bd4c2ab629254`；解包复验 616 测试 616 PASS 0 SKIP＋25 demo PASS。逐项验证记录（回归/根 release/五场景/六域）见 `evidence/v1.25.0/`。
