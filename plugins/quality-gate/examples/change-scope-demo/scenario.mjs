import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run,exitCode} from '../../lib/kernel.mjs';
import {renderSummary} from '../../lib/summary.mjs';

// change-scope 要求项目根即 Git 仓库根，示例目录嵌在本仓库内无法直接运行；
// 本驱动在临时目录内搭建带 baseline 标签的 Git 项目，套用随目录交付的模板配置，
// 按场景注入变更后调用内核，输出与 CLI 相同（stdout=JSON 报告，stderr=摘要）。
const scenarios=['ok','over-scope','protected','content'];
const scenario=process.argv[2]??'ok';
if(!scenarios.includes(scenario)){
 console.error(`Usage: node scenario.mjs <${scenarios.join('|')}>`);
 process.exit(2);
}
const here=path.dirname(fileURLToPath(import.meta.url));
const git=(root,...args)=>{
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
 if(result.error?.code==='ENOENT')throw new Error('git executable not found; the change-scope demo requires Git — install guide: https://git-scm.com/downloads');
 if(result.status!==0)throw new Error(result.stderr||`git ${args.join(' ')} failed`);
 return result.stdout.trim();
};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-scope-demo-'));
git(root,'init','-q');git(root,'config','user.email','demo@example.invalid');git(root,'config','user.name','scope-demo');
fs.mkdirSync(path.join(root,'src'));
fs.writeFileSync(path.join(root,'src','app.mjs'),'export const version=1;\n');
fs.writeFileSync(path.join(root,'README.md'),'baseline readme\n');
fs.writeFileSync(path.join(root,'package.json'),'{\n  "lock": true\n}\n');
fs.copyFileSync(path.join(here,'content-check.mjs'),path.join(root,'content-check.mjs'));
git(root,'add','.');git(root,'commit','-qm','baseline');
git(root,'tag','baseline');
fs.copyFileSync(path.join(here,'.quality-gate.json'),path.join(root,'.quality-gate.json'));
fs.copyFileSync(path.join(here,'scope.json'),path.join(root,'scope.json'));
if(scenario==='content')fs.writeFileSync(path.join(root,'src','app.mjs'),'export const version=2;\nexport const probe=()=>{debugger;};\n');
else fs.writeFileSync(path.join(root,'src','app.mjs'),'export const version=2;\n');
if(scenario==='over-scope')fs.writeFileSync(path.join(root,'README.md'),'out-of-scope edit\n');
if(scenario==='protected')fs.writeFileSync(path.join(root,'package.json'),'{\n  "lock": false\n}\n');
const report=run(root,'close');
console.log(JSON.stringify(report));
console.error(renderSummary(report));
console.error(`scenario=${scenario} project=${root}`);
process.exit(exitCode(report));
