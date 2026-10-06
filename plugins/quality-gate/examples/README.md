# 示例索引

单一事实源:[examples.manifest.json](examples.manifest.json)——由 tests/examples.test.mjs 强制同步:目录↔清单一致、每个 gate kind ≥1 示例(已知缺口须显式登记)、每个示例 ≥1 自动化依据、冒烟测试阶段合法、本表与清单一致。打包冒烟测试由 devtools/build_delivery.py 按清单执行。

| 示例 | 角色 | 域 | 门禁 kind | 冒烟测试阶段 | 测试依据 |
|---|---|---|---|---|---|
| alignment-demo | 协议演示 | L2 | alignment | — | alignment |
| api-security-demo | 协议演示 | L3/L4 | scan, behavior | close | api-security |
| architecture-demo | 协议演示 | L4 | metrics | close | metrics |
| architecture-dependency-demo | 协议演示 | L4 | metrics | close | metrics |
| behavior-demo | 协议演示 | L3 | behavior | close | — |
| budget-demo | 协议演示 | L4 | budget, metrics | close | budget |
| change-scope-demo | 协议演示 | L0 | change-scope | — | change-scope-demo |
| adapter-imports-demo | 协议演示 | L1 | symbol-grounding | — | adapter-imports-demo（python 腿缺席时 java 单跑） |
| api-surface-demo | 协议演示 | L2 | symbol-grounding | — | api-surface-demo |
| configuration-demo | 协议演示 | L5 | configuration | — | configuration |
| convention-align-demo | 协议演示 | L0 | convention-alignment | close | convention-alignment |
| consumer-matrix-demo | 协议演示 | L2 | consumer-matrix | close | consumer-matrix |
| debt-demo | 协议演示 | L5 | debt | — | debt |
| decisions-demo | 协议演示 | L0/L1 | command, decisions | close | — |
| demo | 入门 | L0/L1 | command, assumptions | close | — |
| documentation-demo | 协议演示 | L5 | documentation | — | documentation |
| intent-drift-demo | 协议演示 | L0 | change-scope | — | intent-drift-demo |
| engineering-demo | 协议演示 | L0/L1 | traceability, engineering | close | engineering |
| fibo-demo | 文档配套 | L2 | ontology-map | close | — |
| invariant-demo | 协议演示 | L2 | invariant | — | invariant |
| journey-demo | 协议演示 | L3 | journey | — | journey |
| ledger-demo | 协议演示 | L2 | consistency, alignment | close | consistency |
| persistence-demo | 协议演示 | L2 | persistence | — | persistence-integration |
| owl-reasoning-demo | 协议演示 | L3 | semantic-relation, semantic-alignment | — | owl-reasoning |
| property-demo | 协议演示 | L3 | property | close | property |
| replay-baseline-demo | 协议演示 | L3 | journey | — | replay-baseline |
| rerun-demo | 协议演示 | L4 | rerun | close | rerun |
| resilience-demo | 协议演示 | L4 | resilience | — | resilience |
| resilience-process-demo | 协议演示 | L4 | resilience | close | resilience |
| scan-demo | 协议演示 | L4 | scan | — | scan |
| semantic-alignment-demo | 协议演示 | L3 | semantic-alignment | — | semantic-alignment |
| semantic-conflict-demo | 协议演示 | L3 | semantic-alignment | close | proposals, semantic-alignment |
| semantic-consistency-demo | 协议演示 | L3 | semantic-consistency | close | semantic-consistency |
| semantic-constraint-demo | 协议演示 | L3 | semantic-constraint | close | semantic-constraint |
| semantic-exposure-demo | 协议演示 | L3 | semantic-exposure | close | semantic-exposure |
| semantic-instance-demo | 协议演示 | L3 | semantic-instance | close | semantic-instance |
| semantic-profile-demo | 协议演示 | L2 | semantic-profile | close | — |
| semantic-relation-demo | 协议演示 | L3 | semantic-relation | close | semantic-relation |
| semantic-state-demo | 协议演示 | L3 | semantic-state | close | semantic-state |
| semantic-subsumption-demo | 协议演示 | L3 | semantic-alignment | close | semantic-alignment |
| shacl-engine-demo | 协议演示 | L2 | semantic-profile | — | shacl-engine（无 pyshacl 环境 skip 带指引） |
| six-domain-demo | 组合展示 | L0/L1/L2/L3/L4/L5 | traceability, command, semantic-profile, behavior, metrics, debt | release | six-domain |
| symbol-grounding-demo | 协议演示 | L1 | symbol-grounding | — | symbol-grounding |
| terminology-demo | 协议演示 | L3 | terminology | close | terminology |
| trace-continuity-demo | 协议演示 | L4 | trace-continuity | — | trace-continuity |
| traceability-demo | 协议演示 | L0/L1 | traceability, command | close | — |
| visual-demo | 协议演示 | L3 | visual | — | visual |
| visual-browser-demo | 协议演示 | L3 | visual | — | adapters（无浏览器环境 skip 带指引） |

已知缺口:无——全部 gate kind 均有独立示例。change-scope-demo 因门禁要求"项目根=Git 仓库根"，由 `scenario.mjs` 在临时 Git 项目中驱动（正反例：ok/over-scope/protected/content）。
