# 第三方来源与许可

项目自有代码与文档采用根目录 [MIT LICENSE](../LICENSE)。第三方文件保留其原有许可与来源说明，不以项目版权声明替代上游版权。

| 内容 | 来源与许可 | 仓库中的说明 |
|---|---|---|
| 固定版本 FIBO Agreements/Contracts 子集与派生目录 | Enterprise Data Management Council；MIT | [上游许可证](../plugins/quality-gate/assets/fibo/2026Q1/LICENSE)、[provider 与源文件摘要](FIBO-PROVIDER.md) |
| 可选 pyshacl/rdflib 引擎 | 由使用者在自己的 Python 环境安装；本仓库不分发这些包 | [SHACL 参考适配器](../plugins/quality-gate/adapters/shacl/pyshacl_runner.py)；安装时应遵守各包随附许可证 |
| 可选浏览器、pytest、Java 测试工具等 | 使用者自己的外部工具；本仓库只提供适配代码 | [适配器说明](../plugins/quality-gate/adapters/README.md) |

W3C OWL/SHACL 是规则参考来源，内核实现有明确子集边界；引用标准不表示 W3C 认证。ZCode 是当前宿主适配目标，项目与上游宿主、FIBO 或外部工具之间不存在认证背书关系。
