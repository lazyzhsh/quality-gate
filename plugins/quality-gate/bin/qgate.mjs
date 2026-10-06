import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run,exitCode,validate,STAGE_BUDGET_MS} from '../lib/kernel.mjs';
import {executionBudget} from '../lib/execution-budget.mjs';
import {renderSummary,renderBrief} from '../lib/summary.mjs';
import {runProposalAudit} from '../lib/proposals.mjs';
import {writeTaskIntent,readTaskIntentStatus} from '../lib/task-intent.mjs';
import {TEMPLATES,ADDONS,REGISTRY_DIR,listTemplates,listAddOns,assembleConfig,applyChanges,scanLeftovers,collectRegistryRefs,findPlaceholders,preflightRefs,suggestAddOns} from '../lib/templates.mjs';
import {FIBO_CATALOG_SHA} from '../lib/ontology.mjs';
const usage='Usage: node qgate.mjs <project-root> [edit|close|pr|release]\n       node qgate.mjs report <project-root> [runId]   (re-render an archived run; latest when omitted, unique id prefix accepted)\n       node qgate.mjs proposals <project-root> [proposals-file]\n       node qgate.mjs templates [lite|pro|max]\n       node qgate.mjs init <project-root> <answers-file> [--force] [--fresh]\n       node qgate.mjs update <project-root> <changes-file>\n       node qgate.mjs inspect <project-root>\n       node qgate.mjs intent <project-root> [answers-file] [--revise]  (register/revise the task intent; read-only render when answers omitted)\n       node qgate.mjs leftovers <project-root>';
const args=process.argv.slice(2);
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
if(args[0]==='proposals'){
 const root=args[1],file=args[2]??'ontology-proposals.json';
 if(!root||args.length>3){console.error(usage);process.exitCode=2;}
 else {
  try{
   const report=runProposalAudit(root,file);
   console.log(JSON.stringify(report,null,2));
   console.error(report.drift.length?`发现 ${report.drift.length} 条已接受但未 pin 的提案（accepted-not-pinned）；请人工复核后写入 semantic-alignment mappings 或改回 proposed/rejected。`:`提案登记与 pinned 映射一致；等待决策 ${report.byStatus.proposed} 条、已拒绝 ${report.byStatus.rejected} 条。提案与 confidence 不构成门禁证据。`);
   process.exitCode=report.drift.length?1:0;
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else if(args[0]==='templates'){
 const tier=args[1];
 if(args.length>2||(tier!==undefined&&!['lite','pro','max'].includes(tier))){console.error(usage);process.exitCode=2;}
 else {
  const templates=listTemplates(tier);
  console.log(JSON.stringify({tier:tier??null,templates,addOns:listAddOns(),ontologyHint:{fiboPinnedCatalogSha256:FIBO_CATALOG_SHA}},null,2));
  console.error(`档位 ${tier??'全部'} 可用模板 ${templates.length} 个：${templates.map(t=>`${t.id}[${t.tier}](${t.levels.join('/')})`).join('、')}。附加门禁：${listAddOns().map(a=>a.id).join('、')}。本体钉扎：{"type":"fibo-pinned","expectedCatalogSha256":"${FIBO_CATALOG_SHA}"}。answers 契约与占位符说明见 CONFIG-GUIDE「引导初始化与模板库」。`);
 }
} else if(args[0]==='init'){
 const flags=args.slice(1).filter(a=>a.startsWith('--'));
 const force=flags.includes('--force');
 const fresh=flags.includes('--fresh');
 const positional=args.slice(1).filter(a=>!a.startsWith('--'));
 if(positional.length!==2||flags.some(f=>f!=='--force'&&f!=='--fresh')||args.length!==3+flags.length){console.error(usage);process.exitCode=2;}
 else {
  try{
   const root=fs.realpathSync(positional[0]);
   const configPath=path.join(root,'.quality-gate.json');
   const exists=fs.existsSync(configPath);
   if(exists&&fresh&&!force)throw new Error(`re-initializing ${configPath} requires --force together with --fresh (review the existing config with the user first)`);
   if(exists&&!force)throw new Error(`${configPath} already exists; review it with the user, apply incremental changes via qgate.mjs update, or pass --force to overwrite`);
   const answers=readJson(positional[1]);
   // 装配先行：answers 无效时不删除任何文件
   const config=assembleConfig(answers);
   let freshRemoved;
   if(fresh){
    let oldConfig=null;
    if(exists){try{oldConfig=readJson(configPath);}catch{oldConfig=null;}}
    const scan=scanLeftovers(root,oldConfig);
    for(const rel of scan.registryFiles)fs.rmSync(path.join(root,rel));
    fs.rmSync(path.join(root,'.quality-gate'),{recursive:true,force:true});
    freshRemoved={registryFiles:scan.registryFiles,qualityGateDir:scan.qualityGateDir!==null};
   }
   fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
   // 登记文件门禁引用预检：requirements 等引用了不存在门禁时当场警告，避免首次 close 必撞 rtm
   const preflight=preflightRefs(config,root);
   console.log(JSON.stringify({status:'initialized',templateId:answers.templateId,configPath,gates:config.gates.map(g=>g.id),claims:config.claims.map(c=>c.id),...(freshRemoved?{fresh:freshRemoved}:{}),...(preflight.length?{preflightGateRefs:preflight}:{})},null,2));
   for(const p of preflight)console.error(`预检警告：${p.gateId} 的登记文件 ${p.file} 字段 ${p.field} 引用了配置中不存在的门禁 [${p.unknownGateIds.join(', ')}]——重映射登记引用或补齐门禁后再跑 close，不要禁用门禁放行。`);
   console.error(`已写入 ${configPath}（模板 ${answers.templateId}，${config.gates.length} 门禁）。${freshRemoved?`已按确认清理 ${freshRemoved.registryFiles.length} 个残留登记文件${freshRemoved.qualityGateDir?'与 .quality-gate/ 目录':''}。`:''}下一步：node qgate.mjs "${root}" close 产出首份证据；缺少 runner 或登记文件会按 fail-closed 报错，按 CONFIG-GUIDE 补齐，不要为通过而禁用门禁。`);
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else if(args[0]==='update'){
 if(args.length!==3){console.error(usage);process.exitCode=2;}
 else {
  try{
   const root=fs.realpathSync(args[1]);
   const configPath=path.join(root,'.quality-gate.json');
   if(!fs.existsSync(configPath))throw new Error('missing .quality-gate.json: run onboarding first (qgate.mjs init), or re-initialize via init --fresh');
   const config=readJson(configPath);
   const changes=readJson(args[2]);
   for(const key of Object.keys(changes)){
    if(!['addOns','disable','substitutions','requiredLevels','migrateRegistries','ontology'].includes(key))throw new Error(`Unknown changes field: ${key}`);
   }
   applyChanges(config,{...(changes.addOns!==undefined?{addOns:changes.addOns}:{}),...(changes.disable!==undefined?{disable:changes.disable}:{}),...(changes.substitutions!==undefined?{substitutions:changes.substitutions}:{}),...(changes.requiredLevels!==undefined?{requiredLevels:changes.requiredLevels}:{}),...(changes.ontology!==undefined?{ontology:changes.ontology}:{})});
   // 登记文件迁移：仅迁移配置 file 类字段指向的根目录文件；路径先在内存改写，校验通过后才移动文件并写盘
   const migrated=[],skipped=[],moves=[];
   if(changes.migrateRegistries===true){
    for(const from of collectRegistryRefs(config).filter(rel=>!rel.includes('/')&&!path.isAbsolute(rel)&&fs.existsSync(path.join(root,rel))&&fs.statSync(path.join(root,rel)).isFile())){
     const to=`${REGISTRY_DIR}/${from}`;
     if(fs.existsSync(path.join(root,to)))skipped.push({from,to,reason:'target-exists'});
     else {
      moves.push({from,to});
      for(const g of config.gates){
       if(g.file===from)g.file=to;
       if(g.dataFile===from)g.dataFile=to;
       if(g.files!==null&&typeof g.files==='object'&&!Array.isArray(g.files))for(const [key,value] of Object.entries(g.files))if(value===from)g.files[key]=to;
      }
      if(config.ontology?.file===from)config.ontology.file=to;
     }
    }
   }
   const hits=findPlaceholders(config,'config');
   if(hits.length)throw new Error(`Unresolved placeholder at ${hits.slice(0,5).join(', ')}; supply substitutions via update first`);
   if(config.template)config.template.generatedAt=new Date().toISOString();
   try{validate(config);}catch(e){throw new Error(`Updated config invalid: ${e.message}`);}
   if(moves.length){
    fs.mkdirSync(path.join(root,REGISTRY_DIR),{recursive:true});
    for(const {from,to} of moves){fs.renameSync(path.join(root,from),path.join(root,to));migrated.push({from,to});}
   }
   fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
   const preflight=preflightRefs(config,root);
   for(const p of preflight)console.error(`预检警告：${p.gateId} 的登记文件 ${p.file} 字段 ${p.field} 引用了配置中不存在的门禁 [${p.unknownGateIds.join(', ')}]——重映射登记引用或补齐门禁后再跑 close，不要禁用门禁放行。`);
   console.log(JSON.stringify({status:'updated',configPath,added:changes.addOns??[],disabled:changes.disable??[],migrated,skipped,...(preflight.length?{preflightGateRefs:preflight}:{})},null,2));
   console.error(`已更新 ${configPath}：+${(changes.addOns??[]).length} 附加门禁 / -${(changes.disable??[]).length} 禁用 / 迁移登记文件 ${migrated.length} 个${skipped.length?`（跳过 ${skipped.length} 个：目标已存在）`:''}。下一步：node qgate.mjs "${root}" close 验证；不为通过而禁用门禁。`);
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else if(args[0]==='inspect'){
 if(args.length!==2){console.error(usage);process.exitCode=2;}
 else {
  try{
   const root=fs.realpathSync(args[1]);
   const configPath=path.join(root,'.quality-gate.json');
   if(!fs.existsSync(configPath))throw new Error('missing .quality-gate.json: run onboarding first (qgate.mjs templates / qgate.mjs init)');
   const config=readJson(configPath);
   let valid=true,error=null;
   try{validate(config);}catch(e){valid=false;error=e.message;}
   // 预算与 run/Stop 同源（F01）：登记内嵌 runner（convention argv 规则、contentCheck）
   // 一并计入 usedMs；登记不可读时该阶段如实给出 error 而不是回退仅声明预算
   const budgets={};
   for(const stage of ['edit','close','pr','release']){
    try{
     const b=executionBudget(root,{...config,gates:config.gates??[]},stage);
     budgets[stage]={usedMs:b.totalMs,declaredMs:b.declaredMs,nestedMs:b.nestedMs,budgetMs:STAGE_BUDGET_MS[stage],...(b.nested.length?{nested:b.nested}:{})};
    }catch(error){budgets[stage]={usedMs:null,budgetMs:STAGE_BUDGET_MS[stage],error:error.message};}
   }
   const configGateIds=new Set((config.gates??[]).map(g=>g.id));
   let templateMatch;
   if(config.template?.id&&TEMPLATES.some(t=>t.id===config.template.id)){
    const template=TEMPLATES.find(t=>t.id===config.template.id);
    const templateGateIds=template.config.gates.map(g=>g.id);
    templateMatch={mode:'provenance',id:template.id,templateGateIdsNotInConfig:templateGateIds.filter(id=>!configGateIds.has(id)),configGateIdsNotInTemplate:(config.gates??[]).map(g=>g.id).filter(id=>!templateGateIds.includes(id))};
   }
   else {
    const configKinds=new Set((config.gates??[]).map(g=>g.kind));
    let best=null;
    for(const t of TEMPLATES){
     const kinds=new Set(t.config.gates.map(g=>g.kind));
     const overlap=[...configKinds].filter(k=>kinds.has(k)).length;
     const score=configKinds.size?overlap/Math.max(configKinds.size,kinds.size):0;
     if(!best||score>best.score)best={id:t.id,score,overlap};
    }
    templateMatch={mode:'similarity',...best};
   }
   const applicableAddOns=Object.keys(ADDONS).filter(id=>!configGateIds.has(id));
   const registries=collectRegistryRefs(config).map(rel=>({path:rel,exists:fs.existsSync(path.join(root,rel))}));
   // 裁剪智能化（v1.15 T6）：变更影响驱动的 add-on 推荐——建议性输出，不代写配置。
   // 变更面=未提交变更（git status --porcelain -uall 逐文件展开——默认会把整目录未跟踪项
   // 折叠成 dir/ 使扩展名匹配失效；.quality-gate/ 运行数据不计入）；非 git 仓库如实标注
   // unavailable，不做无依据推荐。
   let suggestions;
   const status=spawnSync('git',['status','--porcelain','-uall'],{cwd:root,shell:false,encoding:'utf8',maxBuffer:1<<20,timeout:5000,windowsHide:true});
   if(status.error||status.signal||status.status!==0){
    suggestions={available:false,reason:'not a git repository or git unavailable — change surface unknown, no suggestions made'};
   }else{
    const changedPaths=status.stdout.split(/\r?\n/).filter(line=>line.trim().length>0).map(line=>{
     let entry=line.slice(3);
     const renameAt=entry.indexOf(' -> ');
     if(renameAt!==-1)entry=entry.slice(renameAt+4);
     if(entry.startsWith('"')&&entry.endsWith('"'))entry=entry.slice(1,-1);
     return entry.replaceAll('\\','/').replace(/\/$/,'');
    }).filter(entry=>entry.length>0&&!entry.startsWith('.quality-gate/'));
    const items=suggestAddOns({changedPaths,installedGateIds:[...(config.gates??[]).map(g=>g.id)]});
    suggestions={available:true,changedFileCount:changedPaths.length,items};
   }
   console.log(JSON.stringify({root,valid,error,gates:(config.gates??[]).map(g=>({id:g.id,kind:g.kind,level:g.level,enabled:g.enabled,stages:g.stages})),budgets,requiredLevels:config.requiredLevels??null,template:config.template??null,templateMatch,applicableAddOns,registries,suggestions},null,2));
   const match=templateMatch.mode==='provenance'?templateMatch.id:`${templateMatch.id}（相似度 ${Number(templateMatch.score??0).toFixed(2)}）`;
   console.error(valid?`配置有效：${(config.gates??[]).length} 门禁；模板匹配 ${match}；可用附加门禁 ${applicableAddOns.length} 项；登记文件 ${registries.filter(r=>r.exists).length}/${registries.length} 存在。`:`配置无效：${error}`);
   if(suggestions.available&&suggestions.items.length)console.error(`建议（变更影响驱动，采纳与否由项目决定）：${suggestions.items.map(item=>`${item.addOnId}（${item.reason}，匹配 ${item.matchedCount} 个变更文件）`).join('；')}。`);
   else if(!suggestions.available)console.error('建议：不可用（非 git 仓库或 git 不可用——变更面不可得，不做无依据推荐）。');
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else if(args[0]==='intent'){
 const flags=args.slice(1).filter(a=>a.startsWith('--'));
 const revise=flags.includes('--revise');
 const positional=args.slice(1).filter(a=>!a.startsWith('--'));
 if(positional.length<1||positional.length>2||flags.some(f=>f!=='--revise')||args.length!==1+positional.length+flags.length){console.error(usage);process.exitCode=2;}
 else if(positional.length===1){
  try{
   const status=readTaskIntentStatus(fs.realpathSync(positional[0]));
   console.log(JSON.stringify(status,null,2));
   if(!status.registered)console.error(`未登记任务意图（${status.file}）。经 /quality-gate-intent 问询确认后：node qgate.mjs intent <project-root> <answers-file> 写入——没有意图基准的"完成"只是 agent 自述。`);
   else {
    const bindingText=status.bindings.length?status.bindings.map(b=>`${b.gateId}:${b.status}`).join('、'):'无 change-scope 绑定（漂移对账未激活）';
    console.error(`任务意图基准: ${status.taskId}（${status.confirmedBy} 于 ${status.createdAt} 确认${status.revisionsCount?`，修订 ${status.revisionsCount} 次`:''}；内容哈希 ${status.contentSha256.slice(0,8)}…；绑定 ${bindingText}）。显示用 ${status.file}；修订须 --revise+reason，不要手改登记文件。`);
   }
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
 else {
  try{
   const root=fs.realpathSync(positional[0]);
   const answers=readJson(positional[1]);
   const result=writeTaskIntent(root,answers,{revise});
   console.log(JSON.stringify({status:revise?'revised':'registered',...result},null,2));
   const rebind=result.reboundSpecs?.length?`已重新绑定 ${result.reboundSpecs.map(s=>`${s.gateId}(${s.specFile})`).join('、')}。`:'未发现声明 taskIntent 的 change-scope spec——漂移对账未激活，可在 scope.json 增加绑定后重跑本命令。';
   console.error(`已${revise?'修订':'登记'}任务意图 ${result.taskId}（内容哈希 ${result.contentSha256.slice(0,8)}…${result.revisionsCount?`，修订链 ${result.revisionsCount} 条`:''}）。${rebind}下一步：node qgate.mjs "${root}" close 对账。`);
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else if(args[0]==='leftovers'){
 if(args.length!==2){console.error(usage);process.exitCode=2;}
 else {
  try{
   const root=fs.realpathSync(args[1]);
   let config=null;
   try{config=readJson(path.join(root,'.quality-gate.json'));}catch(e){if(e.code!=='ENOENT')config=null;}
   const scan=scanLeftovers(root,config);
   console.log(JSON.stringify(scan,null,2));
   const count=scan.registryFiles.length+(scan.qualityGateDir?1:0);
   console.error(count?`检测到 ${count} 处残留：${scan.registryFiles.join('、')}${scan.qualityGateDir?'、.quality-gate/ 目录':''}。经用户确认后用 qgate.mjs init --fresh 清理并全新初始化。`:'未检测到 quality-gate 残留（根目录已知登记文件与 .quality-gate/ 目录均不存在）。');
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else if(args[0]==='report'){
 if(args.length<2||args.length>3){console.error(usage);process.exitCode=2;}
 else {
  try{
   const root=fs.realpathSync(args[1]);
   const runsDir=path.join(root,'.quality-gate','runs');
   const noRuns=`no archived runs under ${runsDir}; run a stage first (node qgate.mjs <root> close)`;
   let file;
   if(args[2]){
    file=path.join(runsDir,`${args[2]}.json`);
    if(!fs.existsSync(file)){
     // runId 支持唯一前缀：对话/人读场景不必抄 36 位 id；歧义即 fail-closed 列出候选
     if(args[2].length<4)throw new Error(`run id prefix must be at least 4 characters: "${args[2]}"`);
     const matches=fs.existsSync(runsDir)?fs.readdirSync(runsDir).filter(name=>name.endsWith('.json')&&name.slice(0,-'.json'.length).startsWith(args[2])):[];
     if(!matches.length)throw new Error(`run ${args[2]} not found under ${runsDir}`);
     if(matches.length>1)throw new Error(`run id prefix "${args[2]}" is ambiguous (${matches.length} matches): ${matches.slice(0,5).map(m=>m.slice(0,-'.json'.length)).join('、')}${matches.length>5?' …':''}——加长前缀后重试`);
     file=path.join(runsDir,matches[0]);
    }
   }
   else {
    if(!fs.existsSync(runsDir))throw new Error(noRuns);
    const latest=fs.readdirSync(runsDir).filter(name=>name.endsWith('.json')).map(name=>({name,mtime:fs.statSync(path.join(runsDir,name)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime)[0];
    if(!latest)throw new Error(noRuns);
    file=path.join(runsDir,latest.name);
   }
   const r=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
   // 历史渲染守卫：明示这是归档运行及其原始时间，避免被误读为当前状态；重跑提示按本
   // CLI 绝对路径渲染（v1.14），任意 cwd 下复制即用
   console.log(`（归档运行 · 生成于 ${r.finishedAt??r.startedAt??'未知时间'} · run=${r.id} · 非当前状态；重跑: node "${fileURLToPath(import.meta.url)}" "${root}" ${r.stage??'close'}）`);
   console.log(renderSummary(r));
  }catch(e){console.error(e.message);process.exitCode=2;}
 }
} else {
 const [root,stage='close',...extra]=args;
 if(!root||extra.length){console.error(usage);process.exitCode=2;}
 else {try {const r=run(root,stage);console.log(JSON.stringify(r,null,2));console.error(r.status==='PASS'?renderBrief(r):renderSummary(r));process.exitCode=exitCode(r);}catch(e){console.error(e.message);process.exitCode=2;}}
}
