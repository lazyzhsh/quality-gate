# 运行手册

版本 0.1.0。要求 Node.js 20+。先运行 `node --test tests/*.test.mjs`，再从仓库根运行 `node plugins/quality-gate/bin/qgate.mjs acceptance/expense-approval-fixture close`。查看 JSON 报告的 `summary`、`gates` 和风险；非 PASS 不准交付。运行时只写入系统临时目录和 `.quality-gate/runs`；若由 ZCode Hook 运行，报告写入 `ZCODE_PLUGIN_DATA` 对应项目目录。故障排查先定位 gate ID，再核对 runner 的 source、target、输入范围和退出码。
