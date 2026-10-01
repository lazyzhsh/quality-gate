# v0.3.0：固定版本 FIBO 概念映射原型

本轮完成一个可运行的 L2 `ontology-map` Gate：检查项目声明的术语 IRI 是否存在于所选目录。内建 provider 固定为官方 FIBO `master_2026Q1` 的 Agreements RDF 小样本，导入九个概念，运行时核验原始 RDF 和目录的 SHA256。项目也可换用 `local-catalog` provider，原有 L0/L1/L2 persistence 配置保持兼容。

验证按增量进行：先验证 RDF 确定性导入，再跑全部回归和 Hook 适配器测试，随后验证示例 CLI 的已知术语、未知术语、错误目录指纹三种结果，最后用官方 ZCode 校验器检查并构建插件安装包。源码和解压后的官方构建 ZIP 均为 41/41 测试通过，含原始 RDF/目录篡改检测和 Stop Hook 适配器负例→正例。记录见 [v0.3 证据](../../evidence/v0.3/matrix.json)、[完整测试](../../evidence/v0.3/tests.txt)、[安装包回归](../../evidence/v0.3/package-smoke.txt) 和 [官方结构校验](../../evidence/v0.3/official-validation.txt)。

明确边界：当前只证明 IRI 在九个概念的固定目录中存在，不判断某业务字段是否映射正确，不做 OWL/SHACL 推理，也不替代持久化逐字段检查。来源、指纹、配置与切换方法见 [FIBO provider 说明](../FIBO-PROVIDER.md)。

本轮完成可重复的本地原型验证；本机 ZCode 注册表仍为已验收的 v0.2.0。v0.3 客户端升级尝试中，Windows Computer Use 输入接口返回 `GetCursorPos failed: 拒绝访问。 (0x80070005)`，未能完成 UI 操作；因此 v0.3 暂不宣称客户端实机验收通过。下次可在可用的桌面会话里刷新本地 marketplace、安装 0.3.0、新开项目会话，并用 fibo-demo 的已知/未知 IRI 做自动 Stop Hook 验收。
