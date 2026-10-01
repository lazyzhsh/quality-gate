# Quality Gate 1.1.0：设计文档逐项可执行原型

依据《universal-delivery-gate-zcode-design-v0.1》§6–11，L0–L5 共 36 个二级任务均有可运行的内核检查或项目工具接入协议；逐条状态、样例及剩余局限见 [设计覆盖台账](../history/DESIGN-COVERAGE-ROADMAP.md)。增加的 Gate 不是对生产环境的普遍保证：安全扫描、性能、浏览器 UI、OWL 推理、真实云端运维均须项目接入合适的专业工具和隔离环境。配置 schemaVersion 仍为 0.1，旧项目可继续使用。

| 阶段 | 已验证的增量 | 累计测试 |
|---|---|---:|
| L0 | AC 类型、假设来源、决策及 Git 范围 | 72 |
| L1 | 静态、构建、单测、真实变异、结构及约定六类检查 | 76 |
| L2 | 实际 HTTP/SQLite 契约、持久化快照、多表不变量 | 82 |
| L3 | 旅程、视觉制品、随机性质/状态转换、FIBO 映射 | 94 |
| L4/L5 | 扫描、故障观测与恢复、配置、真实旧库迁移、文档、运维、债务、发布证据哈希清单 | 114 |

[114 项完整测试](../../evidence/v1.1/tests.txt)通过，[官方结构校验与构建](../../evidence/v1.1/official-validation.txt)通过。全部新增 Gate 至少有运行正例与故意制造的失败案例；runner 的旧 runId、格式错误或异常不会 PASS。`releasePackage` 将当次 Claim/Evidence/Gate/Risk/Exception、域覆盖及逐条证据 SHA256 写进报告，但尚无数字签名、跨运行汇总与有效期管理。例外提案仍阻断，不自动豁免。

本机 ZCode 已安装 1.1.0，并完成自动 SessionStart/Stop Hook 的 L3 性质 Gate 负例阻断与修复放行验收，100 个正确样例均通过。报告及实机边界见 [1.1 实机验收](../history/LIVE-ACCEPTANCE-1.1.md)。Command/Skill 的客户端交互和其他五域的 v1.1 实机会话尚未验收；本地回归不替代这些实机证明。
