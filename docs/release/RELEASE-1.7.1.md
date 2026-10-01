# RELEASE 1.7.1（2026-09-26）

补丁主线"配置生命周期与登记文件集中管理"（用户实机验收 v1.7.0 `/quality-gate-init` 后提出两点：重初始化与升级更新需分权、登记文件应集中目录管理；清理方式/入口/目录经 AskUserQuestion 选定——列表确认后删除、新增独立 update 命令、`.quality-gate/registries/`。架构决策 [ADR-0015](../adr/ADR-0015-config-lifecycle.md)；按 v1.5.1 补丁先例，GATE-SPEC 仍为 v1.7，仅在「引导初始化」节内扩展，不更名不归档）。

## 变更清单（三个增量，逐项独立提交 f5b7b05 → c151a3b → 5184a5f）

1. **模版库改造**（`lib/templates.mjs`）：全部模版/附加项的 `file`/`dataFile`/`files` 默认路径改指 `.quality-gate/registries/<name>`；`assembleConfig` 写入顶层溯源 `template:{id,generatedAt}`（kernel `validate` 校验形状，update 只刷新 generatedAt、id 保持来源）；抽取 `applyChanges` 共享变更核心（init 装配与 update 增量同一实现：禁用级联清理→附加合并→替换→孤儿 claim 修剪）；新增 `scanLeftovers`/`collectRegistryRefs` 只读残留扫描——无旧配置按根目录已知登记文件名（19 个）启发，有旧配置并入其 file/dataFile/files/ontology.file 引用（彻底层）。
2. **CLI 生命周期子命令**：`leftovers <root>`（残留清单，对话确认的数据源）；`init --fresh`（装配成功才删除；删除=登记文件+整个 `.quality-gate/` 目录；stdout JSON 记录 removed 清单；已有配置需 `--force --fresh` 双确认）；`inspect <root>`（有效性/门禁清单/各阶段预算/requiredDomains/priorRuns 数/溯源模版匹配与双向漂移（无溯源按 kind 集相似度）/可用附加/登记文件存在性）；`update <root> <changes>`（契约 `{addAddOns?,disable?,substitutions?,requiredDomains?,migrateRegistries?}` 未知即拒；`migrateRegistries` 内存改写路径→校验通过→才移动文件并写盘，目标已存在跳过并报告）；SessionStart 缺配置且检测到 `.quality-gate/` 残留时提示重初始化路径。
3. **引导命令分权**：`/quality-gate-init` 守卫三分支（已有配置→指向 `/quality-gate-update`，覆盖需显式 `--force` 复核；缺配置+有残留→`leftovers` 列清单、用户确认删除后 `--fresh` 全新引导，残留登记不作为分析输入；纯净首跑→原流程）；新增 `/quality-gate-update` 命令（inspect 呈现→选择题增量→changes 文件→update→close 验证）；SKILL 步骤 2 与根 README 同步（gitignore 指引改为仅忽略 `.quality-gate/runs/`，登记文件应随项目提交）。

同步：RTM v1.7 增补节新增 O2（生命周期分权）/O3（登记文件集中）行并更新汇总；PRD §4 横切/§5 计数/§7 已达成；ADR-0015；CONFIG-GUIDE（顶层 `template` 字段表+样例、引导初始化节扩 leftovers/--fresh、新增「检查与增量更新」节、数据登记文件节目录约定）；GATE-SPEC v1.7 引导初始化节扩展；PLAN v1.7.1 节+历史基线；PROJECT-HANDOFF/根与插件双语 README；版本三处 1.7.1；`devtools/build_delivery.py` 断言 350→363。

## 数字

- 35 个 gate kind（不变）；363 项本地测试（v1.7.0 时 350 → +4 模版库扩展 +9 生命周期集成）；40 个示例与 28 个烟测（不变）。
- 安装包 `dist/quality-gate-1.7.1.zip`：456 文件，SHA256 `da2cd46541977b539731fc57c7d7fd729163daff20ae953aa5ca11f63ffd0f91`；解包复验 363 项测试与 28 个烟测 demo 全部 PASS（`evidence/v1.7.1/package-smoke.txt`）。
- 仓库全量回归 363/363（`evidence/v1.7.1/tests.txt`）。

## 验收正反例

- 正例：`tests/lifecycle.test.mjs`——leftovers 清单（干净/残留两态）；`init --fresh` 删除确认清单且装配失败（残留占位符）时**不删任何文件**；update 对手写旧式配置（根目录登记路径）做替换+`migrateRegistries` 后文件移入 registries、路径改写、close 仍 PASS；update 附加 secret-scan（真实 pass runner）后 close PASS 且溯源 id 保持；inspect 溯源匹配/相似度匹配/坏配置三态。
- 反例（明确失败证据）：已有配置 `--fresh` 无 `--force` 拒绝（exit 2）；update 未知字段/gate id 冲突/未知禁用/未知替换目标各自报错且**配置文件字节不变**；配置残留占位符拒绝；迁移目标已存在跳过（skipped 报告、源文件不动）；缺配置 update/inspect 报错指向 init。

## 证明边界（不因本版收窄）

- **删除不可恢复**（用户选定：列表确认 + git 兜底，无备份目录）；`leftovers` 启发层仅覆盖根目录已知文件名——旧配置已删时深路径自定义残留不可检测（边界如实记录于 ADR-0015）。
- `update` 允许附加目录内任意 id（模版档位限定仅 init 生效），预算/唯一性由内核 `validate()` 兜底；`migrateRegistries` 仅迁移配置 file 类字段指向的**根目录**文件，runner 自用文件不迁移。
- 溯源字段为声明性元数据，不构成配置正确性证明；无溯源的手写配置走 kind 集相似度匹配（inspect 结果标注 mode）。
- 1.6.0/1.7.0/1.7.1 客户端实机验收待执行：重点验证重初始化确认流（删配置→SessionStart 残留提示→/quality-gate-init 列表确认删除→--fresh 全新引导）与 `/quality-gate-update`（inspect→增量→update→close），记录于 `evidence/zcode-live-v1.7/`（与 CLI 回归分别记录）。
