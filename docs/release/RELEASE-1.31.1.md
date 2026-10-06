# RELEASE-1.31.1（2026-10-06，反思轮补丁——v1.30/v1.31 收敛后的遗漏排查修复）

## 主线：对二轮评审两轮修复做系统性反思，排查遗漏事项

对照评审全部建议、AGENTS 约定与两轮实现细节逐项核查，确认 8 处遗漏并修复；判定语义仅在补严方向变化（重复 tRNS、正则语境），其余为展示与文档补全。

## 变更清单

1. **PNG 重复 tRNS chunk 拒绝**（F04 收严）：`lib/png.mjs` 此前对重复 tRNS 静默取后者——结构损坏被掩盖；现 `PNG duplicate tRNS chunk` ERROR（规范至多一个）。测试矩阵补 duplicateTrns 用例。
2. **依赖图提取正则字面量语境守卫**（F05 收严）：分类器对 `/` 的除法/正则判定补关键字语境（`return`/`typeof`/`in`/`case` 等关键字后是正则起始）——此前 `return /'/.test(x)` 被当除法，正则内的引号会打开假字符串吞掉后续真实 import（漏检违例）。测试补"正则内引号不得吞掉后续 import"用例。
3. **visual 字节一致计入核验信号**（来源信号补全）：`comparison:'exact-bytes'`＝内核计算两侧 SHA256 相等，本就是内核可独立核验的信号——自 v1.26 来源分类引入以来一直漏计，现显示 `核验（字节一致）` 并计入 evidenceStrength（byteIdentical）与分布核验桶。
4. **caseOutcomesOf 通用分支收紧**（AC 绑定防御性）：逐用例提取的通用 `details.cases` 分支限定 behavior kind——未来其他 kind 即使出现同名数组也无逐用例身份协议，落在 acCaseMissing（如实边界，不猜测形状）。
5. **夹具负例矩阵 13→14**：新增 rtm 用例绑定负例（AC-02 绑定用例改为当轮从未回报的名字 → acCaseMissing FAIL）——新强制面进入可复用验收基线；矩阵 14/14 检出。
6. **PNG 过滤器组合 Pillow 交叉核验**（评审 W4 补充面）：1×4 RGB8 过滤器 0-0-0-0/1-2-3-4/4-3-2-1 三组合，Pillow 与内核逐像素一致（`evidence/project-review-2026-10-06/png-filters-cross-check.py`，本机留档）——补齐评审"用独立解码器核对过滤器组合"的要求。
7. **GLOSSARY 术语补登记**（AGENTS"新概念先入 GLOSSARY"约定，两轮遗漏）：统一执行预算（execution budget）、用例绑定（case binding）、无信号（no signal）三词条入 §3。
8. **陈旧口径与残留清理**：RTM X13 行后续列（AC 绑定已落地）、OPEN-SOURCE-STATUS 两处（"AC 绑定仍在完善"→已落地；v2.0 终审前无仓内功能缺口）、RELEASE-1.31.0"锚点"弃用词残留 1 处、CONFIG-GUIDE 预算边界句（内核内置有界操作如 change-scope git 调用不属声明预算面）＋execution-budget.mjs 同步注释。

## 验证

- 全量回归 **678/678 PASS、0 SKIP**（新增断言并入既有用例：visual duplicateTrns、metrics 正则语境、summary 字节一致）。
- 夹具：close 13/13、负例矩阵 14/14、生命周期 10/10；根 close 2/2、release 3/3 PASS。
- 评审目录本机复验材料：PNG 过滤器交叉核验 PASS（三组合 Pillow=内核=期望像素）。

## 边界与注记

- 已知未随本补丁的事项（均有既定归宿）：transcript 默认政策留 v2.0 终审裁决（既定记录）；G-DOCS 计数类结构化一致性检查按用户裁定"复发一次再加"；实机验收 1.28.0 起待新轮（本版未做）。
- 评审 reproduce.mjs 的部分前置探针报告（*.report.json）在本机被修复后重跑覆写（evidence/ 为本机留档目录）——评审前置结论以 REVIEW.md 文本与 reproduce.json（保留修复前结果）为准，本目录 2026-10-06 后的 report 文件为修复后状态。

## 版本与证据

- 版本 ×4 → 1.31.1（plugins/quality-gate/package.json、.zcode-plugin/plugin.json、marketplace.json、根配置 G-DOCS version 同步递增）＋入口文档版本串。
- zip `quality-gate-1.31.1.zip` 522 文件，SHA256 `17e47684174d86eaa15f44469474a437bbe9f1328b18c2d48d913799938db64e`（收尾检查补 GATE-SPEC 字节一致标签后重打，前次构建 3eefc851 作废）；解包复验 678 测试 678 PASS 0 SKIP＋27 demo PASS；marketplace 快照已重镜像 1.31.1（待客户端"更新"）。
