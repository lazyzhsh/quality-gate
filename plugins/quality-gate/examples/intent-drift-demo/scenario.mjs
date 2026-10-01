import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run,exitCode} from '../../lib/kernel.mjs';
import {renderSummary} from '../../lib/summary.mjs';
import {taskIntentSha256} from '../../lib/task-intent.mjs';

// 任务意图漂移演示：change-scope 要求项目根即 Git 仓库根，示例目录嵌在本仓库内无法直接运行；
// 本驱动在临时目录内搭建带 baseline 标签的 Git 项目，套用随目录交付的模板配置，
// 按场景注入意图登记与变更后调用内核，输出与 CLI 相同（stdout=JSON 报告，stderr=摘要）。
// 场景（v0.9 §41.6）：ok=scope 内变更 PASS / outside=越界文件 FAIL outside-task-scope /
// tamper=意图登记被静默修改 FAIL intent-file-modified / revise=显式修订+重新绑定 PASS 且修订链留痕
const scenarios=['ok','outside','tamper','revise','bad-ac'];
const scenario=process.argv[2]??'ok';
if(!scenarios.includes(scenario)){
 console.error(`Usage: node scenario.mjs <${scenarios.join('|')}>`);
 process.exit(2);
}
const here=path.dirname(fileURLToPath(import.meta.url));
const git=(root,...args)=>{
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
 if(result.error?.code==='ENOENT')throw new Error('git executable not found; the intent-drift demo requires Git — install guide: https://git-scm.com/downloads');
 if(result.status!==0)throw new Error(result.stderr||`git ${args.join(' ')} failed`);
 return result.stdout.trim();
};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-intent-demo-'));
git(root,'init','-q');git(root,'config','user.email','demo@example.invalid');git(root,'config','user.name','intent-demo');
fs.mkdirSync(path.join(root,'src'));
fs.writeFileSync(path.join(root,'src','app.mjs'),'export const version=1;\n');
fs.writeFileSync(path.join(root,'README.md'),'baseline readme\n');
git(root,'add','.');git(root,'commit','-qm','baseline');
git(root,'tag','baseline');
fs.copyFileSync(path.join(here,'.quality-gate.json'),path.join(root,'.quality-gate.json'));
fs.copyFileSync(path.join(here,'scope.json'),path.join(root,'scope.json'));
const config=JSON.parse(fs.readFileSync(path.join(root,'scope.json'),'utf8'));
fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
const intent={taskId:'refund-cap',statement:'为退款增加可退余额上限校验',scope:['src/**','.quality-gate.json','scope.json'],acceptance:[{text:'@negative\n场景: 退款超限拒绝\n假如 可退余额为 100\n当 提交退款 150\n那么 拒绝并返回 REFUND_EXCEEDED',format:'gherkin'}],constraints:['no-new-dependencies'],source:{kind:'user-prompt',ref:'任务首轮'},createdAt:new Date().toISOString(),confirmedBy:'user'};
if(scenario==='bad-ac'){
 // 结构反例：声明 gherkin 但骨架缺 then——登记即校验，FAIL 指名 ac-structure-invalid
 intent.acceptance=[{text:'场景: 结构坏了\n当 只有前置没有结果',format:'gherkin'}];
}
fs.writeFileSync(path.join(root,'.quality-gate','registries','task-intent.json'),JSON.stringify(intent,null,2)+'\n');
config.taskIntent={file:'.quality-gate/registries/task-intent.json',acknowledgedSha256:taskIntentSha256(intent)};
fs.writeFileSync(path.join(root,'scope.json'),JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(path.join(root,'src','app.mjs'),'export const version=2;\n');
if(scenario==='outside'){
 fs.writeFileSync(path.join(root,'README.md'),'顺带改的说明（不在任务 scope 内）\n');
}
if(scenario==='tamper'){
 fs.writeFileSync(path.join(root,'.quality-gate','registries','task-intent.json'),JSON.stringify({...intent,scope:['**']},null,2)+'\n');
}
if(scenario==='revise'){
 fs.writeFileSync(path.join(root,'README.md'),'本次任务确需更新的使用说明\n');
 const revised={...intent,scope:['src/**','.quality-gate.json','scope.json','README.md'],revisions:[{revisedAt:new Date().toISOString(),reason:'验收要求同步更新使用说明',confirmedBy:'user',previousSha256:taskIntentSha256(intent)}]};
 fs.writeFileSync(path.join(root,'.quality-gate','registries','task-intent.json'),JSON.stringify(revised,null,2)+'\n');
 config.taskIntent.acknowledgedSha256=taskIntentSha256(revised);
 fs.writeFileSync(path.join(root,'scope.json'),JSON.stringify(config,null,2)+'\n');
}
const report=run(root,'close');
console.log(JSON.stringify(report));
console.error(renderSummary(report));
console.error(`scenario=${scenario} project=${root}`);
process.exit(exitCode(report));
