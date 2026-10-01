# L3 机制复审追加（L3R2，2026-09-28 v1.13.0 落地后对账，只增归档）

> 评审性记录，随 v1.13.0 收口。承接 [MECHANISM-REVIEW-L3R-2026-09-27](MECHANISM-REVIEW-L3R-2026-09-27.md)；
> 本轮只回答"其改进候选 1/3 落地后，L3 各敞口状态如何变化"。本轮改动了 L3 代码（T2/T3/T4），
> 评审对象是落地后的现状。

## 敞口对账（对照 L3R 表）

| L3R 敞口 | v1.13.0 落地 | 现状判定 |
|---|---|---|
| C3 behavior/journey actual 自报（伪 runner 回显 expected 可过） | T1–T3：观察可选 `rawTranscript` **声明即核验**——自有协议转录形状（当次 runId 绑定，重放旧转录 ERROR）、逐用例/逐步骤交叉核验（含 baselineActual 出现一致性与 journey source 一致性）、判定以转录为准、计入"原始输出解析"锚点；`requireRawTranscript` 可强制 | **部分闭合**：声明了转录的运行，伪 runner 必须**伪造两份内容一致的记录**（stdout 观察 + 磁盘转录）且绑定当次随机 runId——比回显 expected 的成本高一个量级，但蓄意伪造仍不可防（解析器只保证结构与两源一致，边界与 B1 对 TAP/JUnit 相同）。未声明转录的运行保持旧语义（零破坏设计） |
| C4 visual 无浏览器截图 | T4：`adapters/visual/screenshot.mjs` 参考浏览器 runner（零 npm 依赖 headless CLI）+ `visual-browser-demo`（同机 pin 基线）+ KNOWN_TOOLS 登记 | **部分闭合**：真实截图可接入且同机字节稳定（demo 全链路：pin→close PASS→页面变更 FAIL）；跨机字体渲染/抗锯齿差异须重新 pin 基线（demo 风险登记如实）；像素容差需 diff 度量、本参考不实现图像解码；截图"对不对"仍属 runner 诚实边界 |
| C2 baseline 执行结果自报 | 未动（本轮范围外的候选 2） | 开放不变；**其内核重放的交叉核验恰需本轮 transcript 基建**——v1.14 实施时"重放基线实现→transcript 落盘→内核交叉核验"闭环成型，排序上先 1 后 2 成立 |
| C1 注解↔实现语义最后一公里 / C5 property 非穷尽 / C6 OWL 子集边界 | 未动 | 与 L3R 记录一致（C5 为如实声明的设计边界） |

## 本轮三问速记

- **如何实现**：T1 `parseTranscript` 纯函数（无第三方标准可借——自有协议形状 + 14 组畸形矩阵保证自洽，不宣称对齐任何标准）；T2/T3 在 behavior.mjs/journey.mjs 观察层插入"声明即核验"块（与 B1 在 engineering.mjs 的插入点同构）；T4 纯 adapters 层（visual 协议不变、内核零改动）。
- **可信度**：L3 信任残差从"仅内容自报"收敛为"未声明转录者自报、声明者需两源一致且防重放"；`evidenceStrength` 把核验一致计为锚点（原始输出解析），报告可见。
- **域判断**：对已声明期望，L3 的内核判定独立性进一步收紧；声明面之外仍静默（与 L0 未登记需求同构的声明边界，非本轮范围）。

## 遗留与候选

1. baseline 内容内核重放（C2 残余，v1.14 首选——依赖已就绪）；
2. transcript 强制化默认（E3 先例的"可选→默认强制"演进，待多项目使用面积累后评估）；
3. C6 语义深化（PRD 候选区，未排期）。
