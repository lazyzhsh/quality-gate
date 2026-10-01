# L2 persistence Gate（协议文档）

目标：执行一个真实业务案例，再从持久化存储独立读回，逐字段严格比较。HTTP 2xx 或接口回显不能代替落库证据。

## 快速运行

要求 Node.js 20+；本 demo 额外要求 Python 3.10+，仅使用标准库。在 marketplace 根目录运行：

```powershell
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/persistence-demo close
node scripts/verify-persistence.mjs
```

第二条命令在临时工作目录执行 normal / wrong-value / missing-row 三个案例，预期为 PASS / FAIL / FAIL，保存证据到 evidence/v0.2。运行时仅绑定 127.0.0.1 随机端口，用临时 SQLite 数据库，关闭服务和数据库后清理。Python 不在 PATH 时，将 demo 配置 argv[0] 改为 Python 的完整路径；验证脚本/测试可通过环境变量 QGATE_PYTHON 指定路径。

## 配置与 runner 协议

Gate 配置见 examples/persistence-demo/.quality-gate.json：kind=persistence、domain=L2，配置 argv、timeoutMs、expectedHttpStatus、correlationField、expected。expected 必须枚举返回记录的全部字段，包括可空字段；correlationField 的预期必须是 `$RUN_ID`，每次运行由内核生成新 UUID。匹配是区分类型的深度相等，字段不存在不等于 null；额外字段同样失败。每个数据库列单独生成 fields 证据；对象型列按整个值深度比较，不做本体语义解释。

快照协议（v1.10.0 E3 起 `requireSnapshots` 默认强制）：runner 须回报 API 调用前后的数据库快照 `snapshots:{before,after}`，after 须取自独立会话/连接（[ADR-0013](adr/ADR-0013-persistence-readback.md)，demo 以重新查询实现），内核输出字段 delta 且快照与独立观察不一致即 ERROR；不回报快照即 ERROR 指名默认强制与退出方式，退出须显式 `"requireSnapshots": false`（可见声明，details 入证据）；批量 `expectedRecordCount>1` 与快照互斥，必须显式退出。

内核通过 stdin 发送一行：

```json
{"schemaVersion":"0.1","runId":"<unique-uuid>"}
```

runner 用该 ID 发出 API 请求，等待提交，再用独立查询按该 ID 取回记录；stdout 只输出一个 JSON 对象，诊断写 stderr：

```json
{"schemaVersion":"0.1","runId":"<same-uuid>","request":{"method":"POST","url":"http://127.0.0.1:1234/orders","status":201},"persistence":{"source":"sqlite:test/orders","recordCount":1,"record":{"id":"<same-uuid>","amount_minor":1250,"currency":"CNY","note":null}}}
```

零条记录时 record=null（`expectedRecordCount:0` 断言必须不落库，此时期望 HTTP 状态允许非 2xx）；默认期望 1 条，`expectedRecordCount>1` 为批量——runner 须回 `records` 数组，逐条按 expected 模板核对（与快照互斥，见上）。HTTP 状态与 expectedHttpStatus 不同、记录数不符、任何字段不相等均 FAIL。非零进程退出、超时、过量输出、坏 JSON、无效协议或过期 runId 均 ERROR。单门禁 `timeoutMs` 上限 60 秒（1..60000，v1.21.1 起自 40 秒上调）；同阶段启用门禁的预算合计（含 coverage/reasoner）不超过 60 秒。Gate 数上限 32；schemaVersion=0.1 的原配置兼容。

## 真实项目接入

用项目自己的 API 客户端和数据库只读查询替换 runner；传入唯一案例 ID，明确事务提交和查询的一致性要求。应等待可证明的提交/最终一致性条件；不要靠盲目 sleep 或只检查 HTTP body。内核不保存连接密码、不管理数据库驱动，runner 使用项目现有受控配置。先接入隔离测试环境；本示例不代表已验证用户业务系统。

runner 是受信任代码，其观察可能造假或遗漏查询字段；必须审查 SELECT 列表是否覆盖要验证的完整记录。内核只核对上报字段与预期，不能发现 runner 根本没有查询的额外数据库列。报告可能包含测试数据，脱敏后才能分享。不支持生产环境回滚、数据快照签名、跨平台子进程树隔离或语义推理。退出码的成功只证明本案例。
