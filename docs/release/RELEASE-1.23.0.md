# RELEASE-1.23.0（2026-10-01）

**主线：C6-2 语义深化·下——OWL 推理深化·确定性子集更大集（RTM L3.7→达成）**（来源：[original-design-v0.9](../context/original-design-v0.9.md) §33 后续候选 C6；37 kinds 不变，零破坏）。

## 首日裁决（2026-10-01 经 AskUserQuestion 逐轴利弊）

- **Q1=C 更大集**（用户覆盖推荐 A 等价类＋子属性）：equivalentClass＋subPropertyOf＋inverseOf＋unionOf 四件套全上——取向=推理覆盖面优先，全部限定在确定性子集内（无开世界假设/反例推理）；
- **Q2=双人核准取消**（用户裁决移出范围）：路线图 v1.23 的"本体提案/例外双人核准工作流"整项撤销——单人审批语义（approvedBy＋时间窗）与提案-确认-pin 工作流维持现状；L3.7 边界项随之修订；Q3（协议形状）随之失效不实施。

## 内容

1. **等价类 `equivalentClass`**：目录概念可声明等价（**单边声明即对称**——物化进扩展包含图）：等价类互达（subsumptionPath/闭包对 semantic-alignment 的 subsumed 匹配透明）、互斥沿等价传播（A⊥B 且 B≡C ⇒ A⊥C）、建时矛盾 fail-closed（A≡B 且 A⊥B）；语义分野有专测：X⊥A＋B≡A 合法（仅推断新增互斥对，非矛盾）。
2. **并类 `unionOf`**：并类概念＝操作数之并——物化为操作数父类（操作数⊑并类），并类互斥传播到操作数；操作数/等价目标未知即建时 fail-closed。
3. **属性注册表 `catalog.properties`**：`[{predicate, subPropertyOf?, inverseOf?, transitive?}]`——subPropertyOf 须 DAG（环建时 fail-closed）；逆属性单边声明即双向；`superProperties` 闭包助手暴露给门禁。
4. **semantic-relation 推理满足判定**：期望 P(a,b) 被观察满足当且仅当——直接/子属性（观察 Q(a,b) 且 Q⊑*P）或逆属性（观察 Q(b,a) 且 Q,P 互逆）或传递链（P 或其祖先声明 transitive 且存在观察链 a→…→b，链上边谓词闭包含 P）；链上边记已覆盖（未覆盖观察边＝undeclaredRelation）；本体认可扩展（目录声明更强属性认可更弱主张 D⊒P＋to 概念互逆反向声明）；推断满足入 `details.inferred`（via＋trail 位置链——十秒可判）。
5. **semantic-alignment/consistency 经 provider 免费继承**：subsumed 匹配走等价/并类链、互斥传播、建时矛盾检查——既有 52 项语义套件零回归。
6. **demo＋测试**：owl-reasoning-demo（双门禁：传递链＋逆属性满足的关系推理腿＋等价/并类 subsumed 的绑定推理腿；45→46 示例）；tests/owl-reasoning 10 项（正例＋六负例＋三建时 fail-closed＋助手）。
7. **文档**：GATE-SPEC v1.23（v1.22 归档）；CONFIG-GUIDE（semantic-relation 推理满足判定＋目录 schema）；GLOSSARY 登记"确定性 OWL 子集（推理深化）"；RTM L3.7→达成（36 项：原生 17／部分 8）＋§12.3；PLAN/PRD/双语 README＋路线图双人核准移出范围修订。

## 证明边界（如实）

确定性 OWL 子集——无开世界假设、无反例/逆否推理、无 unionOf 外的类表达式（intersection/枚举/属性约束不出）；等价不合并术语标签（terminology 仍按 IRI 词表精确匹配）；传递推理仅沿观察链前向可达（不合成未观察的中间边）；推理深度以目录声明为界（不导出声明闭包之外的新关系谓词）。

## 验收与证据

- 全量回归 **602 项（601 过/1 skip=pytest 守卫）**，`evidence/v1.23.0/regression.txt`；
- 发行包 `dist/quality-gate-1.23.0.zip`：**721 文件**，SHA256 `db9b343cfb006567501c2ba5816312edae6636ea000fb3edd9ebb4e3114562df`（两次构建全同）；解包复验＝版本 ×3 相等＋owl-reasoning-demo 正例 PASS（2/2）＋断链负例 FAIL 指名（包内核），见 `evidence/v1.23.0/`；
- 根门禁 G-CONVENTIONS **第六次实战命中**：本版 PLAN 状态段自写"锚定"（动词义弃用词）——当即改写"专测区分"并补提交。

## 版本边界

- 客户端实机验收批次更新为 **v1.21.0–v1.23.0 同轮待做**（先完成 v1.21.1 过渡三步：客户端"更新"→新建会话→根配置 G-TESTS 45000 销墙钟事项）。
- 路线位置：**C6 语义深化上下全部完成**——RTM 仅余 v2.0 终审目标（剩余"部分"行边界即达成终审、transcript 强制化默认裁决、RTM 终版清算）。
- 范围红线不变：R13/编排、签名+CI 永久出范围；双人核准移出范围（2026-10-01 用户裁决）。
