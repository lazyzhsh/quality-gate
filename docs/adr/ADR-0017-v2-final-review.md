# ADR-0017：v2.0 终审范围与证据默认策略

- 状态：已接受（用户 2026-10-08 三项裁定；实现与验收结果见本版发布说明）
- 日期：2026-10-08

## 背景

v1.31.1 已实现 AC→当轮用例绑定。v2.0 路线仍须裁定 L3.5 的设计边界、原始观察记录默认策略及 AsyncAPI 是否扩入范围，并核对 RTM 与 v0.9 四轨道完成条件。

## 决策

1. **L3.5 按现有边界转达成。** 内核负责实际观察与期望对比、F2P/P2P 和用例绑定复核。AC 语义、用例设计及二者的对应由人评审；不自动从自然语言 PRD 推导全部正确行为。`requireCaseBinding` 仍是显式项目策略，不因状态调整而自动开启。
2. **原始观察记录保持默认 false。** behavior/journey 的 `requireRawTranscript` 由项目显式启用；声明了记录仍必须核验当轮 runId、逐项值与来源一致性。保留既有回放自报分支和可见的来源边界。双记录一致不证明 runner 诚实，终审不把它改写为独立认证。
3. **AsyncAPI 纳入 v2.0。** 在现有 L2 alignment 内增加 event scope，直接读取 AsyncAPI 3.0 JSON 子集，核验当轮真实工具回报的消息样本。操作方向、通道、消息身份、JSON 类型/必填/枚举/范围和消息覆盖由内核判定；未支持语义 fail-closed。提供零依赖提取器与真实本地 TCP 示例、正反例和全量回归，完成后再定版。

## 备选与后果

- L3.5 继续标部分并另做自动需求推导：未采用；这会扩大既定确定性边界。
- 全局或新模板默认强制原始观察记录：未采用；现有项目保持显式策略，报告继续如实显示来源。
- AsyncAPI 延后新需求：用户未采用。新增 event scope 是加法扩展，37 kinds 与配置 schemaVersion 0.2 保持；旧版插件不认识 event scope，应升级后使用。
- 完整 AsyncAPI 解释器与 broker 集成：本轮参考能力限定为文档所列子集，未验证投递次数、顺序、持久化、协议绑定和生产环境。专业工具接入仍属使用项目工程。

## 关联

[RTM](../RTM.md)、[Gate Spec](../GATE-SPEC-v1.23.md)、[CONFIG-GUIDE](../CONFIG-GUIDE.md)、[ADR-0004](ADR-0004-deterministic-first.md)、[ADR-0007](ADR-0007-kernel-authority.md)、[v2.0 发布说明](../release/RELEASE-2.0.0.md)。
