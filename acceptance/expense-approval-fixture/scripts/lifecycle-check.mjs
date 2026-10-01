import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// 1.7.x 配置生命周期自动验证（在临时副本上执行，不改基线）：
// inspect 现状 → update 增量（阈值替换 / 禁用被引用门禁的预检警告）→ migrateRegistries 迁移
// → 重初始化旅程（删配置 → leftovers 清单 → init --fresh（ontology 钉扎 + 自有阈值 answers）→ 登记重建 → 预检修复 → close 六域 PASS）
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository=path.resolve(project,'..','..');
const qgate=process.env.QGATE_CLI||path.join(repository,'plugins','quality-gate','bin','qgate.mjs');
const registries='.quality-gate/registries';
const steps=[];
const ok=(name,assertion,detail)=>{assertion||(()=>{throw new Error(`${name}: ${detail}`)})();steps.push({name,ok:true,...(detail?{detail}:{})});};

function copy(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expense-qgate-life-'));
 fs.cpSync(project,dir,{recursive:true,filter:source=>{
  const relative=path.relative(project,source).split(path.sep).join('/');
  return relative!=='build'&&relative!=='.quality-gate/runs';
 }});
 return dir;
}
function cli(...args){
 const run=spawnSync(process.execPath,[qgate,...args],{cwd:repository,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4_000_000});
 if(run.error)throw run.error;
 return {code:run.status,stdout:run.stdout,stderr:run.stderr,json(){return JSON.parse(run.stdout);}};
}
const baseline=JSON.parse(fs.readFileSync(path.join(project,'.quality-gate.json'),'utf8'));
const gate=id=>baseline.gates.find(g=>g.id===id);
const write=(dir,file,data)=>fs.writeFileSync(path.join(dir,file),typeof data==='string'?data:JSON.stringify(data,null,2));

let dir=copy();
try{
 // 1. 基线正例
 const close=cli(dir,'close');
 ok('baseline close PASS with six domains',close.code===0&&close.json().status==='PASS'&&close.json().levelCoverage.every(d=>d.status==='PASS'),`exit=${close.code}`);

 // 2. inspect：手写合并配置无溯源 → 相似度匹配；登记文件齐全；预算合规
 const inspect=cli('inspect',dir);
 const info=inspect.json();
 ok('inspect valid + similarity match + registries present',info.valid===true&&info.templateMatch.mode==='similarity'&&info.registries.every(r=>r.exists)&&info.budgets.close.usedMs<=40000,`match=${info.templateMatch?.mode}`);

 // 3. update 禁用被引用门禁 → preflightGateRefs 警告（1.7.2）
 const disable=cli('update',dir,(write(dir,'c1.json',{disable:['behavior']}),path.join(dir,'c1.json')));
 const preflight=disable.json().preflightGateRefs??[];
 ok('update disable flags referenced gate via preflight',disable.code===0&&preflight.some(p=>p.gateId==='rtm'&&p.unknownGateIds.includes('behavior')),JSON.stringify(preflight));

 fs.rmSync(dir,{recursive:true,force:true});dir=copy();
 // 4. update 替换 metrics 阈值（1.7.2 自有指标名）后 close 仍 PASS
 const thresholds=gate('metrics').thresholds;
 thresholds.sampleLatencyMs={...thresholds.sampleLatencyMs,max:999};
 const tuned=cli('update',dir,(write(dir,'c2.json',{substitutions:{gates:{metrics:{thresholds}}}}),path.join(dir,'c2.json')));
 const tunedClose=cli(dir,'close');
 ok('update thresholds substitution keeps close PASS',tuned.code===0&&tunedClose.code===0,tuned.stderr.slice(0,200));

 fs.rmSync(dir,{recursive:true,force:true});dir=copy();
 // 5. migrateRegistries：根目录登记文件迁回集中目录并改写路径
 fs.renameSync(path.join(dir,registries,'rerun.json'),path.join(dir,'rerun.json'));
 write(dir,'.quality-gate.json',{...baseline,gates:baseline.gates.map(g=>g.id==='rerun-evidence'?{...g,file:'rerun.json'}:g)});
 const migrated=cli('update',dir,(write(dir,'c3.json',{migrateRegistries:true}),path.join(dir,'c3.json')));
 const migratedClose=cli(dir,'close');
 ok('migrateRegistries moves and rewrites root registry',migrated.code===0&&migrated.json().migrated.length===1&&!fs.existsSync(path.join(dir,'rerun.json'))&&migratedClose.code===0,JSON.stringify(migrated.json().migrated));

 fs.rmSync(dir,{recursive:true,force:true});dir=copy();
 // 6. 重初始化旅程：删配置 → leftovers → init --fresh（ontology 钉扎 + 模板替换）→ 登记重建（先带断链引用验证预检）→ close 六域 PASS
 const registryBytes={};
 for(const name of ['requirements.json','profile.json','records.json','debt.json','rerun.json'])registryBytes[name]=fs.readFileSync(path.join(dir,registries,name));
 fs.rmSync(path.join(dir,'.quality-gate.json'));
 const leftovers=cli('leftovers',dir);
 ok('leftovers detects quality-gate state without config',leftovers.json().qualityGateDir!==null,JSON.stringify(leftovers.json().qualityGateDir?.entries));
 const ontologyHint=cli('templates').json().ontologyHint;
 const answers={
  templateId:'six-domain',
  addOns:['rerun-evidence'],
  substitutions:{gates:{
   syntax:{argv:gate('syntax').argv},
   behavior:{argv:gate('behavior').argv,cases:gate('behavior').cases},
   metrics:{argv:gate('metrics').argv,thresholds:gate('metrics').thresholds},
   'rollback-drill':{argv:gate('rollback-drill').argv}
  }},
  ontology:{type:'fibo-pinned',expectedCatalogSha256:ontologyHint.fiboPinnedCatalogSha256},
  requiredLevels:{close:['L0','L1','L2','L3','L4','L5'],release:['L0','L1','L2','L3','L4','L5']}
 };
 const init=cli('init',dir,(write(dir,'answers.json',answers),path.join(dir,'answers.json')),'--fresh');
 const initPayload=init.json();
 ok('init --fresh writes config and removes leftovers',init.code===0&&initPayload.status==='initialized'&&initPayload.fresh?.qualityGateDir===true&&!fs.existsSync(path.join(dir,registries)),`fresh=${JSON.stringify(initPayload.fresh)}`);
 // 重建登记：requirements 先带断链引用（旧门禁 id）验证 update 预检，再修正
 const requirements=JSON.parse(registryBytes['requirements.json']);
 requirements.requirements[0].acceptanceCriteria[0].testGateIds=['legacy-approval-behavior','behavior'];
 fs.mkdirSync(path.join(dir,registries),{recursive:true});
 write(dir,`${registries}/requirements.json`,requirements);
 const stale=cli('update',dir,(write(dir,'c4.json',{}),path.join(dir,'c4.json')));
 const staleRefs=stale.json().preflightGateRefs??[];
 ok('update preflight flags stale registry gate refs',stale.code===0&&staleRefs.some(p=>p.unknownGateIds.includes('legacy-approval-behavior')),JSON.stringify(staleRefs));
 requirements.requirements[0].acceptanceCriteria[0].testGateIds=['behavior','rerun-evidence'];
 write(dir,`${registries}/requirements.json`,requirements);
 for(const name of ['profile.json','records.json','debt.json','rerun.json'])fs.writeFileSync(path.join(dir,registries,name),registryBytes[name]);
 const reinitClose=cli(dir,'close');
 ok('re-initialized close PASS across six domains',reinitClose.code===0&&reinitClose.json().status==='PASS'&&reinitClose.json().levelCoverage.every(d=>d.status==='PASS'),`exit=${reinitClose.code}`);
 const reinit=JSON.parse(fs.readFileSync(path.join(dir,'.quality-gate.json'),'utf8'));
 ok('re-init answers carried ontology pin and provenance',reinit.ontology?.type==='fibo-pinned'&&reinit.ontology.expectedCatalogSha256===ontologyHint.fiboPinnedCatalogSha256&&reinit.template?.id==='six-domain',`template=${reinit.template?.id}`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}

const pluginVersion=JSON.parse(fs.readFileSync(path.join(repository,'marketplace.json'),'utf8')).plugins[0].version;
console.log(JSON.stringify({schemaVersion:'0.1',project,pluginVersion,steps,summary:{steps:steps.length,allPassed:true}},null,2));
console.error(`生命周期检查 ${steps.length}/${steps.length} 全部通过（基线正例/inspect/update 预检/阈值替换/迁移/重初始化旅程）；插件版本 ${pluginVersion}。`);
