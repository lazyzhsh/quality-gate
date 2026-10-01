import fs from 'node:fs';
import path from 'node:path';
import {validate} from './kernel.mjs';

// 首运行引导模板库（ADR-0014）：静态数据 + 确定性装配；agent 只问询，写入仅在 CLI 层。
// 占位符约定：模板中项目相关处用 PLACEHOLDER 字符串标记，assembleConfig 装配后仍残留即报错（fail-closed）。
// 登记文件集中管理（v1.7.1，ADR-0015）：默认放 .quality-gate/registries/（可提交）；runs 仍为运行数据。
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const text=v=>typeof v==='string'&&v.trim().length>0;
export const PLACEHOLDER='__PLACEHOLDER__';
export const REGISTRY_DIR='.quality-gate/registries';
const registry=name=>`${REGISTRY_DIR}/${name}`;
const clone=x=>structuredClone(x);

// 根目录已知登记文件名（CONFIG-GUIDE 数据登记文件表 + 各 kind 数据文件）；重初始化残留扫描的启发层
export const KNOWN_REGISTRY_FILES=['assumptions.json','decisions.json','scope.json','requirements.json','catalog.json','ontology-proposals.json','mappings.json','profile.json','records.json','api.expected.json','schema.expected.json','budget.json','rerun.json','topology.json','staging.json','production.json','debt.json','baseline.svg'];

// 收集配置引用的登记文件路径（gate.file/dataFile/files + ontology.file）
export function collectRegistryRefs(config){
 const refs=new Set();
 for(const g of config?.gates??[]){
  if(text(g.file))refs.add(g.file);
  if(text(g.dataFile))refs.add(g.dataFile);
  if(g.files!==null&&typeof g.files==='object'&&!Array.isArray(g.files))for(const value of Object.values(g.files))if(text(value))refs.add(value);
 }
 if(text(config?.ontology?.file))refs.add(config.ontology.file);
 return [...refs];
}

// 重初始化残留扫描（只读）：无旧配置时按根目录已知文件名启发；有旧配置时并入其引用文件（彻底层）
export function scanLeftovers(root,config){
 const found={registryFiles:[],qualityGateDir:null};
 for(const name of KNOWN_REGISTRY_FILES){
  const file=path.join(root,name);
  if(fs.existsSync(file)&&fs.statSync(file).isFile())found.registryFiles.push(name);
 }
 if(config){
  const refs=new Set([...found.registryFiles,...collectRegistryRefs(config)]);
  found.registryFiles=[...refs].filter(rel=>!path.isAbsolute(rel)&&fs.existsSync(path.join(root,rel))&&fs.statSync(path.join(root,rel)).isFile()).sort();
 }
 const qg=path.join(root,'.quality-gate');
 if(fs.existsSync(qg)&&fs.statSync(qg).isDirectory()){
  const runs=path.join(qg,'runs');
  found.qualityGateDir={entries:fs.readdirSync(qg).sort(),...(fs.existsSync(runs)?{runsCount:fs.readdirSync(runs).length}:{})};
 }
 return found;
}

export const TIERS=[
 {id:'lite',name:'Lite 轻量接入',summary:'最小改动先跑起来：入门最小 / Node 工程 / Web API 服务'},
 {id:'pro',name:'Pro 专业治理',summary:'在 Lite 基础上增加数据账本、安全加固与六域全景'},
 {id:'max',name:'Max 全量治理',summary:'在 Pro 基础上再加发布治理（回滚/配置差/债务）'}
];
const tierRank={lite:0,pro:1,max:2};

const scanClaim=id=>({id:`ADDON-${id.toUpperCase()}`,statement:`Configured ${id.replace(/-scan$/,'')} scanning reports no findings at or above the blocking severity`});
const addonScan=(id,category,summary)=>({
 id,summary,
 claim:scanClaim(id),
 gate:{id,kind:'scan',category,level:'L4',enabled:true,stages:['close'],claimId:scanClaim(id).id,argv:[PLACEHOLDER],timeoutMs:5000,blockAt:'high'},
 risks:[{id:`${id}-R1`,gateId:id,description:'Scanner coverage and rules are project-configured; passing proves only the configured scan ran with no blocking findings'}],
 requiredSubstitutions:[{gateId:id,field:'argv',hint:`${summary} runner 命令，如 ["$NODE","scanners/${id}.mjs"]（需按 scan 观察协议输出 JSON）`}]
});

export const ADDONS={
 'change-scope':{
  id:'change-scope',summary:'变更范围登记门禁（L0，Git 基线差集）',
  claim:{id:'ADDON-CHANGE-SCOPE',statement:'This increment changes exactly the agreed file scope'},
  gate:{id:'change-scope',kind:'change-scope',level:'L0',enabled:true,stages:['close','pr'],claimId:'ADDON-CHANGE-SCOPE',file:registry('scope.json')},
  risks:[{id:'change-scope-R1',gateId:'change-scope',description:'Scope evidence is the Git worktree diff against the tagged baseline; uncommitted local noise counts as change'}],
  requiredSubstitutions:[],notes:`需提供 ${registry('scope.json')}（允许变更清单与基线标签），格式见 CONFIG-GUIDE 数据登记文件表`,
  // 裁剪智能化（v1.15 T6）：建议元数据——anyChange=存在任一未提交变更即触发（scope 纪律对任何变更都有价值）
  suggest:{anyChange:true,reason:'存在未提交变更面——变更范围登记把"本次改了什么"变成显式声明的差集证据'}
 },
 'sast-scan':{...addonScan('sast-scan','sast','静态应用安全扫描（SAST）'),
  suggest:{pathPatterns:['*.js','*.mjs','*.cjs','*.ts','*.tsx','*.jsx','*.py','*.go','*.java'],reason:'源代码文件有变更——SAST 扫描把安全基线纳入门禁'}
 },
 'api-authz-scan':{...addonScan('api-authz-scan','api-authz','API 授权声明扫描'),
  suggest:{pathPatterns:['api/*','routes/*','src/api/*','src/routes/*'],reason:'API 路由定义有变更——授权声明扫描要求逐 operation 显式鉴权'}
 },
 'credential-scan':{...addonScan('credential-scan','credential','凭据管理扫描'),
  suggest:{pathPatterns:['.env','*.env','config/*'],reason:'配置/环境文件有变更——凭据管理扫描检查凭据轮换与来源纪律'}
 },
 'debt-register':{
  id:'debt-register',summary:'技术债务登记门禁（L5，release 阶段）',
  claim:{id:'ADDON-DEBT',statement:'Release technical debt is assigned, bounded and not overdue'},
  gate:{id:'debt-register',kind:'debt',level:'L5',enabled:true,stages:['release'],claimId:'ADDON-DEBT',file:registry('debt.json')},
  risks:[{id:'debt-register-R1',gateId:'debt-register',description:'The register depends on honest entry of known debt and does not discover undisclosed debt'}],
  requiredSubstitutions:[],notes:`需提供 ${registry('debt.json')}（债务条目、负责人与到期日）`
  // debt-register 无 suggest 元数据：其触发是 release 流程性而非路径可推导——不做无依据推荐
 },
 'rerun-evidence':{
  id:'rerun-evidence',summary:'同 seed 重跑确定性证据门禁（L4）',
  claim:{id:'ADDON-RERUN',statement:'Same-seed rerun evidence shows deterministic outputs'},
  gate:{id:'rerun-evidence',kind:'rerun',level:'L4',enabled:true,stages:['close'],claimId:'ADDON-RERUN',file:registry('rerun.json')},
  risks:[{id:'rerun-evidence-R1',gateId:'rerun-evidence',description:'Evidence file is project-authored; the kernel verifies structure and hash consistency only'}],
  requiredSubstitutions:[],notes:`需提供 ${registry('rerun.json')}（每个 job 至少两次同 seed 运行的输出哈希）`,
  suggest:{pathPatterns:['jobs/*','job/*','batch/*','workers/*'],reason:'批处理/任务代码有变更——同 seed 重跑证据守护幂等性与确定性'}
 }
};

// 建议路径匹配（v1.15 T6）：'**' 匹配任意路径；'*.<ext>' 后缀（扩展名）匹配；其余按段匹配
// （'*' 通配一段，与 ignoreRoutes 同风格）。路径统一正斜杠。
export function suggestPathMatches(filePath,pattern){
 const normalized=filePath.replaceAll('\\','/');
 if(pattern==='**')return true;
 if(pattern.startsWith('*.'))return normalized.endsWith(pattern.slice(1));
 const segments=normalized.split('/');
 const wanted=pattern.split('/');
 return segments.length===wanted.length&&wanted.every((segment,index)=>segment==='*'||segment===segments[index]);
}

// 变更影响驱动的 add-on 推荐（v1.15 T6，建议性输出——不代写配置，采纳与否由项目对话决定）：
// changedPaths 为未提交变更面（git status --porcelain 归一），installedGateIds 为配置中已有
// 门禁 id 集——已安装的 add-on 不再推荐。无 suggest 元数据的条目不推荐（不做无依据推荐）。
export function suggestAddOns({changedPaths,installedGateIds}){
 if(!Array.isArray(changedPaths)||!Array.isArray(installedGateIds))throw new Error('suggestAddOns requires changedPaths and installedGateIds arrays');
 const items=[];
 for(const addon of Object.values(ADDONS)){
  if(installedGateIds.includes(addon.gate.id))continue;
  const suggest=addon.suggest;
  if(!suggest)continue;
  let matchedPaths=[];
  if(suggest.anyChange)matchedPaths=changedPaths.length>0?changedPaths.slice(0,5):[];
  else matchedPaths=changedPaths.filter(file=>suggest.pathPatterns.some(pattern=>suggestPathMatches(file,pattern)));
  if(!matchedPaths.length)continue;
  items.push({addOnId:addon.id,summary:addon.summary,reason:suggest.reason,matchedPaths,matchedCount:suggest.anyChange?changedPaths.length:matchedPaths.length});
 }
 return items;
}

export const TEMPLATES=[
 {
  id:'minimal',tier:'lite',name:'入门最小',summary:'一条真实命令 + 假设登记，最小可跑通组合（L0/L1）',
  levels:['L0','L1'],kinds:['command','assumptions'],
  requiredSubstitutions:[{gateId:'syntax',field:'argv',hint:'语法/构建检查命令，如 ["$NODE","--check","src/app.mjs"]'}],
  optionalSubstitutions:[{gateId:'assumptions',field:'file',hint:`假设登记文件，默认 ${registry('assumptions.json')}`}],
  availableAddOns:['change-scope','sast-scan'],
  notes:`close 前需提供假设登记文件（默认 ${registry('assumptions.json')}），格式见 CONFIG-GUIDE 数据登记文件表。`,
  config:{
   schemaVersion:'0.2',
   claims:[{id:'C1',statement:'The configured syntax or build command exits successfully'},{id:'C2',statement:'All declared project assumptions are confirmed'}],
   gates:[
    {id:'syntax',kind:'command',level:'L1',enabled:true,stages:['edit','close','pr','release'],claimId:'C1',argv:['$NODE','--check',PLACEHOLDER],timeoutMs:5000},
    {id:'assumptions',kind:'assumptions',level:'L0',enabled:true,stages:['close','pr','release'],claimId:'C2',file:registry('assumptions.json')}
   ],
   risks:[{id:'R1',gateId:'syntax',description:'The command proves only what it checks, not business correctness'},{id:'R2',gateId:'assumptions',description:'The register cannot discover unstated assumptions'}],
   exceptions:[]
  }
 },
 {
  id:'node-engineering',tier:'lite',name:'Node 工程',summary:'静态/单测/结构工程检查 + 需求追踪（L0/L1）',
  levels:['L0','L1'],kinds:['traceability','engineering'],
  requiredSubstitutions:[
   {gateId:'engineering',field:'checks',checkId:'static',hint:'语法检查命令，如 ["$NODE","--check","src/app.mjs"]'},
   {gateId:'engineering',field:'checks',checkId:'unit',hint:'单元测试命令，runner 需按 engineering 观察协议回报计数，如 ["$NODE","--test","tests/"]'},
   {gateId:'engineering',field:'checks',checkId:'structure',hint:'结构/约定检查命令（可包装现有 lint 工具），需按 findings 协议回报'}
  ],
  optionalSubstitutions:[{gateId:'requirements',field:'file',hint:`需求追踪登记文件，默认 ${registry('requirements.json')}`}],
  availableAddOns:['change-scope','debt-register'],
  notes:`需提供 ${registry('requirements.json')} 与各检查 runner；未提供前 close 将按 fail-closed 报 ERROR/FAIL。`,
  config:{
   schemaVersion:'0.2',
   claims:[{id:'ENG-1',statement:'The configured static, unit and structure checks pass'},{id:'ENG-2',statement:'Every acceptance criterion in the requirements register links to same-run engineering evidence'}],
   gates:[
    {id:'requirements',kind:'traceability',level:'L0',enabled:true,stages:['close','pr'],claimId:'ENG-2',file:registry('requirements.json')},
    {id:'engineering',kind:'engineering',level:'L1',enabled:true,stages:['close','pr'],claimId:'ENG-1',timeoutMs:30000,requiredChecks:['static','unit','structure'],checks:[
     {id:'static',type:'exit',argv:['$NODE','--check',PLACEHOLDER],timeoutMs:2000},
     {id:'unit',type:'test',argv:[PLACEHOLDER],timeoutMs:15000,blockOnSkipped:true},
     {id:'structure',type:'findings',argv:[PLACEHOLDER],timeoutMs:5000,maxFindings:0,maxBySeverity:{low:0,medium:0,high:0}}
    ]}
   ],
   risks:[{id:'ENG-R1',gateId:'engineering',description:'Checks cover the configured commands and rules only'},{id:'ENG-R2',gateId:'requirements',description:'Linked passing checks do not prove all acceptance semantics'}],
   exceptions:[],
   requiredLevels:{close:['L0','L1'],pr:['L0','L1']}
  }
 },
 {
  id:'web-api',tier:'lite',name:'Web/API 服务',summary:'API 契约对齐 + 关键行为用例 + SAST 扫描（L2/L3/L4）',
  levels:['L2','L3','L4'],kinds:['alignment','behavior','scan'],
  requiredSubstitutions:[
   {gateId:'api-contract',field:'argv',hint:'契约观察 runner 命令，需按 alignment 观察协议输出实际路由响应'},
   {gateId:'behavior',field:'argv',hint:'行为用例 runner 命令，接收 stdin 用例并回报实际结果'},
   {gateId:'behavior',field:'cases',hint:'关键行为用例数组 [{id,input,expected}]，含正常与边界'},
   {gateId:'sast',field:'argv',hint:'SAST runner 命令（需按 scan 观察协议输出 findings）'}
  ],
  optionalSubstitutions:[{gateId:'api-contract',field:'file',hint:`契约基线文件，默认 ${registry('api.expected.json')}`}],
  availableAddOns:['change-scope','api-authz-scan'],
  notes:`需提供 ${registry('api.expected.json')} 契约基线与各 runner；扫描 runner 可包装项目现有工具（输出协议见 CONFIG-GUIDE）。`,
  config:{
   schemaVersion:'0.2',
   claims:[{id:'API-1',statement:'The live route matches the declared API contract'},{id:'BEH-1',statement:'Configured critical behavior cases pass'},{id:'SEC-1',statement:'Configured sast scan contains no high findings'}],
   gates:[
    {id:'api-contract',kind:'alignment',level:'L2',enabled:true,stages:['close','pr'],claimId:'API-1',scope:'api',file:registry('api.expected.json'),argv:[PLACEHOLDER],timeoutMs:5000},
    {id:'behavior',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'BEH-1',argv:[PLACEHOLDER],timeoutMs:5000,cases:[
     {id:'case-1',input:{placeholder:PLACEHOLDER},expected:{placeholder:PLACEHOLDER}}
    ]},
    {id:'sast',kind:'scan',category:'sast',level:'L4',enabled:true,stages:['close','pr'],claimId:'SEC-1',argv:[PLACEHOLDER],timeoutMs:5000,blockAt:'high'}
   ],
   risks:[
    {id:'API-R1',gateId:'api-contract',description:'Only the observed sample route and response are checked'},
    {id:'BEH-R1',gateId:'behavior',description:'Only the listed behavior cases execute'},
    {id:'SEC-R1',gateId:'sast',description:'Scanner coverage and rules are project-configured; passing proves only the configured scans ran'}
   ],
   exceptions:[],
   requiredLevels:{close:['L2']}
  }
 },
 {
  id:'ledger-service',tier:'pro',name:'数据账本服务',summary:'持久化独立回读 + 账本一致性 + 财务不变式（L2）',
  levels:['L2'],kinds:['persistence','consistency','invariant'],
  requiredSubstitutions:[
   {gateId:'order-persistence',field:'argv',hint:'持久化验证 runner（调用 API 后独立回读存储并输出观察 JSON）'},
   {gateId:'ledger-consistency',field:'checks',checkId:'orders',hint:'零和检查 runner 命令'},
   {gateId:'ledger-consistency',field:'checks',checkId:'reconciliation',hint:'对账检查 runner 命令'},
   {gateId:'ledger-consistency',field:'checks',checkId:'audit',hint:'审计链检查 runner 命令'},
   {gateId:'financial-invariants',field:'argv',hint:'不变式查询 runner（输出断言所需字段供内核判定）'}
  ],
  availableAddOns:['change-scope','rerun-evidence'],
  notes:'一致性检查的业务对象（如 stateChangingOperations、对账 pairs）与不变式断言为骨架示例，需按项目实际账务语义改写；runner 未提供前 close 按 fail-closed 报错。',
  config:{
   schemaVersion:'0.2',
   claims:[
    {id:'PAY-1',statement:'Creating the target record persists every configured field exactly once'},
    {id:'PAY-2',statement:'Ledger consistency holds: zero-sum entries, reconciliation pairs and a verifiable audit chain'},
    {id:'INV-1',statement:'Committed records satisfy the declared financial invariants'}
   ],
   gates:[
    {id:'order-persistence',kind:'persistence',level:'L2',enabled:true,stages:['close','pr'],claimId:'PAY-1',argv:[PLACEHOLDER],timeoutMs:10000,expectedHttpStatus:201,correlationField:'id',requireSnapshots:true,expected:{id:'$RUN_ID'}},
    {id:'ledger-consistency',kind:'consistency',level:'L2',enabled:true,stages:['close','pr'],claimId:'PAY-2',timeoutMs:10000,requiredChecks:['orders','reconciliation','audit'],checks:[
     {id:'orders',type:'zero-sum',argv:[PLACEHOLDER],timeoutMs:2000,requirePreCommitCheck:true},
     {id:'reconciliation',type:'reconciliation',argv:[PLACEHOLDER],timeoutMs:2000,pairs:[{id:'ledger-vs-bank'}],breakSlaHours:72},
     {id:'audit',type:'audit-chain',argv:[PLACEHOLDER],timeoutMs:2000,stateChangingOperations:['appendMoneyOrder'],minRetentionDays:365}
    ]},
    {id:'financial-invariants',kind:'invariant',level:'L2',enabled:true,stages:['close'],claimId:'INV-1',argv:[PLACEHOLDER],timeoutMs:5000,assertions:[
     {id:'balanced-ledger',left:'debitSum',operator:'eq',right:'creditSum'},
     {id:'refund-cap',left:'refundAmount',operator:'le',right:'capturedAmount'}
    ]}
   ],
   risks:[
    {id:'PAY-R1',gateId:'order-persistence',description:'Runner must faithfully execute the API and independently query the intended database; only configured fields and cases are covered'},
    {id:'PAY-R2',gateId:'ledger-consistency',description:'Consistency options are skeleton values to be rewritten for the real ledger semantics'},
    {id:'INV-R1',gateId:'financial-invariants',description:'Only configured queries and assertions are checked; runner integrity is trusted'}
   ],
   exceptions:[]
  }
 },
 {
  id:'security-hardened',tier:'pro',name:'安全加固',summary:'SAST 扫描 + 授权 fail-secure 行为（L3/L4）',
  levels:['L3','L4'],kinds:['scan','behavior'],
  requiredSubstitutions:[
   {gateId:'sast',field:'argv',hint:'SAST runner 命令'},
   {gateId:'authz-behavior',field:'argv',hint:'授权行为 runner 命令'},
   {gateId:'authz-behavior',field:'cases',hint:'攻击与正向对照用例（BOLA 跨租户、属主放行、鉴权服务宕机 fail-secure）'}
  ],
  availableAddOns:['api-authz-scan','credential-scan','change-scope'],
  notes:'扫描 runner 可包装现有安全工具（semgrep 等），按 scan 观察协议输出 findings。',
  config:{
   schemaVersion:'0.2',
   claims:[
    {id:'SEC-1',statement:'Configured sast scan contains no high findings'},
    {id:'SEC-2',statement:'Authorization fails secure under the configured attack cases'}
   ],
   gates:[
    {id:'sast',kind:'scan',category:'sast',level:'L4',enabled:true,stages:['close'],claimId:'SEC-1',argv:[PLACEHOLDER],timeoutMs:5000,blockAt:'high'},
    {id:'authz-behavior',kind:'behavior',level:'L3',enabled:true,stages:['close'],claimId:'SEC-2',argv:[PLACEHOLDER],timeoutMs:5000,cases:[
     {id:'bola-cross-tenant',input:{placeholder:PLACEHOLDER},expected:{status:403}}
    ]}
   ],
   risks:[
    {id:'SEC-R1',gateId:'sast',description:'Scanner coverage and rules are project-configured; passing proves only the configured scans ran'},
    {id:'SEC-R2',gateId:'authz-behavior',description:'Only the listed attack cases execute; production needs the project full authorization matrix'}
   ],
   exceptions:[],
   requiredLevels:{close:['L4']}
  }
 },
 {
  id:'six-domain',tier:'pro',name:'六域全量',summary:'L0–L5 全域组合（追踪/语法/语义轮廓/行为/度量/债务+回滚演练），含 requiredLevels 治理',
  levels:['L0','L1','L2','L3','L4','L5'],kinds:['traceability','command','semantic-profile','behavior','metrics','debt'],
  requiredSubstitutions:[
   {gateId:'syntax',field:'argv',hint:'语法/构建检查命令，如 ["$NODE","--check","src/business.mjs"]'},
   {gateId:'behavior',field:'argv',hint:'行为用例 runner 命令'},
   {gateId:'behavior',field:'cases',hint:'业务行为用例数组（正常与边界）'},
   {gateId:'metrics',field:'argv',hint:'度量 runner 命令（输出阈值观测 JSON）'},
   {gateId:'rollback-drill',field:'argv',hint:'隔离回滚演练命令'}
  ],
  optionalSubstitutions:[
   {gateId:'metrics',field:'thresholds',hint:'自有指标阈值 {<指标名>:{min?,max?}}（1..20 个），替换模板演示指标（architectureViolations/unsafeEvalOccurrences/sampleLatencyMs）'}
  ],
  availableAddOns:['debt-register','rerun-evidence'],
  notes:`需提供 ${registry('requirements.json')}、${registry('profile.json')}、${registry('records.json')}、${registry('debt.json')} 等登记文件与各 runner。ontology 默认 fibo-skeleton 仅占位（validate 可过，但 semantic-profile 运行会 ERROR）；正式使用在 answers 提供 ontology——推荐 {"type":"fibo-pinned","expectedCatalogSha256":"<随包目录 sha，见 qgate.mjs templates 输出的 ontologyHint>"} 或 {"type":"local-catalog","file":"<项目目录文件>"}。`,
  config:{
   schemaVersion:'0.2',
   claims:[
    {id:'C0',statement:'The stated acceptance criterion links to implementation and a passing check'},
    {id:'C1',statement:'The business module parses'},
    {id:'C2',statement:'The agreement sample satisfies the declared FIBO-linked profile'},
    {id:'C3',statement:'The business policy handles configured normal and boundary cases'},
    {id:'C4',statement:'Configured architecture, security and latency metrics meet thresholds'},
    {id:'C5',statement:'Release technical debt is assigned, bounded and not overdue'},
    {id:'C5D',statement:'The isolated rollback drill succeeds'}
   ],
   gates:[
    {id:'rtm',kind:'traceability',level:'L0',enabled:true,stages:['close','release'],claimId:'C0',file:registry('requirements.json')},
    {id:'syntax',kind:'command',level:'L1',enabled:true,stages:['close','release'],claimId:'C1',argv:['$NODE','--check',PLACEHOLDER],timeoutMs:5000},
    {id:'profile',kind:'semantic-profile',level:'L2',enabled:true,stages:['close','release'],claimId:'C2',file:registry('profile.json'),dataFile:registry('records.json')},
    {id:'behavior',kind:'behavior',level:'L3',enabled:true,stages:['close','release'],claimId:'C3',argv:[PLACEHOLDER],timeoutMs:5000,cases:[
     {id:'case-1',input:{placeholder:PLACEHOLDER},expected:{placeholder:PLACEHOLDER}}
    ]},
    {id:'metrics',kind:'metrics',level:'L4',enabled:true,stages:['close','release'],claimId:'C4',argv:[PLACEHOLDER],timeoutMs:5000,thresholds:{architectureViolations:{max:0},unsafeEvalOccurrences:{max:0},sampleLatencyMs:{max:1000}}},
    {id:'technical-debt',kind:'debt',level:'L5',enabled:true,stages:['close','release'],claimId:'C5',file:registry('debt.json')},
    {id:'rollback-drill',kind:'command',level:'L5',enabled:true,stages:['close','release'],claimId:'C5D',argv:[PLACEHOLDER],timeoutMs:5000}
   ],
   risks:[
    {id:'R0',gateId:'rtm',description:'Linked passing checks do not prove all acceptance semantics'},
    {id:'R1',gateId:'syntax',description:'Syntax does not prove functional correctness'},
    {id:'R2',gateId:'profile',description:'Profile fields are project-authored, not inferred from FIBO'},
    {id:'R3',gateId:'behavior',description:'Only listed business cases execute'},
    {id:'R4',gateId:'metrics',description:'Demo scanner and timing samples are not production assurance'},
    {id:'R5',gateId:'technical-debt',description:'The debt register depends on honest entry of known debt'},
    {id:'R5D',gateId:'rollback-drill',description:'Drill does not exercise a production migration'}
   ],
   exceptions:[],
   ontology:{type:'fibo-skeleton'},
   requiredLevels:{close:['L0','L1','L2','L3','L4','L5'],release:['L0','L1','L2','L3','L4','L5']}
  }
 },
 {
  id:'release-governed',tier:'max',name:'发布治理',summary:'回滚演练 + 环境配置差 + 债务登记（L5，release 阶段）',
  levels:['L5'],kinds:['command','configuration','debt'],
  requiredSubstitutions:[{gateId:'rollback-drill',field:'argv',hint:'隔离回滚演练命令，如 ["$NODE","scripts/rollback-drill.mjs"]'}],
  availableAddOns:['sast-scan','change-scope'],
  notes:`需提供 ${registry('staging.json')}、${registry('production.json')}、${registry('debt.json')} 登记文件。`,
  config:{
   schemaVersion:'0.2',
   claims:[
    {id:'REL-1',statement:'The isolated rollback drill succeeds'},
    {id:'CFG-1',statement:'Release environment configuration has compatible keys and declared differences'},
    {id:'T-1',statement:'Release technical debt is assigned, bounded and not overdue'}
   ],
   gates:[
    {id:'rollback-drill',kind:'command',level:'L5',enabled:true,stages:['close','release'],claimId:'REL-1',argv:[PLACEHOLDER],timeoutMs:5000},
    {id:'config',kind:'configuration',level:'L5',enabled:true,stages:['release'],claimId:'CFG-1',files:{staging:registry('staging.json'),production:registry('production.json')},allowedDifferences:['endpoint','database.host','auth.token','features.*.enabled']},
    {id:'technical-debt',kind:'debt',level:'L5',enabled:true,stages:['release'],claimId:'T-1',file:registry('debt.json')}
   ],
   risks:[
    {id:'REL-R1',gateId:'rollback-drill',description:'Isolated drill does not prove production rollback capability'},
    {id:'CFG-R1',gateId:'config',description:'File comparison does not prove live deployment values or secret store availability'},
    {id:'T-R1',gateId:'technical-debt',description:'The register depends on honest entry of known debt'}
   ],
   exceptions:[],
   requiredLevels:{release:['L5']}
  }
 }
];

export function listTemplates(tier){
 if(tier!==undefined)check(TIERS.some(t=>t.id===tier),`Unknown tier: ${tier}`);
 return TEMPLATES.filter(t=>tier===undefined||tierRank[t.tier]<=tierRank[tier]).map(({config,...meta})=>meta);
}
export function getTemplate(id){
 const t=TEMPLATES.find(x=>x.id===id);
 check(t,`Unknown template id: ${id}`);
 return t;
}
export function listAddOns(){
 return Object.values(ADDONS).map(({claim,gate,risks,...meta})=>meta);
}

const applyGateSubstitution=(gate,spec)=>{
 for(const [key,value] of Object.entries(spec)){
  if(key==='argv'){check(Array.isArray(value)&&value.length&&value.every(text),`gate ${gate.id}: argv must be a non-empty string array`);gate.argv=value;}
  else if(key==='file'){check(text(value),`gate ${gate.id}: file must be text`);gate.file=value;}
  else if(key==='timeoutMs'){check(Number.isInteger(value)&&value>0&&value<=60000,`gate ${gate.id}: timeoutMs must be 1..60000`);gate.timeoutMs=value;}
  else if(key==='cases'){check(Array.isArray(value)&&value.length,`gate ${gate.id}: cases must be a non-empty array`);gate.cases=value;}
  else if(key==='thresholds'){
   // 与 validateMetrics 同构：1..20 个自有指标名，{min?,max?} 有限数值且 min<=max
   check(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0&&Object.keys(value).length<=20,`gate ${gate.id}: thresholds must be an object with 1..20 metrics`);
   for(const [name,limit] of Object.entries(value)){
    check(text(name)&&limit!==null&&typeof limit==='object'&&!Array.isArray(limit)&&('min'in limit||'max'in limit),`gate ${gate.id}: threshold ${name||'<empty>'} requires min and/or max`);
    check(!('min'in limit)||Number.isFinite(limit.min),`gate ${gate.id}: threshold ${name} has a non-finite min`);
    check(!('max'in limit)||Number.isFinite(limit.max),`gate ${gate.id}: threshold ${name} has a non-finite max`);
    check(!('min'in limit)||!('max'in limit)||limit.min<=limit.max,`gate ${gate.id}: threshold ${name} requires min<=max`);
   }
   gate.thresholds=value;
  }
  else if(key==='checks'){
   check(value!==null&&typeof value==='object'&&!Array.isArray(value),`gate ${gate.id}: checks substitution must be an object keyed by check id`);
   const byId=new Map((gate.checks??[]).map(c=>[c.id,c]));
   for(const [checkId,override] of Object.entries(value)){
    const target=byId.get(checkId);
    check(target,`gate ${gate.id}: unknown check id ${checkId}`);
    for(const [field,fieldValue] of Object.entries(override)){
     if(field==='argv'){check(Array.isArray(fieldValue)&&fieldValue.length&&fieldValue.every(text),`gate ${gate.id} check ${checkId}: argv must be a non-empty string array`);target.argv=fieldValue;}
     else if(field==='timeoutMs'){check(Number.isInteger(fieldValue)&&fieldValue>0&&fieldValue<=20000,`gate ${gate.id} check ${checkId}: timeoutMs must be 1..20000`);target.timeoutMs=fieldValue;}
     else throw new Error(`gate ${gate.id} check ${checkId}: unsupported substitution field ${field}`);
    }
   }
  }
  else throw new Error(`gate ${gate.id}: unsupported substitution field ${key}`);
 }
};

export const findPlaceholders=(node,origin)=>{
 const hits=[];
 const walk=(value,at)=>{
  if(typeof value==='string'){if(value.includes(PLACEHOLDER))hits.push(at);}
  else if(Array.isArray(value))value.forEach((item,index)=>{
   // gates/checks/claims 等带 id 的数组元素用 id 标注路径，报错可直接定位
   const labeled=item!==null&&typeof item==='object'&&text(item.id)&&text(item.kind)?`[${item.id}]`:`[${index}]`;
   walk(item,`${at}${labeled}`);
  });
  else if(value!==null&&typeof value==='object')for(const [key,child] of Object.entries(value))walk(child,`${at}.${key}`);
 };
 walk(node,origin);
 return hits;
};

// 本体 provider 声明形状（与 lib/ontology.mjs 三种类型对齐；answers/changes 共用，严格键集）
const validateOntology=o=>{
 check(o!==null&&typeof o==='object'&&!Array.isArray(o)&&text(o.type),'ontology must be an object with a type');
 if(o.type==='fibo-skeleton')check(Object.keys(o).length===1,'fibo-skeleton takes no other fields');
 else if(o.type==='local-catalog')check(text(o.file)&&!path.isAbsolute(o.file)&&Object.keys(o).length===2,'local-catalog requires exactly a project-relative file');
 else if(o.type==='fibo-pinned')check(/^[0-9a-f]{64}$/.test(o.expectedCatalogSha256)&&Object.keys(o).length===2,'fibo-pinned requires exactly a 64-hex expectedCatalogSha256');
 else throw new Error(`Unknown ontology type: ${o.type}`);
 return o;
};

// 登记文件门禁引用预检（init/update 写盘后调用，只读）：testGateIds/affectsGateIds
// 引用了配置中不存在的门禁时报告，提前避免首次 close 撞 rtm 类 fail-closed。
// 引用可出现在登记文件任意层级（如 requirements[].acceptanceCriteria[].testGateIds），做深度收集
export function preflightRefs(config,root){
 const gateIds=new Set(config.gates.map(g=>g.id));
 const refFields={traceability:['testGateIds'],decisions:['affectsGateIds']};
 const collect=(node,field,acc)=>{
  if(Array.isArray(node)){for(const item of node)collect(item,field,acc);return;}
  if(node===null||typeof node!=='object')return;
  const value=node[field];
  if(Array.isArray(value))for(const id of value)if(typeof id==='string')acc.push(id);
  for(const child of Object.values(node))collect(child,field,acc);
 };
 const findings=[];
 for(const g of config.gates){
  const fields=refFields[g.kind];
  if(!fields||!text(g.file))continue;
  const file=path.join(root,g.file);
  if(!fs.existsSync(file))continue;
  let data;
  try{data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{continue;}
  for(const field of fields){
   const ids=[];
   collect(data,field,ids);
   const unknown=[...new Set(ids)].filter(id=>!gateIds.has(id));
   if(unknown.length)findings.push({gateId:g.id,file:g.file,field,unknownGateIds:unknown});
  }
 }
 return findings;
}

// 共享变更核心（init 装配与 update 增量共用）：禁用级联清理→附加合并→替换→孤儿 claim 修剪
export function applyChanges(config,changes={}){
 check(config!==null&&typeof config==='object'&&Array.isArray(config.gates)&&Array.isArray(config.claims),'config with gates and claims required');
 check(changes!==null&&typeof changes==='object'&&!Array.isArray(changes),'changes object required');
 for(const key of Object.keys(changes))check(['addOns','disable','substitutions','requiredLevels','ontology'].includes(key),`Unknown changes field: ${key}`);
 const addOns=changes.addOns??[];
 const disable=changes.disable??[];
 check(Array.isArray(addOns)&&addOns.every(text)&&new Set(addOns).size===addOns.length,'addOns must be an array of unique add-on ids');
 check(Array.isArray(disable)&&disable.every(text)&&new Set(disable).size===disable.length,'disable must be an array of unique gate ids');
 const gateIds=new Set(config.gates.map(g=>g.id));
 const claimIds=new Set(config.claims.map(c=>c.id));
 for(const id of addOns){
  check(Object.hasOwn(ADDONS,id),`Unknown add-on: ${id}`);
  check(!gateIds.has(id),`Add-on gate id ${id} already exists in config`);
  check(!claimIds.has(ADDONS[id].claim.id),`Add-on claim id ${ADDONS[id].claim.id} already exists in config`);
 }
 for(const id of disable)check(gateIds.has(id),`Cannot disable ${id}: not an existing gate`);
 config.gates=config.gates.filter(g=>!disable.includes(g.id));
 // 级联清理：被禁用门禁的 risks/exceptions 一并移除，孤儿 claims 在合并附加门禁后统一修剪
 config.risks=config.risks.filter(r=>config.gates.some(g=>g.id===r.gateId));
 config.exceptions=config.exceptions.filter(x=>config.gates.some(g=>g.id===x.gateId)&&config.risks.some(r=>r.id===x.riskId));
 for(const id of addOns){
  const addon=ADDONS[id];
  config.gates.push(clone(addon.gate));
  config.claims.push(clone(addon.claim));
  config.risks.push(...clone(addon.risks));
 }
 if(changes.substitutions!==undefined){
  check(changes.substitutions!==null&&typeof changes.substitutions==='object'&&!Array.isArray(changes.substitutions),'substitutions must be an object');
  const gateSpecs=changes.substitutions.gates??{};
  const claimSpecs=changes.substitutions.claims??{};
  check(gateSpecs!==null&&typeof gateSpecs==='object'&&!Array.isArray(gateSpecs),'substitutions.gates must be an object');
  check(claimSpecs!==null&&typeof claimSpecs==='object'&&!Array.isArray(claimSpecs),'substitutions.claims must be an object');
  const gatesById=new Map(config.gates.map(g=>[g.id,g]));
  for(const [id,spec] of Object.entries(gateSpecs)){
   const gate=gatesById.get(id);
   check(gate,`Unknown substitution gate: ${id}`);
   check(spec!==null&&typeof spec==='object'&&!Array.isArray(spec),`gate ${id}: substitution must be an object`);
   applyGateSubstitution(gate,spec);
  }
  const claimsById=new Map(config.claims.map(c=>[c.id,c]));
  for(const [id,spec] of Object.entries(claimSpecs)){
   const claim=claimsById.get(id);
   check(claim,`Unknown substitution claim: ${id}`);
   check(spec!==null&&typeof spec==='object'&&!Array.isArray(spec)&&text(spec.statement)&&Object.keys(spec).length===1,`claim ${id}: substitution must be exactly {statement}`);
   claim.statement=spec.statement;
  }
 }
 const referenced=new Set(config.gates.map(g=>g.claimId));
 config.claims=config.claims.filter(c=>referenced.has(c.id));
 if(changes.requiredLevels!==undefined){
  check(changes.requiredLevels!==null&&typeof changes.requiredLevels==='object'&&!Array.isArray(changes.requiredLevels),'requiredLevels must be an object');
  config.requiredLevels=clone(changes.requiredLevels);
 }
 if(changes.ontology!==undefined)config.ontology=clone(validateOntology(changes.ontology));
 return config;
}

export function assembleConfig(answers){
 check(answers!==null&&typeof answers==='object'&&!Array.isArray(answers),'answers object required');
 for(const key of Object.keys(answers))check(['templateId','addOns','disable','substitutions','requiredLevels','ontology'].includes(key),`Unknown answers field: ${key}`);
 const template=getTemplate(answers.templateId);
 const config=clone(template.config);
 const addOns=answers.addOns??[];
 const disable=answers.disable??[];
 check(Array.isArray(addOns)&&addOns.every(text)&&new Set(addOns).size===addOns.length,'addOns must be an array of unique add-on ids');
 check(Array.isArray(disable)&&disable.every(text)&&new Set(disable).size===disable.length,'disable must be an array of unique gate ids');
 for(const id of addOns){
  check(Object.hasOwn(ADDONS,id),`Unknown add-on: ${id}`);
  check(template.availableAddOns.includes(id),`Add-on ${id} is not available for template ${template.id}`);
 }
 const templateGateIds=new Set(template.config.gates.map(g=>g.id));
 for(const id of disable){
  check(templateGateIds.has(id),`Cannot disable ${id}: not a gate of template ${template.id}${Object.hasOwn(ADDONS,id)?' (add-ons are opt-in; omit them from addOns)':''}`);
 }
 applyChanges(config,{...(addOns.length?{addOns}:{}),...(disable.length?{disable}:{}),...(answers.substitutions!==undefined?{substitutions:answers.substitutions}:{}),...(answers.requiredLevels!==undefined?{requiredLevels:answers.requiredLevels}:{}),...(answers.ontology!==undefined?{ontology:answers.ontology}:{})});
 const hits=findPlaceholders(config,'config');
 check(!hits.length,`Unresolved placeholder at ${hits.slice(0,5).join(', ')}${hits.length>5?` (+${hits.length-5} more)`:''}; supply substitutions or disable the gate`);
 // 溯源字段（v1.7.1）：update 据此识别模板漂移；update 只刷新 generatedAt，id 保持来源
 config.template={id:template.id,generatedAt:new Date().toISOString()};
 try{validate(config);}catch(e){throw new Error(`Assembled config invalid: ${e.message}`);}
 return config;
}
