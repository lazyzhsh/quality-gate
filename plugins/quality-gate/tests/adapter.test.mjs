import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
const hook=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
function invoke(input,env={}){const r=spawnSync(process.execPath,[hook],{input:JSON.stringify(input)+'\n',encoding:'utf8',env:{...process.env,...env}});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
const runsCount=root=>fs.existsSync(path.join(root,'.quality-gate','runs'))?fs.readdirSync(path.join(root,'.quality-gate','runs')).filter(n=>n.endsWith('.json')).length:0;
test('P2 SessionStart injects context',t=>{const f=fixture(t);assert.match(invoke({cwd:f.root,hook_event_name:'SessionStart'}).hookSpecificOutput.additionalContext,/Quality Gate/);});
test('P2 Stop permits pass and blocks failure, including retry',t=>{const f=fixture(t);assert.deepEqual(invoke({cwd:f.root,hook_event_name:'Stop'}),{});f.c.gates[0].argv[2]='process.exit(1)';f.save();const out=invoke({cwd:f.root,hookEventName:'Stop',stop_hook_active:true});assert.equal(out.decision,'block');assert.match(out.reason,/node ".*qgate\.mjs"/);});
// v1.14：adapter 自身输入损坏不再阻断（模型无法通过改项目文件修复客户端输入）
test('v1.14 invalid input is non-blocking with guidance',()=>{const out=invoke({hook_event_name:'Stop'});assert.equal(out.decision,undefined);assert.match(out.systemMessage,/adapter error/);});
test('v1.14 ungated project Stop does not block',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate ungated '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const out=invoke({cwd:root,hook_event_name:'Stop'});
 assert.equal(out.decision,undefined);assert.match(out.systemMessage,/quality-gate-init/);
});
test('v1.14 corrupt config still blocks (ERROR is a fixable signal)',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,'.quality-gate.json'),'{ broken');
 assert.equal(invoke({cwd:f.root,hook_event_name:'Stop'}).decision,'block');
});
test('v1.14 Stop reuses a fresh archived run instead of re-running',t=>{
 const f=fixture(t);
 f.c.gates=[{id:'G',claimId:'C1',kind:'configuration',level:'L5',enabled:true,stages:['close'],files:{a:'a.json',b:'b.json'},allowedDifferences:[]}];f.save();
 fs.writeFileSync(path.join(f.root,'a.json'),'{"v":1}');fs.writeFileSync(path.join(f.root,'b.json'),'{"v":1}');
 invoke({cwd:f.root,hook_event_name:'Stop'});
 assert.equal(runsCount(f.root),1);
 invoke({cwd:f.root,hook_event_name:'Stop'});
 assert.equal(runsCount(f.root),1); // 输入未变 → 复用归档结论，不新增运行
 fs.writeFileSync(path.join(f.root,'touched.md'),'x');
 invoke({cwd:f.root,hook_event_name:'Stop'});
 assert.equal(runsCount(f.root),2); // 输入已变 → 回退全量重跑
});
// v1.14 stop.blockMode=new-only：会话开始前既有、且声明输入未变的 FAIL 放行为警告；
// 新失败、输入已变、配置漂移、ERROR 仍阻断
test('v1.14 new-only downgrades pre-existing failures with untouched inputs',t=>{
 const f=fixture(t),data=fs.mkdtempSync(path.join(os.tmpdir(),'qgate hookdata '));t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
 f.c.gates=[{id:'legacy',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000},
            {id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(0)'],timeoutMs:1000}];
 f.c.stop={blockMode:'new-only',inputs:{legacy:['legacy/**']}};
 f.save();
 assert.equal(invoke({cwd:f.root,hook_event_name:'Stop'},{ZCODE_PLUGIN_DATA:data}).decision,'block'); // 首次失败：无基线 → 全部视为新失败
 invoke({cwd:f.root,hook_event_name:'SessionStart'},{ZCODE_PLUGIN_DATA:data}); // 绑定会话基准（legacy=FAIL）
 fs.writeFileSync(path.join(f.root,'docs-note.md'),'x'); // 与 legacy 声明输入无关的变更
 const allowed=invoke({cwd:f.root,hook_event_name:'Stop'},{ZCODE_PLUGIN_DATA:data});
 assert.equal(allowed.decision,undefined);
 assert.match(allowed.systemMessage,/既有（legacy）/);
 fs.mkdirSync(path.join(f.root,'legacy'));fs.writeFileSync(path.join(f.root,'legacy','rule.txt'),'x'); // 命中声明输入
 const blocked=invoke({cwd:f.root,hook_event_name:'Stop'},{ZCODE_PLUGIN_DATA:data});
 assert.equal(blocked.decision,'block'); // 既有失败的输入已变 → 不降级，照常阻断
});
test('v1.14 new-only blocks when config drifted after baseline',t=>{
 const f=fixture(t),data=fs.mkdtempSync(path.join(os.tmpdir(),'qgate hookdata '));t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
 f.c.gates=[{id:'legacy',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(1)'],timeoutMs:1000}];
 f.c.stop={blockMode:'new-only',inputs:{legacy:['legacy/**']}};
 f.save();
 invoke({cwd:f.root,hook_event_name:'Stop'},{ZCODE_PLUGIN_DATA:data});
 invoke({cwd:f.root,hook_event_name:'SessionStart'},{ZCODE_PLUGIN_DATA:data});
 f.c.stop.inputs.legacy.push('extra/**');f.save(); // 配置漂移：基线哈希失效，失败全部视为新
 assert.equal(invoke({cwd:f.root,hook_event_name:'Stop'},{ZCODE_PLUGIN_DATA:data}).decision,'block');
});
test('v1.14 SessionStart injects baseline status of the last run',t=>{
 const f=fixture(t);
 f.c.gates[0].argv[2]='process.exit(1)';f.save();
 invoke({cwd:f.root,hook_event_name:'Stop'});
 assert.match(invoke({cwd:f.root,hook_event_name:'SessionStart'}).hookSpecificOutput.additionalContext,/基准: 最近一次 close 运行 FAIL/);
});
