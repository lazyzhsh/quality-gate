# RELEASE 1.15.0 — baseline 内容内核重放 + 裁剪智能化 + consumer-matrix 深化

日期：2026-09-28。主线经 AskUserQuestion 选定（A+C+D 全量，逐轴利弊表后用户确认；T6 设计二次确认 A/A/A）。零破坏：34 kinds 不变、37 示例不变（demo 改造不新增）。460 项本地测试（459 过/1 skip=pytest 守卫）。规划与逐包边界见 [PLAN.md](../PLAN.md) v1.15 节与 [RTM](../RTM.md) §10（BR1/TS1/CD1 原生）。

## 主线 BR1：baseline 内容内核重放（C2 残余部分闭合）

B1（v1.11 TAP/JUnit 内核解析）→ C3（v1.13 transcript 声明即核验）→ C2（本轮基线侧）三轮同构收口链的末环：声明 expected 的基线证据从"ref 存在性核验"（W3 `rev-parse`）升级为"**内容绑定+两源一致**"。

- **T1 转录基线块**：`parseTranscript` behavior 顶层可选 `baseline`，形状与观察 `baselineSource` 统一（`lib/baseline.mjs` 新导出 `normalizeBaselineSource`：git 型 `{type,ref,file?,contentSha256?}`——file 与 contentSha256 必须成对、sha 64-hex；embedded 型仅 type）；文档顶层键白名单收紧（journey 不承载 baseline、未知顶层键拒收）。
- **T2 内容核验**：git 型声明 `file`+`contentSha256` 时内核 `git show <ref>:<file>` 取内容（Buffer 原样哈希，不经编码转换）对拍——不符或路径不在 ref 树中即 ERROR 指名；一致记 `contentVerified` 并计入证据力新锚点**"基线内容核验"**。behavior 转录 `baseline` 块与观察 `baselineSource` **两源一致核验**（不符或观察缺失 ERROR 指名）。门禁级 `requireBaselineTranscript:true`（须声明 expected）缺块 FAIL 指名"缺少基线转录声明"；显式 false 保留旧语义。
- **T3 engineering 同构**：unit 观察可选 `baselineRawOutput:{format:'tap'|'junit', file}`——内核解析基线实现的原始测试输出、逐用例重算基线状态与自报 `baselineStatus` 交叉核验（不符/用例缺失/基线输出内重名 ERROR fail-closed）；核验一致后 F2P/P2P 方向审计的基线侧取内核重算值，计入"原始输出解析"锚点。门禁级 `requireBaselineRawOutput:true`（须所有 test 检查声明 expected）缺声明 FAIL 指名。
- **T4 demo 改造**：behavior-demo runner git 路径声明内容绑定 sha 并在转录承载 baseline 块（embedded 回退亦声明，demo close 保留降权行+锚点）；engineering-demo 基线 TAP 落盘 `dist/baseline-run.tap` 并声明 baselineRawOutput（demo close"原始输出解析 2"双锚点）。
- **诚实边界**：内核核验内容绑定+两源一致，**仍不执行基线**——合谋 runner 可对内核已验证的真实基线内容伪造执行记录，伪造成本升至"与真实基线内容一致的双记录"，残差与 B1/C3 同类（RTM §10 BR1 行如实记录）。
- **协议收紧（随版迁移）**：`baselineSource` embedded 型收紧为仅 `{type:'embedded'}`（原容忍多余 ref 键）——受影响 runner 应去掉多余字段；W3 语义（embedded 摘要降权、`baselineMode:git` 拒绝）不变。

## 随版 TS1：裁剪智能化（inspect 建议块）

变更影响驱动的 add-on 推荐——**建议性输出，不代写配置**。`lib/templates.mjs` ADDONS 各条目可选 `suggest:{pathPatterns|anyChange, reason}` 策展元数据（change-scope=anyChange、sast-scan=源码扩展名、api-authz-scan=路由目录、credential-scan=配置/环境文件、rerun-evidence=任务目录；debt-register 无路径可推导不设——不做无依据推荐）+ `suggestPathMatches` 三语义匹配器（`'**'` 任意 / `'*.<ext>'` 扩展名 / 段通配同 ignoreRoutes 风格）+ `suggestAddOns` 纯函数（已安装门禁不再推荐）。`qgate inspect` 输出 `suggestions` 块：`git status --porcelain -uall` 逐文件展开计算未提交变更面（`.quality-gate/` 运行数据不计入；默认 porcelain 会把整目录未跟踪项折叠成 `dir/` 使扩展名匹配失效，实测发现后改用 `-uall`），非 git 仓库 `available:false` 如实标注不做无依据推荐；`/quality-gate-update` 提示词同步（建议预选、用户决定）。边界：变更面仅未提交变更，不含已提交历史。

## 随版 CD1：consumer-matrix 深化

- **Pact 字段级使用面**：`pact-normalize.mjs` 新 `bodyFieldPaths`——请求 body 的字段路径提取为字段级使用面条目（叶子字段、点连接嵌套、深度 ≤4、数组取元素字段同键路径归并不带下标、跨 interaction 并集去重、非对象 body 只产端点条目）；**响应侧**字段使用 Pact 不记录，工具不虚构（边界如实改写）。
- **扫描器多语言**：`scan-usage.mjs` 识别 python（`requests.`/`httpx.` 动词）、go（`http.Get/Post/Head`、`http.NewRequest(http.MethodX, url)`）、java（RestTemplate `xxxForEntity/Object`、OkHttp `Request.Builder().url(url).verb()` 链）；CLI 递归扩展名 `.py/.go/.java`。各生态仅覆盖最常见形状（`requests.request`/resty/WebClient 不识别，如实入边界）。
- **内核**：beyond-expectation 字段级判定 v1.12 已备，本轮补 contract-test 来源负例锚定（demo orders-web 期望删字段即 FAIL"期望文件已过期"）。demo：Pact 夹具补请求 body，期望与 provider schema 同步 `refundFirst`（usageItemCount 1→4，close PASS run=251c7fb 双降权行保留）。

## 文档与打包

- CONFIG-GUIDE：behavior/engineering 选项表与 jsonc 样例（`requireBaselineTranscript`/`requireBaselineRawOutput` 入样例；`baselineSource` 内容绑定形状；`baselineRawOutput` 观察协议）；生命周期段 inspect 建议块说明。
- GATE-SPEC git-mv v1.13→history（已取代 banner）并建 v1.15（导语重写；engineering/behavior 行与摘要锚点段、引导初始化节更新）；9 处活文档链接重指。
- RTM §10 BR1/TS1/CD1 状态翻转原生+证据锚；§11 状态汇总 v1.15 行。PLAN/PRD/README/HANDOFF/双语插件 README 随版。
- 打包：`dist/quality-gate-1.15.0.zip`（570 文件，SHA256 `48819f16249c27ffa5c6e145fc72a019b09514003ce328713e6cd62a3be5599b`，解包复验 460 测试+24 烟测 demo PASS，独立解包复验见 `evidence/v1.15.0/unpack-verify.txt`；构建脚本自身解包复验见 `build-delivery.txt`）。

## 客户端实机验收

待做（快照再同步 `python devtools/sync_client_marketplace.py` → 客户端"更新"按钮 → 夹具四步 + 新声明断言：内容绑定核验+锚点/两源不一致 ERROR/强制开关 FAIL/baselineRawOutput 交叉核验/inspect 建议块；Journey C new-only 补做可同轮搭车）。
