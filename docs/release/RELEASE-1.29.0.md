# RELEASE-1.29.0（2026-10-06，评审后续推进——七工作包：内容级核验/真实故障/真实测量/像素重算/组合验证/子集显式化/延迟分布）

## 主线：2026-10-01 审查"通往无条件宣布"的仓内可推进项（用户经选项卡选定三工作包全量）

上轮差距分析（评审 F01–F11 与展示差距已清零后）确认剩余差距集中在"自报→实测"与组合验证。本轮七个工作包落地：**W1+W7+W8 小件批、W2+W3 真实测量双件、W4+W6 视觉与语义验证**。37 kinds 不变；除 W6 修复的传递自环缺陷外判定语义不变（该修复只把此前误报 missingRelation 的正确推导转为满足）。

## 变更清单

1. **W1 documentation 内容级核验**：`requireContentCheck:true` 下内核实读四类制品内容验证 `requiredTopics` 逐个出现与版本串出现；可选 `requiredContent:[{id,role,contains}]` 逐条关键字段字面量核验。自报 topics/version 不再是唯一依据——伪 runner 撒谎、内容陈旧、关键字段缺失均按制品 FAIL 指名。CONFIG-GUIDE 选项表＋jsonc 样例同步。
2. **W2 真实进程故障参考 runner**（`examples/resilience-process-demo`）：service.mjs 为独立 HTTP 子进程；故障＝真实进程终止（kill），恢复＝监督者真实重启＋真实健康轮询计时，signals 来自子进程真实日志。负场景 `process-kill-no-restart` 终止后不重启，观察窗口（3 秒）内端口确无响应——**时间不可伪造反证**：伪 runner 谎报 ready 时 recoveryMs≥真实窗口仍超预算 FAIL。
3. **W3 依赖图真实测量**（`examples/architecture-dependency-demo`）：runner 扫描 src/ 真实 .mjs 静态 import 说明符构建模块图，按 layers.json 声明计算违规方向数（forbiddenDependencies）与环数（cycles，DFS 三色标记）；`QGATE_SCENARIO=violation/cycle` 注入真实违规文件（core→ui 方向／a↔b 互引），检出即 FAIL，finally 清理。测量边界＝静态 ESM 相对 import（动态引用/外部包明示）；R13 拓扑推导不回范围。
4. **W4 像素差内核重算**（`lib/png.mjs`＋visual 门禁）：容差模式且两侧为 PNG 时内核自行解码（声明子集＝8 位 RGB/RGBA、非隔行、≤6400 万像素；越界或维度不一致 ERROR fail-closed）并重算 `diff`；runner 自报仍在时交叉核验（不符即 ERROR——B1 声明即核验模式），未自报则直接采用内核值；非 PNG 维持自报协议。证据新增 `diffSource`。
5. **W6 OWL/SHACL 组合性质测试**（`tests/owl-shacl-combinatorial.test.mjs`）：22 个固定种子 OWL 用例（子属性 DAG×传递×互逆随机组合，每次内核 run 打包多条期望）＋120 组 SHACL 组件矩阵（值类型/枚举/pattern/长度/范围/languageIn/closed/深匹配×{value,lang}），以独立实现的朴素 oracle 对照内核判定。**发现并修复内核缺陷**：semantic-relation 传递满足的链可达 BFS 把起点预置入 visited，`from===to` 期望（传递属性上 a→b＋b→a 应推得 P(a,a)）永远误报 missingRelation；修正为从起点出边出发的可达闭包（自环须真实环回）。
6. **W8 OpenAPI 声明子集提取器**（`adapters/openapi/extract-contract.mjs`）：真实 OpenAPI 文档→alignment 期望 items 协议；子集＝3.0.x JSON、五方法、application/json 字段枚举、parameters 并入 requestFields、字典序最小 2xx；$ref/非 JSON 媒体/YAML/无 2xx 越界即退出码 3。alignment-demo 增 openapi.json，提取输出与既有手写期望逐字段等价（测试锁定）。
7. **W7 延迟分布多轮计时**（`devtools/measure-timing.mjs`）：对根项目重复执行 CLI release 并支持 busy 负载注入；本轮实测 5 常规轮 20.7/21.3/21.4s＋2 负载轮 21.6/21.8s（全 PASS，G-TESTS 60 秒预算内）——多轮分布取代单点计时，仍不作为长期保证。

## 验证

- 全量回归 **653/653 PASS、0 SKIP**（635＋新增 18：documentation×4、resilience×3、metrics×3、visual×4、owl-shacl-combinatorial×2、reference-adapters×3 减去重排）。
- 新 demo 冒烟：resilience-process-demo close PASS（真实恢复 ~0.2s）；architecture-dependency-demo close PASS，violation/cycle 场景 FAIL 且注入文件清理干净。
- 根 CLI release 含完整回归（门禁内 ~20s）；构建解包复验见"版本与证据"。

## 边界与注记

- L2.2（真实 ORM/多方言）、L3.4（跨渲染环境基线治理）、L3.5（AC 独立验收绑定）保持"部分"且证明边界如旧；效果类宣称（错误放行率/接入成本/修复轮数）仍待真实项目接入基线——这是"无条件宣布全部预期效果达成"的剩余关键路径。
- W6 oracle 与内核为两套独立实现，同构风险如实登记（oracle 错误形态本轮已出现两次并被定位为 oracle 自身缺陷：Set.add 恒真值死循环、自环捷径；内核侧发现一处真实缺陷并修复）。
- 像素"相等"定义＝RGBA 逐字节相等（无逐通道容差），容差在门禁层 maxDiffPixels/maxDiffRatio——声明边界。

## 版本与证据

- 版本 ×3 → 1.29.0（package.json / .zcode-plugin/plugin.json / marketplace.json）＋插件 README 版本行 ×2。
- zip `quality-gate-1.29.0.zip` 516 文件，SHA256 `f997c65b9ba9ef51a1becbbd48b9be486227722b5590132631c5f08320491a34`；解包复验 653 测试 653 PASS 0 SKIP＋27 demo PASS（含两个新 demo 冒烟）。同日按用户决定将 `experiments/`（效果实验材料与封存评分键）转为本机产物：git 取消跟踪并移出交付包（587→516 文件），RTM/PLAN 中实验报告链接自此指向本机留档（与 evidence/ 同口径）。
- 根 CLI close（G-CONVENTIONS PASS＋G-TESTS 阶段跳过）与 release（G-TESTS＋G-CONVENTIONS 2/2 PASS）均过；marketplace 快照已重镜像至 1.29.0（待客户端"更新"）。
- 逐项验证记录见 `evidence/v1.29.0/`（全量回归、计时分布常规＋负载、9 示例、构建解包、marketplace 同步）。
