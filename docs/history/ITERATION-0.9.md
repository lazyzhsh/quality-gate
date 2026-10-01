# v0.9：跨域汇总与例外登记

新增 `requiredDomains` 阶段矩阵与 `domainCoverage`，六域中任一被禁用、跳过或失败均在要求该域的阶段阻止整体通过。报告将每条 Risk 关联到同次 Gate Evidence。完整 Exception 提案可登记，但仍阻断交付，不能用 `approved` 字样直接放行。

六域组合 demo 在同一次 `release` 执行七个 Gate：L0 RTM、L1 syntax、L2 FIBO-linked profile、L3 behavior、L4 metrics、L5 readiness 与回滚演练。对每个域制造一个失败样例，另验证缺失必需域。源代码回归和打包验收在 v1.0 收尾阶段统一完成，之后才做 ZCode 客户端实机验收。
