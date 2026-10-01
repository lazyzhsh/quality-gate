# RELEASE 1.5.1（2026-09-25，补丁）

补丁目的唯一：把 v1.5.0 客户端安装缓存内 `tests/config-guide.test.mjs` 的安装布局崩溃修复送入客户端。该修复已在 v1.5.0 发布当日的源码中完成（详见 [LIVE-ACCEPTANCE-1.5](../history/LIVE-ACCEPTANCE-1.5.md) 的 FINDING+FIX），但当时 1.5.0 安装包已定型，客户端缓存一直带着该崩溃。本补丁不夹带任何功能变更。

## 变更清单

- `tests/config-guide.test.mjs`：安装布局中不存在 `docs/CONFIG-GUIDE.md` 时显式 `t.skip`（skip 不算 PASS），仓库布局仍全量执行；
- 版本号 1.5.0 → 1.5.1（`marketplace.json`、`plugins/quality-gate/package.json`、`plugins/quality-gate/.zcode-plugin/plugin.json` 三处同步）。

除上述外与 1.5.0 内容一致（34 kinds / 304 测试 / 38 示例）。

## 验证证据

- 仓库全量回归：304/304 通过（`evidence/v1.5.1/tests.txt`）；
- 打包解包复验：`dist/quality-gate-1.5.1.zip`（423 文件，SHA256 `e6ebcbafa2a28a2f5382db438f04ca7a5b5250750ce2aa35dff6c18109482037`），解包临时目录内 304 项测试与 27 个烟测 demo 全部 PASS（`evidence/v1.5.1/package-smoke.txt`）。

## 客户端升级与复验（待执行，随后补记）

1. ZCode 客户端经本地 marketplace（仓库根 `marketplace.json`）安装/升级 quality-gate 1.5.1，新开会话；
2. 验证安装缓存内 `tests/config-guide.test.mjs` 不再崩溃（skip 布局语义）；
3. 记录于 `evidence/zcode-live-v1.5.1/` 与本文件补记，实机记录与 CLI/模拟分别留存（项目约定）。
