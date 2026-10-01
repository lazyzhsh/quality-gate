# Quality Gate 1.24.0

首次 GitHub 开源发行准备版：修复审查发现的错误放行与错误阻断，补齐 MIT、第三方归属和贡献/安全入口。37 kinds、46 示例不变；不将 7 项部分需求转为达成。

## 判定修复

- Stop 复用限制到纯文件式 `ontology-map`、无外部引擎的 `semantic-profile`/`semantic-consistency` 与 `configuration`。运行前后和当前输入内容快照一致才复用，旧报告、删除/重命名、读失败、符号链接或枚举超限不复用。argv、Git/运行时、时间政策与例外重新评估；new-only 使用内容差异，包含删除，不再依赖 mtime。
- OWL 只由传递属性链推出该属性及其父属性，不能从父属性链反向证明子属性。外部 reasoner 同时收到 equivalentClass/unionOf，参考 reasoner 独立传播这些事实。
- 零和账本拒绝非正安全整数；已接受金额使用 BigInt 精确累计，不因总和超过 Number 范围丢精度。超界差额以十进制字符串输出。
- 默认 `**/*` 扫描包含根文件；内置模块按当前 Node 的完整说明符判断，拒绝虚构子路径。
- SHACL 单边长度/数值边界各自校验，字符串长度按 Unicode 码点；参考引擎 UTF-8 协议固定，标准 Datatype/NodeKind 组件可报告为数据 FAIL。
- 配置数组按 JSON 结构值比较；空对象与 null/数组类型可区分。ADR parser 接受 deferred，L0 许可与期限规则保留，L5 仍阻断。

## 预算与兼容性

CLI edit/close 阶段预算仍为 60 秒；仅在 pr/release 阶段使用的 command 可配置到 300 秒，该阶段总和也为 300 秒。Stop 的 55 秒期限预留 5 秒，只接受最多 50 秒配置执行预算，超出时落盘 ERROR 并阻断。`inspect` 与 validate 使用同一预算计算，包含 shacl。

根项目完整回归移到 pr/release（180 秒预算）；close 只做 G-CONVENTIONS。这是阶段划分，不代表免除回归。CLI release 实际跑完整回归后才能证明 C-REGRESSION。

这些修复可能让原先错误通过的输入变为 FAIL/ERROR，并增加外部 runner 的 Stop 执行次数。长时 close 配置需调整检查阶段。没有新增 kind 或撤销既有范围裁剪。

## 开源交付

MIT 覆盖自有内容；保留 FIBO 上游许可。公开源码不上传本机 evidence、历史 dist、客户端缓存或原始 Git 历史；新交付包排除这些本机产物。贡献和安全报告入口位于 `.github/`。

以下为首次发布前本机源码验证，ZCode 实机另行记录。

## 首次发布验证

环境：Windows、Node.js 24.14.1、Python 3.12.9；可选 SHACL 引擎为 pyshacl 0.40.1。工具来自本仓库源码，外部引擎与模拟 runner 的范围分别记录。

- 指定全量回归：615/615 PASS，0 SKIP，77.507 秒。
- 根 CLI release：G-TESTS 与 G-CONVENTIONS 2/2 PASS，约 73 秒；close 只执行 G-CONVENTIONS，不作为完整回归证据。
- 报销夹具：业务单测 8/8；close 13/13；故意失败矩阵 13/13 检出；生命周期 10/10。
- 受影响及代表性示例：six-domain、property、OWL、SHACL、trace、convention、consumer-matrix 7/7 PASS。
- 原审查的错误放行/阻断复现重新执行：输入删除/运行期间漂移/过期均 Stop 阻断；OWL 父属性反向推理 FAIL；畸形 SHACL ERROR；不安全金额 ERROR；根虚构引用 FAIL；合法内置模块 PASS、虚构子路径 FAIL；配置数组、deferred ADR 与完整事实 reasoner 正例 PASS。
- 首次构建解包：615/615 PASS，0 SKIP，25 个清单冒烟示例 PASS；交付包排除 evidence、dist、客户端缓存和凭据文件，并包含自有/第三方许可证。安装包哈希单独存放在同名 .sha256 发行附件中。

本轮未新增 ZCode 实机或跨平台验证；没有把示例扫描器、目录查询或本地故障模拟记成生产认证。
