# Release 1.10.1 — 快赢补丁（R12 摘要层证据力汇聚）

发布日期：2026-09-27。零破坏补丁（v1.11 规划轮经用户 2026-09-27 选定先行）；GATE-SPEC-v1.10 节内扩展（补丁不更名）。

## 新增

- **R12 证据力汇聚**（`lib/summary.mjs` 新增 `evidenceStrength(report)`，纯展示层）：只读聚合 **PASS 门禁** details 中的实测信号，回答"这次 PASS 由什么强度的证据支撑"——
  - **锚点信号**（内核可独立核验）：git 基线（`baseline.status:'verified'`，rev-parse 核验）、alignment 来源指纹（`sourceFingerprint.status:'VERIFIED'`，磁盘哈希核验）、rerun 同 seed 双跑一致（`jobs[].deterministic`）、persistence 前后快照（`details.snapshots`，E3 默认强制下交叉核验）；
  - **定量信号**（runner 自报数值、形状经内核校验）：unit 测试计数（total/passed/skipped 跨 check 汇总）、覆盖率（ratio+tool）、变异分数（0..1 格式化为百分比）、property 用例数与 seed、behavior 用例数；
  - **等级由实测推导**，不预设：`锚定`（存在任一锚点）＞`声明级`（仅定量信号）＞`降权`（存在"证据降权"声明时优先级最高）；无任何可汇聚信号则不显示该行（不虚报）。
- brief 与全表报告各呈现一行"证据力: 等级 · 锚点 … · 定量 …"（锚点/定量各截前 4 项）；归档重渲染（`qgate report`）同样携带。示例：`证据力: 锚定 · 锚点 git 基线 1、来源指纹 1 · 定量 测试 9/10、覆盖率 87.2%（c8）、变异 72%、性质 40 例（seed 42）`。

无新增配置项、无 runner 协议变更、不改任何门禁判定；旧报告 JSON 可直接重渲染出该行（渲染时聚合）。

## 验证

- 390 项回归全绿（386→390：summary 4 个新测试——锚点+定量聚合且非 PASS 门禁不计入、声明级分级、降权优先、无信号不虚报且不渲染该行）；六域 demo 呈现"声明级 · 定量 行为 2 例"、engineering-demo 呈现"降权 · 定量 测试 4/4、覆盖率 100%（node:test --experimental-test-coverage）、变异 100%"（embedded 基线降权如实先行）；GATE-SPEC-v1.10 摘要输出节扩展；RTM R12 行转原生。
- 打包：`quality-gate-1.10.1.zip`（491 文件，SHA256 `8a053f339da9f5f2e4626b76e0ed4d89a1cccb19af0690472e728c48398fc64f`）解包复验全量测试+烟测通过，见 `evidence/v1.10.1/`。

## 边界

只汇聚**已回报**的证据信号，不新增采集；等级是对"证据强度"的汇总呈现，不构成新的判定、不改变准出语义；非 PASS 门禁的证据不计入（不支撑准出）。B1 原始证据内核解析落地 v1.11.0 后，`rawOutput` 内核解析信号将计入锚点（RTM R12 行已注明）。

下一轮已确认：v1.11.0 主线"B1 原始证据内核解析 + E 系列其余"（E5 Entity↔ORM、E6 API 消费者链层设计先行、E7 Java/Python 参考适配器）+ L3 机制复审随版，见 [PLAN](../PLAN.md) v1.11 节。
