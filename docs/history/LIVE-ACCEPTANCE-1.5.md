# Quality Gate 1.5.0 ZCode 客户端实机验收

2026-09-25 后续补录：已用新的 `expense-approval-fixture/` 在 ZCode 客户端完成六域 11 门禁新任务、插件详情页 1.5.0 视觉/无障碍核验，以及本夹具 Stop Hook 的阻断→恢复→放行回路。证据和边界见 [`VALIDATION-EXPENSE-FIXTURE-1.5.md`](VALIDATION-EXPENSE-FIXTURE-1.5.md)。下文保留第一次验收当时的原始边界，勿把其中“未取得”误读成后续补录状态。

验收日期：2026-09-25。用户已将 ZCode 客户端使用的插件手动升级至 1.5.0 并同意使用"电脑控制"。证据目录：[evidence/zcode-live-v1.5/](../../evidence/zcode-live-v1.5)；细节记录：[client-runtime-evidence.md](../../evidence/zcode-live-v1.5/client-runtime-evidence.md)、[computer-control-trail.md](../../evidence/zcode-live-v1.5/computer-control-trail.md)。

## 1. 安装核验

客户端缓存 `C:\Users\sacha\.zcode\cli\plugins\cache\quality-gate-local\quality-gate\1.5.0\` 的插件清单为 1.5.0（1 Skill、1 Command、SessionStart/Stop 两个 Hook 登记齐全）；缓存与仓库源码 **512 文件 SHA256 全等**。缓存内全量回归 303/304 通过——`config-guide.test.mjs` 在客户端安装布局（无 `docs/`）下 ENOENT 崩溃，这是本次验收发现并当场修复的缺陷：该测试改为无文档布局显式 skip（skip 不计 PASS）、仓库/解包布局照常全量执行；修复后仓库回归 **304/304**。此修复在仓库源码中，将随下一次打包发布进入客户端；当日客户端缓存内运行的仍是修复前字节（运行时行为不受该测试文件影响）。

## 2. 客户端运行时（真实会话证据）

| 验收项 | 结果 | 证据 |
|---|---|---|
| SessionStart 注入 | 本验收会话首部出现 1.5.0 adapter 的启用引导语（含"缺配置需 onboarding、不得无证据宣称 PASS、Stop 反馈有重试上限"） | 会话转录（client-runtime-evidence.md 第 2 节） |
| Skill 调用 | `quality-gate:quality-gate` 从 1.5.0 缓存加载；按其指引以**安装缓存内** qgate 对验收项目执行 close：依赖提示（python3 安装指引）、7/9 通过、budget 违约明细、退出码 1 | acceptance-fail-skill-invoked.json |
| Stop Hook 放行 | 当日 18:31 客户端 Stop 运行（root=本仓库，close，G-TESTS 304 项）PASS；本验收回合结束亦将产生新报告 | client-stop-pass-20260925-1831.json |
| Stop Hook 阻断→修复→放行 | 本回合故障注入回路完成：真实阻断+失败摘要回传，按反馈修复后放行（见第 4 节） | stop-fail-deliberate.json |

G-TESTS 客户端实跑耗时 20.0s，贴着该门禁 20000ms 超时线（容量观察：1.1.0 时代沿用至今的 timeoutMs=20000 对 304 项已无余量，建议下轮上调或拆分）。

## 3. 验收项目（六域组合 + 1.5.0 新门禁 + 依赖提示注入）

`acceptance/zcode-v15-acceptance/`（在 v1.1 验收项目惯例上扩展）：six-domain-demo 的 L0–L5 七门禁全保留（close 阶段 requiredDomains 六域），新增：

- `timeout-budget`（**budget**，1.5.0 新 kind）：故意违约 hop（2000ms×(3+1)=8000ms > 5000ms，加合法 hop 合计需求 8600ms）；
- `external-tool`（command，argv 首参为登记表命令 `python3`）：本机 python3 为 WindowsApps 商店桩，内核 probeExecutable 判缺失 → SessionStart/摘要/报告注入安装指引（用户要求的"外部工具缺失必须提示安装指引"行为）。

双路预验（仓库 CLI 与安装缓存 qgate）均得预期 FAIL（7/9、L1/L4 未满足、退出码 1、含依赖提示行）；修复态（800ms×3 + argv 换 $NODE）在临时副本 9/9 全过、六域全绿。验收现场保持 FAIL 态供复演。

## 4. Stop Hook 阻断回路（本回合故障注入，已完成）

机制与结果：在仓库根门禁 glob 内放入故意失败的未跟踪测试文件后结束回合，客户端 Stop Hook 真实执行并**阻断**了本回合，向会话回传失败摘要（"Quality Gate FAIL · close · 0/1 通过 … G-TESTS FAIL 退出码 1 … 修复失败项后重跑；不要通过禁用门禁来放行"）；按反馈删除该文件后回合放行（本回复的到达即放行证明；放行侧运行报告另见 18:31 的 `client-stop-pass-20260925-1831.json`）。阻断报告：`stop-fail-deliberate.json`（run=dc5ac199…，root=本仓库，stage=close，G-TESTS 退出码 1，耗时 19.8s）。

**报告路径发现**：客户端运行 Stop 钩子时设定 `ZCODE_PLUGIN_DATA`，报告写入 `C:\Users\sacha\.zcode\cli\plugins\data\quality-gate@quality-gate-local\<sha256(工作区根)>\runs\`（本仓库哈希 `6b213db2…`），而非仓库内 `.quality-gate/runs`（后者仅在无该环境变量时使用，如手工 CLI）。

**容量修正**：阻断运行 19.8s、当日放行运行 20.0s，均贴着原 20000ms 门禁超时线；且客户端已升级 1.5.0（内核 argv 超时上限 40000ms），为 1.1.0 客户端保留 20000ms 的历史约束不再成立。本验收随提交将根门禁 `timeoutMs` 上调为 30000ms。

## 5. 证明边界

- 本轮**实机**覆盖：安装一致性（SHA256）、SessionStart 注入、Skill 从 1.5.0 缓存的调用与执行、Stop Hook 放行与阻断回路（本仓库工作区）、依赖提示注入的判定与文案。阻断回路以故障注入方式在本仓库工作区实证 Stop 反馈循环；**未**在验收项目工作区的新任务中发送消息复演（电脑控制环境下无法键入，诊断与已完成的 UI 操作见 computer-control-trail.md；新任务已就绪，桌面可交互后发送一条消息即可补录转录）。
- 插件详情页视觉截图未取得；安装状态以清单+SHA256+运行时加载路径证明。
- 缓存内 config-guide 崩溃修复尚未进入客户端缓存（见第 1 节）；`/quality-gate` 命令面板的 UI 调用同受键入限制，其运行时等价路径（技能→缓存 qgate）已实证。
- 演示项目与故障注入证明协议与判定链路，不构成生产认证；外部扫描器、真实压测等边界同 [RELEASE-1.5](../release/RELEASE-1.5.md)。

## 6. 补充轮：expense-approval-fixture 的 CUA 交叉复验（2026-09-25 晚）

[VALIDATION-EXPENSE-FIXTURE-1.5.md](VALIDATION-EXPENSE-FIXTURE-1.5.md)（CodeX 驱动）已记录夹具六域验收：budget 注入的实机"阻断→修复→放行"、插件详情页 1.5.0 无障碍核验。本轮为**独立驱动栈（ZCode/GLM 会话经"电脑控制"）的交叉复验**，证据在 [`evidence/fixture-v15/zcode-cua-round/`](../../evidence/fixture-v15/zcode-cua-round)，与 CodeX 轮互补三点：

1. **插件详情页视觉截图入库**（`plugin-detail-1.5.0.png`）：设置→插件→Quality Gate 显示 版本 1.5.0、技能 1（quality-gate）、命令 1（quality-gate）、Hooks 2（SessionStart/Stop）、已启用。
2. **模型亲自编辑路径**：CodeX 轮由验收方自行改源、指令禁止客户端改文件；本轮由对端模型在客户端"变更前确认"权限对话框（选择"始终允许本项目"）下亲自完成注入与恢复——权限门控与门禁钩子互不干扰，全程 UI 键入驱动（Electron 自定义编辑器仅接受逐键 typeText，setValue/剪贴板粘贴被忽略）。
3. **behavior 边界注入的连坐失败面**：`APPROVAL_LIMIT_CENTS` 100000→99999 一处改动同时 FAIL 三个门禁（L3 approval-behavior 的 limit 用例、L1 engineering 的 unit、L0 requirements 追踪联动）；客户端 Stop 三连阻断且失败签名一致（重试上限内），恢复后全 PASS 放行。四份客户端报告：stop1-pass-clean（c50e6197）、stop2-fail-blocked（1c0797e6）、stop3-fail-retry-blocked（6468c2b9）、stop4-pass-restored（f607b1fe）。

边界：夹具为受控本地项目（本地 JSON 非生产库、扫描规则非 SAST、计时非负载测试），本轮证明的是插件在真实客户端中的安装、触发、判定、阻断与放行链路；夹具目录与 CodeX 轮文档在工作树中的提交状态由用户处置。
