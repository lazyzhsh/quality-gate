import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate space '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const c={schemaVersion:'0.2',claims:[{id:'C1',statement:'build works'}],risks:[],exceptions:[],gates:[{id:'build',kind:'command',level:'L1',enabled:true,stages:['close'],claimId:'C1',argv:['$NODE','-e','process.exit(0)'],timeoutMs:1000}]};
 const save=()=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));save();return {root,c,save};
}
// 零 spawn 版：基础门禁 id/位置不变（同轮证据与整体计数语义保持），kind 换为文件式 debt（空登记 none:true 恒 PASS）。
// 墙钟瓶颈为进程生成而非 CPU（~0.1s/spawn）——文件式测试的几乎全部成本原是基础 command 门禁的每次 run 一次子进程。
// 改写基础门禁为失败 command 的测试用 `f.c.gates[0]={id:'build',kind:'command',…}` 整对象覆写；argv 原位变异型（adapter/dependencies/invariant/kernel/summary）仍用 fixture()。
export function leanFixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate space '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const c={schemaVersion:'0.2',claims:[{id:'C1',statement:'build works'}],risks:[],exceptions:[],gates:[{id:'build',kind:'debt',level:'L5',enabled:true,stages:['close'],claimId:'C1',file:'debt.json'}]};
 fs.writeFileSync(path.join(root,'debt.json'),JSON.stringify({items:[],none:true}));
 const save=()=>fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(c));save();return {root,c,save};
}
