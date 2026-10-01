# ADR-0006：内建 OWL 子集推理 fail-closed，外部 reasoner 只做一致性核对

- 状态：已接受（v1.4 L3.7 收口时定案）
- 日期：2026-09-25

## 背景

semantic-alignment 需要子类包含与互斥判定。引完整 OWL 推理机意味着大依赖与不可控的开放世界语义；完全不做又无法发现"MultilateralContract⊥BilateralContract 经子类传播冲突"这类真实错误。外部 reasoner 的结论能否被采信也是问题。

## 决策

1. 内建**纯 JS 的 OWL 子集推理**：subClassOf 传递闭包 + disjointWith 沿继承传播；目录自相矛盾（互斥⊕子类包含、菱形）在 provider 构建期即抛错（fail-closed）。
2. `semantic-consistency` 的外部 reasoner 仅用于**双实现一致性核对**：内核经 stdin 发送事实，双方结论不一致即 ERROR；**内核不采信外部单独声称的结论**，reasoner 增强不增加内建规则之外的推理能力。

## 后果

- 正面：零依赖下的可判定子集；双实现分歧可见；边界诚实（不冒充完整 OWL/SHACL）。
- 负面：属性/关系级推理、多语言术语、未声明同义词均不在能力内（RTM L3.7 后续）。

## 备选方案

嵌入 elk/hermit 类推理机（拒绝：依赖与语义面失控）；信任外部 reasoner 结论（拒绝：违反确定性优先）。

## 关联

[ADR-0004](ADR-0004-deterministic-first.md)、[ADR-0005](ADR-0005-replaceable-ontology.md)、[history/RELEASE-1.4](../release/RELEASE-1.4.md)
