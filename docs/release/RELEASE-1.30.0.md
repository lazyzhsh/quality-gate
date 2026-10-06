# RELEASE-1.30.0（2026-10-06，二轮评审修复——六组实现问题收敛：预算完整性/缺证据语义/反向认可/PNG 结构与透明/依赖提取/提取器 fail-closed）

## 主线：第二轮全项目审查（evidence/project-review-2026-10-06）六组实现问题按 P1→P2 分阶段收敛

审查基线 1.29.0（main 3f0f95c）确认六组实现问题：P1×3（F01 登记内 runner 绕过执行预算、F02 requireLive 缺失 mode 放行、F03 同谓词反向被当认可）＋P2×3（F04 PNG tRNS/结构防线缺失、F05 依赖提取漏副作用 import 且误计注释、F06 OpenAPI 提取静默通过子集外输入）。本版两阶段修复：每个问题保留评审输入为负例、补邻接正例后再改内核/参考 runner/规范——不通过缩小 AC、放宽阈值或静默跳过修复。37 kinds 不变；F02/F03 是判定收紧（此前被错误放行的输入现在 FAIL/ERROR），其余为防线补全。

## 变更清单

1. **F01 统一执行预算（P1）**：新增 `lib/execution-budget.mjs`——加载登记文件汇总内嵌 runner 预算（conventions.json 的 argv 规则、scope.json 的 `contentCheck`）与顶层声明（timeoutMs/coverage/reasoner/shacl）为同一执行计划；`run()` 统一断言总预算 ≤ 阶段上限与宿主 `budgetMs`，登记不可读/不可解析 fail-closed（预算未知不接受）；`inspect` 的 usedMs 与 run/Stop 同源（含 declared/nested 分解）。宿主预算同时是执行期限：门禁级（kernel 门禁循环）与规则级（runConventionAlignment 逐规则、observeContent）在启动新任务前做剩余期限守卫——不足即停止启动并记 ERROR `budget-exhausted`（不放行为 SKIP），报告新增 `executionBudget` 分解。评审实测反例（3×20000ms argv 规则声明合计 60000ms 而 stageBudget(close)=0、Stop adapter 55862ms 才返回）自此在执行前被拒绝。
2. **F02 requireLive 缺失语义（P1）**：`requireLive:true` 要求显式 `mode:'live'`——static 即 FAIL（既有）；**缺失 mode 同样 FAIL 指名**（`missingObservationMode`：无法区分实时观察与不回报模式声明的旧 runner，缺失来源不比诚实 static 更易放行）；畸形值仍 ERROR；未开启时缺失＝未声明保持兼容。三条消费路径（alignment api/schema、alignment contract-diff、consumer-matrix）共用同一判定（alignment.mjs 导出 `liveModeBlock`），摘要层新增"观察缺少模式声明"原因。
3. **F03 反向认可收紧（P1）**：semantic-relation 的目录认可中，同谓词反向边（B—P→A）不再自动认可正向期望（A—P→B）——反向认可必须存在 inverseOf 声明且声明谓词 D∈super*(inv(P))；对称语义须显式声明 P.inverseOf=P。观察满足层的逆属性判定本就要求互逆，本修复使认可层与之一致（目录对反向主张提供第三方约束的边界如实）。owl-shacl-combinatorial 扩展：反向认可噪声生成（同谓词/互逆/互逆祖先随机）＋独立 sanctionOracle 对照 unsanctionedRelation 集＋覆盖面单向健全性（内核已覆盖观察边必须落在 oracle 满足路径上）＋verdict 一致性。
4. **F04 PNG 结构防线与透明语义（P2）**：`lib/png.mjs` 重写——逐 chunk 长度边界与 CRC32 核验、IHDR 首位恰一次、IDAT 连续、IEND 存在且为末尾（其后字节即损坏）、未知关键 chunk（规范大写首字母）拒绝（不认识的扩展可能改变像素解释）、`inflateSync maxOutputLength` 锁定期望行容量且解压长度须精确相等；RGB 真彩色 tRNS 透明键正确展开（键色像素 alpha=0、位深 8 取低字节），RGBA 携带 tRNS 即 ERROR（规范禁止），tRNS 长度校验。Pillow 独立解码器交叉核验一致（(10,20,30,255)/(10,20,30,0)——方法同评审 png-independent）。像素相等＝解码样本字节相等，不做色彩管理（声明边界）。
5. **F05 依赖图提取收敛（P2）**：architecture-dependency-demo runner 以逐字符状态机（行/块注释、单双字符串、模板字面量含 `${}` 嵌套、正则字面量启发式跳过）分类源码后，仅在代码区域识别三类静态引用：命名/默认 import、**副作用 import**、**export-from**。注释与字符串里的 `from '…'` 不再误计为依赖（评审 ARCH-COMMENT：注释形态曾误报违规）；副作用 import 与 export-from 不再漏计（ARCH-SIDE-EFFECT：core→ui 副作用引用曾放行）；副作用边参与环检测。未解析到测量模块集的静态引用计入报告性指标 `unresolvedImports`（无阈值）；动态 import()/外部裸包仍为声明边界。
6. **F06 OpenAPI 提取器 fail-closed 补全（P2）**：path item 的子集外操作（head/options/trace/connect）与未知键退出 3 指名（不再静默丢操作）；schema 组合关键字（allOf/oneOf/anyOf/not）退出 3（不再静默展开为空字段表）；消费子树**任意深度** `$ref` 深扫退出 3（覆盖 parameter.schema.$ref）；参数按 OpenAPI 语义以 name+in 覆盖合并（operation 覆盖 path 级、占 path 槽位——不再拼接 `['q','q']`），同级 name+in 重复退出 3；输出自带 `kind:'api'` 可直接作为 alignment.file 期望制品；新增端到端测试：真实声明→提取→直接消费 PASS→声明漂移后重提取 FAIL 指名差异（防旧归一化文件继续验证）。

## 验证

- 全量回归 **672/672 PASS、0 SKIP**（653＋新增 19：execution-budget×10、semantic-relation×2、alignment/consumer-matrix/contract-diff 缺失矩阵扩展×3、owl-shacl-combinatorial 扩展断言、visual×2、metrics×2、reference-adapters×2）。
- 评审探针复验（本机独立重跑，13 项全部按规范结果收敛）：P1——BUDGET-NESTED PASS→ERROR（执行前拒绝）、LIVE-MISSING PASS→FAIL、RELATION-REVERSE-SANCTION PASS→FAIL；P2——PNG-TRANSPARENCY PASS→FAIL（diff pixels:1，kernel-recompute）、PNG-MISSING-IEND PASS→ERROR、ARCH-SIDE-EFFECT PASS→FAIL、ARCH-COMMENT FAIL→PASS、OAS-HEAD/NESTED-REF/COMPOSITION exit0→exit3、OAS-OVERRIDE `['q','q']`→`['q']`＋kind:'api'、OAS-DIRECT-CONSUME 由端到端测试承接（PASS→漂移 FAIL）。评审 reproduce.mjs 在 OAS-HEAD 分支不再可跑——该脚本假设 exit 0 正是被修复的缺陷。
- Pillow 12.2.0 独立解码器与内核对 tRNS 样本逐像素一致；受影响 demo（alignment/consumer-matrix/semantic-relation/convention-align/ledger/visual/six-domain）close 全 PASS；根 CLI close（G-CONVENTIONS＋G-DOCS）PASS。

## 边界与注记

- 预算执法范围：CLI 运行（无 budgetMs）只做声明预算校验，不设执行期限——期限执法仅在宿主给出预算时生效（Stop 场景）；engineering/consistency 子检查不属登记内嵌 runner（其门禁级 timeoutMs 已被既有 validate 约束覆盖子检查之和）。
- F02 收紧的兼容面：requireLive 未开启时旧 runner（不回报 mode）行为不变；开启 requireLive 的项目若 runner 未声明 mode，将得到 FAIL 与缺证据指引——这是显式开启的来源约束，不是静默破坏。
- 审查另列的证明链缺口（AC→真实用例身份绑定、来源信号表覆盖 kernel-recompute/contentCheck、transcript 默认裁决）**不在本版**，属下一轮"证明链补齐轮"；G-DOCS 字面包含检查的边界（同文混排/计数漂移不检出）已有记录，维持。
- 1.28.0 起客户端实机验收待新轮（本版未做实机验收；Stop 反例为直接执行 adapter 的本地模拟与单元级期限守卫测试）。

## 版本与证据

- 版本 ×4 → 1.30.0（plugins/quality-gate/package.json、.zcode-plugin/plugin.json、marketplace.json、根配置 G-DOCS version 同步递增）＋入口文档版本串（根 README/PRD 版本基线/HANDOFF/插件 README ×2）。
- 逐项验证记录与评审复现材料见 `evidence/project-review-2026-10-06/`（本机留档）；修复后探针复验输出见本目录各 *.report.json 与提交说明。
- zip `quality-gate-1.30.0.zip` 520 文件，SHA256 `cbce6cefe515e984748863976dde0a09cafd1ddb91b02baacacb2cf0b9bcacfa`；解包复验 672 测试 672 PASS 0 SKIP＋27 demo PASS（构建脚本内置打包冒烟）。marketplace 快照已重镜像至 1.30.0（待客户端"更新"）。
