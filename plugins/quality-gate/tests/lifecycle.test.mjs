import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as templates from '../lib/templates.mjs';
const qgate=fileURLToPath(new URL('../bin/qgate.mjs',import.meta.url));
const adapter=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
const runCli=(...a)=>spawnSync(process.execPath,[qgate,...a],{encoding:'utf8'});
const invokeHook=input=>{const r=spawnSync(process.execPath,[adapter],{input:JSON.stringify(input)+'\n',encoding:'utf8'});assert.equal(r.status,0);return JSON.parse(r.stdout);};

function project(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate life '));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}
const write=(root,name,data)=>{const file=path.join(root,name);fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data,null,2));return file;};
const minimalAnswers={templateId:'minimal',substitutions:{gates:{syntax:{argv:['$NODE','--check','app.mjs']}}}};

test('leftovers reports detected artifacts and clean state',t=>{
 const root=project(t);
 assert.deepEqual(JSON.parse(runCli('leftovers',root).stdout),{registryFiles:[],qualityGateDir:null});
 write(root,'app.mjs','export default 1;\n');
 write(root,'rerun.json','{}');
 write(root,'notes.md','mine');
 fs.mkdirSync(path.join(root,'.quality-gate','runs'),{recursive:true});
 write(root,'.quality-gate/runs/a.json','{}');
 const out=JSON.parse(runCli('leftovers',root).stdout);
 assert.deepEqual(out.registryFiles,['rerun.json']);
 assert.equal(out.qualityGateDir.runsCount,1);
 assert.match(runCli('leftovers',root).stderr,/检测到 2 处残留/);
});

test('init --fresh deletes confirmed leftovers only after successful assembly',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 write(root,'rerun.json','{}');
 fs.mkdirSync(path.join(root,'.quality-gate','runs'),{recursive:true});
 write(root,'.quality-gate/runs/a.json','{}');
 write(root,'keep.md','mine');
 // 装配失败（残留占位符）不删除任何文件
 const bad=runCli('init',root,write(root,'bad.json',{templateId:'minimal'}),'--fresh');
 assert.equal(bad.status,2);
 assert.match(bad.stderr,/Unresolved placeholder/);
 assert.ok(fs.existsSync(path.join(root,'rerun.json')));
 assert.ok(fs.existsSync(path.join(root,'.quality-gate','runs','a.json')));
 const ok=runCli('init',root,write(root,'answers.json',minimalAnswers),'--fresh');
 assert.equal(ok.status,0,ok.stderr);
 assert.ok(!fs.existsSync(path.join(root,'rerun.json')));
 assert.ok(!fs.existsSync(path.join(root,'.quality-gate')));
 assert.ok(fs.existsSync(path.join(root,'keep.md')));
 assert.ok(JSON.parse(ok.stdout).fresh.registryFiles.includes('rerun.json'));
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 write(root,'.quality-gate/registries/assumptions.json',{assumptions:[{id:'A1',statement:'demo assumption',status:'confirmed'}]});
 const close=runCli(root,'close');
 assert.equal(close.status,0,close.stderr);
});

test('init --fresh on an existing config requires --force',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 const answers=write(root,'answers.json',minimalAnswers);
 assert.equal(runCli('init',root,answers).status,0);
 const blocked=runCli('init',root,answers,'--fresh');
 assert.equal(blocked.status,2);
 assert.match(blocked.stderr,/--force together with --fresh/);
 const forced=runCli('init',root,answers,'--force','--fresh');
 assert.equal(forced.status,0,forced.stderr);
});

test('update applies substitutions, migrates root registries and keeps close passing',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 write(root,'assumptions.json',{assumptions:[{id:'A1',statement:'demo assumption',status:'confirmed'}]});
 // 手写旧式配置（根目录登记路径、无溯源），模拟 1.7.0 时期项目
 write(root,'.quality-gate.json',{schemaVersion:'0.2',claims:[{id:'C1',statement:'works'}],gates:[
  {id:'syntax',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','--check','app.mjs'],timeoutMs:5000},
  {id:'assumptions',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C1',file:'assumptions.json'}
 ],risks:[{id:'R1',gateId:'assumptions',description:'register may omit unstated assumptions'}],exceptions:[]});
 const changes=write(root,'changes.json',{substitutions:{claims:{C1:{statement:'updated claim'}}},migrateRegistries:true});
 const result=runCli('update',root,changes);
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 const summary=JSON.parse(result.stdout);
 assert.deepEqual(summary.migrated,[{from:'assumptions.json',to:'.quality-gate/registries/assumptions.json'}]);
 assert.ok(!fs.existsSync(path.join(root,'assumptions.json')));
 assert.ok(fs.existsSync(path.join(root,'.quality-gate','registries','assumptions.json')));
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 assert.equal(config.gates.find(g=>g.id==='assumptions').file,'.quality-gate/registries/assumptions.json');
 assert.equal(config.claims.find(c=>c.id==='C1').statement,'updated claim');
 assert.equal(config.template,undefined,'hand-written config gains no invented provenance');
 assert.equal(runCli(root,'close').status,0,'close passes after migration');
});

test('update adds a scan add-on with a real runner and close still passes',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 write(root,'.quality-gate/registries/assumptions.json',{assumptions:[{id:'A1',statement:'demo assumption',status:'confirmed'}]});
 assert.equal(runCli('init',root,write(root,'answers.json',minimalAnswers)).status,0);
 fs.mkdirSync(path.join(root,'scanners'),{recursive:true});
 write(root,'scanners/pass.mjs','let raw="";process.stdin.on("data",c=>raw+=c).on("end",()=>{const q=JSON.parse(raw);process.stdout.write(JSON.stringify({schemaVersion:"0.1",runId:q.runId,tool:"pass",version:"1",category:q.category,target:".",findings:[]}));});\n');
 const changes=write(root,'changes.json',{addOns:['sast-scan'],substitutions:{gates:{'sast-scan':{argv:['$NODE','scanners/pass.mjs']}}}});
 const result=runCli('update',root,changes);
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 assert.deepEqual(JSON.parse(result.stdout).added,['sast-scan']);
 const close=runCli(root,'close');
 assert.equal(close.status,0,close.stderr);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 assert.equal(config.template.id,'minimal','provenance origin preserved');
 assert.ok(!Number.isNaN(Date.parse(config.template.generatedAt)));
});

test('update rejects invalid inputs without writing',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 write(root,'.quality-gate/registries/assumptions.json',{assumptions:[{id:'A1',statement:'demo assumption',status:'confirmed'}]});
 runCli('init',root,write(root,'answers.json',minimalAnswers));
 const before=fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8');
 const change=(name,data)=>write(root,name,data);
 assert.match(runCli('update',root,change('c1.json',{oops:1})).stderr,/Unknown changes field/);
 assert.match(runCli('update',root,change('c3.json',{disable:['nope']})).stderr,/not an existing gate/);
 assert.match(runCli('update',root,change('c4.json',{substitutions:{gates:{nope:{argv:['$NODE','-e','0']}}}})).stderr,/Unknown substitution gate/);
 assert.equal(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'),before,'failures must not touch the config');
 const empty=project(t);
 assert.match(runCli('update',empty,'x.json').stderr,/missing \.quality-gate\.json/);
 const collide=project(t);
 write(collide,'app.mjs','export default 1;\n');
 write(collide,'.quality-gate.json',{schemaVersion:'0.2',claims:[{id:'C1',statement:'w'}],gates:[{id:'change-scope',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','0'],timeoutMs:1000}],risks:[],exceptions:[]});
 assert.match(runCli('update',collide,write(collide,'c.json',{addOns:['change-scope']})).stderr,/already exists in config/);
});

test('update applies the documented ontology change (was rejected by the changes whitelist)',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 write(root,'.quality-gate.json',{schemaVersion:'0.2',claims:[{id:'CL-1',statement:'w'}],gates:[{id:'g',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'CL-1',argv:['$NODE','-e','0'],timeoutMs:1000}],risks:[],exceptions:[]});
 const out=runCli('update',root,write(root,'c.json',{ontology:{type:'fibo-skeleton'}}));
 assert.equal(out.status,0,out.stderr);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 assert.equal(config.ontology?.type,'fibo-skeleton');
});

test('update refuses placeholders and skips migration when the target exists',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 write(root,'assumptions.json',{assumptions:[{id:'A1',statement:'a',status:'confirmed'}]});
 write(root,'.quality-gate.json',{schemaVersion:'0.2',claims:[{id:'C1',statement:'works'}],gates:[
  {id:'probe',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['__PLACEHOLDER__'],timeoutMs:5000}
 ],risks:[],exceptions:[]});
 assert.match(runCli('update',root,write(root,'c.json',{})).stderr,/Unresolved placeholder/);
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 write(root,'.quality-gate/registries/assumptions.json',{assumptions:[{id:'A1',statement:'a',status:'confirmed'}]});
 write(root,'.quality-gate.json',{schemaVersion:'0.2',claims:[{id:'C1',statement:'works'}],gates:[
  {id:'syntax',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','--check','app.mjs'],timeoutMs:5000},
  {id:'assumptions',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C1',file:'assumptions.json'}
 ],risks:[],exceptions:[]});
 const result=runCli('update',root,write(root,'m.json',{migrateRegistries:true}));
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 const summary=JSON.parse(result.stdout);
 assert.deepEqual(summary.skipped,[{from:'assumptions.json',to:'.quality-gate/registries/assumptions.json',reason:'target-exists'}]);
 assert.ok(fs.existsSync(path.join(root,'assumptions.json')),'source untouched on skip');
});

test('inspect reports provenance match, budgets, registries and invalid configs',t=>{
 const root=project(t);
 write(root,'app.mjs','export default 1;\n');
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 write(root,'.quality-gate/registries/assumptions.json',{assumptions:[{id:'A1',statement:'demo assumption',status:'confirmed'}]});
 runCli('init',root,write(root,'answers.json',minimalAnswers));
 const good=JSON.parse(runCli('inspect',root).stdout);
 assert.equal(good.valid,true);
 assert.equal(good.template.id,'minimal');
 assert.equal(good.templateMatch.mode,'provenance');
 assert.equal(good.templateMatch.id,'minimal');
 assert.ok(good.applicableAddOns.includes('change-scope'));
 assert.deepEqual(good.registries,[{path:'.quality-gate/registries/assumptions.json',exists:true}]);
 assert.equal(good.budgets.close.usedMs,5000);
 const hand=project(t);
 write(hand,'app.mjs','export default 1;\n');
 write(hand,'assumptions.json',{assumptions:[{id:'A1',statement:'a',status:'confirmed'}]});
 write(hand,'.quality-gate.json',{schemaVersion:'0.2',claims:[{id:'C1',statement:'works'}],gates:[{id:'g',kind:'assumptions',level:'L0',enabled:true,stages:['close'],claimId:'C1',file:'assumptions.json'}],risks:[],exceptions:[]});
 const similar=JSON.parse(runCli('inspect',hand).stdout);
 assert.equal(similar.templateMatch.mode,'similarity');
 assert.equal(similar.templateMatch.id,'minimal');
 write(hand,'.quality-gate.json','{broken');
 assert.equal(runCli('inspect',hand).status,2);
 const missing=runCli('inspect',project(t));
 assert.equal(missing.status,2);
 assert.match(missing.stderr,/missing \.quality-gate\.json/);
});

// ---- 裁剪智能化（v1.15 T6）：inspect 建议块——元数据×未提交变更面，建议性不代写 ----

const gitInit=root=>{
 const run=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 run('init','-q');run('config','user.email','test@example.invalid');run('config','user.name','Test');
 return run;
};
const suggestionConfig={schemaVersion:'0.2',claims:[{id:'C1',statement:'works'}],gates:[{id:'syntax',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','--check','app.mjs'],timeoutMs:5000}],risks:[],exceptions:[]};
test('inspect suggests add-ons from the uncommitted change surface and stays honest without git',t=>{
 // 非 git 临时目录 → available:false（变更面不可得，不做无依据推荐）
 const bare=project(t);
 write(bare,'app.mjs','export default 1;\n');
 write(bare,'.quality-gate.json',suggestionConfig);
 const bareResult=JSON.parse(runCli('inspect',bare).stdout);
 assert.equal(bareResult.suggestions.available,false);
 assert.match(bareResult.suggestions.reason,/not a git repository/);
 // git 仓库：干净工作区 → 无建议；未提交源码/任务/配置/API 变更 → 按元数据命中
 const root=project(t);
 const git=gitInit(root);
 write(root,'app.mjs','export default 1;\n');
 write(root,'.quality-gate.json',suggestionConfig);
 git('add','.');git('commit','-qm','seed');
 let result=JSON.parse(runCli('inspect',root).stdout);
 assert.equal(result.suggestions.available,true);
 assert.equal(result.suggestions.changedFileCount,0);
 assert.deepEqual(result.suggestions.items,[]);
 for(const dir of ['jobs','api','config','.quality-gate/runs'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 write(root,'jobs/import.py','print("new")\n');
 write(root,'api/routes.ts','export {};\n');
 write(root,'config/prod.yaml','mode: prod\n');
 write(root,'.quality-gate/runs/ignored.json','{}'); result=JSON.parse(runCli('inspect',root).stdout);
 assert.equal(result.suggestions.changedFileCount,3); // .quality-gate/ 运行数据不计入
 const ids=result.suggestions.items.map(item=>item.addOnId);
 assert.deepEqual(ids,['change-scope','sast-scan','api-authz-scan','credential-scan','rerun-evidence']); // debt-register 无路径可推导，不推荐
 const sast=result.suggestions.items.find(item=>item.addOnId==='sast-scan');
 assert.deepEqual(sast.matchedPaths,['api/routes.ts','jobs/import.py']); // git status 字母序
 assert.ok(sast.reason.length>0);
 // 已安装门禁不再推荐：配置加入 change-scope 门禁后 anyChange 建议消失
 const withScope={...suggestionConfig,gates:[...suggestionConfig.gates,{id:'change-scope',kind:'change-scope',level:'L0',enabled:true,stages:['close'],claimId:'C1',file:'.quality-gate/registries/scope.json'}]};
 write(root,'.quality-gate.json',withScope);
 result=JSON.parse(runCli('inspect',root).stdout);
 assert.ok(!result.suggestions.items.some(item=>item.addOnId==='change-scope'));
 // inspect 只读：不写配置（无 update 通道）
 const before=fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8');
 runCli('inspect',root);
 assert.equal(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'),before);
});
test('suggestAddOns matcher honors extension, segment and any-change semantics',()=>{
 const {suggestAddOns,suggestPathMatches}=templates;
 assert.equal(suggestPathMatches('jobs/import.py','*.py'),true);
 assert.equal(suggestPathMatches('jobs/import.py','jobs/*'),true);
 assert.equal(suggestPathMatches('src/jobs/import.py','jobs/*'),false);
 assert.equal(suggestPathMatches('a/b/c.txt','**'),true);
 assert.equal(suggestPathMatches('src\\win\\x.py','*.py'),true); // 反斜杠归一
 const items=suggestAddOns({changedPaths:['jobs/run.mjs'],installedGateIds:[]});
 assert.deepEqual(items.map(item=>item.addOnId),['change-scope','sast-scan','rerun-evidence']);
 assert.throws(()=>suggestAddOns({}),/requires changedPaths/);
});

test('init and update surface registry gate-id preflight warnings',t=>{
 const root=project(t);
 write(root,'calc.mjs','export default 1;\n');
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 write(root,'.quality-gate/registries/requirements.json',{criteria:[],testGateIds:['legacy-gate','engineering']});
 const answers={templateId:'node-engineering',substitutions:{gates:{engineering:{checks:{static:{argv:['$NODE','--check','calc.mjs']},unit:{argv:['$NODE','-e','0']},structure:{argv:['$NODE','-e','0']}}}}}};
 const init=runCli('init',root,write(root,'answers.json',answers));
 assert.equal(init.status,0,init.stderr);
 assert.deepEqual(JSON.parse(init.stdout).preflightGateRefs,[{gateId:'requirements',file:'.quality-gate/registries/requirements.json',field:'testGateIds',unknownGateIds:['legacy-gate']}]);
 assert.match(init.stderr,/预检警告.*legacy-gate/);
 const upd=runCli('update',root,write(root,'c.json',{disable:['engineering']}));
 assert.equal(upd.status,0,upd.stderr);
 assert.deepEqual(JSON.parse(upd.stdout).preflightGateRefs[0].unknownGateIds,['legacy-gate','engineering'],'disabling a referenced gate re-flags it while unresolved ids persist');
});

test('SessionStart hints clean re-initialization when leftovers exist without config',t=>{
 const root=project(t);
 fs.mkdirSync(path.join(root,'.quality-gate','runs'),{recursive:true});
 const context=invokeHook({cwd:root,hook_event_name:'SessionStart'}).hookSpecificOutput.additionalContext;
 assert.match(context,/First run detected: no \.quality-gate\.json\. Run \/quality-gate-init/);
 assert.match(context,/Previous quality-gate state detected/);
});
