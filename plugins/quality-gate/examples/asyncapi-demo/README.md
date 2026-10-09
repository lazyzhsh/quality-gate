# AsyncAPI 事件契约示例

在本目录执行 `node ../../bin/qgate.mjs . close`。内核每次直接读取 `asyncapi.json`；runner 通过真实本地 TCP 连接调用 `app.mjs`，回报应用接收的订单与发出的确认消息。

发送/接收方向按订单应用视角解释。内核核对操作、通道地址、消息标识、JSON 类型、必填字段、枚举、数值范围、应用头字段及逐消息覆盖。把 `app.mjs` 的 `status:'accepted'` 改成 `status:'rejected'` 后复验，应为 FAIL，证据包含 `/items/1/payload/status event-enum`；恢复后应 PASS。把发送通道改错应为 `event-channel`；漏报发送消息应为 `event-missing-message`。

支持 AsyncAPI 3.0.x JSON 子集与本文件 components 引用。每个操作必须显式列 messages；每个根通道消息必须被操作引用。本例不读取声明生成实际结果。`mode:live` 是 runner 的来源声明，内核不能证明 runner 诚实。

证明边界：这是本机 TCP 消息交换，未验证 Kafka、AMQP、MQTT 等消息中间件、投递次数、顺序、持久化或生产认证。完整子集、上限与错误语义见仓库 `docs/CONFIG-GUIDE.md` 的 alignment 节。旧版 AsyncAPI、YAML、外部/循环引用、traits、bindings、安全配置、动态地址、request/reply 及未支持的 Schema 关键字均报 ERROR。
