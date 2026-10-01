# Release 1.9.1 — 快赢补丁（E4 + alignment 观察端来源指纹）

发布日期：2026-09-26。零破坏补丁（v1.9 规划候选中的快赢两件，经用户 2026-09-26 选定先行）；GATE-SPEC-v1.9 节内扩展（补丁不更名）。

## 新增

- **E4 变更内容级强制**（change-scope，spec 可选 `requireContentCheck: true`）：开启后，受保护路径（protectedPaths 规则命中，**含已确认**——确认覆盖路径变更，内容语义另需内容级检查）发生变更而未配置 `contentCheck` 即 FAIL 指名 `protectedChangedWithoutContentCheck`（摘要"受保护路径变更缺少内容级检查"）；配置了 contentCheck 则由其协议接管（acceptedFindings 语义不变）；未开启时判定语义不变。
- **alignment 观察端来源指纹**（api/schema 与 contract-diff 两分支同构）：观察可选 `sourceFingerprint:{file, sha256}`——**声明即核验**（projectFile 存在性+防逃逸，与磁盘文件哈希比对；不符 FAIL 指名，畸形/逃逸 ERROR），把观察绑定到具体项目制品；门禁可选 `requireSourceFingerprint: true`（未声明即 FAIL"缺少来源指纹"）。适用于文件型观察面；live HTTP 面走 W3 的 `mode:live`+`requireLive`（附实现文件哈希指纹同样有效）。

两项均为可选声明（v1.9 哲学延续），旧配置与旧 runner 输出零迁移。

## 验证

- 378 项回归全绿（376→378：change-scope 与 alignment 各 1 个多态正反例测试）；CONFIG-GUIDE 选项表/登记文件字段同步（config-guide 3/3）；GATE-SPEC-v1.9 节内扩展；RTM E4/AF 行转原生。
- 打包：`quality-gate-1.9.1.zip` 解包复验（全量测试+烟测），见 `evidence/v1.9.1/`。

## 边界

E4 防的是**静默**语义超范围（受保护变更无内容级检查），不防蓄意绕过（如关闭 requireContentCheck 须改 spec，W2 selfGuard 可锚定该字段）；指纹核验"声明与磁盘一致"，不证观察面即生产系统。

下一轮已确认：v1.10.0 主线"拓扑语义深化"（新纯内核 kind `topology` 承载 R1–R4）+ E3 `requireSnapshots` 默认强制（破坏性），见 [PLAN](../PLAN.md) v1.10 节。
