# RELEASE-1.13.0（2026-09-28）

发布日期：2026-09-28。主线"**L3 证据链延伸 + 观察工具链**"（[PLAN](../PLAN.md) v1.13 规划，候选 1+3+5——2026-09-28 经 AskUserQuestion 选定；用户在推荐组合 1+5 之外将 visual 浏览器接入升入本轮，选型记录见 PLAN）。零破坏：全部新字段可选、默认不启用，既有配置零迁移；34 kinds 不变。GATE-SPEC-v1.13 现行（v1.12 归档 history）。

## 工作包

### T1 转录格式与解析器

`lib/raw-evidence.mjs` 新增 `parseTranscript`（纯函数、fail-closed）：behavior/journey 共用的结构化转录形状 `{schemaVersion:'0.1', kind, runId, 观察原样}`。边界如实：transcript 无业界标准格式可借（不同于 TAP/JUnit 有真实工具 fixtures），以协议形状 + 14 组畸形矩阵（截断/非 JSON/形状错/重复 id/意外键/journey 缺 source 或 steps 等）保证解析器自洽，不宣称对齐第三方标准。

### T2/T3 behavior/journey rawTranscript 声明即核验（C3 开放→部分闭合）

- 观察可选 `rawTranscript:{format:"qgate-transcript", file}`——**声明即核验**（B1 同构）：内核解析转录并逐用例/逐步骤与自报交叉核验（behavior 含 `baselineActual` 出现一致性；journey 含 `source` 一致性），不符 ERROR 指名逐项分歧（如 `case boundary actual reported … but transcript says …`）；**当次 runId 绑定**——旧转录重放即 ERROR（stale transcript）；核验一致后**判定以转录为准**并计入证据力锚点"原始输出解析"。
- 门禁级可选 `requireRawTranscript:true`（缺声明 FAIL 指名"缺少原始用例转录/旅程转录"；显式 `false` 保留旧语义）。
- summary 提取器（missingRawTranscript 指名）、CONFIG-GUIDE 选项表与 jsonc、SPEC、`evidenceStrength` 锚点同步（测试强制）。
- demo：behavior-demo/journey-demo runner 随版落盘转录并声明（close brief 含"锚点 原始输出解析 1"，run 576f90e9 / 2bf6e1f6）。

### T4 visual 浏览器参考 runner（C4 开放→部分闭合，adapters 内核零改动）

`adapters/visual/screenshot.mjs`：零 npm 依赖，经系统浏览器（Chrome/Edge 平台候选路径；`QGATE_BROWSER` 显式指定且**不回退探测**——指定路径不存在即退出 2 给指引）headless CLI 截图，按 visual 既有观察协议回报 actualFile+sha256（判定仍由内核做）。确定性选项：`--headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1` 固定 `--window-size` 与 `--virtual-time-budget`。`lib/dependencies.mjs` KNOWN_TOOLS 登记 chrome/msedge（probe+安装指引）。新 demo `examples/visual-browser-demo`（纯形状 SVG 页免字体噪声、`scripts/pin-baseline.mjs` 同机 pin 基线、随包 baseline.png；**不入烟测集合**——烟测环境无浏览器保证，锚在 tests/adapters.test.mjs）。边界：同机字节稳定、跨机渲染差异须重新 pin；像素容差需 diff 度量本参考不实现图像解码；截图正确性仍属 runner 诚实边界。

### T5 consumer-matrix 观察层工具化（adapters 内核零改动）

`adapters/consumer-usage/`：`pact-normalize.mjs` `pactToUsage`（Pact 契约产物 v2/v3 → `contract-test` 条目：请求面锚定、query 剥离、同端点去重、malformed fail-closed；**不含字段级使用**——Pact 不记录消费者读了哪些响应字段）与 `scan-usage.mjs` `scanUsage`（源码静态扫描 → `scanned` 条目：fetch/axios 形状、method 同语句探测、origin/query 剥离，CLI 递归扫 js/mjs/cjs/ts/jsx/tsx；**漏扫边界如实**——动态 URL/SDK 封装会漏，使使用面偏小、超面判定偏松）。consumer-matrix-demo 改为真实派生：orders-web 经 Pact 产物归一、**新增第三消费者 orders-cli（scanned）**、settlement-batch 保持 declared——三来源齐演示且双降权行保留（close PASS run 84445ea）。

## 测试与验证

- 433 项回归（432 过 / 1 skip=pytest 守卫）：+3 解析器、+6 behavior、+3 journey、+2 浏览器适配器（缺失浏览器用 QGATE_BROWSER 覆盖模拟，任意机器可跑；有浏览器时全链路 pin→PASS→变更 FAIL）、+4 consumer-usage。
- 打包：`dist/quality-gate-1.13.0.zip` 551 文件，SHA256 `b07d8ac5cc983b36cfc5523974562ed3613c2afaa2cf45b20f87413b0d26306a`（构建后回填本行，v1.6 起惯例）；build_delivery 清单烟测 24 demo PASS；独立解包复验 433 测试 + 四个新接线 demo（consumer-matrix/behavior/journey/visual-browser）close 全 PASS——`evidence/v1.13.0/unpack-verify.txt`。
- L3 复审追加记录：[MECHANISM-REVIEW-L3R2-2026-09-28](../history/MECHANISM-REVIEW-L3R2-2026-09-28.md)（C3/C4→部分闭合、C2 排序论证成立、遗留候选）。

## 边界与迁移

- 零破坏：`rawTranscript`/`requireRawTranscript` 全部可选，未声明=旧语义；不声明转录的运行其 actual 仍自报（C3 收敛是声明驱动的）。
- transcript 不防蓄意伪造两份内容一致的记录（与 B1 对 TAP/JUnit 的边界同构）；判定残差从"仅内容自报"收敛为"声明者需两源一致且防重放"。
- 浏览器截图跨机器不可直接复用基线（字体渲染/抗锯齿）；`visual-browser-demo` 风险登记与 pin 脚本如实承载该边界。
- Pact 归一只覆盖请求面；静态扫描漏扫使超面判定偏松——两者边界均写入 adapters/README。
- 客户端实机验收待执行（快照再同步 → "更新"按钮 → 夹具四步 + 新声明断言，清单见 RTM §10）。
