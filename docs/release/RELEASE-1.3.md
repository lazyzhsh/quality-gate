# Quality Gate 1.3.0 发布说明

面向 semantic-alignment 主线的六项增强：Terminology Ambiguity 门禁、subClassOf 传递闭包与 `subsumed` 匹配模式、FIBO vendored 双模块升级、`acknowledgedOntology` 指纹重确认与 ontology diff 工具、semantic-profile 与 SHACL Core 词汇对齐、提案-确认-pin 工作流审计。配置 schemaVersion 保持 0.1；未使用新选项的旧项目配置无需修改（升级 FIBO pin 的项目须按手动升级工作流更新 `expectedCatalogSha256`）。

本轮来源：一次 semantic-alignment 专题技术调研（对标 SHACL/SKOS/ROBOT/OAEI/LLM 对齐等外部方法后确定"标准词汇对齐 + 零依赖内核小步增强 + 构建期工具链 + 受控 LLM 提案"的路线）。

## 增量 1：terminology 门禁（Terminology Ambiguity 最小版）

- 新增原生 L3 门禁 `terminology`（无 runner）：目录级 SKOS 完整性——prefLabel 跨概念唯一（`duplicateLabel`，SKOS S14 精神）；项目术语按 label/altLabels 精确解析，零命中 `unmatchedTerm`、多命中 `ambiguousTerm`，全部规则 FAIL。
- provider 接口新增 `concepts()` 词表枚举；local-catalog/fibo-pinned 概念支持可选 `altLabels`；capabilities 新增 `labels`。
- 正例 `examples/terminology-demo`（术语经 prefLabel 与 altLabel 各命中一次）；反例 `tests/terminology.test.mjs`（重复标签、术语歧义、未命中、骨架 provider ERROR、畸形 altLabels ERROR、术语表校验 ERROR）。
- 测试 +8；回归 188/188。

## 增量 2：subClassOf 传递闭包与 subsumed 匹配

- 目录概念新增可选 `subClassOf`（非空唯一数组）；provider 构建时校验目标必须在目录内且无环（dangling/环均 ERROR fail-closed），并提供 BFS 最短包含链 `subsumptionPath(from, to)`。
- semantic-alignment 新增可选 `matchMode: strict|subsumed`（默认 strict，行为不变）：subsumed 下候选为声明概念经传递闭包的子类亦 PASS，包含链入 findings 证据；互斥对检测两种模式不变。RDFS 子集闭包，非 OWL 推理。
- 正例 `examples/semantic-subsumption-demo`；反例含默认 strict 拒绝子类、subsumed 下互斥候选仍 FAIL、环/dangling 目录 ERROR、非法 matchMode ERROR、多跳链证据。
- 测试 +7；回归 195/195。

## 增量 3：FIBO vendored 双模块升级（手动升级工作流）

- 随包 vendored 文件从单模块扩展为 `FND/Agreements/Agreements.rdf` + `FND/Agreements/Contracts.rdf`（同一修订 `574a8315…`，手动下载静态文件，运行不联网）。目录从 9 概念升级为 **52 概念、41 条保留 subClassOf 边、5 条互斥边**；跨模块外指边（如 Commons 上游父类）丢弃并按 `droppedSubclassEdges`/`droppedDisjointEdges` 全量登记在目录清单。
- 生成器重写为 `scripts/import-fibo.py`（多文件 SOURCES 表、逐源 SHA、自检无环、输出新 catalogSha256）；运行时信任链：代码常量 pin 目录 SHA → 目录记录逐源摘要 → vendored 文件逐字节核验，任一篡改即 ERROR。
- 新目录 SHA `eb9795a2…16c4e`；引用 fibo-pinned 的四个示例与测试同步更新。真实 FIBO 语义入测试：WrittenContract→Contract→Agreement 两跳包含链、VerbalContract⊥WrittenContract 互斥对、篡改 vendored 源 ERROR。
- 测试 +4；回归 199/199。

## 增量 4：acknowledgedOntology 指纹重确认 + ontology diff 工具

- semantic-alignment 与 terminology 新增可选 `acknowledgedOntology: {id, version, catalogSha256}`（语义同 change-scope `acknowledgedBase`）：目录升级/替换后与 provider 实际指纹不符即 `staleOntologyAck` FAIL 并指明漂移字段，强制人工重审映射后更新确认。provider describe 统一携带 `catalogSha256`。
- 新增 `plugins/quality-gate/scripts/ontology_diff.py`（Python stdlib，随包发布）：对比两版目录，逐变更分类 additive/breaking（删概念/改标签/删继承边/新增互斥=破坏性），存在破坏性变更退出码 1；FIBO 手动升级工作流第 4 步强制使用。
- 正反例：匹配确认 PASS、版本漂移 FAIL（含字段级证据）、畸形确认 ERROR；diff 工具分类与退出码各有测试（python 可用性探测与 KNOWN_TOOLS 一致）。
- 测试 +6；回归 205/205。

## 增量 5：semantic-profile 与 SHACL Core 词汇对齐

- 四条规则与 W3C SHACL Core 组件建立命名对齐并写入逐条 violation 的 `shacl` 字段：`minCount`→`sh:MinCountConstraintComponent`、`maxCount`→`sh:MaxCountConstraintComponent`、`allowedValues`→`sh:InConstraintComponent`、`valueType`→`sh:datatype`（string→xsd:string、number→xsd:decimal、boolean→xsd:boolean；object 仅近似 sh:nodeKind）。
- 明确边界：这是命名/可互译层面的对齐，内核不是 SHACL 引擎（无 RDF 图语义、路径表达式、SPARQL 约束）。判定语义不变。
- 测试 +1（四类 violation 的组件标注）；回归 206/206。

## 增量 6：提案-确认-pin 工作流审计

- 新增 `lib/proposals.mjs` 与 CLI 子命令 `node bin/qgate.mjs proposals <项目根> [登记文件]`：登记 `ontology-proposals.json`（`proposals[{id, symbol, candidateIri, confidence 0..1, source, status: proposed|accepted|rejected, note?}]`），审计"已接受但未 pin 进 semantic-alignment mappings"的漂移（`accepted-not-pinned`，退出码 1）；登记畸形即退出码 2。
- 工作流边界写入文档：LLM/匹配工具只产出提案；人工接受后必须 pin 进 mappings；**门禁不读取提案文件，confidence 不构成证据**。
- 测试 +4（三态退出码、漂移证据、纯函数只认 semantic-alignment mappings）。

## 定稿验证（2026-09-25）

- 测试基线：**210 项全部通过**（v1.2 的 180 + terminology 8 + subsumed 7 + FIBO 升级 4 + acknowledgedOntology/diff 6 + SHACL 1 + proposals 4）。
- 正例 demo：**28 个全部通过**（`evidence/v1.3/demos.txt`，含本轮新增 terminology-demo、semantic-subsumption-demo；较 v1.2 清单补跑 fibo/semantic-profile/metrics/scan/delivery 五个既有示例）。
- 功能实测（`evidence/v1.3/functional-checks.txt`）：duplicateLabel/unmatchedTerm 摘要、strict 拒绝子类、FIBO 两跳包含链证据、staleOntologyAck 字段级原因、proposals 漂移报告、ontology_diff 破坏性分类退出码。
- 打包：`quality-gate-1.3.0.zip`（307 文件，SHA256 `7332647a…3811`），解包复跑 210 项测试与十二个核心 demo 全部通过（`evidence/v1.3/package-smoke.txt`）；历史 v0.1–v1.2 安装包原样保留。
- 规范文件更名为 `docs/GATE-SPEC-v1.3.md`；CONFIG-GUIDE 选项表/样例与 `tests/config-guide.test.mjs`、`tests/summary.test.mjs` 强制同步（26 个 kind 全覆盖）。
- **已知待办（需客户端操作，自 v1.2 结转）**：在 ZCode 客户端将本地 marketplace 更新至 1.3.0 后，复验 Command/Skill 调用、L0–L5 六域组合 Stop Hook 与依赖提示注入（含新增 terminology 门禁的 Stop 摘要），并保留客户端报告。

## 证明边界

本轮增强不构成 OWL entailment 或完整业务正确性证明：subClassOf 闭包是 RDFS 子集（跨模块丢弃边使闭包不完整）；SHACL 词汇对齐不是 SHACL 引擎；FIBO vendored 子集不覆盖完整 FIBO；ontology_diff 是人工评审辅助而非自动裁决；LLM 提案与 confidence 不进入证据链。不得把上述能力表述为生产认证。
