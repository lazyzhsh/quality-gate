# 参考适配器（E7，v1.11.0）

非 Node 项目经 **runner 协议**接入 quality-gate 的参考实现。B1（rawOutput 声明即核验）落地后，
接入成本显著降低：测试工具的**原生输出**（TAP / JUnit XML）由内核直接解析计数，适配器只需要
把原生输出文件交给内核并回显观察协议字段。

## 目录

| 适配器 | 形态 | 验证边界 |
|---|---|---|
| `python/unit_runner.py` | pytest 包装 runner：stdin 收 qgate 请求 → 本地跑 `pytest --junitxml` → 从 XML 属性自报计数并声明 `rawOutput:{format:'junit'}`，退出码恒 0（观察协议，测试失败由内核判定） | 仓库内以真实 pytest 全链路验证（见 `tests/adapters.test.mjs`；本机无 pytest 时该测试 skip 并给安装指引） |
| `python/persistence_orm.py` | persistence 参考 runner 的 Entity↔ORM 形态（E5）：before/after 快照与落库记录取自 SQLAlchemy 会话（独立新 session 回读，ADR-0013），E3 快照协议不变、内核零改动 | 仓库内经真实内核门禁全链路验证（SQLAlchemy 2.x + 内存 SQLite；依赖缺失时测试 skip 并给安装指引；request 以 `orm://` 方案如实标注非真实 HTTP 面真实项目应回报其真实 API 调用） |
| `java/merge-junit.mjs` | surefire/gradle 报告合并 runner：把 `TEST-*.xml` 多文件合并为单 `testsuites` 文件、自报计数并声明 rawOutput（复用内核解析器自检）；Java 项目仅需运行 qgate 所需的 Node | 仓库内以样例 surefire XML（按 schema 手写、如实标注）验证合并与内核解析；无 JDK 环境，不做 Maven/Gradle 全链路实测，不声称已验证真实构建工具链 |
| `visual/screenshot.mjs` | visual 门禁参考浏览器 runner（v1.13 T4）：零 npm 依赖，经系统浏览器（Chrome/Edge，`QGATE_BROWSER` 显式指定且不回退探测）headless CLI 截图，按 visual 观察协议回报 actualFile+sha256——判定（字节比较/像素容差）仍由内核做；`--headless=new --disable-gpu --force-device-scale-factor=1` 固定窗口与虚拟时间预算求确定性 | 同机字节稳定（仓库内经真实内核 visual 门禁全链路验证：pin 基线→close PASS→页面变更 FAIL，见 `tests/adapters.test.mjs`）；跨机器字体渲染/抗锯齿差异是已知噪声——跨机复验先重新 pin 基线；像素容差需 runner 报 diff 度量，本参考不实现图像解码；无浏览器环境测试 skip 带安装指引、不入冒烟测试集合（正例见 `examples/visual-browser-demo`） |
| `consumer-usage/pact-normalize.mjs` | consumer-matrix 观察层（v1.13 T5；v1.15 T7 字段级深化）：Pact 契约测试产物（v2/v3 JSON）→ `consumerUsage` 条目（`usage:'contract-test'`，最强来源——使用面由消费者自己的契约测试绑定）；纯函数 `pactToUsage` + CLI（多文件输出数组） | Pact interaction 记录请求面（method+path，query 剥离、同端点去重）；**请求 body 的字段路径**（v1.15）提取为字段级条目——叶子字段、嵌套点连接、深度 ≤4、数组取元素字段（同键路径）、跨 interaction 并集去重、非对象 body 只产端点条目；**响应侧** consumer 读取了哪些字段仍不记录（Pact 不含此信息，工具不虚构）；具体 id 与模板路由不匹配时由项目归一，工具不做猜测性改写；malformed 产物 fail-closed（缺 consumer.name/无 interactions/缺 method/path）。正例：`examples/consumer-matrix-demo` 的 orders-web（真实经本适配器派生，含字段级使用面） |
| `consumer-usage/scan-usage.mjs` | consumer-matrix 观察层（v1.13 T5；v1.15 T7 多语言扩展）：消费者源码静态扫描 → `consumerUsage` 条目（`usage:'scanned'`）；JS/TS 识别 `fetch(url,{method})`（method 同语句内探测、缺省 GET）与 `axios.get/post/…(url)`/`axios(url,{method})`；Python 识别 `requests./httpx.` 动词调用；Go 识别 `http.Get/Post/Head` 与 `http.NewRequest(http.MethodX, url)`；Java 识别 RestTemplate `getXxxForEntity/Object`/`postForEntity/Object` 与 OkHttp `Request.Builder().url(url).get()/post()` 链；绝对地址剥 origin、query 剥离；CLI 递归扫 js/mjs/cjs/ts/jsx/tsx/py/go/java | 静态正则扫描：动态拼接 URL、SDK 封装层、间接调用会漏（Python `requests.request('POST',…)`、Go resty、Java WebClient 等均不在识别集合）；漏扫使"使用面小于真实面"，越界使用 FAIL 可能偏松；scanned 是观察层弱来源，建议结合 contract-test 或如实 declared。正例：`examples/consumer-matrix-demo` 的 orders-cli（真实经本适配器派生） |

## 接入要点（engineering 门禁）

1. unit check 的 `argv` 指向适配器；门禁级可开 `requireRawOutput: true` 强制原始证据；
2. 适配器从 stdin 读 `{schemaVersion,runId,checkId}` 并在观察 JSON 中**回显 runId**（防重放）；
3. 适配器报告计数（来自工具自身摘要属性），并声明 `rawOutput` 指向原生输出文件——**内核会独立
   解析同一文件重算计数并交叉核验**，不符即 ERROR fail-closed（B1，`lib/raw-evidence.mjs`）；
4. 缺失外部工具（python/pytest 等）时的安装指引见根 README"外部依赖"与 `lib/dependencies.mjs`
   的 KNOWN_TOOLS 登记表。

## import 对账参考 适配器（v1.20，symbol-grounding `importObservations`）

- `python/import_probe.py`：以运行中解释器 `importlib.util.find_spec` 探测 import（pip 包名与模块名
  不同构，探测才是真对账；venv 边界如实=以运行本脚本的解释器环境为准），产出观察文件；
  `--normalize-openapi` 将 YAML 声明面归一为 JSON（pyyaml 缺失时给安装指引并以非零退出）；
- `java/import_scan.mjs`：package 声明定位源根后对账扫描集源码与 pom.xml/build.gradle 依赖段
  （词法提取，不编译——JDK 边界如实），产出观察文件；
- 内核与适配器各自实现同一语句起首词法规则，内核以"恰好覆盖"双向对账核验回报——提取集无回报
  FAIL `observation-coverage-gap`（runner 无权决定引用集，防瞒报）。

## 边界

参考实现示范观察协议，**不是对任何测试工具或语言栈的认证**；各项目按 runner 协议自行接入并对
自己的工具链诚实回报。解析器保证的是"计数与原始输出自洽"，不防蓄意伪造内容一致的原始文件。

### shacl/ — SHACL 引擎参考适配器（v1.22）

`pyshacl_runner.py`：semantic-profile 门禁 `shacl:{argv,timeoutMs}` 引擎协议的对端——stdin 收内核翻译的
{shapes, records, subClassOf}，构建 SHACL 形状图与数据图（属性名映射 `urn:qgate:prop:<path>` 谓词、
`{value,lang}` 值→语言标签字面量、子类边→rdfs:subClassOf 三元组使 pyshacl 原生完成 sh:targetClass 深度匹配），
运行 pyshacl 后归一回报 findings＋conformance。真引擎是 pyshacl（`pip install pyshacl`；缺失时 stderr 给安装指引、
退出码 3——内核 fail-closed）。参考非认证：本适配器只做翻译与归一，引擎侧 SHACL 语义判定属 pyshacl。v1.22.1 起（OD-116）该适配器为**可选集成**——组件全集已内核原生判定（默认零外部依赖），环境装有 pyshacl 时接入即作为第二实现参与并集判定。
正例 `examples/shacl-engine-demo`（8 组件＋closed＋三跳子类链；无 pyshacl 环境测试 skip 带指引）。
