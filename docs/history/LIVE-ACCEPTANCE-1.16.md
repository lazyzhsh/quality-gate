# 客户端实机验收 1.16（v1.16.0，2026-09-30；v1.15.0 版本级验收并入本轮）

> 只增归档。证据目录 `evidence/zcode-live-v1.16/`；断言工作区 `E:\DevVault\qg-live-v116-assert\`（可重放脚本 `run-assertions.sh`）；Journey C 沙箱 `E:\DevVault\qg-live-v114n`（v1.14 现场复用，配置已前置迁移）。承接 [LIVE-ACCEPTANCE-1.14](LIVE-ACCEPTANCE-1.14.md)。v1.15.0 版本级实机验收经 2026-09-30 决定并入本轮执行（非跳过）。

## 1. 客户端插件刷新（同版本内容刷新）

1. `python devtools/sync_client_marketplace.py` 快照再镜像后确认：缓存已装 1.16.0 但与源 **5 文件差**（`lib/raw-evidence.mjs`、`tests/glossary.test.mjs`、`tests/engineering.test.mjs`、`tests/raw-evidence.test.mjs`、`README_CN.md`——6b201eb 追加裁决轮改源在缓存安装之后，属 v1.14 发现的"版本未动内容停更"类别）；脚本 DIFFER 分支已补"同版本内容刷新"指引（卸载→插件市场个人页签→安装，cd7ec1a）；
2. 客户端执行同版本内容刷新后复验：**缓存 1.16.0 ↔ 源码 568 文件 SHA256 全等**（`cache-sha.txt`）。

## 2. 可复用验收基线四步（全部走缓存 1.16.0 内核，QGATE_CLI 覆盖口，已迁移 schemaVersion 0.2 配置）

单测 **8/8**；close **13/13 PASS 六层级** + 层级覆盖全 ✓ + 证据力 `核验级 · 信号 双次运行一致 1 · 定量 测试 8/8、行为 7 例`（run=a3c6c6a）；负例矩阵 **13/13**（自认"插件版本 1.16.0"）；生命周期 **10/10**（插件版本 1.16.0）。证据 `fixture-four-steps.txt`。

**本轮发现并修复**：`acceptance/expense-approval-fixture/scripts/lifecycle-check.mjs` 为 T5 协议键迁移漏网——读旧报告键 `domainCoverage`（两处）+ init answers 写旧键 `requiredDomains`（1.16 内核 fail-closed），四步第 4 步在 1.16 内核下崩溃；改 `levelCoverage`/`requiredLevels` 后 10/10（43dea79）。负例矩阵/生命周期脚本在 1.16 上属首跑，实机四步复验即为此设。

## 3. 新声明断言（v1.15 五项 + v1.16 迁移三项，全部走缓存内核）

证据 `new-declaration-assertions.txt`（判定 9 条），工作区可重放：`bash run-assertions.sh <qgate.mjs> <输出文件>`。

**v1.15（5/5）**：
1. **内容绑定核验** ✅ A1：临时 git 仓库（legacy 标签=USD-only 历史实现）behavior-demo close PASS，证据信号行 `基线内容核验 1`（另有 `git 基线核验 1`）；
2. **两源不一致 ERROR** ✅ A2b：观察记录 baseline 块与观察 baselineSource 声明不一致 → `rawTranscript baseline disagrees with observation baselineSource: … vs …`（逐字段指名）；附 A2a 内容绑定不符：声明哈希篡改 → `baselineSource content sha256 mismatch: declared 000…0 but legacy:app.mjs hashes to d270…`；
3. **强制开关 FAIL** ✅ A3：`requireBaselineTranscript:true` 且观察记录缺 baseline 块 → `缺少基线观察记录声明（requireBaselineTranscript）`；A4n：`requireBaselineRawOutput:true` 且 runner 不声明 → `unit: 缺少基线原始输出（requireBaselineRawOutput）`；
4. **baselineRawOutput 交叉核验** ✅ A4：engineering-demo close PASS，`unit.baselineRawOutput {crossCheck:"match", parser:"tap", total:4, caseCount:4, file:"dist/baseline-run.tap"}`，基线状态由内核解析 TAP 重算（含 F2P 用例 large amount discount rate：current pass / baseline fail）；
5. **inspect 建议块** ✅ A5：git 仓库未提交 `*.mjs` 变更 → `建议（变更影响驱动…）：change-scope（…匹配 1 个变更文件）；sast-scan（…匹配 1 个变更文件）`。

**v1.16（3/3）**：
1. **旧键 fail-closed 指名** ✅ B1 双守卫：schemaVersion 0.1 → `Unsupported schemaVersion (config schema is 0.2 since v1.16; 0.1 configs must migrate domain->level / requiredDomains->requiredLevels, see RELEASE-1.16.0)`；版本号已迁但残留旧键 → `legacy key requiredDomains was renamed to requiredLevels in v1.16 (config schemaVersion 0.2)`；
2. **0.1 归档重渲染** ✅ B2：v1.15 时代 0.1 归档（沙箱 5fb29ec4）经 1.16 内核 `report` 重渲染成功，且以 0.2 新文案呈现（层级覆盖/未满足必需层级——读兼容垫片在渲染层翻译旧键）；
3. **层级覆盖新文案** ✅ B3：全部摘要行以 `层级覆盖: L0 … L5` 呈现（B1 负例另见 `未满足必需层级: L0, L1` 行）。

## 4. Journey C（new-only 降级，H1c）：补做完成，三点断言通过

沙箱 `E:\DevVault\qg-live-v114n`（v1.14 现场保留）**前置迁移**：配置 0.1→0.2 原位迁移（1.16 内核对旧键 fail-closed，不迁移则旅程会变成"配置 ERROR 阻断"而非降级放行；原件备份 `E:\DevVault\qg-live-v114n-config-0.1.bak.json`），缺陷 99999 与预建 FAIL 归档 5fb29ec4（最新）/b2d7d2c4 未动。补做按"新建任务"路径（新 SessionStart 才会以 0.2 哈希写会话基准）：

1. 新任务绑定沙箱 → 完全访问预设（菜单实测该项目记忆已带勾，仍显式点选确认）→ 发送 README 备注消息（明确不运行测试、不改其他文件）；
2. **断言一点：runs 新增 FAIL 运行** ✅——`runs/d6614dd2`（2026-09-30T05:14:28Z）status=FAIL，失败门禁 {rtm, engineering, behavior} 与预建归档一致；configSha256=d6e61f37…（0.2 配置，证明重跑用的是迁移后配置；0.1 时代归档哈希不符故未触发复用，全量重跑符合预期）；
3. **断言二：回合未阻断直接释放** ✅——回合 59 秒自然结束（agent 终态消息正常呈现"未改动其他文件…直接结束回合"），转录仅 5 行单回合交换（若阻断会有携阻断原因的后续请求行），README +1 -0 唯一变更；
4. **断言三（等价证据）**：放行注记 `…个门禁 FAIL 为会话开始前既有（rtm, engineering, behavior），stop.blockMode=new-only 放行本次 Stop…` 为客户端**瞬时 UI 提示**——实测不回灌模型、不落转录与客户端日志（与阻断型 reason 回灌下一请求不同）。以判定链等价证据替代：`session-baseline.json`（重装后由 1.16 钩子新写，configSha256=d6e61f37… 与重跑报告全等=无配置漂移；基线门禁结论含三门禁 FAIL）× 重跑失败门禁集与基线一致 × 唯一变更文件 README.md 不匹配任何声明输入 glob（behavior/engineering=src/**，rtm=registries/**、src/**）× 回合释放——new-only 释放分支的四个必要条件全部实证成立。证据 `journey-c/`（session-baseline.json、run-d6614dd2.json、turn-completed.png、transcript-excerpt.txt）；
5. **SessionStart 基准行客户端实证**（H1b 沿袭）：夹具转录捕获 `基准: 最近一次 close 运行 FAIL（此后有文件变更，先重跑再收尾），时间 2026-09-28T08:19:19.669Z，失败门禁: rtm, engineering, behavior。`

## 5. 边界与过程记录

- **T5 迁移漏网**（本轮发现并修复，见 §2）：验收脚本层无测试锚点（四步脚本不进 464 套件），协议键迁移类变更需把验收脚本列入自查面。
- **隐藏窗口墙**：本会话前半程客户端主窗口整场隐藏/未渲染，全部唤醒路径失败（getScreenshot×6、include_screenshot×3、`zcode://` 深链、第二实例让位；裸键/滚动 frontmost 拒绝）——CLI 可验证部分先行完成后请用户恢复窗口续接（经验入记忆）。
- **重装清空插件数据目录**：卸载→重装清除了 `plugins/data/quality-gate@quality-gate-local/` 下全部工作区状态（含旧 baseline.json 与本会话此前归档）；新格式 `session-baseline.json` 由夹具会话 SessionStart 重新写入。Journey C 未受影响（现场关键状态在沙箱与缓存，不在数据目录）。
- **沙箱配置迁移属验收前置**：Journey C 判定语义（new-only 降级）与配置键名正交；迁移以备份+原位改键完成并记录，"现场保留"指缺陷与预建归档原样。
- v1.15 其余新面（consumer-matrix body 字段级/多语言 scan-usage）由套件与 demo 覆盖（460 项回归轮已证），未另做客户端旅程；v1.16 其余新面（术语统一/缺陷①②）由 464 项套件覆盖，客户端侧以四步+断言+Journey C 代表。

## 6. 结论

v1.16.0（并 v1.15.0 版本级）在真实客户端完成验收：安装完整性（568/568 SHA 全等）、夹具四步（缓存 1.16.0 内核、已迁移配置）、v1.15 新声明断言 5/5、v1.16 迁移断言 3/3、Journey C new-only 降级（含 SessionStart 基准行）全部实证通过。附带产出：验收脚本 T5 迁移漏网修复、同步脚本指引更新。下一轮候选不变：C6 语义深化、生产工具接入、第二 adapter、transcript 强制化默认。
