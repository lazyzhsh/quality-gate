# ADR-0010：零依赖运行时与自含打包、安装布局容错

- 状态：已接受（v0.1 起；v1.5 实机验收发现安装布局差异后补强）
- 日期：2026-09-23；修订 2026-09-25

## 背景

门禁框架要在任意项目、CI 与客户端插件缓存中即拷即用；三种布局（仓库开发布局、交付 zip 解包布局、ZCode 客户端安装布局——marketplace 只装插件目录本身，不含外层 docs/）对相对路径的解析不同。

## 决策

1. 运行时**零 npm 依赖**（纯 Node 20+ 标准库）、运行不联网；框架直接调用的外部程序仅 git（change-scope），python 系为登记的示例 runner 命令（KNOWN_TOOLS 预检+安装指引）。
2. 打包自含 marketplace.json+docs+evidence；`devtools/build_delivery.py` 在临时目录解包重跑全量回归与清单驱动的 demo 烟测后才产出 zip+SHA256。
3. 测试对布局差异**显式容错**：config-guide.test.mjs 在无 docs/ 的安装布局下显式 skip（skip 不计 PASS），仓库/解包布局照常全量执行——这是 2026-09-25 客户端实机验收发现 ENOENT 崩溃后的修复决策。

## 后果

- 正面：任意环境可复现；打包即验过；布局差异不再表现为崩溃。
- 负面：不能引入便利依赖（生态工具一律走 runner 协议）；打包流程较重。

## 备选方案

常规 npm 依赖树（拒绝：安装面与供应链面扩大）；测试假定单一布局（拒绝：实机已证伪）。

## 关联

[ADR-0003](ADR-0003-platform-agnostic-kernel.md)、[ADR-0011](ADR-0011-manifest-single-source.md)、[history/LIVE-ACCEPTANCE-1.5](../history/LIVE-ACCEPTANCE-1.5.md)
