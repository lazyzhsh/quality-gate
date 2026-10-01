# Release 1.11.0 — 原始证据内核解析 + E 系列适配（B1/E5/E7 + L3 复审）

发布日期：2026-09-27。主线经用户 2026-09-27 AskUserQuestion 选定（"完成 B1 和 E 系列其余"）；**零破坏**：所有新字段可选、默认不启用，旧配置与旧 runner 输出零迁移；GATE-SPEC-v1.11 现行（v1.10 归档 history）。

## 新增

### B1 原始证据内核解析（L1.3 去信任化）

- **新共享 `lib/raw-evidence.mjs`**：TAP 与 JUnit XML 两个无第三方依赖解析器（纯函数、fail-closed）。TAP 面向 node --test 真实输出（任一缩进测试点、`# SKIP`/`# TODO` 指令计 skipped、describe suite 点经 YAML `type:'suite'` 识别且不计入测试数、逐缩进层级 plan 互核、工具自产摘要注释与逐点计数互核、`Bail out!`/零测试点/空文本拒收）；JUnit XML 面向 pytest/surefire/gradle 标准形状（testsuite 属性求和与逐 testcase 子元素推导互核、多 testsuite 求和、属性缺失/矛盾拒收）。fixtures 全部为真实工具产出（node --test 平铺与嵌套、pytest junitxml——pytest 于一次性 venv 隔离安装生成，来源记录在 `tests/fixtures/raw/fixture-provenance.txt`）。
- **engineering unit 观察可选 `rawOutput:{format:'tap'|'junit', file}`——声明即核验**（先例 E4/AF）：内核读取原始测试输出文件（projectFile 防逃逸）、自行解析重算 total/passed/failed/skipped 并与 runner 自报交叉核验，**不符即 ERROR fail-closed** 并指名逐项分歧（如 `passed reported 4 but raw file says 2`）；核验一致后**判定计数即内核重算值**；证据记录 `rawOutput:{file,format,parser,计数,caseCount,crossCheck:'match'}` 并计入摘要"证据力·锚点：原始输出解析"。
- **门禁级可选 `requireRawOutput:true`**（内核校验布尔）：开启后 unit 观察未声明 rawOutput 即 FAIL 指名"缺少原始测试输出——自报计数未经内核解析"；显式 `false` 保留旧语义。畸形声明（未知格式/多余字段）、文件缺失、路径逃逸、原始文件结构矛盾均 ERROR。
- engineering-demo 随版启用（runner 落盘原始 TAP 并声明 + 配置开启 requireRawOutput）：close PASS 呈现"锚点 原始输出解析 1"。

### E7 Java/Python 参考适配器（`plugins/quality-gate/adapters/`，随包分发）

- **`python/unit_runner.py`**：pytest 包装 runner——stdin 收 qgate 请求并回显 runId，本地跑 `pytest --junitxml`，自 testsuite 属性求和自报计数并声明 rawOutput；退出码恒 0（观察协议：测试失败由内核按计数判定）。附 `test_sample.py`（2 过/1 跳/1 败）。
- **`java/merge-junit.mjs`**：surefire/gradle 报告合并 runner——把目录下全部 `TEST-*.xml` 合并为单 `testsuites` 文件，复用内核解析器自检计数后自报并声明 rawOutput；附按 surefire schema 手写的样例（provenance 注释如实标注）。
- `adapters/README.md` 接入指引（runner 协议、requireRawOutput、缺失工具安装指引、"参考实现非认证工具"边界）。

### E5 Entity↔ORM persistence 参考形态

- **`python/persistence_orm.py`**：persistence 参考 runner 的 SQLAlchemy 2.x 形态——before/after 快照与落库记录均取自 ORM 会话（after 用全新 session 独立回读，即 ADR-0013 的持久化独立回读），correlation `id=$RUN_ID` 防重放；E3 快照默认强制协议不变，**内核零改动**；request 以 `orm://` 方案如实标注进程内写（真实项目应回报其真实 API 调用）。

### E6 API 消费者链层（协议设计完成，实现待确认）

- 现状盘点 + 推荐方案（alignment 第四分支 `scope:"consumer-matrix"`：多消费者期望声明、内核逐消费者 contract-diff 同源比对出兼容矩阵与破坏归因表）已落 [PLAN.md](../PLAN.md) T6 节；**经用户确认方向与消费者使用面来源约定后实现**，未确认前不写代码。

### L3 机制复审 + 首轮六域评审归档（评审性，不改代码）

- 首轮六域机制评审记录（2026-09-26，驱动 v1.9.0 W1–W5）归档 [MECHANISM-REVIEW-2026-09-26](../history/MECHANISM-REVIEW-2026-09-26.md)；L3 对照 v1.9/v1.10/v1.11 落地现状复审归档 [MECHANISM-REVIEW-L3R-2026-09-27](../history/MECHANISM-REVIEW-L3R-2026-09-27.md)：C1/C2 部分闭合（origin 运行时绑定 / baselineSource ref 核验）、C3 经 B1 收敛至"仅内容自报"、C4/C5/C6 开放或设计边界；改进候选 4 项供后续版本选择。

## 验证

- 407 项回归（390→407：raw-evidence 6、engineering 6、adapters 3+1、summary 行为/ORM 信号并入；406 过/0 败/1 skip=本机无 pytest 的守卫跳过，附安装指引）；CONFIG-GUIDE 选项表+jsonc 样例同步（config-guide 测试过）；GATE-SPEC-v1.11 现行（v1.10 归档）；RTM §8 行转原生、§9 刷新。
- **真实工具端到端取证**（一次性 venv）：python 适配器 direct 调用 4 测试 2/1/1 退出 0；内核级 FAIL 旅程 run=3bf30911（内核独立解析 junitxml 指名"unit: 1/4 个测试失败"，交叉核验通过）；PASS 旅程 run=3853cf3（"证据力: 锚定 · 锚点 原始输出解析 1 · 定量 测试 3/4（跳过 1）"）；ORM persistence 内核级 PASS run=5577d80（"锚点 持久化快照 1"）——见 `evidence/v1.11.0-t3-python-adapter.txt`、`evidence/v1.11.0-t5-orm-persistence.txt`。
- 打包：`quality-gate-1.11.0.zip`（515 文件，SHA256 2d249fa622ee6a52ddbbf4176ab6685e66a800f3ac09db682fd65381bb7dca2e）解包复验全量测试+烟测通过，见 `evidence/v1.11.0-unpack-verify.txt`。

## 边界

B1 解析器保证的是**计数与原始输出自洽**，不防蓄意伪造内容一致的原始文件（运行时绑定仍是 runner 诚实性问题）；覆盖率原始解析（cobertura/istanbul）不做，仍走 baselineSource 协议；rawOutput 默认强制留候选（E3 先例）。E7 参考适配器非认证工具，Java 侧无 JDK 环境以样例+内核单测验证、不声称真实 Maven/Gradle 链实测。E5 示范观察协议非 ORM 认证。客户端实机验收（1.10.1/1.11.0）待下一轮次。

下一轮候选：E6 实现（待确认方向）、L3 复审改进候选（behavior/journey raw-transcript、baseline 内容内核重放、visual 浏览器接入、C6 语义深化），见 [PLAN](../PLAN.md) 与 [MECHANISM-REVIEW-L3R-2026-09-27](../history/MECHANISM-REVIEW-L3R-2026-09-27.md)。
