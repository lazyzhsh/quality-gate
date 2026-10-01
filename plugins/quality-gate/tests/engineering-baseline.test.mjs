import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run} from '../lib/kernel.mjs';
import {failureReasons,downgradeNotes,evidenceStrength} from '../lib/summary.mjs';
import {project,engineering,configOf,saveConfig,unitCheck,focusChecks} from './engineering-helpers.mjs';

const git=(root,...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
test('unit baselineSource: git real baseline preferred, embedded fallback downgraded, git-mode strict',t=>{
 // 场景一：无 git 历史 → demo runner 回退内嵌基线，any 模式放行并在摘要降级标注
 const plain=project(t);focusChecks(plain,['unit']);
 let result=run(plain);
 const unitAny=engineering(result).details.checks.find(x=>x.id==='unit');
 assert.equal(unitAny.status,'PASS');
 assert.equal(unitAny.baseline.status,'embedded');
 assert.ok(downgradeNotes(result).some(note=>note.includes('unit: 基线为内嵌声明')),JSON.stringify(downgradeNotes(result)));
 // 场景二：临时 git 仓库真基线（legacy 提交后切回当前实现）——runner 经 QGATE_BASELINE_REF 双次运行
 const root=project(t);focusChecks(root,['unit']);
 // 真基线演练：先提交 legacy 版 calc.mjs（无大额档），再切回当前实现——f2p 用例在基线须失败
 const currentSource=fs.readFileSync(path.join(root,'calc.mjs'),'utf8');
 git(root,'init','-q');git(root,'config','user.email','test@example.invalid');git(root,'config','user.name','Test');
 fs.writeFileSync(path.join(root,'calc.mjs'),['export function fee(amount){',' if(amount<=0)return null;',' return Math.ceil(amount*0.02);','}',''].join('\n'));
 git(root,'add','.');git(root,'commit','-qm','legacy baseline');
 const sha=git(root,'rev-parse','HEAD');
 fs.writeFileSync(path.join(root,'calc.mjs'),currentSource);
 process.env.QGATE_BASELINE_REF=sha;
 try{
  result=run(root);
  const unitGit=engineering(result).details.checks.find(x=>x.id==='unit');
  assert.equal(unitGit.status,'PASS');
  assert.equal(unitGit.baseline.status,'verified');
  assert.equal(unitGit.baseline.resolvedCommit,sha);
  // 基线内容绑定 + 基线原始输出（v1.15 T3）：demo runner 声明 file+contentSha256 与基线 TAP，
  // 内核 git show 内容比对一致 + 逐用例基线状态核验一致 → contentVerified 与双原始输出信号
  assert.equal(unitGit.baseline.contentVerified,true);
  assert.equal(unitGit.baseline.source.file,'calc.mjs');
  assert.equal(unitGit.baselineRawOutput.crossCheck,'match');
  assert.equal(unitGit.baselineRawOutput.file,'dist/baseline-run.tap');
  assert.ok(!downgradeNotes(result).some(note=>note.includes('unit: 基线为内嵌声明')),JSON.stringify(downgradeNotes(result)));
  const strength=evidenceStrength(result);
  assert.equal(strength.signals.gitBaselines,1);
  assert.equal(strength.signals.baselineContents,1);
  assert.equal(strength.signals.rawOutputs,2);
  // baselineMode:git 下真基线通过
  const config=configOf(root);config.gates.find(g=>g.id==='engineering').checks.find(c=>c.id==='unit').baselineMode='git';saveConfig(root,config);
  result=run(root);
  assert.equal(engineering(result).details.checks.find(x=>x.id==='unit').baseline.accepted,true);
  // 场景三：git 模式 + 无 git 历史的副本 → embedded 回退被拒，FAIL 指名
  const bare=project(t);focusChecks(bare,['unit']);
  const bareConfig=configOf(bare);bareConfig.gates.find(g=>g.id==='engineering').checks.find(c=>c.id==='unit').baselineMode='git';saveConfig(bare,bareConfig);
  result=run(bare);
  assert.equal(result.status,'FAIL');
  assert.ok(failureReasons(engineering(result)).some(reason=>reason.includes('基线为内嵌声明（embedded），baselineMode:git 不接受')),JSON.stringify(failureReasons(engineering(result))));
 }finally{delete process.env.QGATE_BASELINE_REF;}
});
