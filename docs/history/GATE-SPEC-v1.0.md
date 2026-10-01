# Gate Spec 1.0（配置 schemaVersion 仍为 0.1）

框架核心独立于 Agent；ZCode Hook/Command/Skill 只负责触发。项目根 `.quality-gate.json` 声明 Claim、Gate、Risk、Exception 和可选 `requiredDomains`；内核每次运行生成 Evidence。`schemaVersion=0.1` 保持早期项目兼容，插件版本为 1.0.0。

## 结果与执行

Gate 状态 `PASS` / `FAIL` / `ERROR` / `SKIP`。无实际执行项为 SKIP，CLI 退出 2；任何 ERROR 退出 2，FAIL 退出 1，全通过才退出 0。`enabled` 与 `stages` 控制裁剪；阶段包括 `edit`、`close`、`pr`、`release`。最多八个 Gate；所有可执行 Gate 在同一阶段的超时预算合计不超过 40 秒。证据为当次观察，不对随后源码变动或 runner 的诚实性提供签名保证。

`requiredDomains` 可按阶段指定 L0–L5；任一必需域无执行项或未通过，整体 FAIL。报告含 `domainCoverage`、`missingRequiredDomains`、`unmetRequiredDomains`、`riskEvidence`。`risks` 只记录残余风险与关联 Gate 的运行状态，Gate PASS 不意味着风险消失。

`exceptions` 目前只接收 `status=proposed` 的完整记录：`id,gateId,riskId,reason,owner,expiresAt`。必须关联已登记且属于该 Gate 的风险；存在提案时整体 FAIL，不执行审批或豁免。任何声称 approved 的输入为 ERROR。

## Gate 种类

| 域 | kind | 可验证的有限主张 |
|---|---|---|
| L0 | `assumptions` | 假设登记项全部为 confirmed |
| L0 | `traceability` | 显式 requirement/AC 关联项目内代码文件及同次通过的 command/persistence Gate |
| L1 | `command` | 配置的命令在限定时间内退出 0；也可用于其他域的已有工具 |
| L2 | `persistence` | 独立查询的落库记录与预期字段逐项一致 |
| L2 | `ontology-map` | IRI 存在于所选本体目录 |
| L2 | `semantic-profile` | 样例记录满足项目声明的数量、类型、枚举约束，目标类在本体目录中 |
| L3 | `behavior` | 已配置业务案例的 runner 观察输出与预期深度相等 |
| L4 | `metrics` | 受信任扫描器/基准工具提供的数值指标满足 min/max 阈值 |
| L5 | `readiness` | 必需交付制品非空、记录 SHA256，关联的同次验证 Gate PASS |

`traceability` 和 `readiness` 在所引用 Gate 执行后判定，因此配置顺序无关。二者的关联关系由项目显式声明，不能据此推断测试内部覆盖或生产环境真正就绪。`semantic-profile` 是有界 JSON 约束原型，不是 SHACL/OWL 推理。`metrics` 的准确性取决于 runner；示例扫描器仅用于演示。具体协议及边界见各 `ITERATION-0.x.md` 与 `PERSISTENCE-GATE.md`、`FIBO-PROVIDER.md`。

参考 [six-domain-demo](../../plugins/quality-gate/examples/six-domain-demo/.quality-gate.json) 配置七个 Gate 覆盖六域，并在 `close` 与 `release` 阶段强制六域均有通过证据。不得直接把演示脚本当作生产扫描器、性能基准或回滚演练。
