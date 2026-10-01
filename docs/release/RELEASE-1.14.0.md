# RELEASE-1.14.0（2026-09-28）

发布日期：2026-09-28。主线"**Stop Hook 摩擦优化**"——源自 1.13.0 实机验收会话复盘（一个文档备注任务被夹具既有缺陷阻断后，用户要求评估并全量采纳 P1–P4 四项建议）。零破坏：默认行为除两处明确的"不阻断面收窄"外语义不变，全部新字段可选；34 kinds 不变。GATE-SPEC-v1.13 现行（v1.14 差异以节内标注承载）。

## 工作包

### H1a Stop 复用新鲜证据（P1）

新模块 `lib/freshness.mjs`（`pathGlob`/`configSha256`/`latestRun`/`modifiedSince`/`reusableRun`）。Stop Hook 在重跑前检查项目 `.quality-gate/runs/` 的最近同阶段归档：`configSha256` 与当前配置一致、结论为 PASS/FAIL、且归档 `finishedAt` 之后项目输入无 mtime 变更（`.quality-gate/runs/` 输出目录除外）→ 直接复用归档结论，不重跑（阻断 reason 附注"复用归档 run <id>"）。**fail-safe**：变更数超采样上限（200）、遍历超 100k 项、文件不可读、时钟异常 → 一律按"已变更"回退全量重跑；符号链接跳过。CLI `close` 永远全量重跑——复用只发生在 Stop Hook，消解"agent 刚跑过、钩子再跑一遍"与重试循环内的重复执行。

### H1b SessionStart 基线前置（P2）

SessionStart 上下文追加 Baseline 行：最近一次归档 run 的阶段/结论/时间/失败门禁清单与新鲜度括注（"此后输入未变 / 此后有文件变更，先重跑再收尾"；目录 >20k 项时省略括注不误报）。既有红灯在任务中暴露并修复，而不是在 Stop 被撞上。同时在插件数据目录按项目根哈希锚定会话基线（配置哈希 + 逐门禁结论 + finishedAt），供 new-only 判定。

### H1c 新旧失败区分 `stop.blockMode`（P3，可选）

顶层可选配置 `stop:{blockMode:"all"|"new-only", inputs:{<门禁id>:[glob,...]}}`（内核 validate 校验形状；模板不装配、默认不启用）。`new-only` 下 Stop 的放行条件全部满足才降级为 systemMessage 警告：报告为 FAIL（**ERROR 永不降级**）、每个 FAIL 门禁在会话基线中已 FAIL（SessionStart 无归档 = 全按新失败）、该门禁声明了 `inputs`、且基线之后的变更文件无一命中其 glob；配置哈希漂移 → 基线失效全按新失败。未声明 inputs 的既有 FAIL 不降级（保守优先）。降级只影响 Hook 呈现：报告仍为 FAIL、CLI 退出码不变、CI 强制不受影响。

### H1d 小修三处（P4）

- **证据落点统一**：Stop 运行写入项目 `.quality-gate/runs/`（与 CLI 同轨，`report` 可重渲染）；项目目录不可写时回退插件数据目录。
- **绝对路径重跑提示**：summary 与 `qgate.mjs report` 的重跑/全表命令按 qgate.mjs 绝对路径渲染（展示层项目根仍按 cwd 相对化），任意 cwd 复制即用。
- **不阻断面收窄**：项目无 `.quality-gate.json`（未接入，SessionStart 已给引导）与 adapter 自身错误（输入损坏等模型无法经项目文件修复的情况）改为 systemMessage 不阻断；门禁/配置 ERROR 仍阻断（可修复信号）。

## 测试与验证

- 445 项回归（444 过 / 1 skip=pytest 守卫）：+6 `freshness.test.mjs`（glob 边界与拒绝、最新归档按阶段回看、runs 目录排除、截断 fail-safe、复用四条件）；`adapter.test.mjs` 重写为 9 项（放行与阻断含重试、无效输入非阻断、未接入不阻断、损坏配置仍阻断、复用不新增运行/变更后重跑、new-only 降级→输入触碰→配置漂移全链、SessionStart 基线行）；summary/report 断言随绝对路径提示更新。
- 打包：`dist/quality-gate-1.14.0.zip` 564 文件，SHA256 `2b8082f94001e90e07a93dc7a2936d4806f1dbdeea3790c93c9c67ca1bc045cf`（构建后回填本行，v1.6 起惯例）；build_delivery 独立解包复验 445 测试 + 24 demo PASS——`evidence/v1.14.0/build-delivery.txt`。
- 客户端实机验收待执行（快照再同步 → "更新"按钮 → 新建会话验证 SessionStart 基线行与 Stop 复用/降级，清单见 RTM §10）。

## 边界与迁移

- 零破坏：`stop` 可选且模板不装配；未配置时 Stop 语义与 1.13 一致，除两处不阻断面收窄（无配置项目、adapter 错误）——这两处原会形成模型无法修复的阻断循环，属有意修正。
- mtime 新鲜度是**性能优化非证明手段**：不感知仓库外文件与网络状态；无法判定即回退重跑。复用/降级判定均可从归档报告审计。
- new-only 的"会话基线"锚定在 SessionStart：跨版本升级后的首个会话无基线 → 全按新失败处理（不会误放行）；基线文件在插件数据目录，删除无害。
- Stop 重试客户端上限与"最终强制准出需 CI"的既有边界不变。
