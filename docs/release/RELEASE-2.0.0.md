# RELEASE-2.0.0（2026-10-08）

## 变更

1. **完成 v2.0 需求终审。** L3.5 经用户裁定按现有边界转达成；AC 语义与用例设计仍由人评审。behavior/journey 的 requireRawTranscript 保持默认 false，按项目显式启用，声明记录仍须核验。决策见 [ADR-0017](../adr/ADR-0017-v2-final-review.md)。
2. **AsyncAPI 纳入本版。** alignment 新增 scope:event，file 直接读取 AsyncAPI 3.0.x JSON 子集。内核核对实际消息的操作、send/receive 方向、通道、消息身份、JSON 载荷/应用头约束、逐消息覆盖和备选唯一匹配；失败含精确路径，越界语义 ERROR。新增提取 CLI 与真实本地 TCP 示例。完整字段、上限和证明边界见 [CONFIG-GUIDE](../CONFIG-GUIDE.md)。
3. **报告保留观察来源边界。** event 样本计入声明来源和 eventSamples 定量；未将 runner 的 live 声明当作独立认证。原有 API/Schema 与契约兼容检查语义保持。
4. **状态与文档结算。** 六域 31 项为原生/达成 20、协议 11、部分 0；X12 按第一批完成条件复核转达成，X13–X15 保持各自证据边界。v0.9 四轨道采用范围标记完成，原始提案正文保留。清理 RTM 中签名暂缓、R1–R4 待做与历史部分计数的陈旧指向。

## 兼容与证明范围

- 37 kinds 不变；配置 schemaVersion 仍为 0.2、观察协议仍为 0.1；新增 event scope 需要本版插件。原始观察记录与用例绑定没有自动强制化。
- 49 个示例、28 个打包冒烟示例。event 样本通过只证明本声明与当轮观察；完整 AsyncAPI、两版本事件契约兼容性、消息中间件投递/顺序/持久化及生产工具认证均未验证。
- AsyncAPI 子集支持本文件引用、静态通道、明确的操作消息集合、JSON 标量/对象/数组及文档列出的约束。traits/bindings/security/servers/reply、动态地址、外部/循环引用、Schema 组合/format/pattern、非 JSON 媒体和 YAML 明确报错。
- ZCode 实机验收仍只到 1.27.0；1.28.0–2.0.0 待新轮。CLI、模拟与打包解包结果不替代客户端实机记录。

## 验证与交付

- 本机 Windows、Node.js v24.14.1；全量回归 **692/692 通过，0 SKIP**，较 1.31.1 新增 14 项测试。
- 验收夹具：业务单测 8/8，close 13/13 PASS，故意失败矩阵 14/14 检出，生命周期 10/10。
- AsyncAPI 正例→错误枚举 FAIL→恢复 PASS 留有独立 CLI 报告；behavior/journey close 与 six-domain release 通过。
- 详细完成条件、原始证据索引与边界见 [FINAL-REVIEW-2.0.0](../history/FINAL-REVIEW-2.0.0.md)。交付脚本打包后在临时解包目录复验全量套件与 28 个 demo；最终构建日志位于维护者本机 `evidence/v2.0-final-review-2026-10-08/build.txt`。
- 交付包为 `dist/quality-gate-2.0.0.zip`，摘要为同目录 `.sha256` 文件。版本四处同步；公开发布与客户端更新分别执行，不因本地定版自动视为完成。

## 2026-10-09 交付收尾修复

本版正式重建前处理三项代码路径发现：① `run-suite.mjs` 的测试子进程受信号终止或缺数值退出码时返回非零，避免根 G-TESTS 误收未完成回归；② `devtools/delivery-files.json` 固定 528 个已提交交付文件。首轮清单与旧包同为 533 项；提交后正式重建时，新校验检出旧包内 5 个示例运行时生成的未跟踪文件（behavior/journey transcript、engineering TAP ×2、浏览器截图），已移出清单，示例会在运行时生成其所需输出。构建不再扫描整个工作区挑选文件，未跟踪私有笔记不会入包，路径逃逸、符号链接和 junction 拒收；③ 候选 zip/SHA 在临时目录完成解包全量测试与 28 个示例后才写正式路径，测试失败保留旧文件对，普通发布写入异常会回滚。正式发布仅接受与 HEAD 一致的跟踪源码，包内字节直接取自 Git blob，避免 Windows 检出换行变化；未提交修改使用 `--verify-only` 验证而不发布。

新增开发工具定向测试：Node 3 项覆盖正常/失败/信号/缺状态的退出码，Python 9 项覆盖清单、越界/链接、Git 索引与已提交源码、Git blob 字节、零 SKIP、失败保留旧包、成功发布及写入异常回滚。根 release 阶段把 Node 定向测试纳入 G-TESTS；打包脚本还会执行 Python 与 Node 开发工具测试。最终正式包的 SHA256 与解包复验结果记录在本机 `evidence/v2.0-final-review-2026-10-08/build-after-commit.txt`，以 `dist/quality-gate-2.0.0.sha256` 为准；先前 2026-10-08 的包不再作为交付依据。
