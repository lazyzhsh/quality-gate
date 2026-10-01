# Release 1.10.0 — 拓扑语义深化版（topology semantics）

发布日期：2026-09-26。主线：新纯内核 kind `topology`（L4，文件式无 runner，32→33 kinds）承载四原则拓扑语义 R1–R4（研究输入 [RESEARCH-ARCH-PRINCIPLES.md](../context/RESEARCH-ARCH-PRINCIPLES.md)，2026-09-26 经用户选定）；随版 E3 persistence 快照默认强制（本轮唯一破坏性变更）。kernel 判定只消费声明式拓扑文件——不信任任何 runner 自我评估（同 budget/rerun 先例）。

## R1–R4（topology 门禁）

- **R1 故障域语义**：必存活集合 = critical 服务 ∪ 被关键服务依赖的服务（共享依赖天然并入）。`replicaDetails[{failureDomain:{region,zone,host}, role}]` 长度须等于 replicas；关键服务自身副本与关键依赖 `distinct(failureDomain) >= 2`（违规 `domainSpread`/`dependencyDomainSpread` 指名服务与依赖）。无域信息的必存活服务须显式 `domainVerification:"unavailable"` 降级（degradations 登记 + 报告"证据降权"行），否则 FAIL `failureDomainsUndeclared`——降级可见、不静默。
- **R2 状态模型分型**：关键服务必声明 `stateModel`（stateless/consensus/standby，缺即 `stateModelUndeclared`）；阈值 stateless≥2 / consensus≥3 且奇数（偶数 `consensusReplicasEven`——**2 副本共识集群是常见误配**，Raft 多数派浪费一票）/ standby≥3；`faultModel:"byzantine"` 仅限 consensus 且须 `faultTolerant:f`、replicas≥3f+1。
- **R3 一阶最小割集**：节点侧（必存活服务全部副本同域或单副本）+ 边侧（关键依赖 `instances=1`）；`minCutOrder1Count` 与"无单点"严格等价，任一非零 FAIL 并逐条指名；天然覆盖共享依赖与同域副本。二阶割集仅 `minCutOrder2Count` 计数登记不阻断。batch 单副本不豁免（可重跑不构成可用性）。
- **R4 平等判定**：副本 role 集合须全同（对称）或存在 leader 语义（role 含 primary/leader 或 stateModel:standby）；后者必须声明 `transientLeadership:true` + `leaderLeaseSec`，缺失即 `permanentPrimary` 指名缺字段——存在不可轮转的永久 primary 即 FAIL；非对称且无 leader 语义 `asymmetricRoles`。
- 畸形形状 fail-closed：未知/自依赖、instances 超目标副本、replicaDetails 长度不符、非法枚举/域键、重复服务名、文件缺失均 ERROR。

## E3 快照默认强制（破坏性）

persistence `requireSnapshots` 缺省由 false 改为 **true**（API 前后独立回读交叉核验本为设计要求）。退出须显式 `"requireSnapshots": false`（可见声明，`details.requireSnapshots` 入证据）；未回报快照 ERROR 指名默认强制与退出方式。批量 `expectedRecordCount>1` 与快照互斥 → **必须显式置 false**（未显式退出的批量由校验通过转为 ERROR）。

**迁移**：批量 persistence 门禁在配置中补 `"requireSnapshots": false`；单记录 persistence 门禁的 runner 补回报 `snapshots:{before,after}`（after 须与独立观察深相等）或显式置 false。本仓 persistence-demo 的 runner 恒回报快照，零迁移；夹具不使用 persistence，不受影响。

## 其他

- 1.9.1（同日先行发布）：E4 change-scope `requireContentCheck` 与 alignment 观察端 `sourceFingerprint`（零破坏，见 RELEASE-1.9.1）。
- architecture-demo 同一 topology.json 同时供 metrics（四原则布尔/灰度判定，对照）与 topology（R1–R4 结构化语义）两个门禁消费；settlement-batch 调整为 2 副本、payment-db 共识 3 副本以过 R2/R3。
- 摘要提取器新增 topology 逐规则原因；"证据降权"行覆盖拓扑域信息显式降级。
- 范围决定（2026-09-26）：发布包签名（in-toto/DSSE）与仓库自有 CI 工作流**出项目范围**，不再列为候选。

## 验证

- 386 项回归全绿（376→386：E3 1 项 + topology 7 项 + summary 对齐）；CONFIG-GUIDE 34 段 jsonc 样例（33 kind+顶层）通过内核 validate；RTM §7 E3/R1–R4 全部原生；GATE-SPEC-v1.10 现行（v1.9 归档 history）。
- 夹具四步在 v1.9.0 已全绿且本轮不涉及夹具（无 persistence/topology 门禁）；demo：architecture-demo close 2/2 PASS。
- 打包：`quality-gate-1.10.0.zip` 解包复验（全量测试+烟测），见 `evidence/v1.10.0/`。

## 边界

topology 核验的是**声明文件的一致性**（R1–R4 语义），不是真实部署编排态（从 K8s/IaC 推导声明属候选 R13）；域信息显式降级是声明，不是核验通过。E3 的快照由 runner 产出——默认强制封"未核验"，不防 runner 伪造快照内容。
