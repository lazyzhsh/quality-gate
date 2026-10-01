# RELEASE-1.22.1（2026-10-01）

**小迭代补丁：SHACL 组件全集内核原生化（OD-116=默认零外部依赖）**（零破坏；判定语义放宽——原"声明新组件必须接引擎否则 ERROR"的配置现完整可用并正确判定）。

## 背景与裁决

用户问询"使用 pyshacl 是否还需要插件额外安装？"——确认：pyshacl 是 python 第三方包（`pip install pyshacl`），不随插件分发；v1.22.0 的七组新组件（pattern/minLength/maxLength/minInclusive/maxInclusive/languageIn/closed）声明即须引擎，**事实上使该功能依赖外部安装**。**用户裁决（OD-116，2026-10-01）：先降级裁剪掉该依赖——组件全集改为内核原生判定（简化处理），确保默认插件不依赖外部环境工具安装；环境工具就绪时兼容集成使用**（pyshacl 保留为可选第二实现）。

## 内容

1. **组件全集内核原生判定**：七组新组件全部零依赖实现——pattern（正则测试）/minLength/maxLength（字符串长度）/minInclusive/maxInclusive（数值比较）/languageIn（语言标签成员检查，未标注值即违规——与 SHACL 语义一致）/closed（记录属性超出形状声明集逐路径指名）；"声明未接引擎即 fail-closed"检查删除。默认插件零外部安装即可使用全部组件。
2. **pyshacl 降为可选第二实现（OD-114=B 保留）**：`shacl:{argv,timeoutMs}` 配置语义不变（stdin 交付形状/记录/子类边→findings＋conformance，未知记录/未知组件/自报矛盾均 ERROR fail-closed），与原生判定**并集**（任一侧发现违规即 FAIL）。未配置引擎时 details 无 shacl 块——零依赖完整路径。
3. **测试重构（+2 净增，592 项）**：shacl-engine 套件拆两腿——原生腿（**无守卫**，任何环境可跑：全组件合规＋六类逐组件变异指名）与引擎腿（pyshacl 守卫 skip 带指引）；semantic-profile 的 engine-required 用例反转为原生判定用例（合规 PASS＋违规指名 pattern/minLength）。
4. **文档口径同步 ×7 处**：GATE-SPEC v1.22（导语＋尾段）、CONFIG-GUIDE（file 行/shacl 行/边界段）、GLOSSARY（SHACL 引擎协议条目）、RTM（L2.3 行＋§12.2 C6-1a）、双语 README、adapters README——统一为"组件全集内核原生（OD-116 默认零外部依赖）；引擎为环境就绪时的可选第二实现（并集判定）"。

## 证明边界（如实）

完整 SHACL 语义（SPARQL 约束/路径表达式/sh:node 递归等）仍属 pyshacl，仅在接入引擎时生效；内核原生判定覆盖的是 JSON 记录可表达的组件面（与内核翻译给引擎的子集同构）。object 型 valueType 维持近似 nodeKind 口径。

## 验收与证据

- 全量回归 **592 项（591 过/1 skip）**，`evidence/v1.22.1/regression.txt`；
- 发行包 `dist/quality-gate-1.22.1.zip`：**711 文件**，SHA256 `84f1266c24ca304fd1fbcfd6b3f7dfa81e2b681748c3cc977c5fdb4d15825bba`（两次构建全同）；
- 解包复验三腿（包内核）：引擎腿 PASS（pyshacl 就绪）／**原生腿 PASS（移除 shacl 选项——零外部依赖直接证明）**／原生腿＋违规注入 FAIL 指名 `closed/minLength/pattern`，见 `evidence/v1.22.1/`。

## 版本边界

- 客户端实机验收 v1.21.0–v1.22.1 同轮待做（快照随本版同步 1.22.1；先完成 v1.21.1 过渡三步）。
- 路线位置：小迭代补丁（C6-1 语义不变）；下一轮 v1.23.0=C6-2（推理深化＋双人核准——L3.7→达成）。
- 范围红线不变。
