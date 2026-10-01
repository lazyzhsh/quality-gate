# RELEASE-1.21.1（2026-10-01）

**小迭代补丁：内核预算上限上调 40000→60000（自举驱动）**（零破坏；kind/测试判定语义不变，仅上限数值与同步文档）。

## 背景与裁决

v1.21.0 收尾后 Stop 连续 ETIMEDOUT：套件 575 项全绿但墙钟在环境交互负载下 ~41s，超出根门禁 40000ms 硬顶。诊断（记录于 PLAN 未了事项 2026-10-01）：安静基线 ~34s（v1.21.0 收尾 39.8s 内 2/2 PASS 有存档）；同代码漂移纯环境（常驻大进程内存压力/文件缓存失效＋Defender 扫描拖慢每次 spawn——CPU 空闲 4% 时仍 41s，复位需重启）；并发 12/16 无改善。结构性事实：内核 `timeoutMs ≤ 40000` 且同阶段预算总和 ≤ 40000ms，配置层无上调空间（门禁拆分亦不行，预算按阶段求和）。**用户裁决 2026-10-01：做 v1.21.1 上调内核预算上限**（先例：timeout 上限 20000→40000 于 v1.4——同为自举驱动）。

## 内容

1. **上限上调 ×6 处**：kernel 单门禁 `timeoutMs` 1..60000；kernel 同阶段预算总和（含 coverage/reasoner）≤ 60000ms；templates 替换字段校验同步；engineering/consistency 门禁级上限跟随；`qgate inspect` 预算显示 budgetMs 60000。
2. **分层边界（如实）**：宿主 Stop Hook 的 55s 预算属适配器层约束（`hooks/hooks.json` 不变）——内核 60s 供 CLI/CI 与多门禁阶段用，Stop 路径实际可用 ≈53s（55s−hook 开销）。
3. **测试 +3 同步 ×2**：新 `tests/config-ceiling.test.mjs`（单门禁 60000 收/60001 拒；阶段总和边界＋禁用门禁不计入；engineering 门禁级跟随）；templates.test 拒绝用例 50000→65000；persistence.test 预算边界 3×20000（=60000 已合法）→3×25000（=75000 拒绝）。
4. **文档 ×8 处**：GATE-SPEC v1.21（尾句＋上调注记）、根 README、CONFIG-GUIDE×5（规模约束/替换字段/inspect/工程两处）、PRD 时效行、PERSISTENCE-GATE 协议段。

## 证明边界（如实）

上限是宽松化（原 40000 内配置全部仍有效，无破坏面）；不改变任何判定语义；宿主 Hook 预算 55s 分层不变；本仓库根配置保持 40000 直至客户端更新过渡完成（见下）。

## 验收与证据

- 全量回归 **578 项（577 过/1 skip）**，`evidence/v1.21.1/regression.txt`；
- 发行包 `dist/quality-gate-1.21.1.zip`：**696 文件**，SHA256 `287cbfd48a65f787786a1897ca7aeab3d96016753f6c7541a4d9dc6aa70449e0`（两次构建全同）；解包复验＝版本 ×3 相等＋**42 秒 runner 挂 timeoutMs=55000 门禁 PASS**（旧顶必超时——上调直接证明）＋60001 拒绝 fail-closed，见 `evidence/v1.21.1/`；
- 根门禁端到端：源码内核＋临时 60000 配置 **close 2/2 PASS 43.4s run=08e0c4d**（归档于 `.quality-gate/runs/`），验证后恢复 40000。

## 版本边界（过渡期约束，三步序列）

1. `python devtools/sync_client_marketplace.py`（已执行，快照 1.21.1 就绪）→ 客户端插件市场对插件行点**更新**至 1.21.1；
2. **新建会话**（Stop hook 按会话启动时绑定缓存内核路径——旧会话仍调 1.20.0，其 validate 上限 40000，先行上调根配置会使 Stop 变 validate ERROR 而非超时，无增益）；
3. 新会话内把根 `.quality-gate.json` G-TESTS `timeoutMs` 40000→**45000**（套件 ~41s 留 4s 余量，且 45000+hook 开销 < Stop 55s 预算）→ close 复验 2/2 → PLAN 未了事项销项。

路线位置：小迭代补丁（轨道 D 已于 v1.21.0 收官不变）；下一轮 v1.22/23=C6 语义深化。范围红线不变。
