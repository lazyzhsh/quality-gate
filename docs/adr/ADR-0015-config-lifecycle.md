# ADR-0015：配置生命周期分权（init/update）与登记文件集中目录

- 状态：已接受（用户 2026-09-26 实机验收 v1.7.0 后提出：重初始化须区分于升级更新；登记文件应集中管理。清理方式/入口形态/目录经 AskUserQuestion 选定：列表确认后删除、新增独立 update 命令、`.quality-gate/registries/`）
- 日期：2026-09-26

## 背景

实机验收发现两个缺口：① 手工删除 `.quality-gate.json` 后触发 init，agent 把残留登记文件当输入自主分析——重初始化（清空重来）与升级更新（保留并增量调整）语义被混在一起；② 登记文件（rerun.json、assumptions.json 等）随 kind 增多在项目根目录扩散。

## 决策

1. **入口分权**：`/quality-gate-init` 专职首次接入与重初始化；新增 `/quality-gate-update`（CLI `inspect`/`update`）专职既有配置的升级、修复与增量调整（附加/禁用/替换/requiredDomains）。init 遇已有配置默认指向 update，覆盖需显式 `--force` 复核。
2. **重初始化=列表确认后删除**：`qgate.mjs leftovers` 确定性列出残留（根目录已知登记文件名启发层；旧配置在时并入其 file 引用彻底层 + `.quality-gate/` 目录内容），经用户确认后 `init --fresh` 删除（不可恢复、不备份）并全新引导；装配失败不删除任何文件。残留登记不作为新配置的分析输入。
3. **登记文件集中**：默认目录 `.quality-gate/registries/`（可提交），模版/附加项默认路径全部指向该目录；`.quality-gate/runs/` 仍为运行数据，gitignore 指引改为仅忽略 runs/。存量项目经 `update` 的 `migrateRegistries` 迁移（仅配置 file 类字段指向的根目录文件，路径内存改写→校验通过→移动+写盘，目标已存在跳过并报告）。
4. **溯源字段**：init 装配写入顶层 `template:{id,generatedAt}`（kernel 校验形状），update 刷新 generatedAt、id 保持来源；`inspect` 据此输出模版漂移（无溯源时按 kind 集相似度匹配），为 update 的差异分析提供确定性依据。

## 后果

- 正面：三种意图（首跑/重建/升级）各有唯一入口与守卫；根目录不再随 kind 增长堆积登记文件；删除行为有确认与记录（stdout removed 清单）。
- 负面：删除不可恢复（用户选定，依赖确认与 git 兜底）；已知文件名启发层只覆盖根目录，旧配置已删时深路径残留不可检测（边界如实记录）；update 允许目录内任意附加项（无模版域限定），依赖 validate 的预算/唯一性兜底。

## 备选方案

重初始化自动备份后清理（拒绝：用户选列表确认后删除，git 即回滚手段）；init/update 合并为双模式命令（拒绝：入口语义混合易误触发）；登记文件放根目录 `quality-gate/` 无点目录（拒绝：与 `.quality-gate/` 并存视觉混淆且 gitignore 语义分裂）。

## 关联

[ADR-0014](ADR-0014-guided-onboarding.md)、[ADR-0004](ADR-0004-deterministic-first.md)、[CONFIG-GUIDE 引导初始化与模版库/检查与增量更新](../CONFIG-GUIDE.md)、[RTM O2/O3](../RTM.md)、[release/RELEASE-1.7.1](../release/RELEASE-1.7.1.md)
