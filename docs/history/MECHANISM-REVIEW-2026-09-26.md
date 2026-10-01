# 六域机制评审记录（首轮，2026-09-26，只增归档）

> 溯源：本记录归档自 2026-09-26 的逐域机制评审会话（用户逐域三问：如何实现 / 可信度+敞口 /
> 域判断题），当时以会话记录形态存在、未归档；2026-09-27 按原结论整理归档（评审性，未改代码）。
> 本轮总敞口清单直接驱动了 v1.9.0 工作包 W1–W5（RTM §6）。按归档惯例只增不改。

## L0（assumptions/decisions/change-scope/traceability）

- **定位结论**：L0 = 登记完整性与一致性核验器，非意图比对器——对草率 agent 强，对策略性 agent 弱。
- **确认的强项**：两阶段内核排序（常规门禁→assumptions→decisions→debt→traceability→readiness）使
  testGateIds 引用同运行真证据；runId 回显防重放；fail-closed 默认；shell:false / baseRef `-` 守卫 /
  路径逃逸 / realpath 核验。
- **敞口清单**（编号沿用 v1.9 规划轮 A/B/C/D 系）：A1 需求级完备性未核验（漏登记的需求仍 PASS，
  PRD 绑定是自由文本）；A2 requiredTypes 自选+类型标签自报；A3 coverage runner 可选（codeFiles 仅存在性）；
  A4/A5 空登记真空过（assumptions 无下界）；A6 decisions 纯文本 evidence 放行；A7 allowDeferred 无期限；
  D1 allowedPaths 自 widening 不可见（登记目录默认被 change-scope 自身排除）；D2 baseRef 未锚定
  （可前移清空 diff）；D3 语义超范围需 contentCheck 配置；D4 rename 只报目标侧（源侧删除逃逸确认）。
- **处置**：A4/A5/A6/A7 → W1；D1/D2/D4 → W2；A1/A2 → W4（prdRef/requirePrdRefs/defaultRequiredTypes）；
  D3 → v1.9.1 E4。A3、D1 残余部分仍开放（见 v1.11 复审）。

## L1（command/engineering）

- **定位结论**：L1 答案 = 协议核验为真 × 适配器接入为真；L1.2 build 是唯一零信任检查（内核独立
  re-stat + re-hash 制品 sha256）。
- **强项**：unit 计数算术恒等式（拒 0 测试真空过）；F2P/P2P 方向审计（伪修复防护）；覆盖率
  ratio×counts 交叉核验 ±0.005；超时预算 Σchecks ≤ 门禁 ≤40s。
- **敞口**：B1 观察数值完全自报（硬编码 output({total:5,passed:5}) 的适配器可过 L1.3——算术一致性
  防不一致不防合谋）；B2 F2P/P2P baselineStatus 亦自报；B3 变异集合项目自选（变异充分性未测）；
  B4 requiredChecks 白名单自报；B5 exit 型任何退出 0 脚本都过；语言/环境：只有 Node 参考适配器，
  Java/Python 零示例。
- **处置**：B1 → v1.11.0 B1 原始证据内核解析（rawOutput 声明即核验）+ E7 Java/Python 参考适配器；
  B2/B3/B4/B5 仍开放。

## L2（alignment/semantic-profile/persistence/invariant/consistency）

- **定位结论**：L2 = 全框架去信任化最深的域（四个内核独立性机制：$RUN_ID 绑定、快照交叉核验、
  审计链内核重算、零和借貸内核重算）；真实数据段最强。
- **敞口**：8.1 API 对齐 route+响应字段表粒度，无 DTO/Client/Consumer 链层，观察真实性自报；
  8.2 Entity↔ORM 层无适配器；8.3 自认非 SHACL 引擎；8.4 快照当时还是可选（设计偏差）；
  8.5 invariant 操作数值自报、append-only mutations 自报、无跨服务事务。
- **处置**：8.4 → E3 快照默认强制（v1.10.0）；append-only 来源 → W3 sourceType 枚举+降权；
  观察端指纹 → v1.9.1 AF；8.1 Consumer 链层 → E6（v1.11 设计先行）；8.2 ORM → E5（v1.11 参考
  形态）。其余仍开放。

## L3（journey/behavior/visual/property + semantic-* 八类）

- **定位结论**："系统实际做的事是否符合业务世界"拆成三个可机检代理：运行时形状（journey/behavior/
  visual）、运行时性质（property）、语义身份（semantic-*）；判定独立性全框架最高（内核做 diff/
  谓词/哈希/方向审计）。**对已声明的期望给最强内核判定；"业务世界"本身沉默——代理到世界的残差
  由作者纪律闭合，不由 L3。**
- **敞口**：C1 语义门禁绑定注解而非行为（代码标 Payment 实现 refund 不可见——最后一公里无桥）；
  C2 behavior baselineActual 自报（内核不能对真实 git worktree 验证）；C3 actual 自报（伪 runner
  回显 expected 可过）；C4 visual 无浏览器截图（基线保护靠 change-scope）；C5 property 固定 seed
  非穷尽、无 shrink；C6 RDFS 子集非 OWL、单语精确匹配、无双人核准。
- **处置**：C1 → W5 部分闭合（origin:annotation|runtime + requireRuntimeOrigin）；C2 → W3 部分闭合
  （baselineSource 协议：ref 真实性核验，内容执行仍自报）；C3 → B1 仅覆盖 L1.3 计数，L3 actual 仍自报；
  C4/C5/C6 仍开放。最杠杆收敛方向（当时提出）：semantic↔behavior 桥、baselineActual 来源证明。
  **2026-09-27 复审见 [MECHANISM-REVIEW-L3R-2026-09-27.md](MECHANISM-REVIEW-L3R-2026-09-27.md)。**

## L4/L5（metrics/scan/resilience/budget/rerun/topology、configuration/documentation/debt）

- **范围排除（用户决定，当日）**：L4.2 非功能阈值、L4.4 dependency/secret/iac、L4.5 DAST、L5.2 迁移、
  L5.4 operational readiness、L5.7 releasePackage——后经 v1.8.0 整体移除出程序。
- **评审范围**：L4.1 架构适应度（metrics 承载用户四原则+R5 灰度判定协议）、L4.3 可观测、L4.6 韧性
  （requiredTransitions 精确匹配+演练新鲜度）、budget 纯内核算术、L5.1 配置多环境纯内核键比较、
  L5.3 文档四角色、L5.5 debt、L5.6 decisions 两阶段闭合（L0 allowDeferred → L5 强制全闭合）。
- **新发现敞口**：debt 空登记真空过（与 assumptions 同形）→ W1；metrics provenance:declared 拓扑
  非真实依赖图、resilience 生产采集/告警投递未验、configuration 只读 JSON 非活配置、秘密按键名正则。
- **追责答案**：owner/when/evidence + runId 同运行绑定 + qgate report 重放 = 追责最强；跨运行
  priorRuns 哈希链在排除域 L5.7 中（后随 v1.8.0 移除）。

## 六域总结

三大声明式信任锚（登记完备性 / runner 诚实性 / 注解=行为）+ 两处空转过（空 assumptions/空 debt）
+ 两处自指软化（allowedPaths/baseRef、requiredChecks 白名单）；收敛优先级提案后经用户选定 W1–W5
全部落地（v1.9.0）。遗留开放项见上各节"处置"标注与 RTM §9。
