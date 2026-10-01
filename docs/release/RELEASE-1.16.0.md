# RELEASE 1.16.0 — 统一语言治理（DDD 式术语统一 + 协议键迁移）

日期：2026-09-30。主线经 AskUserQuestion 四问选型（**D+A+A+B**——作用域 D 全量硬改协议键、自造词 A 全部规范化、双语 A 双轨映射制、时序 B v1.15.0 实机验收并入本轮；其中 D/A 覆盖推荐的 C/B，理由=追求彻底统一，已记录）。**判定语义零变化**：34 kinds 不变、37 示例不变。464 项本地测试（463 过/1 skip=pytest 守卫；460 基线 +1 update-ontology 回归 +3 glossary 防回归）。规划与逐包边界见 [PLAN.md](../PLAN.md) v1.16 节与 [RTM](../RTM.md) §11（UL1–UL3 原生）。

## UL1 统一语言治理：GLOSSARY 唯一登记处 + ADR-0016 + 防回归

三轮术语盘点（文档/代码/约束并行）量化后建立 [docs/GLOSSARY.md](../GLOSSARY.md)（统一语言唯一登记处）：60+ 概念族（规范中文｜代码名｜定义｜限界上下文｜弃用别名）+ 限界上下文六分（内核产品域/宿主适配/参考工具适配器/演示/过程管理/历史档案）+ 验证动词分工（校验/核验/交叉核验/核对/验证/审计）+ ID 前缀注册表（样例 id 让位 CL-n/RS-n/EX-n）+ 借词清单 + 命名谱系（qgate/quality-gate/quality-gate-local/qgate-transcript 不改名）；[ADR-0016](../adr/ADR-0016-ubiquitous-language.md) 记录八项治理决策与**替换判定三问**（惯用词可用/描述性复合词可用/比喻类比跨域借词改惯用语）；AGENTS.md 增规则"新概念先入 GLOSSARY"；`tests/glossary.test.mjs` 三测：弃用词在活文档零出现（映射记法"旧→新"与白名单专名豁免——防重放/v1.15 主题名/设计覆盖台账等）、GLOSSARY 结构校验、L0–L5 名称一致性（§3.1 ↔ CONFIG-GUIDE 章节标题逐字相等）。

## UL2 概念拆义与表达规范化（约 640 文档处 + 代码文案/注释/测试针）

- **拆义**：基线/基准二分（基线＝F2P/P2P 对照实现，代码族自洽零改动；基准＝change-scope `baseRef` 变更参照/会话基准/首环境基准；PM 义→历史版本记录）；L0–L5 统一为长名规范+短名叙述简称；快照（持久化/市场）、live（实机/`mode:live`）、命令（runner argv/CLI 子命令/`command` 门禁）、旅程（journey 门禁/客户端走查）多义消歧。
- **替换 36 项弃用词**（T2 六项裁决，其中**快赢→小迭代为用户指定**、未采用推荐案"小步补丁"）：收口→收尾、锚点→证据信号、锚定→核验级（等级）/绑定（动词）、验证锚→验证依据、对拍→内容比对、超面→越界使用、降权→降级、残差与诚实边界→残余风险、自指→自引用、空转封堵→空登记直通阻断、落点→输出位置、末环→最后一环、搭车→同轮附带、悬置→暂缓、双跑→双次运行、烟测→冒烟测试、翻转→状态更新、自证放行→自行放行、合谋 runner→不可信 runner、转录→观察记录、模版→模板（错字 57 处）、附加库/附加项→附加门禁（库）、随版→随版发布、运行器→runner、会话基线→会话基准；保留清单（主线/工作包/复盘/落盘/档位/命中/摩擦/裁剪/收紧/收窄/同构/剥离/实机/夹具/冒烟测试/声明即核验等）逐项附理由（GLOSSARY §6.1）。**发布当日用户追加裁决（GLOSSARY §7-7）**：白名单、台账、灰度、口径、敞口 五词保留，其替换已回滚（弃用清单 41→36 项）；§5 ID 前缀注册表改为按层次与目标分组。
- **代码人读层**（T4）：summary 显示（强度等级 核验级/声明级/降级、信号行、六信号标签 git 基线核验/双次运行一致、"层级覆盖:"/"未满足必需层级:"/"证据降级:"、观察记录失败文案）、hook `Baseline:` 前缀→`基准:`、内部标识符 `anchors`→`signals`（计数字段避让为 `signalTotal`）；演示 runner 注释与测试针（summary/behavior/engineering/adapter/journey/rerun/init/topology 等 13 文件）同批。
- **历史档案不回写**：docs/history、docs/release、evidence、ADR-0001–0015 正文旧词＝历史称谓；活文档历史性小节仅版本主题名（如 v1.15 主线"baseline 内容内核重放"）等专名豁免。

## UL3 协议键迁移（schemaVersion 0.1→0.2）+ 两处缺陷修复

**迁移表（破坏性配置变更；旧键 fail-closed 拒绝并指名迁移，先例 v1.8/v1.9）**：

| 层 | 旧 | 新 |
|---|---|---|
| 配置 | `schemaVersion:'0.1'` | `'0.2'` |
| 配置 | `gates[].domain` | `gates[].level` |
| 配置 | `requiredDomains` | `requiredLevels` |
| run 报告 | `schemaVersion:'0.1'` / `domainCoverage` / `evidence[].domain` / `missingRequiredDomains`·`unmetRequiredDomains` | `'0.2'` / `levelCoverage` / `level` / `missingRequiredLevels`·`unmetRequiredLevels` |
| CLI 契约 | update changes `addAddOns` | `addOns`（与 init 契约统一） |
| adapter 内部 | 状态文件 `baseline.json` | `session-baseline.json`（读侧回读旧名一次） |
| 内部数据 | templates 域字段 / examples.manifest `domains` | `levels` |

**兼容**：`renderSummary` 读兼容垫片（`levelCoverage??domainCoverage`、`item.level??item.domain`、`entry.level??entry.domain`、unmet 双读）保证 0.1 归档 run 可继续重渲染（实机以迁移前归档 run 重渲染实证；report.test 旧键夹具即垫片覆盖）；观察协议与 transcript schema 键零改名（schemaVersion 保持 0.1）。迁移面：37 demo 配置+根配置+acceptance 4 配置+全部测试内联夹具与 fixture.mjs（共 42 个 `.quality-gate.json`）同批。

- **缺陷①**：update changes 白名单拒 `ontology`（`/quality-gate-update` 文档已承诺、`applyChanges` 本支持）——CLI 白名单与传参补齐，+1 回归测试。
- **缺陷②**：`build_delivery.py` 含集漏排 `.zcode/`——v1.15.0 安装包实际误打包 1 个 `.zcode/plans` 会话文件；本轮排除后包构成对照（+GLOSSARY/ADR-0016/SPEC v1.16/glossary.test/evidence v1.15.0×3 −.zcode 文件）见 evidence/v1.16.0/。

## 文档与打包

- GATE-SPEC git-mv v1.15→history（归档相对链接四处修复）并建 **v1.16**（导语重写：统一语言治理版+迁移说明+链接 GLOSSARY；kind 表列名"域"→"层级"；15 处活文档链接重指）。
- CONFIG-GUIDE：全部 jsonc 样例与选项表迁移（`level`/`requiredLevels`/`addOns`/schemaVersion 0.2；机器校验样例自动同步测试全绿）；样例 id CL-1/RS-1/EX-1 让位。双语插件 README 版本叙事与计数。
- 打包：`dist/quality-gate-1.16.0.zip`（**576 文件，SHA256 `d6e7901a4a1a2956104f6d7b7cb231c38b8f44a248696e0f9026e42de1468246`，两次构建全同**）；构建内自验证（解包全量 464 测试+清单驱动 24 冒烟 demo）；独立解包复验（版本一致性+解包内核跑 six-domain-demo close/release PASS）见 [evidence/v1.16.0/](../../evidence/v1.16.0/)。

## 诚实边界

本轮不改任何门禁判定语义——唯三行为变化＝协议键迁移（旧配置 fail-closed+迁移表）、缺陷①②修复。旧 run 档案渲染依赖读兼容垫片（只覆盖本轮键差异，不承诺未来 schema 前向兼容）。glossary 防回归测试只拦字面弃用词、拦不住语义漂移与新同义词（靠 GLOSSARY 纪律与评审）。客户端缓存 1.15.0 文案存在一版差（客户端更新后消除）。v1.15.0 版本级实机验收并入 v1.16.0 实机验收（如实标注非跳过）。
