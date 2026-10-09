# v2.0.0 终审记录（2026-10-08）

## 结论与输入范围

v2.0 采用范围的需求终审完成。六域在册 31 项为原生/达成 20、协议 11、部分 0；RTM 有 29 个六域表格行，其中 L3.1–L3.3 合并为一行，按 3 项计。横切 X12 按已批准的第一批完成条件复核转达成；X13–X15 保留既有达成状态及实验局限。v0.9 §52 四轨道与已采用范围完成，未采用候选不因终审自动加入。

输入基线为本地 `main` 的 `a54919b`（其文件树与已发布 v1.31.1 的 `e41417d` 相同）及本轮 v2.0 工作区改动。检查覆盖 PRD/RTM、v0.1/v0.9 设计输入、ADR、现行规范、配置指引、对应源码/测试及复用验收夹具；这是需求收尾与新增事件契约验收，不是新的穷尽式安全审计。

ZCode 1.28.0–2.0.0 实机验收仍未验证；此前记录只到 1.27.0。版本定版与源码 CLI 证据不替代客户端安装、Hook 触发和 Stop 走查。跨操作系统、最低 Node 20、真实 broker 与生产工具接入也不在本轮运行证据内。

X15 原始效果实验材料未包含在当前检出中（experiments/ 不入库）；历史计数与达成状态沿用 RTM 的 2026-10-06 记录，本轮未复测、原始材料未验证。终审将四个失效的本机 Markdown 链接改为明确标注的历史路径引用，没有补造材料或将其计入本轮 692 项回归。

## 用户裁定

| 事项 | 2026-10-08 裁定 | 影响与边界 |
|---|---|---|
| L3.5 | 按现有边界转达成 | AC 绑定当轮用例与结果；AC 语义及用例设计仍人工负责。不自动由 PRD 推导所有正确行为，requireCaseBinding 保持显式开启 |
| 原始观察记录 | requireRawTranscript 保持默认 false | behavior/journey 声明记录即核验，项目可显式强制；两份一致记录不证明 runner 诚实 |
| AsyncAPI | 纳入本轮，实现并验收后定版 | 新增 alignment event scope、3.0 JSON 子集、纯函数提取与内核样本核验、真实本地 TCP 示例；完整 AsyncAPI 和 broker 保证未验证 |

决策详细理由与备选见 [ADR-0017](../adr/ADR-0017-v2-final-review.md)。既有范围裁定维持：R13 拓扑推导/编排、签名、仓库自有 CI、双人核准和 v1.8.0 裁剪项出范围；外部真实项目使用验证属进一步需求收集。

## 需求与完成条件对账

L3.5 的可执行证明由 behavior 的期望/实际比较、F2P/P2P 及 traceability 的当轮用例绑定承接。tests/traceability 证明链组覆盖真实身份绑定、无关成功门禁、跳过/失败、强制缺绑定和登记畸形；夹具逐 AC 绑定 behavior 用例，负例矩阵包含 acCaseMissing。内核仍不能判断自然语言 AC 是否忠实表达业务意图；用户明确接受该边界，状态变更不扩大证明范围。

X12 对照 [受控表达方案](../context/RESEARCH-CONTROLLED-EXPRESSION-2026-10-06.md) §9 第一批：旧字段与例外说明已修正，失败建议优先指向修复制品，WRITING-GUIDE 与 AGENTS 约束已接入；summary/adapter/report 的正反例在本次全量回归通过。第二至四批已由 X13–X15 单独跟踪，因此不再将其算作 X12 的未完成内容。根文风检查仍 advisory，未把提示命中算作阻断或宣称全文语义已自动证明。

v0.9 §52 的 19 项完成条件逐项核对如下（测试文件均在 `plugins/quality-gate/tests/`；本轮执行全量套件）：

| 轨道/条目 | 实现与证据 | 终审结果 |
|---|---|---|
| A1 意图协议与 validate | task-intent.mjs；task-intent.test.mjs | 达成；畸形拒收 |
| A2 问询引导与 Hook | quality-gate-intent 命令；intent-hooks.test.mjs；既有实机记录 | 达成；新版客户端另验 |
| A3 范围/登记漂移 | change-scope；task-intent、intent-drift-demo 测试 | 达成；路径级对账 |
| A4 AC 结构 | ac-structure；ac-structure.test.mjs | 达成；Gherkin/EARS 结构与类型校验，不判意图语义 |
| A5 禁新增依赖约束 | task-intent/change-scope 的 no-new-dependencies | 达成；依赖键变更面 |
| A6 demo/回归/配置 | intent-drift-demo、全量回归与 CONFIG-GUIDE 样例检查 | 达成 |
| A7 术语登记 | GLOSSARY 的任务意图/漂移/AC 结构词条 | 达成 |
| B1 约定登记与豁免 | convention-alignment；convention-alignment.test.mjs | 达成；字面规则 |
| B2 独立 kind 正反例 | convention-align-demo 及同名机制测试 | 达成 |
| B3 ADR 绑定与状态 | decisions-adr.test.mjs | 达成；平面 frontmatter 子集 |
| B4 自举裁定执行 | 根 G-CONVENTIONS，glossary 测试整体退役的历史裁定 | 达成；不恢复被裁剪测试 |
| B5 demo/配置/词条 | convention-align-demo、CONFIG-GUIDE、GLOSSARY | 达成 |
| C1 JS/TS import 对账 | symbol-grounding.test.mjs | 达成；动态语法等边界保留 |
| C2 API/符号声明面 | api-surface 与 symbol-grounding 正反例 | 达成；端点/配置键声明面 |
| C3 Python/Java 参考适配 | reference-adapters.test.mjs | 达成；Java 为源码/依赖扫描，不宣称 JDK 构建验证 |
| C4 demo/配置/词条 | symbol-grounding-demo、api-surface-demo、adapter-imports-demo | 达成 |
| D1 trace 贯通 | trace-continuity.test.mjs 断链/缺失/头格式反例 | 达成；观察由 runner 采集 |
| D2 回放与漂移 | replay-baseline.test.mjs 值/顺序/覆盖/哈希反例 | 达成；非性能时序回放 |
| D3 demo/配置/词条 | trace-continuity-demo、replay-baseline-demo、CONFIG-GUIDE、GLOSSARY | 达成 |

OD-101＝registries 单文件；OD-102＝Gherkin 首选并实现 EARS 双支持；OD-103＝独立 convention-alignment；OD-104＝JS/TS 内核与 Python/Java 参考适配；OD-105＝登记即激活的软 Hook；OD-106＝独立 trace-continuity；OD-107＝项目与任务范围取交集。来源为 RTM AL1–AL5 及对应发行说明，均已有裁定和实现，本轮未重新选择。v0.9 原文保留设计时点，头部增加完成标记与本记录链接。

## AsyncAPI 实现与反例

内核每轮读取原始 AsyncAPI 文件，提取操作、通道、消息与 Schema 子集；不存在可沿用的旧归一化期望文件。runner 回报当轮消息，内核检查身份、方向、地址、媒体类型、载荷/应用头约束，以及每个操作-消息组合至少一次覆盖；消息备选须恰好匹配一个。13 项新测试含 live 正例、载荷/通道漂移与修复、声明修改、类型/必填/范围/枚举、漏报/多报/重复样本、备选歧义、本文件引用与 JSON Pointer、子集外语义、循环与资源界限、旧 runId/模式、配置豁免拒收和提取 CLI。另增 1 项摘要测试，消息定量按“声明”呈现，不提高到独立核验信号。

本地 TCP runner 与被测应用均不读取期望文档生成实际结果；输入订单与应用输出经过真实连接收发。它不是 Kafka/AMQP/MQTT 认证，不证明投递保证、排序、持久化、安全握手或所有业务事件。参考范围以 [CONFIG-GUIDE](../CONFIG-GUIDE.md) event 子集为准。标准依据为 [AsyncAPI 3.0.0](https://github.com/asyncapi/spec/blob/v3.0.0/spec/asyncapi.md)，本实现不是完整规范校验器。

## 本轮验证证据

工具来源：本机 Node.js v24.14.1（win32/x64）与 Python 3.12.9，仓库内核 CLI、测试与验收脚本；未使用生产扫描器或外部 broker。套件经 devtools/run-suite.mjs 按项目约定限制并发。

| 检查 | 结果 | 本机证据（不随公开源码上传） |
|---|---|---|
| 原 v1.31.1 基线全量 | 678 通过、0 SKIP | evidence/v2.0-final-review-2026-10-08/regression.txt |
| v2.0 实现全量 | 692 通过、0 SKIP | 同目录 implementation-regression.txt |
| 夹具业务单测 | 8/8 通过 | fixture-unit.stdout.txt |
| 夹具 close | 13/13 PASS | fixture-close.report.json |
| 逐机制负例 | 14/14 检出；注入对象 FAIL，未当成 PASS | fixture-negative.stdout.txt |
| 配置生命周期 | 10/10 步通过 | fixture-lifecycle.stdout.txt |
| 受影响 demo | asyncapi/behavior/journey close 与 six-domain release PASS | 对应 *.report.json |
| AsyncAPI 故意失败与恢复 | 错误枚举 FAIL、恢复后 PASS | asyncapi-negative.report.json、asyncapi-repaired.report.json |

交付构建命令为 `python devtools/build_delivery.py`：从源码打包，临时目录解包并运行全量回归与清单中的 28 个冒烟示例；最终输出归本机同目录 `build.txt`，SHA256 以 `dist/quality-gate-2.0.0.sha256` 为准。根 release 门禁报告归 `root-release.report.json`；该门禁包含全量回归，根 close 的阶段未选中测试项不能替代它。

## 保留事项

1. ZCode 1.28.0–2.0.0 的缓存安装与 Hook/Stop 实机验证仍未验证，按 [PLAN](../PLAN.md) 单独执行。
2. 公开 GitHub 版本在实际推送前仍为 v1.31.1；本轮本地定版不等于远端发布。
3. 协议边界、未采用候选与生产环境局限保留；没有把 ERROR、SKIP、缺失证据或例外提案改写为 PASS。

## 2026-10-09 交付流程补验

用户指出三项发布前代码路径问题：测试包装器在信号终止时可能返回 0、工作区全扫描可能收进未跟踪文件、验证失败时正式 zip/SHA 已被覆盖。修复与定向反例见 [RELEASE-2.0.0](../release/RELEASE-2.0.0.md) 与 `devtools/tests/`。本机新增 `delivery-files.json` 显式清单；首轮 533 项与此前候选包成员集合相同，正式构建从提交树核对时发现其中 5 项是未跟踪的运行时产物，已收紧为 528 个已提交文件。本轮修复不改变插件 692 项套件计数。正式包须在提交后从干净 HEAD 重建，校验摘要并另存解包日志。此前 `build.txt` 为修复前流程的执行记录，不能替代重建验证。
