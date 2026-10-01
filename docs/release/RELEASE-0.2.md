# v0.2.0：L2 持久化正确性增量

客户端升级和真实 Stop Hook 验收已经完成，见 [LIVE-ACCEPTANCE-0.2.md](../history/LIVE-ACCEPTANCE-0.2.md)。下文保留发布前的阶段性记录。

本轮已完成：Gate 内核新增 persistence；真实 HTTP POST 后用独立 SQLite 只读连接回查；每个字段生成 expected/actual/存在性/状态证据；唯一 runId 防止旧观察误当新证据；原有 L0/L1 与 ontology provider 保持兼容。

## 验证记录

1. 先写 L2 测试，旧内核出现 10 项失败（未支持 persistence），确认新测试捕获缺失能力。
2. 实现判定后首批 15 项全部通过。
3. 真实 SQLite 集成暴露 Windows 文件占用：事务上下文并不关闭连接，导致清理失败。增加显式连接关闭后，正常、错值、漏写与 Hook 恢复检查全部通过。退出清理失败仍判 ERROR，未放宽检查。
4. 加入非法 stdout、过量输出与 CLI 退出码验证，最终 [35 项测试全部通过](../../evidence/v0.2/tests.txt)。
5. [真实案例矩阵](../../evidence/v0.2/matrix.json)：normal=PASS；wrong-value=FAIL（预期 1250，实际 1251）；missing-row=FAIL（HTTP 201 但数据库零行）。均有独立 JSON 证据。
6. [官方目录校验与构建通过](../../evidence/v0.2/official-validation.txt)。
7. ZIP 解包后运行同样 35 项测试全部通过，见 [安装包回归](../../evidence/v0.2/package-smoke.txt)。

运行方法、协议、Python 依赖与真实业务接入说明见 [PERSISTENCE-GATE.md](../PERSISTENCE-GATE.md)。分阶段计划见 [ITERATION-0.2.md](../history/ITERATION-0.2.md)。

## 升级与验证边界

本机 v0.1 此前已通过客户端实测；v0.2 的新增 L2 先通过 CLI、真实 HTTP/SQLite 和 ZCode adapter 子进程验证，随后完成 ZCode GUI 升级与实机验收。

本机已刷新 `quality-gate-local`，插件管理显示 0.2.0，并在新会话完成失败→恢复闭环。其他机器仍按 README 安装；独立 demo 项目位于 plugins/quality-gate/examples/persistence-demo。保持 Node 可用，并让 ZCode 的 PATH 可找到 Python。

## 下一轮

下一轮独立推进 FIBO 固定版本目录导入与来源/内容哈希验证。首个本体 Gate 只验证映射概念是否存在，不把目录匹配当作 OWL 语义推理；后续再评估 SHACL。当前 FIBO 仍为 skeleton。

本轮风险边界：runner 属于信任域，必须审查真实 API/查询行为；检查覆盖的是配置列与测试案例。demo 只访问临时测试数据库。未实现例外审批、生产环境回滚或不可篡改证据。
