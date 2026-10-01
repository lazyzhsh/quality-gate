# RELEASE-1.23.1（2026-10-01，小迭代补丁——回归套件瘦身）

## 主线：根门禁墙钟根治——回归套件总子进程数削减（用户裁决提前 v2.0 候选：重启＋瘦身）

**背景**：v1.23.0 收尾当晚根门禁 G-TESTS 连续 ETIMEDOUT——602 项套件墙钟 60.0–62.5s 越过内核预算上限 60000ms（配置层零余量）。功能面直跑全绿（602/602/exit 0），纯墙钟超预算。诊断定位：**瓶颈是进程生成而非 CPU**（空闲 CPU 1% 时仍 60s+；node spawn 单价实测 103–110ms，v1.21.0 的 Defender/内存压力诊断延续）；并行效率 3× 劣化于调度下界，说明进程创建被全局序列化——**总 spawn 数才是真杠杆**（每个 argv 门禁/检查的 runner 都是一次子进程）。

## 改造（测试编排层，零内核/判定语义变更，602 项测试数不变）

1. **leanFixture 零 spawn 基础门禁**（`tests/fixture.mjs`）：22 个使用共享 fixture 的测试文件中，19 个迁移到 leanFixture——基础 `build` 门禁由 command（每次 run 白付一次 `node -e exit(0)` spawn）换为文件式 debt（空登记 `none:true` 恒 PASS，id/位置不变保持整体计数与同轮证据语义）。文件式 kind 测试（topology/traceability/decisions/metrics/semantic-profile 等）的几乎全部成本原是这一次基础 spawn。
2. **延后门禁引用型三文件**（assumptions/decisions/traceability——其延后评估门禁引用 `{gateId:'build'}` 作同轮证据，需要常规期已 PASS）：基础门禁覆写为 symbol-grounding `check:'all'`（零 spawn 常规期 kind，对无 import 临时项目恒 PASS；每次注入浅拷贝防共享对象跨用例污染）。改写基础门禁为失败 command 的用例改整对象按 id 覆写。
3. **engineering 聚焦**：engineering-baseline/engineering-rawoutput 逐用例 `focusChecks(root,['unit'])`（14 处）——原每次 run 执行 demo 全部六检查（6 spawn），聚焦到被断言的 unit。
4. **consistency 聚焦**：`consistency-helpers` 新增 `focusConsistency`（check 过滤＋requiredChecks 同步＋停用侧门禁级联清理 risk/孤儿 claim，语义对齐 templates disable 级联）；consistency.test 按场景映射注入（8 用例×单 check）、consistency-observation 五用例（contract-diff 两用例反向只留 contract 门禁）。ledger 每次 run 原付 5 check＋contract-compat 共 6 spawn。

**保持不动**（真实覆盖成本，非浪费）：six-domain 全量正例与逐域负例（旗舰集成测试）、mutation 检查的逐变异体执行、adapters 的 python/pytest 真跑、shacl-engine 的 pyshacl 引擎腿、lifecycle/task-intent 的 CLI 通道真调用。

## 效果（同机同负载当晚实测）

| 指标 | 前 | 后 |
|---|---|---|
| 套件墙钟（run-suite 钳制口径） | 60.0–62.5s（越 60000 上限，close 三连 ETIMEDOUT） | **47.6s** |
| 根门禁 close | ERROR（ETIMEDOUT） | **2/2 PASS 47.7s run=ca3d1334**（余量 12.3s） |

机器重启后 spawn 单价回落将进一步扩大余量（用户另行执行，非本版销项前提）。

## 边界与注记

- 判定语义零变化：仅测试编排层（fixture 形状/检查聚焦）；被聚焦用例断言的 check 仍在真实执行，未断言的伴生检查由 demo 级集成测试（six-domain）与各自全量用例（engineering 首测/consistency 健康用例）覆盖。
- 直跑 `node --test`（无钳制 24 路并发）在 110ms spawn 风暴下 adapter 的 new-only 用例可因门禁超时走 ERROR 仍阻断——契约内口径为 run-suite 钳制执行（AGENTS 约定），非本版引入。
- 内核/适配器代码零变更——客户端无需更新到 1.23.1（随包测试文件变化仅影响源码树/解包复验；快照已同步，更新为可选）。

## 版本与证据

- 版本 ×3 → 1.23.1；602 项测试（直跑时 pytest 在场则 602 全过，守卫环境 601 过/1 skip）；37 kinds/46 示例不变。
- zip `quality-gate-1.23.1.zip` 735 文件（v1.23.0 收尾后的 evidence/LIVE-ACCEPTANCE/RELEASE 随包制品按惯例乘下版包），SHA256 `08883d27d8458cf5f86a4895b9172c092944cabada72ec6810b8172ed4f8e1cb`；解包复验 602 测试＋25 demo PASS。
- 证据 `evidence/v1.23.1/`（前后逐文件计时/墙钟对比/spawn 单价探针/门禁 PASS）。
