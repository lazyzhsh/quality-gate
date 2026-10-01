# RELEASE 1.7.0（2026-09-26）

主线"首运行引导初始化"（用户 2026-09-26 提出"首次运行先跑引导对话，推荐&选择定制初始化 `.quality-gate.json`"，入口/模版集合/定制深度经 AskUserQuestion 逐项选定，范围见 [PLAN](../PLAN.md) v1.7 完成状态；架构决策 [ADR-0014](../adr/ADR-0014-guided-onboarding.md)）。此前缺配置只有三处提示文字靠 agent 手工改编 `examples/demo`；本版把配置创建变成有限选择的推荐对话 + 确定性装配。门禁 kind 与判定规则延续 v1.6，配置完全兼容。

## 变更清单（三个增量，逐项独立提交 ee0c132 → 71064f5 → 3e92495）

1. **模版库**（`lib/templates.mjs`，内核侧静态数据）：7 个模版按 lite ⊂ pro ⊂ max 档位累积——lite（`minimal` 入门最小 / `node-engineering` Node 工程 / `web-api` Web API 服务）、pro（+`ledger-service` 数据账本 / `security-hardened` 安全加固 / `six-domain` 六域全量）、max（+`release-governed` 发布治理）；10 个可勾选附加门禁（七类扫描、change-scope、debt-register、rerun-evidence），各模版 `availableAddOns` 限定可选集（同阶段 40s 预算内校验通过）。每个模版均为可过 `validate()` 的完整骨架，项目相关处 `__PLACEHOLDER__` 占位。`assembleConfig(answers)`：克隆 → disable 级联清理 risks/exceptions/孤儿 claims → 合并附加 → 替换（argv/file/timeoutMs/cases/checks/statement，类型预检）→ 占位符残留即拒绝并按 gate/check id 定位路径 → 内核 `validate()`。answers 契约严格校验：未知字段/未知模版/不兼容附加/禁用附加 id/未知替换目标均拒绝。
2. **CLI 与提示**：`qgate.mjs templates [lite|pro|max]` 列档位模版与附加项；`qgate.mjs init <root> <answers> [--force]` 装配→校验→写入（已有配置无 `--force` 拒绝覆盖；失败不落盘）——写入仅发生在 CLI 层，kernel `run()` 保持只读。kernel 缺配置 ENOENT 由裸报错改为可行动文案（指向 `templates`/`init`）；adapter SessionStart 区分缺配置（"First run detected… Run /quality-gate-init"）与配置损坏，Node<20 提示改为无条件注入。
3. **引导命令与提示面**：新增 `/quality-gate-init` 斜杠命令（八步规程：已有配置先复核绝不静默覆盖 → 探测项目 → 档位/模版/附加/禁用逐层选择题（推荐项排前）→ 确认真实 argv 与 claims（预填探测结果，沿用 `$NODE` 与 Windows npm.cmd 规则）→ 写 answers 临时文件调 `init` → 首跑 `close` 如实报告缺什么 → 汇报结果）；SKILL 步骤 2 与 `/quality-gate` 缺配置改指向引导，手工改编 demo 降为备选；双语 README 接入说明更新。

同步：RTM 增补 O1 行（v1.7 增补节）；PRD §4 横切/§5 计数/§7 已达成；ADR-0014；CONFIG-GUIDE 新增「引导初始化与模版库」节（模版/附加/answers 选项表；样例用 `json` 围栏，不进入 `tests/config-guide.test.mjs` 的 36 段 jsonc 计数）；GATE-SPEC 更名 v1.7 并加引导初始化协议节（v1.6 加"已取代"横幅移入 history/，全仓链接修复）；PLAN v1.7 完成状态与历史基线；PROJECT-HANDOFF/根与插件双语 README；版本三处（package.json / plugin.json / marketplace.json）同步 1.7.0。

## 数字

- 35 个 gate kind（不变）；350 项本地测试（v1.6 时 330 → +14 模版库 +6 CLI 集成）；40 个示例与 28 个烟测（不变，模版库不是可运行示例，不进 manifest）。
- 安装包 `dist/quality-gate-1.7.0.zip`：450 文件，SHA256 `62596e75565132409dad3085337bb36ca63e3fc2865f1a26de654099e1a5bbb9`；解包复验 350 项测试与 28 个烟测 demo 全部 PASS（`evidence/v1.7/package-smoke.txt`）。
- 仓库全量回归 350/350（`evidence/v1.7/tests.txt`）。

## 验收正反例

- 正例：`tests/init.test.mjs`「init writes a validated config and the first close run passes」——临时项目（app.mjs + assumptions.json）以 minimal 模版 answers 初始化，写入配置过 `validate()` 且首跑 `close` PASS；`tests/templates.test.mjs` 7 模版全附加组合装配均过 `validate()` 且不残留占位符。
- 反例（明确失败证据）：已有配置无 `--force` 拒绝覆盖（exit 2）；未知模版/未知附加/禁用附加 id/未知替换字段各自报错；残留占位符按 `config.gates[syntax].argv[2]` 式路径定位拒绝且不落盘；非法 timeoutMs 越界在装配预检拦截；answers 含未知顶层字段拒绝。

## 证明边界（不因本版收窄）

- 模版是**骨架协议**：runner 与登记文件（assumptions.json、requirements.json、scope.json、release.json 等）未提供前首跑 close 按设计 FAIL/ERROR（fail-closed）；引导对话产出的是"结构正确且过校验的配置"，不是"已验证的项目质量"。
- agent 只问询、配置一律经 `init` 确定性装配写入；`--force` 覆盖需用户先行复核（命令规程第 1 步），CLI 不做内容级审查。
- 1.6.0/1.7.0 客户端实机验收待执行：marketplace 升级 → 新会话验证 SessionStart 首运行指引、`/quality-gate-init` 引导对话、Skill/Stop 阻断与放行，记录于 `evidence/zcode-live-v1.7/`（与 CLI 回归分别记录）。
