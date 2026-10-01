# Quality Gate

Configurable, evidence-producing quality gates for agent-assisted software delivery.

把“软件可交付”变成可追溯的 **Claim → Evidence → Gate → Risk → Exception** 证明链。内核采用 Node.js 标准库，无 npm 依赖，可通过独立 CLI 运行；ZCode 插件是首个宿主 adapter。

**当前版本：1.24.0，早期开源发行。** 已有 37 种门禁和 46 个示例，覆盖 L0–L5 六个质量证明域。支持范围、修复内容与后续缺口见 [开源状态](docs/OPEN-SOURCE-STATUS.md)、[发布说明](docs/release/RELEASE-1.24.0.md) 和 [RTM](docs/RTM.md)。

## 快速开始

需要 Node.js 20+ 和 Git。内核不需要 `npm install`；Python、浏览器、Java 或专业扫描器只由使用相应示例/adapter 的项目提供。

```powershell
git clone https://github.com/lazyzhsh/quality-gate.git
cd quality-gate
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/demo close
```

CLI 的 stdout 输出 JSON，stderr 输出人读报告；退出码为 **0 PASS、1 FAIL、2 ERROR/SKIP**。演示成功只证明演示场景，不代表你的业务项目已经通过。

给实际项目选择模板、准备真实命令和声明，再生成配置：

```powershell
node plugins/quality-gate/bin/qgate.mjs templates lite
node plugins/quality-gate/bin/qgate.mjs init <项目绝对路径> <answers.json>
node plugins/quality-gate/bin/qgate.mjs <项目绝对路径> close
```

`answers.json` 的格式和可运行配置样例见 [配置指引](docs/CONFIG-GUIDE.md)。已有配置可用 `inspect`/`update`；历史报告可用 `report` 重渲染。项目登记文件应提交，`.quality-gate/runs/` 应忽略。

## 能力与边界

| 质量域 | 能力 |
|---|---|
| L0 需求与决策 | 需求追踪、验收条件覆盖、假设/决策登记、任务意图与变更范围、约定对齐 |
| L1 工程验证 | 静态检查、构建、单测、变异测试执行协议；TAP/JUnit 原始输出解析；符号存在性 |
| L2 数据与契约 | API/Schema 对齐、实际落盘回读、字段语义、不变量与账本一致性 |
| L3 行为与语义 | 行为/旅程/视觉协议、性质测试、F2P/P2P、术语和确定性 OWL 子集 |
| L4 非功能与安全 | 度量、扫描工具协议、恢复演练、预算守恒、拓扑声明核验、trace 贯通 |
| L5 治理与收尾 | 多环境配置、文档、技术债和决策收尾 |

门禁按 `enabled`、`stages` 和 `requiredLevels` 裁剪。PASS 只覆盖本阶段实际选择的门禁与输入，不证明全部 Claim、自然语言需求或生产业务都正确。runner 来源与覆盖面决定证明强度；一个核验信号不代表所有证据均独立核验。演示扫描器、FIBO 子集和本地故障演练不构成生产认证。

配置中的 argv 以当前用户权限执行，应像构建脚本一样审查。内核不自动上传报告；命令自身可以访问外部环境。Stop 的重试受宿主限制，强制准出应由使用项目调用 CLI 并检查退出码。

## ZCode 安装

在 ZCode 插件市场添加克隆目录或解包目录作为本地来源，安装并启用 `quality-gate`，新建会话。升级流程与验证规则见 [交接入口](PROJECT-HANDOFF.md)。插件支持 SessionStart、UserPromptSubmit、PreToolUse 和 Stop；正式项目必须配置自己的 `.quality-gate.json`。

Stop 的 55 秒宿主期限内最多接受 50 秒已声明执行预算，余量用于核验与落盘；长检查用 CLI 的 pr/release 阶段。根项目的 close 只检查活文档约定，完整回归在 pr/release 执行，close PASS 不代表完整回归已执行。

## 开发与验证

```powershell
node devtools/run-suite.mjs plugins/quality-gate/tests/*.test.mjs
node plugins/quality-gate/bin/qgate.mjs . release
node plugins/quality-gate/bin/qgate.mjs plugins/quality-gate/examples/six-domain-demo release
node acceptance/expense-approval-fixture/scripts/negative-matrix.mjs
python devtools/build_delivery.py
```

测试入口按项目约定限制并发；可选工具未安装导致的 SKIP 应单独记录。构建脚本在本地生成交付 zip，解包后重跑套件和清单中的冒烟示例。历史安装包和本机运行证据不随公开源码上传。

## 文档与参与

- [文档导读](docs/README.md)、[产品需求](docs/PRD.md)、[需求跟踪](docs/RTM.md)、[判定规范](docs/GATE-SPEC-v1.23.md)、[配置指引](docs/CONFIG-GUIDE.md)
- [贡献指引](.github/CONTRIBUTING.md)、[安全报告](.github/SECURITY.md)、[问题反馈](https://github.com/lazyzhsh/quality-gate/issues)
- [项目交接](PROJECT-HANDOFF.md) 与 [下一步计划](docs/PLAN.md)

自有代码与文档采用 [MIT 许可证](LICENSE)。FIBO 等第三方内容保留原许可与归属，见 [第三方说明](docs/THIRD-PARTY-NOTICES.md)。
