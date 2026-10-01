# RELEASE 1.7.2（2026-09-26）

补丁主线"引导流程收口"——1.7.0 在 `acceptance/expense-approval-fixture` 实机验收（pro 档 six-domain + secret-scan/rerun-evidence，修一轮输入后 close 9/9 PASS、六域全覆盖）分诊出的三项引导缺口修复（RTM O4；GATE-SPEC 仍为 v1.7，节内补段）：

1. **answers/changes 新增 `ontology`**：six-domain 默认 fibo-skeleton 仅占位（provider NOT_IMPLEMENTED，semantic-profile 运行必 ERROR），此前 answers 契约无 ontology 字段、走完引导对话必须 post-init 手改配置，与"配置只由 init/update 写入"矛盾。现支持整体替换：`{"type":"fibo-skeleton"}`｜`{"type":"local-catalog","file":...}`｜`{"type":"fibo-pinned","expectedCatalogSha256":"<64hex>"}`，严格键集（多带字段即拒）；随包目录 sha 由 `qgate.mjs templates` 输出的 `ontologyHint.fiboPinnedCatalogSha256` 发布（ontology.mjs 导出 `FIBO_CATALOG_SHA`），引导对话推荐 fibo-pinned 开箱即用。
2. **metrics `thresholds` 可替换**：`substitutions.gates.<metrics 门禁>.thresholds` 接受项目自有指标名（1..20 个、`{min?,max?}`、min≤max，与 `validateMetrics` 同构预检）——项目不再被迫把 runner 输出改成模版演示指标名（architectureViolations/unsafeEvalOccurrences/sampleLatencyMs 降为可替换默认值）。
3. **登记文件门禁引用预检**：`preflightRefs` 于 init/update 写盘后只读检查 requirements.json 的 `testGateIds`、release.json 的 `verificationGateIds`、decisions.json 的 `affectsGateIds` 是否引用配置中不存在的门禁（旧配置残留或 update 禁用了被引用门禁），以 `preflightGateRefs` 字段与 stderr 警告当场提示——旧配置重初始化后首次 close 必撞 rtm 的那一轮失败（错误信息本就准确）现在提前到写入时即可见；预检只读不阻断，处置路径是重映射登记引用或补齐门禁，不是禁用。

两个增量（129cd57 → 9cac34c）：契约扩展与 preflightRefs（+4 模版库测试）、CLI 预检输出与 ontologyHint + 命令规程扩展（init 5b 问 ontology、7 预检处置；update 2/3 同步）。命令规程 answers 契约同步补 `ontology`/`thresholds`。

夹具遗留（README"11 门禁"计数、negative-matrix 旧门禁 id 映射）依赖实机会话尚未提交的新配置，由该会话一并收口，本补丁不动。

## 数字

- 35 个 gate kind（不变）；367 项本地测试（v1.7.1 时 363 → +4）；40 个示例与 28 个烟测（不变）。
- 安装包 `dist/quality-gate-1.7.2.zip`：459 文件，SHA256 `3368fa9134b16067bb61b59a15a2eb0da0e999828efcdcb652bbd0df158eef28`；解包复验 367 项测试与 28 个烟测 demo 全部 PASS（`evidence/v1.7.2/package-smoke.txt`）。
- 仓库全量回归 367/367（`evidence/v1.7.2/tests.txt`）。

## 验收正反例

- 正例：ontology 替换（six-domain answers 带 fibo-pinned 随包 sha → config.ontology 替换且过 validate）；thresholds 自有指标（approvalLatencyMs/claimsThroughput 替换后过 validate）；preflightRefs（requirements 引用 `['old-rtm-gate','syntax']` → 仅报 unknown `old-rtm-gate`；登记文件缺失跳过）；CLI 层 init 输出 `preflightGateRefs` + stderr 警告、update 禁用被引用门禁后再次检出（未处理的旧引用持续保留）。
- 反例：ontology 形状（缺 64hex sha、绝对路径 file、未知 type、多余字段）各自拒绝；thresholds（缺 min/max、min>max、空对象）各自拒绝。

## 证明边界（不因本版收窄）

- fibo-skeleton 仍为 six-domain 默认（占位通过 validate；L2 语义门禁运行 ERROR 属 fail-closed 常规路径，正式使用按引导换 provider）；预检为只读警告，不改变任何门禁判定。
- `ontologyHint` 发布的 sha 与插件随包目录绑定——插件升级更换目录时旧钉扎失效（fail-closed），须重新确认，这正是钉扎语义。
- 1.6.0–1.7.2 客户端实机验收待执行；重初始化确认流与 `/quality-gate-update` 的实机记录归 `evidence/zcode-live-v1.7/`。
