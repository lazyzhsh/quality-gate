# v0.3：固定版本 FIBO 概念映射 Gate

本轮只增加一个可审计的小能力：项目配置中的术语 IRI 必须存在于固定版本的 FIBO Agreements 概念目录。这个检查属于 L2 契约一致性；它不判断实体数据、业务含义、类之间的逻辑关系，也不执行 OWL/SHACL 推理。

## 范围和实现

- 保留 Gate Spec `schemaVersion=0.1`，增加 `kind=ontology-map`，`domain=L2`。
- 项目 `mappings.json` 为 `{ "mappings": [{ "id": "contract", "iri": "..." }] }`，1–100 条，ID 不可重复。全部 IRI 在 provider 中精确找到才 PASS；未知术语 FAIL；配置、provider 或文件错误为 ERROR。
- 内建 `fibo-pinned` provider 使用 FIBO `master_2026Q1` 的 `FND/Agreements/Agreements.rdf`，仅导入其中 9 个带标签的本模块 `owl:Class`。原始 RDF、导入后目录和 SHA256 随插件打包，运行时离线校验。
- 同一个 Gate 可选 `local-catalog`，从项目文件读取其他业务本体概念目录；切换不需要修改内核和 ZCode 适配器。原 `fibo-skeleton` 仍保留，但作为 Gate 使用会返回 ERROR。
- `examples/fibo-demo` 是可运行样例，含两个映射和显式风险。老示例与原 Gate 无须迁移。

## 验证顺序

1. 导入脚本从已固定的原始 RDF 重新生成目录，核对概念数和摘要。
2. 单元测试验证已知/未知 IRI、错误指纹、无实现 skeleton、错误映射和 provider 切换；同时运行所有旧测试。
3. CLI 对示例运行 close，核查证据中的版本、修订、摘要、映射状态与退出码。
4. 使用 ZCode 官方插件校验器检查结构，构建分发包后从解压副本做烟测。

后续小步建议：把业务字段到本体类的声明和具体用例证据连接起来，再评估 SHACL 约束。当前术语存在性只能证明“引用了目录中的术语”，不能证明映射正确。
