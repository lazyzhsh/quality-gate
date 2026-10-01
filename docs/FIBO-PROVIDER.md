# 固定版本 FIBO provider 使用说明

官方来源：EDM Council FIBO GitHub 的 `master_2026Q1` 发布，修订 `574a83150a34d7188384c2ecbe124843761931d6`。项目原始文件（`Agreements.rdf`、`Contracts.rdf`）与该修订的 MIT LICENSE 随插件置于 `assets/fibo/2026Q1`。上游链接：

- https://github.com/edmcouncil/fibo/releases/tag/master_2026Q1
- https://github.com/edmcouncil/fibo/blob/574a83150a34d7188384c2ecbe124843761931d6/FND/Agreements/Agreements.rdf
- https://github.com/edmcouncil/fibo/blob/574a83150a34d7188384c2ecbe124843761931d6/FND/Agreements/Contracts.rdf

## 手动升级工作流（不联网运行）

1. 在目标修订下手动下载模块 RDF/XML 原始文件到 `plugins/quality-gate/assets/fibo/2026Q1/`（或新版本目录）。
2. 更新 `plugins/quality-gate/scripts/import-fibo.py` 的 `SOURCES` 表（文件名、SHA256、模块路径与 IRI 前缀）及版本常量。
3. 运行 `python scripts/import-fibo.py` 重新生成 `catalog.json`，脚本输出新的 `catalogSha256`。
4. 运行 `python scripts/ontology_diff.py <旧目录备份> assets/fibo/2026Q1/catalog.json`（在 plugins/quality-gate 下） 分类加法/破坏性变更（删除概念/改标签/删继承边/新增互斥为破坏性，存在即退出码 1），据此人工重审受影响映射。
5. 将 `lib/ontology.mjs` 中的 `FIBO_CATALOG_SHA`（及版本/修订常量）更新为该值，项目 `.quality-gate.json` 的 `expectedCatalogSha256` 同步更新；声明了 `acknowledgedOntology` 的 semantic-alignment/terminology 门禁在重审后更新确认指纹，否则以 `staleOntologyAck` FAIL 阻断。
6. 跑全量回归与受影响 demo。

生成器只收录各文件中 IRI 属于该模块命名空间且带 `rdfs:label` 的 `owl:Class`，并抽取 `rdfs:subClassOf`/`owl:disjointWith` 资源引用边；目标不在概念集内的边（如指向 Commons 上游的父类）被丢弃并按 `droppedSubclassEdges`/`droppedDisjointEdges` 全量登记在目录清单中。当前目录含 52 个概念、41 条保留 subClassOf 边与 5 条保留互斥边（含 `VerbalContract ⊥ WrittenContract`）。不宣称覆盖完整 FIBO。

运行时信任链：代码常量 pin 目录 SHA → 目录记录每个源文件 SHA → 与随包 vendored 文件逐字节核对。运行 Gate 不联网；篡改任一 vendored 文件或目录即 fail-closed ERROR。

项目 `.quality-gate.json` 参考 `examples/fibo-demo`：

```json
{
  "ontology": {
    "type": "fibo-pinned",
    "expectedCatalogSha256": "eb9795a238457b85161bbb22610a6a5507a613fb76d377b05daba625b3816c4e"
  }
}
```

这段对象需和 `claims`、`gates`、`risks`、`exceptions` 一起配置。映射文件例子在 `examples/fibo-demo/mappings.json`。执行 `node bin/qgate.mjs examples/fibo-demo close`；或 `node bin/ontology.mjs examples/fibo-demo <IRI>` 查看单项查找结果。输出 Evidence 记录 provider 版本、修订、逐源摘要、概念数及每条映射的 FOUND/UNKNOWN。

切换本体时将 provider 配成 `{ "type": "local-catalog", "file": "ontology.json" }`，项目目录文件格式为 `{ "id": "domain", "version": "1", "concepts": [{ "iri": "urn:domain:Contract", "label": "Contract", "altLabels": [], "subClassOf": [], "disjointWith": [] }] }`（三种边均为可选非空唯一数组）。目录受项目根路径约束；该选项目前没有固定摘要机制，不能将其视作等同于固定 FIBO 版本的供应链保证。

Gate 做 IRI 精确存在性检查；目录中的 `subClassOf` 支持传递闭包包含判定（semantic-alignment `matchMode: subsumed`，无环且目标必须在目录内，BFS 包含链入证据），`disjointWith` 支持互斥冲突检测（内建 OWL 子集推理：互斥沿继承传播、与包含关系矛盾即 fail-closed，非完整 OWL reasoner），label/`altLabels` 支持 terminology 术语解析。它不确认业务字段是否适合对应概念，不做 OWL 推理（丢弃的跨模块继承边意味着闭包不完整），不校验本体全局一致性，不验证持久化数据；后者需另用 persistence Gate。
