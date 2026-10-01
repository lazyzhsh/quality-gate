# 参与贡献

欢迎提交可复现的问题和范围明确的改进。开发前阅读 [项目交接](../PROJECT-HANDOFF.md)、[项目约定](../AGENTS.md) 和 [RTM](../docs/RTM.md)。

需要 Node.js 20+ 和 Git；默认内核无 npm 依赖。SQLite 示例与交付构建需要 Python 3.10+；pyshacl、浏览器和 Java 工具仅用于明确声明的可选集成。

```powershell
node devtools/run-suite.mjs plugins/quality-gate/tests/*.test.mjs
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/six-domain-demo release
node acceptance/expense-approval-fixture/scripts/negative-matrix.mjs
python devtools/build_delivery.py
```

修复须有能复现错误效果的反例与可运行正例，失败证据应指名输入、规则和范围。不要通过禁用门禁、例外或忽略项让反例变成通过。保持内核与宿主 adapter 分离；可配置项和协议入参同时更新 CONFIG-GUIDE、SPEC、RTM 与发布说明。

提交 PR 时说明问题触发条件、修改后的行为、实际运行的验证及尚未覆盖的环境。不要提交 `.quality-gate/runs/`、客户端缓存、真实凭据、本机运行证据或历史安装包。历史文档记录当时事实，只增不改。以 MIT 许可提交贡献，并保留第三方归属说明。
