# RELEASE-1.20.0（2026-10-01）

**主线：轨道 C 收官——API/符号存在性声明即核验（symbol-grounding 可选观察分支）＋Python/Java import 对账参考适配器**（来源：[original-design-v0.9](../context/original-design-v0.9.md) §43.2 语言分界与 §43.3 协议层三分；36 kinds 不变，零破坏）。

## 首日裁决（2026-10-01 经 AskUserQuestion 四问逐轴利弊）

- **OD-108=C 混合**（采纳推荐）：内核原生提取三类可定位引用＋观察输入口同轮定型——证明力最强形态；
- **OD-109=B 登记文件**（用户覆盖推荐 A 门禁选项直引）：声明面独立登记＋source 溯源，与 conventions.json 治理先例一致；
- **OD-110=A JSON 直读＋YAML 走适配器**（采纳推荐）：内核守零依赖，YAML 归一为可选拓展；
- **OD-111=A 双向对账**（采纳推荐）：内核词法提取集×适配器回报恰好覆盖——防瞒报，runner 无权决定引用集。

## 内容

1. **命名 import 成员对账（默认启用，无需登记）**：`import {x}` 的 x 对账目标模块词法导出枚举（声明五形＋子句别名表＋default 命名导出）；仅 resolution=project 的 ESM 目标；`export *`/CJS 目标 opaque 计数豁免（不虚报面也不装作可判）；缺成员 FAIL `unresolved-member`（文件/行/成员/目标）。
2. **apiSurface 声明面登记（OD-109）**：`registries/api-surface.json`（openapi/openapi-yaml/json-schema 三类，source 溯源必填，路径防逃逸，畸形 fail-closed；openapi-yaml 需归一 JSON＋mtime 新鲜度哨兵——过期即 ERROR，过期面比对等于对账幻影）。绑定即对账：端点引用（`fetch('/x')`/`axios.<verb>('/x')` 两族路径形字面量，查询串剥离）×OpenAPI paths 面（`{param}` 段级通配）；配置键（`process.env.KEY` 两形态）×schema properties 递归键面（含中间对象键）；缺即 FAIL `unresolved-reference`（endpoint/config-key 指名）；对应类型声明面缺席则该类引用只计数不对账；登记内容哈希入证据。
3. **importObservations 观察输入口（OD-108 协议部分＋OD-111 双向对账）**：`[{language,file}]` 绑定适配器观察文件（形状 fail-closed：schemaVersion 0.1/language 一致/tool 溯源/resolution 四枚举）。内核词法提取 Python（专用 `#` 注释状态机——python 无 `//` 但有地板除，不能复用 JS 预备器；逗号多模块＋相对导入原样）与 Java（含 static 全链名）引用集；提取集无回报 FAIL `observation-coverage-gap`（位置指名）；回报 unresolved FAIL 汇入；多出回报审计面不阻断；观察文件哈希入证据。绑定语言即扩大扫描扩展名（.py/.java）。
4. **参考适配器**：`adapters/python/import_probe.py`（真实解释器 `importlib.util.find_spec` 探测——pip 包名与模块名不同构，探测才是真对账；venv 边界如实；`--normalize-openapi` YAML 归一，pyyaml 缺失给安装指引）；`adapters/java/import_scan.mjs`（package 声明定位源根→扫描集源码=project；pom/gradle 依赖段词法=third-party；JDK 内建前缀=stdlib；不编译，JDK 边界如实）。
5. **demo×2（40→42）**：api-surface-demo（双声明面正例＋幽灵三路反例＋YAML 归一往返腿[守卫]）；adapter-imports-demo（ok/ghost/trim 三场景——trim 演示裁剪回报即 coverage-gap FAIL 的防瞒报闭环；python 缺席 java 单跑如实提示；未跑适配器直接 close fail-closed ERROR）。
6. **文档**：GLOSSARY 正式登记 API 存在性协议/声明面/观察输入口/双向对账（提案转正）；GATE-SPEC v1.20（v1.19 归档）；CONFIG-GUIDE 选项表＋jsonc＋api-surface.json/观察文件两节（自动同步测试强制）；summary 提取器三组新原因；RTM §12 AL4＋§13 汇总；PRD §7；双语 README 计数 36/555/42。

## 证明边界（如实）

端点匹配为路径级段通配（HTTP 方法不判——fetch 不携带方法）；完整 URL 不提取（host 绑定边界）；schema 键面不含 patternProperties/条件组合；OpenAPI `$ref` path item 与 servers basePath 不展开（面只取显式声明，方向=不虚报）；适配器解析以运行环境为准（venv/JDK 版本差异如实）；YAML 归一依赖 python＋pyyaml（缺失守卫降级＋指引）；java 按需 `.*` 导入不覆盖；词法提取不覆盖动态引用（既有 dynamicForms 边界延续）。

## 验收与证据

- 全量回归 **555 项（554 过/1 skip=pytest 守卫）**，`evidence/v1.20.0/regression.txt`；
- 发行包 `dist/quality-gate-1.20.0.zip`：**664 文件**，SHA256 `18ff04c93b1ae366a2c1e23c446ca27c2109327022567435a689feb3581d59e4`（两次构建全同）；解包复验含端到端正反例（幽灵注入三路指名/适配器 trim 防瞒报），见 `evidence/v1.20.0/`；
- 根门禁 close 2/2（G-TESTS＋G-CONVENTIONS——后者本版第二次实战命中，逮住自写文案弃用词"锚定"，当即修正）。

## 版本边界

- 客户端实机验收 **1.17.0–1.20.0 五版同轮挂起**（用户决定，2026-10-01；并入 v1.21.0 验收轮补做，届时在 ≥1.20.0 客户端执行新声明断言：命名成员/端点/配置键正反例＋观察输入口双向对账正反例＋YAML 归一往返，如实标注"并入"非跳过）。
- 路线位置：**轨道 C 收官**（v1.17 首轮 import 对账 → v1.20 API 存在性＋适配器）；四轨道进度 A ✅ B ✅ C ✅；下一轮 v1.21.0=轨道 D（resilience trace 贯通＋回放资产）。
- 范围红线不变：R13/编排、签名+CI 永久出范围；1.8.0 裁剪项不回潮。
