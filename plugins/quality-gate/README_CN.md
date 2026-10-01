# Quality Gate

Quality Gate 把"软件可交付"变成可追溯的证明链：Claim → Evidence → Gate → Risk → Exception。内核与智能体平台无关（纯 Node 20+ 标准库、无 npm 依赖、运行不联网）；本插件是首个交付适配器，同一 CLI 可独立运行并接入 CI。当前 37 种 gate kind 覆盖 L0–L5 六域：**语义轨道**——terminology 与八个 semantic-* 门禁、确定性 OWL 子集推理（等价/并类/子属性/逆属性/传递链）、SHACL Core 组件内核原生判定（pyshacl 引擎可选并集）、多语言术语、FIBO 钉扎目录；**原则/实践轨道**——F2P/P2P 双向测试防伪修复、支付数据一致性（零和账本/append-only/对账/DLQ 保留/内核重算审计链）、授权与凭据扫描、超时重试预算守恒、熔断全路径演练、拓扑语义、重跑确定性；**对齐防护四轨道（已收官）**——任务意图登记与漂移对账、约定对齐与 ADR 绑定、符号存在性与 API 声明面对账、trace 贯通核验与回放基线；**判定与治理**——灰度判定协议、审批例外窗口、摘要层证据力汇聚；**信任收敛**——原始 TAP/JUnit/观察记录内核解析（声明即核验）、基线内容绑定、观察端来源指纹。逐版能力演进见 marketplace 根 `docs/release/`；证明边界见 `docs/GATE-SPEC-v1.23.md` 与 `docs/RTM.md`。

每次运行后 CLI 向 stderr 输出分级人读报告——PASS 输出一行 brief（存在可汇聚实测信号时附证据力行）；其余输出全量 Markdown 表（原因、建议列、耗时）——stdout 仍是供工具消费的规范 JSON 报告。Stop Hook 阻断 reason 附带同一摘要；SKILL/命令/SessionStart 提示词要求 agent 把分级报告以 Markdown 正文贴进回复（不得包代码围栏）。报告内每条证据均记录所属门禁的 `kind` 与 `level`。

需要 Node.js 20+，无需安装依赖或联网。通过 quality-gate 命令/技能，或 `node bin/qgate.mjs <项目根> close` 执行。经 `/quality-gate-init` 引导对话配置 `.quality-gate.json`（`node bin/qgate.mjs templates [lite|pro|max]` 列出档位模板库——7 模板 + 6 附加门禁；`node bin/qgate.mjs init <root> <answers.json>` 装配并写入校验通过的配置），或参照示例手改；既有配置升级走 `/quality-gate-update`（`inspect`/`update`）。`node bin/qgate.mjs report <项目根> [runId]` 不重跑门禁即可重渲染归档运行的人读报告。SessionStart 注入上下文、外部依赖安装指引与最近一次归档基线状态；Stop 执行门禁并对非 PASS 阻断（v1.24：仅确定性文件式检查可在运行前后及当前输入内容快照一致时复用，外部命令和时间政策重新执行；可选 `stop.blockMode:"new-only"` 把声明输入未触动的既有失败降级为警告；未接入门禁的项目与 adapter 自身错误不再阻断）。启用或修改插件后新建会话。非 Node 项目（pytest/surefire/gradle）可经 `adapters/` 的参考适配器接入 unit 门禁（原生输出交内核解析重算计数）。

L1 以当前用户权限执行配置的 argv，须按构建脚本同等审查配置；配置的命令可能写文件或联网。L0 检查假设登记状态。报告写入项目 .quality-gate/runs（v1.14 起 Stop Hook 同轨；项目目录不可写时回退 ZCODE_PLUGIN_DATA）；stdout/stderr 可能含敏感数据，不自动上传。CLI 退出码 0=PASS、1=FAIL、2=ERROR/SKIP。强制准出用 CI；Stop 重试有客户端上限。例外提案登记即阻断；已审批例外在有效期内呈现 WAIVED（审批为声明字段、不防伪造，且从不豁免任何 FAIL 门禁）。ontology CLI 提供固定 FIBO 子集、fibo-skeleton 与可替换 local-catalog。

测试：`node --test tests/*.test.mjs`。部署：在 ZCode 设置→插件管理→发现中添加外层本地 marketplace，安装启用并新建会话（升级：先同步 marketplace 快照，再在插件行点"更新"）。完整中文指南、分阶段计划、规范与验证记录位于 marketplace 根目录。

L2 persistence 门禁：见 examples/persistence-demo（Python 3.10+ 标准库）。真实调用本地 HTTP API、独立读取已提交 SQLite 数据并逐字段核对。v1.10.0 起前后数据库快照默认强制（`requireSnapshots` 默认 true；after 快照须取自独立会话，见 ADR-0013），退出须显式 `"requireSnapshots": false`。runner 输入输出 JSON 以唯一 runId 关联。不可用接口回显替代落库证据；全部场景使用临时测试存储。

L2 ontology-map 门禁：见 examples/fibo-demo。核对配置的 IRI 存在于随包、SHA256 校验的 FIBO `master_2026Q1` Agreements/Contracts 子集（52 个含 subClassOf/disjointWith 边的类）或配置的 local catalog。只证明术语存在性；不验证业务映射、不做 OWL 推理。上游归属详见 marketplace 根 `docs/FIBO-PROVIDER.md`。

examples/six-domain-demo 六域示例在 close/release 要求 L0–L5 每域都有 PASS 证据。examples/examples.manifest.json 是全部 46 个示例的单一事实源（含冒烟测试阶段；交付构建按清单执行）。完整协议与边界见 marketplace 根 `docs/GATE-SPEC-v1.23.md`。例外提案登记即阻断；已审批者在窗口内呈现 WAIVED，从不豁免任何 FAIL 门禁。

MIT: see LICENSE in this plugin directory. Stop accepts at most 50000ms declared execution budget within the 55000ms host deadline; long command checks can use CLI pr/release (up to 300000ms). Current release: 1.24.0.

1.24.0 复用仅适用于确定性文件式检查且运行前后/当前内容快照一致；外部命令和时间政策重新执行。长回归使用 CLI pr/release，Stop 超预算时 ERROR 并阻断。
