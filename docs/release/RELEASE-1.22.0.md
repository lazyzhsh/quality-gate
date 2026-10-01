# RELEASE-1.22.0（2026-10-01）

**主线：C6-1 语义深化·上——SHACL Core 引擎接入（RTM L2.3→达成）＋terminology 多语言术语**（来源：[original-design-v0.9](../context/original-design-v0.9.md) §33 后续候选 C6；37 kinds 不变，零破坏）。

## 首日裁决（2026-10-01 经 AskUserQuestion 三问逐轴利弊）

- **OD-114=B runner 协议外接**（用户覆盖推荐 A 零依赖自研）：pyshacl 为 SHACL **真引擎**（完整 SHACL 语义含 SPARQL 约束由其承载），经参考适配器接入统一观察协议；内核负责声明翻译、深度匹配路由、观察核验与判定——不自判放行。取向=真引擎的可信覆盖面优先于零依赖基线（四规则原生判定保留作无引擎基线）；
- **扩展集 8 组件**（采纳推荐）：pattern＋minLength/maxLength＋数值范围＋closed＋languageIn，加既有 4 条共 10 组注册表组件；
- **OD-115=A SKOS 语言标签**（采纳推荐）：`{value,lang}` 条目＋S14 按 (语言, 值) 分域＋术语严格同语言匹配；旧目录纯字符串零改动兼容。

## 内容

1. **semantic-profile 三层升级**：①sh:targetClass **深度匹配**——记录类型是目标类或其后代（subClassOf 链）即套用 shape（旧精确匹配为缺陷面，真 SHACL 即 rdfs:subClassOf* 语义；真子类套用入 `deepMatches` 证据链）；②七组新组件 `pattern`（正则可编译校验）/`minLength`/`maxLength`/`minInclusive`/`maxInclusive`/`languageIn`/`closed`——**声明而未接引擎即运行时 fail-closed ERROR**（带适配器与安装指引）；③可选 `shacl:{argv,timeoutMs}` 引擎协议：stdin 交付形状/记录/子类边（子类边→rdfs:subClassOf 三元组使引擎原生深度匹配）→ 引擎回报 `findings`＋`conformance` → 内核核验（runId 失配/未知记录/未知组件/自报矛盾均 ERROR——不采信自报放行；组件名 IRI↔sh: 短名归一化）。既有四规则保留零依赖原生判定；语言标签值 `{value,lang}` 按其载荷参与原生判定。
2. **参考适配器 `adapters/shacl/pyshacl_runner.py`**：JSON→SHACL 形状图＋数据图（属性名映射 `urn:qgate:prop:` 谓词、`{value,lang}`→语言标签字面量、数值经字符串构造避开 rdflib 类型改写、languageIn 时不叠加恒假 datatype、object 型近似 nodeKind 与内核同口径）；pyshacl 运行，findings 归一（shapeId 仅可信时携带）；缺 pyshacl 给 pip 安装指引退出码 3。
3. **terminology 多语言**：目录 `altLabels` 条目可为 `{value,lang}`（BCP47 子集校验 fail-closed；纯字符串＝语言未定，**旧目录零改动兼容**——FIBO 钉扎目录未动）；SKOS S14 唯一性按 (语言, 值) 分域——跨语言同形词合法；术语可选 `lang` **严格同语言匹配**（只命中同语言已标注条目；不带 lang 跨语言匹配重名即歧义如实暴露）。
4. **demo**：semantic-profile-demo 加 FIBO WrittenContract 子类记录（深度匹配原生腿）；terminology-demo zh 语言标签＋带 lang 术语；新 **shacl-engine-demo**（8 组件全声明＋closed＋本地三跳子类链＋引擎接线；44→45 示例）。
5. **测试 +12**：shacl-engine 套件 6（pyshacl 守卫 skip 带指引：全组件合规 PASS＋逐组件违规六类指名＋自报矛盾 fail-closed＋未知记录/未知组件＋陈旧观察＋选项形状校验）；semantic-profile +3（深度匹配正反例/engine-required/畸形组件）；terminology +3（严格语言限定＋跨语言歧义/S14 分域/畸形标签 fail-closed）。
6. **文档**：GATE-SPEC v1.22（v1.21 归档）；CONFIG-GUIDE（semantic-profile 选项表三行＋边界段组件注册表口径＋terminology 多语言语义）；GLOSSARY 登记 SHACL 引擎协议/深度匹配/多语言术语＋借词 pyshacl/BCP47；RTM L2.3→达成＋§12.2；PLAN/PRD/双语 README/adapters README；spec 引用全仓切换 v1.22＋归档移动链接修复。

## 证明边界（如实）

完整 SHACL 语义属外部引擎 pyshacl——内核翻译的 JSON 子集不含 SPARQL 约束、SHACL 路径表达式、sh:node 递归形状；object 型 valueType 在 RDF 图中无对应（近似 nodeKind，与内核标注同口径）；引擎为外部 python 依赖（缺失环境 fail-closed 带安装指引——本机为开发验证安装 pyshacl 0.40.1）；严格语言匹配制：带 lang 术语不命中语言未定义条目（语言未定标签由不带 lang 的术语查询）。

## 验收与证据

- 全量回归 **590 项（589 过/1 skip=pytest 守卫）**，`evidence/v1.22.0/regression.txt`；
- 发行包 `dist/quality-gate-1.22.0.zip`：**707 文件**，SHA256 `815f03bbc52fc98041855fc693477cd9826e3557408bd569681e31aa13c50b26`（两次构建全同）；解包复验＝版本 ×3 相等＋三 demo 包内核 PASS（shacl-engine-demo 用**随包适配器**相对路径全链路 run=a93cc95），见 `evidence/v1.22.0/`；
- 根门禁：G-CONVENTIONS 对全部新文档文本 PASS；G-TESTS 墙钟超时为 v1.21.1 已记录过渡事项（客户端更新三步序列待执行，见 PLAN 未了事项）。

## 版本边界

- 客户端实机验收 **v1.21.0/v1.21.1/v1.22.0 同轮待做**（1.21.x 过渡三步先行：更新→新会话→根配置 45000；随后按夹具四步＋新声明断言[深度匹配/引擎组件六类/自报矛盾 fail-closed/多语言三态]）。
- 路线位置：**C6 上完成**；下一轮 v1.23.0=C6-2（semantic-alignment 推理深化＋本体提案/例外双人核准工作流——RTM L3.7→达成），再后 v2.0.0 收尾终审轮。
- 范围红线不变：R13/编排、签名+CI 永久出范围；1.8.0 裁剪项不回潮。
