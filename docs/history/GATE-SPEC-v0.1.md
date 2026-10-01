# Gate Spec v0.1

历史初版规范；现行 v1.0 行为（含六域、proposed Exception 登记和 requiredDomains）见 [Gate Spec 1.0](GATE-SPEC-v1.0.md)。

配置文件：项目根目录 `.quality-gate.json`，UTF-8 JSON。schemaVersion 为 0.1。
核心与 Agent 无关，适配器只负责输入输出协议，不决定检查是否通过。

五种对象：Claim{id,statement}；Evidence{id,gateId,claimId,status,details,startedAt,finishedAt}；Gate{id,kind,domain,stages,claimId,enabled}；Risk{id,gateId,description}；Exception{id,gateId,riskId,reason,owner,expiresAt}。
首版 Exception 仅登记，不授权豁免。任何非空 exceptions 配置返回 ERROR，避免产生未经审批的放行。

结果 PASS / FAIL / ERROR / SKIP。只有至少一个启用 Gate 执行且全部 PASS 时整体 PASS。
无匹配 Gate 返回 SKIP，CLI 退出 2，不作为质量通过。FAIL 退出 1；配置、执行器和证据写入错误退出 2。每次重新运行，不复用缓存证据。
证据包包含运行 ID、配置 SHA256、时间、项目绝对路径、Claim、Risk、Exception 和检查结果。它证明当次观察，不证明后续源码未变，也不提供签名或防篡改保障。

L1 command：argv 数组直接执行（不经过 shell），cwd 固定项目根；timeoutMs 为 1..20000 毫秒，输出限制 64 KiB。允许的 executable 是受信任项目配置的一部分，配置本身能执行代码，须像构建脚本一样审查。输出可能包含秘密，报告不应默认提交。
L0 assumptions：读取受项目根约束的 JSON 文件，格式 {assumptions:[{id,statement,status}]}；status=confirmed 才通过，open/rejected 失败。仅证明登记状态，不证明业务真实性。

domain 为 L0..L5；stages 为 edit/close/pr/release 的非空子集；v0.2 起配置最多八个 Gate，各阶段进程预算合计不超过 40000ms。Stop 运行 close。禁用记录 SKIP，启用但阶段不符不执行。

OntologyProvider.describe()/resolve(iri) 接口：内建 fibo-skeleton 返回 NOT_IMPLEMENTED；local-catalog 根据本地概念目录精确解析 IRI。provider 选择独立于 Gate，首版不影响 Gate 判定。local-catalog 可承载其他业务本体，扩展实现只修改 provider factory，无需改内核或 Agent adapter。不附带完整 FIBO、不联网、不执行 OWL/SHACL 推理。

## v0.2 兼容扩展

schemaVersion 仍为 0.1；新增 kind=persistence，协议和判定见 [PERSISTENCE-GATE.md](../PERSISTENCE-GATE.md)。原 L0/L1 配置不需迁移。runner 的 runId 同时绑定输出与预期持久化关联字段；不能复用旧观察结果作为新证据。

## v0.3 兼容扩展

新增 `kind=ontology-map`，须为 `domain=L2`，Gate 的 `file` 指向项目根内的映射 JSON。每个映射含非空 `id` 和 `iri`；1–100 条，id 唯一。`ontology` 在项目配置顶层指定 provider：`fibo-pinned` 必须包含固定目录的 `expectedCatalogSha256`；`local-catalog` 须包含项目内 `file`；`fibo-skeleton` 不能实际通过 Gate。全部精确匹配为 PASS，未知 IRI 为 FAIL，provider/输入错误为 ERROR。详情与边界见 [FIBO-PROVIDER.md](../FIBO-PROVIDER.md)。
