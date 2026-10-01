# RELEASE 1.5.0 — 原则/实践轨道:支付正确性、安全最小集与证据纪律

日期:2026-09-25。范围来自 [PLAN.md](../PLAN.md) v1.5(用户 2026-09-25 逐项确认;调研依据 [RESEARCH-ARCH-PRINCIPLES.md](../context/RESEARCH-ARCH-PRINCIPLES.md)、[RESEARCH-PRINCIPLE-CATALOG.md](../context/RESEARCH-PRINCIPLE-CATALOG.md))。语义轨道 1.3/1.4 由并行会话完成,本版与其正交叠加。

## 新增能力(六工作包,提交 6f17509 → 本版)

1. **F2P/P2P 双向测试协议**(L1 engineering / L3 behavior):新行为用例必须在基线上失败(伪修复防护),防回归用例双版本通过;skip 不计通过;六类违规全部指名。behavior 的基线通过与失败由内核按同一期望判定,runner 只报实际值。
2. **证据纪律四件套**(L4 metrics/resilience):`evidenceValidity`(延迟证据 CO 纠正前置)、`maxAgeDays`(observedAt 新鲜度,过期 FAIL)、`baselineViolations`(哈希钉扎存量冻结,只拦新增)、`provenance: declared|derived|drilled`(declared 失败摘要降权)。泛化 v1.3 acknowledgedOntology 的过期语义。
3. **支付数据正确性**(L2):新 `consistency` 门禁五类子检查——零和账本(整数最小货币单位+可选写前校验证实)、append-only、对账(账龄分桶+SLA)、DLQ(retention≥source 静默丢数据防护+毒消息演练)、审计链(**内核重算 sha256(prev:seq:actor:action),runner 无法伪造**);alignment 新增 `contract-diff`(breaking change 结构化阻断)。
4. **安全最小集**(L4 scan + L3 behavior):新类目 `api-authz`(逐 operation 显式鉴权声明,anonymous 须显式)与 `credential`(issuedAt 轮换≤90 天+vault 来源);api-security-demo 含 BOLA 越权与 fail-secure(鉴权依赖故障→403)行为反例。
5. **超时/重试预算与熔断**(L4):新 `budget` 门禁(纯内核算术:Σ timeoutMs×(retries+1) ≤ 调用方预算;重试预算≤20%+jitter 模式);resilience `requiredTransitions` 熔断全路径演练(closed→open→half-open→closed+跳变日志);budget-demo 并发重试风暴确定性演练。
6. **容量与隔离演练**(A4/A7/A8):capacity-demo 经 metrics+drilled 来源承载——无界队列=0、过载优先级准入三断言、关键依赖分舱+干扰演练、负载阶梯吞吐单调。

## 验证证据

- 304 项测试全部通过(`evidence/v1.5/tests.txt`);含新增 consistency(11)、api-security(4)、budget(5)、capacity(4)、behavior F2P/P2P(5)、metrics/resilience 证据纪律(5)、examples 清单同步(6)。
- 打包解包复验:`quality-gate-1.5.0.zip`(372→含证据文件 374 文件,SHA256 见 `evidence/v1.5/package-smoke.txt`,dist 留档),临时目录解包重跑 304 测试与 27 个 demo 全 PASS(烟测清单读自 examples/examples.manifest.json 单一事实源)。
- 新增 demo 实跑:`evidence/v1.5/demos.txt`(ledger/api-security/budget/capacity 各 close 阶段 PASS)。

## 工程治理(随包附带)

- 示例集中管理:`examples/examples.manifest.json` 为 38 个示例的单一事实源(角色/kind/烟测阶段),`tests/examples.test.mjs` 强制清单↔目录↔README 索引同步、每 kind ≥1 示例(change-scope 显式登记为已知缺口)、每示例 ≥1 自动化锚;原 5 个无锚示例(behavior/metrics/fibo/semantic-profile/delivery)已接入打包烟测(22→27)。

## 证明边界

- 新 demo(ledger/capacity/budget)为确定性同步仿真或迷你内存实现,证明**协议与判定链路**(含内核侧审计链重算),不等于生产账务存储、真实压测或真实队列设施认证;风险条目已逐 demo 声明。
- 客户端实机验收(v1.2 起累计的遗留项)已于 2026-09-25 完成,证据与边界见 [LIVE-ACCEPTANCE-1.5.md](../history/LIVE-ACCEPTANCE-1.5.md):SessionStart/Skill/Stop 放行与阻断回路、依赖提示注入均为 1.5.0 客户端运行时实证;插件详情页视觉与验收项目 UI 发送复演因桌面无可交互前台未取得;缓存内 config-guide 安装布局崩溃当日修复,随下次发布进入客户端。
- 四原则语义深化(R1–R6:故障域、最小割集、副本分型、灰度判定协议、重跑确定性)按用户决策留待下一轮。
