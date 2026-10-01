import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run,exitCode} from '../../lib/kernel.mjs';
import {renderSummary} from '../../lib/summary.mjs';

// 适配器双向对账演示（v1.20 轨道 C，OD-111=A）：参考适配器以真实解释器/依赖清单解析 Python/Java
// import 并产出观察文件，内核词法提取×回报恰好覆盖双向对账。场景：
// ok=适配器如实回报→PASS / ghost=注入幻觉 import→FAIL unresolved 指名（两种语言各一） /
// trim=裁剪 java 回报模拟瞒报→FAIL observation-coverage-gap（runner 无权决定引用集）
// python 解释器缺席时仅 java 腿运行（python 绑定不加，stderr 如实提示）。
const scenarios=['ok','ghost','trim'];
const scenario=process.argv[2]??'ok';
if(!scenarios.includes(scenario)){
 console.error(`Usage: node scenario.mjs <${scenarios.join('|')}>`);
 process.exit(2);
}
const here=path.dirname(fileURLToPath(import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-adapter-demo-'));
fs.cpSync(here,root,{recursive:true,filter:source=>!source.endsWith('scenario.mjs')});
const python=(()=>{for(const candidate of ['python','python3']){if(spawnSync(candidate,['-c','print(1)'],{windowsHide:true}).status===0)return candidate;}return null;})();
const javaFiles=['src/main/java/com/example/Main.java','src/main/java/com/example/Order.java'];
const runAdapters=()=>{
 const java=spawnSync(process.execPath,[path.resolve(here,'../../adapters/java/import_scan.mjs'),'--output','.quality-gate/observations/java.json',...javaFiles],{cwd:root,windowsHide:true,encoding:'utf8'});
 if(java.status!==0)throw new Error(java.stderr||'java adapter failed');
 if(python){
  const probe=spawnSync(python,[path.resolve(here,'../../adapters/python/import_probe.py'),'--output','.quality-gate/observations/py.json','pkg/app.py'],{cwd:root,windowsHide:true,encoding:'utf8'});
  if(probe.status!==0)throw new Error(probe.stderr||'python adapter failed');
 }
};
if(scenario==='ghost'){
 fs.appendFileSync(path.join(root,'pkg','app.py'),'import ghost_module\n');
 fs.appendFileSync(path.join(root,'src','main','java','com','example','Main.java'),'import com.ghost.Missing;\n');
}
runAdapters();
const configPath=path.join(root,'.quality-gate.json');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(python)config.gates[0].importObservations.push({language:'python',file:'.quality-gate/observations/py.json'});
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
if(scenario==='trim'){
 // 模拟瞒报：观察文件删去一条已提取的回报——内核 coverage 对账指名缺口
 const observationPath=path.join(root,'.quality-gate','observations','java.json');
 const observation=JSON.parse(fs.readFileSync(observationPath,'utf8'));
 observation.entries=observation.entries.filter(entry=>entry.module!=='com.example.Order');
 fs.writeFileSync(observationPath,JSON.stringify(observation,null,2)+'\n');
}
const report=run(root,'close');
console.log(JSON.stringify(report));
console.error(renderSummary(report));
console.error(`scenario=${scenario} project=${root}${python?'':' python=absent(java 腿单跑)'}`);
process.exit(exitCode(report));
