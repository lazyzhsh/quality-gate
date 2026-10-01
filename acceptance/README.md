# 客户端验收项目

## 1.5.0 夹具与六域验收

`expense-approval-fixture/` 是 1.5.0 的真实研发夹具：PRD、进度、业务源码、测试与 11 个跨 L0–L5 门禁。运行方法见其 [`README.md`](expense-approval-fixture/README.md)（负例矩阵 `scripts/negative-matrix.mjs` 在临时副本逐域注入缺陷）；实机记录见 [`VALIDATION-EXPENSE-FIXTURE-1.5.md`](../docs/history/VALIDATION-EXPENSE-FIXTURE-1.5.md)（CodeX 驱动）与 [LIVE-ACCEPTANCE-1.5 第 6 节](../docs/history/LIVE-ACCEPTANCE-1.5.md)（ZCode/GLM 电脑控制交叉复验）。

`zcode-v15-acceptance/` 是 1.5.0 六域组合验收项目（six-domain-demo + 故意违约的 budget 门禁 + python3 缺失依赖提示），保持 FAIL 态供复演，见 [LIVE-ACCEPTANCE-1.5](../docs/history/LIVE-ACCEPTANCE-1.5.md) 第 3 节。

## 1.1 客户端性质 Gate 样例

`zcode-v11-acceptance/` 与 `zcode-v11-acceptance-pass/` 都是独立项目，当前配置为正确样例。`zcode-v11-acceptance/` 曾在 ZCode 1.1.0 实机验收时于 Gate 的 `argv` 增加 `wrong-refund`，使第 8 个确定性样例出现退款 300 > 扣款 299，自动 Stop Hook 产生 FAIL；移除该参数后 100/100 PASS。客户端原始报告的副本见 `../evidence/zcode-live-v1.1/`。

在仓库根目录可先检查正确样例：

```powershell
node plugins/quality-gate/bin/qgate.mjs acceptance/zcode-v11-acceptance close
```

需要重放负例时，在该验收项目的 `.quality-gate.json` 中把 Gate 的 `argv` 临时设为 `["$NODE", "runner.mjs", "wrong-refund"]`，运行后恢复原配置。不要通过禁用 Gate 或删除 `requiredDomains.close` 来制造通过结果。

`.quality-gate/runs/` 下的 JSON 是迁移前的本地 CLI 历史报告，包含原路径；其副本保存在 `../evidence/v1.1/acceptance-cli/` 供版本追溯。新运行的输出不应提交到版本库。
