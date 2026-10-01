# L3 机制复审（2026-09-27，对照 v1.9.0/v1.10.0/v1.11.0 落地现状，只增归档）

> 评审性记录，本轮未改 L3 代码。首轮 L3 评审见
> [MECHANISM-REVIEW-2026-09-26.md](MECHANISM-REVIEW-2026-09-26.md) L3 节；本复审按同三问格式，
> 只回答"哪些敞口已被 v1.9.0（W3/W5）、v1.10.0（E3/topology）、v1.11.0（B1/R12/E 系）闭合、
> 哪些仍开放"。范围：journey/behavior/visual/property 与 semantic-* 八类（terminology 归 L3 目录
> 一致性，随 semantic 节评述）。

## 三问复审

**（a）如何实现——未变的骨架**：12 kinds 三代理结构未变（运行时形状 journey/behavior/visual、
运行时性质 property、语义身份 semantic-*×8+terminology）；判定独立性维持全框架最高——内核做
diff（lib/diff.mjs 共享）、谓词求值（lib/assertions.mjs 与 invariant 同源）、F2P/P2P 方向审计、
固定 seed、字节哈希比较。v1.9.0 只加了修饰层（baselineSource/mode/origin 声明协议），v1.11.0 的
B1/R12 未触及 L3 门禁本身（R12 把 L3 的行为/性质用例数纳入证据力定量呈现——可见性增强，非信任增强）。

**（b）可信度与敞口——逐项对账**：

| 首轮敞口 | 现状 | 判定 |
|---|---|---|
| C1 语义门禁绑定注解非行为 | W5 落地 `origin:annotation\|runtime` + `requireRuntimeOrigin`：符号须有运行时来源绑定且与期望 IRI 一致 | **部分闭合**：证的是"该符号在运行时被绑定到该 IRI"，绑定本身仍声明驱动——一致地错绑到错误 IRI 仍过；最后一公里（注解↔实现语义等价）仍由作者纪律闭合 |
| C2 behavior baselineActual 自报 | W3 落地 baselineSource 协议：git 型内核 rev-parse 核验 ref 真实性，embedded 降权，`baselineMode:git` 强制 | **部分闭合**：ref 真实性已核验，基线内容的**执行结果**仍 runner 自报（内核不重放基线实现） |
| C3 actual 自报（伪 runner 回显 expected 可过） | B1（v1.11.0）仅覆盖 L1.3 unit 计数（rawOutput 内核解析）；behavior/journey/property 的 actual 观察**仍自报** | **开放**：L3 无 raw-output 等价物（见改进候选） |
| C4 visual 无浏览器截图 | 未变；基线保护仍靠 change-scope protectedPaths | **开放**：浏览器驱动属"生产工具接入"候选（runner 协议已就绪，是项目工程） |
| C5 property 固定 seed 非穷尽、无 shrink | 未变 | **设计边界**（如实声明，非缺陷）：seed 确定性保证可复现，不保证穷尽 |
| C6 RDFS 子集非 OWL、单语精确匹配、无双人核准 | 未变 | **开放**（PRD §7 业务语义深化候选，未排期） |

**（c）域判断题——"系统实际行为是否符合业务世界"现在能回答什么**：对**已声明的期望**，
L3 给出全框架最强的内核判定（含方向审计与运行时来源绑定）；声明面之外仍静默（与 L0"未登记
需求"同构的声明边界）。B1 之后测试计数一层已去信任，但 L3 的"actual 观察数值"层仍依赖 runner
诚实——**L3 的信任残差从"计数+内容双自报"收敛为"仅内容自报"**，收敛来自 W3/W5/B1 三处叠加。

## 改进候选（供后续版本选择，未排期）

1. **behavior/journey 的 raw-transcript 等价物**（B1 的 L3 延伸）：runner 落盘结构化用例转录
  （请求/响应/步骤时序原样），内核重放 diff——把 C3 从"开放"推到"部分闭合"；规模与 B1-T2 相当。
2. **baseline 内容执行核验**：`baselineMode:git` 下内核以 `git show <ref>:<file>` 取基线实现并
  重放（behavior-demo 已有双跑先例，可内核化）——闭合 C2 残余。
3. visual 浏览器 runner 经生产工具接入（协议侧已就绪）。
4. C6 业务语义深化（完整 OWL/SHACL、多语言、双人核准）——PRD 候选区。
