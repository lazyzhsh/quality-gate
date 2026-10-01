# LIVE-ACCEPTANCE-1.23（2026-10-01，五版同轮收尾 v1.21.0–v1.23.0）

**范围**：客户端实机验收 1.21.0/1.21.1/1.22.0/1.22.1/1.23.0 五版同轮（跨版挂起后一次性收尾，先例 [LIVE-ACCEPTANCE-1.20](LIVE-ACCEPTANCE-1.20.md)）。客户端插件市场"更新"按钮升至 **1.23.0**（用户执行）；验收会话＝更新后新会话，SessionStart 即绑定缓存 1.23.0 内核。验证一律走文件系统（缓存版本目录、SHA、runs 按 mtime）；断言全部对**缓存内核与随包制品**执行。

## 〇、v1.21.1 过渡三步完成（根门禁墙钟事项销项）

- ①客户端"更新"至 1.23.0（缓存版本目录在场）；②验收会话＝新会话；③根配置 G-TESTS timeoutMs 上调＋缓存内核 close 复验 **2/2 PASS**（run=cfa91c48，59.5s）。过渡前后运行渲染见 `evidence/zcode-live-v1.23/step0-*.txt`。
- **校准轨迹（如实记录）**：计划值 45000 基于 575 项套件 ~41s 时代；v1.23.0 套件已 602 项，实测轨迹：直接计时 **54.9s / 56.1s** → 45000 当轮 ETIMEDOUT（45.0s 被掐，过渡前 ERROR 运行 76aac6e3 同因）→ **58000 亦一次 ETIMEDOUT（58.1s）** → 最终校准至内核上限 **60000**：close 2/2 PASS 59.5s，**余量仅 0.5s——套件墙钟已顶满内核上限，配置层零上调空间**。宿主 Stop Hook 55s 预算低于套件墙钟：Stop 对未变更输入按 v1.14 归档复用语义取用本轮归档结论（每轮收尾先经 CLI close 留新鲜归档——v1.14 H1a 已实证的设计行为）。
- **结构性事实（记入 PLAN）**：602 项套件墙钟（~55–60s）已超出宿主 Stop 55s 预算并顶满内核 60000 上限——Stop 对变更输入的全量执行在该负载下不可完成，且配置层已无解。属环境负载＋套件规模复合问题（v1.21.0 诊断：常驻大进程＋Defender 拖慢 spawn），解法＝套件瘦身轮（v2.0 候选）或负载复位。

## 一、缓存 SHA 全等核验

- `devtools/sync_client_marketplace.py`：快照 1.23.0 一致＋镜像（cache-sha-verify.txt）。会话内 demo 执行使两侧各自新增 `.quality-gate/runs/*.json` 运行档案（gitignored 运行时数据），sync 的并集比对因此报 DIFFER——文件头注解逐项说明，**插件内容零漂移**。
- 内容级独立核验（两侧对称排除 `.quality-gate/` 运行时目录）：**371 文件并集 SHA256 全等**（cache-content-sha-verify.txt，脚本随断言目录可复跑）。
- 口径注记：v1.20 轮"630 文件"为 sync 脚本含运行时档案口径；本轮"371 文件"为内容级（排除运行时目录）口径——均为并集全等比对，结论一致。

## 二、夹具四步（缓存 1.23.0 内核，`QGATE_CLI` 显式指向缓存）

| 步骤 | 结果 | 证据 |
|---|---|---|
| 1 业务单测 | 8/8 | step1-unit-tests.txt |
| 2 基线 close | **13/13 PASS 六域覆盖，证据力: 核验级**（run=4ec8ef2a） | step2-close.txt |
| 3 负例矩阵 | **13/13 全部检出**（插件版本自识别=1.23.0） | step3-negative-matrix.txt |
| 4 生命周期 | **10/10**（inspect/update 预检/阈值替换/迁移/重初始化旅程） | step4-lifecycle-check.txt |

## 三、五版新声明断言（26/26 全过，缓存内核＋随包制品，可复跑脚本 `E:\DevVault\qg-live-v123-assert\run-assertions.mjs`）

- **v1.21.0 trace-continuity（B1）**：正例 PASS（`requireTraceparent` 双链核验）＋断链矩阵四故障逐指名：drop-context→`trace-id-discontinuity`／wrong-parent-span→`span-id-mismatch`／skip-payments→`missing-link`／bad-traceparent→`invalid-traceparent`；
- **v1.21.0 replayBaseline（B2）**：正例 PASS（内容绑定核验）＋drift→`replay-drift`／reorder→`replay-sequence-drift`／drop-step→`replay-missing`＋基线篡改未重 pin→`replay-baseline-modified`＋显式重 pin（当次归档即新基线＋内容哈希重绑＋声明期望层 expectedSteps 同步）→PASS＋当次无观察记录自报对照＝PASS（source=self-reported）且自报对照仍抓漂移；
- **v1.21.1 预算上限（B3）**：timeoutMs=45000 门禁在缓存内核 close PASS（旧上限 40000 会 validate ERROR）；根配置最终 60000 同轮实证（run=cfa91c48，59.5s）。
- **v1.22.0 semantic-profile 深度匹配（B4）**：正例 PASS（`deepMatches` 含 WrittenContract⊑Agreement 子类套用）＋深度匹配记录违规 `maxCount` 指名（子类实例真被形状评估）；
- **v1.22.0 terminology 多语言三态（B6）**：zh 严格命中（协议→Agreement.altLabel[zh]）PASS／lang 不匹配→`unmatchedTerm` 指名 lang:en／跨语言重名无 lang→`ambiguousTerm`；
- **v1.22.1 SHACL 原生＋引擎可选（B4c/B5）**：原生零依赖判定 PASS（门禁无 shacl 引擎配置）＋引擎腿 PASS（pyshacl 0.40.1 经随包参考适配器自缓存直跑，深度匹配含）；
- **v1.23.0 OWL 推理四件套（B7）**：双门禁正例 PASS（`inferred` 证据在场，equivalence/union-classes 能力在册）＋传递链断链→`missingRelation`＋`undeclaredRelation` 双指名＋等价集外绑定 FAIL（等价精确非模糊）＋出并类操作数集绑定 FAIL＋子属性环建时 fail-closed ERROR。

## 四、客户端侧行为（本会话即实机）

- **SessionStart 基准行跨会话实证**：验收会话启动时注入上一会话 Stop 的 ERROR 基线（G-TESTS ETIMEDOUT，run 76aac6e3，09:43Z）——基准行注入与跨会话基准传递在 1.23.0 内核上工作正常。
- **阻断→修复→放行链（判定链等价证据）**：过渡前 ERROR 基线（G-TESTS 40000 超时）→根配置校准（45000→58000→60000 轨迹）→close 2/2 PASS（run=cfa91c48）归档。运行档案全留痕于 `.quality-gate/runs/`。

## 五、边界与注记（如实）

- 本轮未重做 CUA 客户端走查（软形态注入/意图修订/问询不代写等机制自 1.17–1.20 轮已证且未变更；本轮五版增量全部为内核/门禁 kind 层，CLI＋缓存制品已覆盖；客户端侧增量仅"更新"按钮与内核重绑定，均已实证）。PLAN 校准段清单（过渡三步→夹具四步→新声明断言）全部完成，未列 CUA 项。
- 断言脚本首轮 3 例失败经查全部为**脚本自身缺陷**（B2f 重 pin 未同步声明期望层——journey 门禁的 expectedSteps 声明期望与 replayBaseline 回放基线系**两层独立核验**，本轮实测确认；B2g 根目录复用互染），插件行为逐例复核正确后修正脚本——如实记录，与 v1.20 轮同类。
- 引擎腿 pyshacl 0.40.1 为本机已装环境；原生腿零外部依赖（OD-116 默认零外部依赖），引擎为可选并集判定。本地夹具与演示不构成生产认证。
- 根门禁 G-TESTS 60000（内核上限）为环境负载＋套件规模下的实测校准，已写回 PLAN 未了事项与 PROJECT-HANDOFF。
