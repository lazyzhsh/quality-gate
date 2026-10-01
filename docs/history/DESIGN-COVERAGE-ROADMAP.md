# 设计文档逐项实施台账（已归档）

> **已归档（2026-09-25）**：本台账的活跃职责已由 [RTM](../RTM.md) 单一索引承接（36 任务+横切+v1.5 增补、状态图例与维护约定）；本文档保留更细的逐项执行语义描述，作查阅副本，不再随实现更新（更新走 RTM）。

基线：《universal-delivery-gate-zcode-design-v0.1》§6–11；本台账记录可执行检查，而非只按六个域各放一个演示 Gate。`原生`表示内核有专门的验证与结构化证据；`项目工具`表示可配置已有命令，但该任务的分析逻辑仍需项目提供；`待实现`表示尚无专门验证。任何结果都只覆盖配置选定的项目与案例。

## L0 范围、需求与生成完整性

| 设计任务 | 状态 | 当前/目标执行与证据 |
|---|---|---|
| L0.1 Requirement Traceability | 原生 | 显式 RTM 逐条关联 AC、项目内代码文件及同次 PASS 的任意非元门禁（traceability/readiness 除外）；可选 coverage 运行器协议核验 AC 链接文件是否被执行（covered 逐文件落证据），输出关联证据 ID |
| L0.2 Acceptance Criteria Coverage | 原生（声明范围内） | 每个 Requirement 可声明所需 normal/boundary/negative/exception/state-transition 类型；缺类型或关联测试未 PASS 均失败。尚不自动从 PRD 推断遗漏场景 |
| L0.3 Assumption Check | 原生 | 可要求来源、证据、影响、风险、处理方式；open/rejected 失败。source/evidence 支持结构化引用：`{file}` 核验存在性并防路径逃逸，`{gateId}` 须为同次 PASS 证据；纯文本不核验。独立模块，在关联门禁之后评估 |
| L0.4 Open Decision Check | 原生 | 决策登记表含 owner、resolution、evidence；open 失败，deferred 仅可在 L0 显式允许。evidence 支持 `{file}`/`{gateId}` 结构化引用并核验（同次 PASS 证据或存在文件）；可选 `affectsPaths`/`affectsGateIds` 声明决策影响范围并核验存在性，未知门禁即 ERROR |
| L0.5 Change Scope Check | 原生 | Git 基线与工作树/未跟踪文件对比；允许路径、必需路径、敏感路径确认；逐文件记录 A/M/D/R 变更类型（重命名报目标路径）。确认可绑定 `acknowledgedBase`，基线移动后失效需重新确认。可选 contentCheck 运行器对 diff 内容产出结构化 finding（如依赖新增），未在 `acceptedFindings` 显式接受即 FAIL。仍不能自动判断接口语义改变 |

## L1 代码与工程正确性

| 设计任务 | 状态 | 当前/目标执行与证据 |
|---|---|---|
| L1.1 Syntax/Static | 原生执行协议 | engineering 的 static 子检查运行真实工具，记录退出码与输出；样例用 Node syntax，lint/type 工具由项目配置 |
| L1.2 Compile/Link/Package | 原生执行协议 | build 子检查执行构建，核验非空制品和 SHA256；样例生成真实模块制品 |
| L1.3 Unit Test | 原生执行协议 | unit 子检查要求本次运行的 total/passed/failed/skipped；可选 `blockOnSkipped`（skipped>0 即 FAIL，对齐"SKIP 非 PASS"哲学）与 `minTotal` 最小测试数；样例执行 Node 测试。五类场景覆盖（normal/boundary/negative/exception/state-transition）由 L0.2 的 RTM `requiredTypes` 落实，engineering-demo 已演示二者同次联动 |
| L1.4 Mutation Testing | 原生执行协议 | mutation 子检查要求 killed/total/score 与阈值；可选 `survivors` 存活明细（id/description，须与 killed/total 算术一致否则 ERROR）；样例真实生成两处变异并运行测试 |
| L1.5 Code Structural Rules | 原生执行协议 | structure 子检查记录具体文件/规则/严重度；可选分严重度阈值 `maxBySeverity` 与总数上限叠加，证据含逐严重度计数；样例识别禁止的 legacy 层导入，正式项目需接入依赖图工具 |
| L1.6 Repository Convention Alignment | 原生执行协议 | convention 子检查记录具体违规项，同样支持 `maxBySeverity` 分严重度阻断；样例禁止 console.log，正式项目需配置自身规则 |

## L2 接口、数据与系统一致性

| 设计任务 | 状态 | 当前/目标执行与证据 |
|---|---|---|
| L2.1 API Contract Alignment | 部分原生 | alignment 比较声明契约与本次 runtime runner 观察，输出 JSON Pointer 差异；`ignorePaths` 可显式豁免易变路径（差异计入证据）。样例真实请求本地 HTTP。尚未覆盖完整 OpenAPI/DTO/客户端/消费者链 |
| L2.2 Schema Structural Alignment | 部分原生 | alignment 比较声明列规格与 SQLite migration 后 PRAGMA 实际列结构，输出列级差异；维度（type/nullable/default/key 等）由声明决定，内核做深比较。尚未覆盖 ORM、外键与多数据库方言 |
| L2.3 Schema Semantic Check | 部分原生 | FIBO/local concept lookup 与项目声明字段约束；尚不识别 captured/settled 等概念冲突 |
| L2.4 Persistence Behavioral Verification | 原生 | 独立 runner 实际 API→DB 回查并逐字段核对，记录请求、状态、记录数、字段 expected/actual；可强制 before/after 快照并由内核生成字段 delta。`expectedRecordCount` 支持 0（必须不落库，允许断言非 2xx 拒绝场景）与 N（批量 `records` 逐条核对）；幂等重复提交可用同 runner 双 gate 模式（persistence-demo 已示范） |
| L2.5 Cross-table/Cross-service Invariant | 部分原生 | invariant 对 runner 独立读取的多个值执行 eq/neq/le/lt/ge/gt 和条件规则（when 支持 in/notEquals/AND 组合）；样例实际查询 SQLite payment/ledger 两表。跨服务事务与最终一致性尚未覆盖，多源建议每服务一 gate 另配对账 gate |

## L3 功能与业务语义正确性

| 设计任务 | 状态 | 当前/目标执行与证据 |
|---|---|---|
| L3.1 Smoke | 原生执行协议 | journey 按显式场景逐步骤检查；可选 `ignorePaths` 豁免步骤易变字段（差异/豁免入证据）；样例实际请求本地 HTTP 健康端点 |
| L3.2 Integration | 原生执行协议 | journey 实际创建再读取资源，记录每步预期与实际；项目依赖由 runner 启动 |
| L3.3 E2E | 原生执行协议 | journey 完整执行创建、支付、读取 API 旅程并定位失败步骤；尚非浏览器旅程 |
| L3.4 Visual/UI | 部分原生 | visual 默认与基线逐字节比较、报告 SHA 差异；可选 `maxDiffPixels`/`maxDiffRatio` 像素容差协议（runner 回报度量、内核按阈值判定）；基线变更保护可经 change-scope `protectedPaths` 组合实现。尚无浏览器截图与感知级比较 |
| L3.5 PRD Behavioral | 部分原生 | behavior 按显式案例输入/预期对比实际输出，可选 `ignorePaths` 豁免易变输出字段，失败案例差异明细入证据；尚不自动由 PRD 推导 |
| L3.6 Domain Invariant | 原生执行协议 | property 以固定 seed 执行多案例的不变量与状态转换规则，断言语义与 invariant 完全一致（eq/neq/le/lt/ge/gt + `when` 条件），输出反例；尚无模型检查/穷举证明与自动收缩 |
| L3.7 Ontology Semantic Gate | 部分原生 | semantic-alignment 从项目代码读取符号映射（支持多候选注解），与可替换 provider 中的概念 IRI 核对；`matchMode: subsumed` 经目录 `subClassOf` 传递闭包接受子类候选并输出包含链（无环与目标在目录内均 fail-closed）；local-catalog `disjointWith` 支持互斥冲突检测且经内建 OWL 子集推理沿继承传播（Semantic Conflict 升级版：含 FIBO 真实推断互斥对 MultilateralContract⊥BilateralContract；目录自相矛盾 fail-closed，`examples/semantic-conflict-demo`、`examples/semantic-subsumption-demo`）；terminology 门禁实现 Terminology Ambiguity 最小版（prefLabel 唯一性 + 术语 label/altLabels 精确解析，SKOS S14 精神，`examples/terminology-demo`）；`acknowledgedOntology` 指纹确认使目录升级（含 FIBO 手动升级，`plugins/quality-gate/scripts/ontology_diff.py` 分类变更）强制映射重审；semantic-relation 门禁实现 Relation Alignment 最小版（概念间关系三元组的代码/声明/目录三方核对，`examples/semantic-relation-demo`）；semantic-constraint 门禁实现 Constraint Alignment 最小版（本体声明约束在真实观察案例上执行，与 L3.6 property 同一断言语义，`examples/semantic-constraint-demo`）；semantic-state 门禁实现 State Alignment 最小版（本体生命周期与观察到的实例转换对齐，`examples/semantic-state-demo`）；semantic-instance 门禁实现实例级对齐（纯内建：实体期望类型核对 + 实例级互斥/歧义判定，含沿继承传播的推断互斥，`examples/semantic-instance-demo`）；semantic-exposure 门禁实现 Semantic Exposure 最小版（目录 exposure 策略 + runner 观察公共面，`examples/semantic-exposure-demo`）；semantic-consistency 门禁实现一致性核验 + 可选外部 reasoner 双实现一致性核对协议（不一致即 ERROR，内核不采信外部单独声称的结论，`examples/semantic-consistency-demo`）。仍无完整 OWL 关系/属性推理，reasoner 增强不增加内建规则之外的推理能力 |

## L4 架构、非功能与安全

| 设计任务 | 状态 | 当前/目标执行与证据 |
|---|---|---|
| L4.1 Architecture Fitness | 部分原生 | metrics 比较项目 runner 提供的违规数；`examples/architecture-demo` 将"实时无单点、后台多活、核心可灰度、批量可重跑并跑"四原则转为拓扑度量正反例，CONFIG-GUIDE 提供更多可选模式库；生产需正式依赖图工具 |
| L4.2 Non-functional | 部分原生 | metrics 比较数字阈值；示例计时不等于生产负载/P95/P99 |
| L4.3 Observability | 部分原生 | resilience 故障演练强制核对 log/metric/trace/alert 信号；尚未验证生产采集、告警投递和 trace 链路 |
| L4.4 SAST/Dependency/Secret/IaC | 原生执行协议 | scan 接受四类扫描器结构化 findings、严重度阈值与版本；可选 `acceptedFindings` 显式豁免（rule+location+reason，expiresAt 过期自动恢复阻断）。样例规则真实扫描项目文件，正式项目应接专业扫描器 |
| L4.5 DAST/Penetration | 部分原生 | scan 的 DAST 模式要求显式 local-process 声明并校验报告的回环目标，样例真实请求本机 HTTP 并阻断高危 finding；runner 的网络访问仍需外部隔离，不等于完整渗透测试 |
| L4.6 Failure/Resilience | 部分原生 | resilience 对 DB 不可用、重复消息与外部依赖超时执行服务代码故障注入，核对恢复时间、最终状态及观测信号；CONFIG-GUIDE 给出六类故障的 runner 模式指引，其余类型由项目 runner 实现 |

## L5 交付、运行与治理完整性

| 设计任务 | 状态 | 当前/目标执行与证据 |
|---|---|---|
| L5.1 Configuration Change | 原生 | configuration 比较多环境配置键、类型、声明的差异（`allowedDifferences` 支持 `*` 段通配）和秘密引用；发现明文秘密时脱敏失败；非 JSON 格式经 JSON 镜像接入（指引见 CONFIG-GUIDE）。尚不读线上配置 |
| L5.2 Database Migration | 原生执行协议 | migration 对真实 SQLite 旧版库执行 up/down，逐阶段核对 schema 与旧记录字段；生产方言/规模需项目 runner |
| L5.3 Document Consistency | 部分原生 | documentation 核对四类制品的版本与能力主题，制品 path 由内核核验存在且非空（与 readiness/RTM 对齐）；无法证明全文内容准确 |
| L5.4 Operational Readiness | 部分原生 | readiness 核对制品及同次验证；operational 本地执行 deploy、stop/start、upgrade、rollback、diagnosis、repair、alert handling、DR 八项并核对结果；生产环境需真实演练 |
| L5.5 Technical Debt Register | 原生 | debt 检查 owner、影响、偿还条件、期限；高/严重与逾期未结项阻断发布；resolved 项可选 `{file}`/`{gateId}` 证据引用并核验（延后评估引用同次门禁证据） |
| L5.6 Open Decision Closure | 原生 | decisions 用于 L5 时，open/deferred 均失败 |
| L5.7 Release Evidence Package | 部分原生 | release 报告含 Claim/Evidence/Gate/Risk/Exception、域覆盖和逐条证据 SHA256 清单；尚无跨运行汇总、有效期和签名 |

## v1.5 原则/实践轨道增补（2026-09-25，PLAN.md v1.5）

| 能力 | 域 | 状态 | 说明与证明边界 |
|---|---|---|---|
| F2P/P2P 双向测试协议 | L1/L3 | 原生 | engineering unit（runner 报逐用例 current/baseline）与 behavior（内核自判基线）双落地；伪修复/回归/跳过/缺用例六类违规指名。防"agent 声称完成但测试未锚定"（SWE-bench 教训） |
| 证据纪律（测量/新鲜度/冻结/来源） | L4 | 原生 | metrics：evidenceValidity（CO 纠正前置）、maxAgeDays（observedAt 新鲜度）、baselineViolations（哈希钉扎冻结）、provenance 三级；resilience：maxAgeDays。泛化 v1.3 acknowledgedOntology |
| 支付数据正确性 | L2 | 原生 | consistency 五类子检查（零和/append-only/对账/DLQ/审计链，审计链内核重算哈希）+ alignment contract-diff（breaking 阻断）；ledger-demo 真实迷你账本出正反例，非生产存储认证 |
| 安全最小集 | L4/L3 | 原生执行协议 | scan 新类目 api-authz（逐 operation 显式鉴权）与 credential（轮换/vault/CI keyless）；api-security-demo 含 BOLA 与 fail-secure 行为反例 |
| 超时/重试预算与熔断 | L4 | 原生 | budget 门禁纯内核算术（预算守恒+重试预算≤20%+jitter）；resilience requiredTransitions 熔断全路径演练；budget-demo 并发重试风暴演练（确定性模拟） |
| 容量与隔离演练（A4/A7/A8） | L4 | 部分原生 | capacity-demo：无界队列/优先级准入/分舱干扰/负载阶梯单调，metrics+drilled 来源承载；确定性同步仿真证明协议，生产需真实压测 |

## 跨域实施顺序与验收

1. L0：本轮新增 AC 类型覆盖、假设来源、决策和 Git 变更范围。正反例与旧功能回归必须通过。
2. L1：构建/测试/变异/架构工具的规范化结果协议与可运行样例已实现；继续补真实项目工具适配、测试覆盖率和依赖图分析。
3. L2：API/DB 结构差异、多表不变量与持久化快照已完成首个可执行样例；继续补完整 OpenAPI/ORM/迁移链、领域概念冲突及跨服务一致性。
4. L3：旅程、视觉、性质与状态机及金融概念冲突样例已完成；下一步为浏览器截图与完整 OWL/SHACL 推理。
5. L4：扫描 findings、回环 DAST 和本地故障演练协议已完成；下一步接生产项目的扫描器、负载工具与遥测系统。
6. L5：旧版迁移、运营演练、债务与决策治理、Release Evidence Package 首版已完成；下一步是生产环境演练与签名/跨运行证据。
7. 横切：Profile/Impact、证据 provenance/independence/validity、安全脱敏、MCP 与其他 Agent adapter。

每一项准出：至少一个可运行正例和故意制造的负例，报告能指出具体失败对象、预期/实际、所属 Claim、工具来源；框架错误不得 PASS。需要真实生产系统才能证明的条目，先实现项目可配置的受控执行协议，再用隔离样例验证协议，不宣称演示结果证明生产就绪。
