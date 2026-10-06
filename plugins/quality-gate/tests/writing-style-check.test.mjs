import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {renderBrief,renderSummary} from '../lib/summary.mjs';

// X14（v1.27）：受控表达文风检查器——统一观察协议、确定性正例反例、误报边界与零文件可见性。
// 全部 advisory 语义：命中不阻断判定，只进证据与摘要可见层（X13 advisory 行）。
const script=fileURLToPath(new URL('../scripts/writing-style-check.mjs',import.meta.url));
const invoke=(root,extra=[])=>{
 const result=spawnSync(process.execPath,[script,...extra],{cwd:root,input:JSON.stringify({schemaVersion:'0.1',runId:'run-x',ruleId:'STYLE-writing'})+'\n',encoding:'utf8'});
 return {status:result.status,output:result.stdout?JSON.parse(result.stdout):null,error:result.stderr};
};
const fixture=t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-style-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'docs'));
 return root;
};

test('protocol echoes runId and reports the rule source',t=>{
 const root=fixture(t);
 fs.writeFileSync(path.join(root,'docs','clean.md'),'# 干净文档\n\n短句。没有命中。\n');
 const {status,output}=invoke(root,['--scope','docs/**/*.md']);
 assert.equal(status,0);
 assert.equal(output.schemaVersion,'0.1');
 assert.equal(output.runId,'run-x');
 assert.equal(output.ruleId,'STYLE-writing');
 assert.equal(typeof output.source,'string');
 assert.deepEqual(output.findings,[]);
 assert.equal(output.scannedFiles,1);
});

test('long sentence beyond threshold is reported with file and line',t=>{
 const root=fixture(t);
 fs.writeFileSync(path.join(root,'docs','long.md'),'# 标题\n\n'+`前缀${'长'.repeat(200)}。结尾\n`);
 const {output}=invoke(root,['--scope','docs/**/*.md','--max-zh','150']);
 const hit=output.findings.find(finding=>finding.detail.startsWith('ws-long-sentence'));
 assert.ok(hit,JSON.stringify(output.findings));
 assert.equal(hit.path,'docs/long.md');
 assert.equal(hit.line,3);
 assert.match(hit.detail,/中文分句 \d+ 字 > 150/);
 // 反例：阈值内的句子不报
 fs.writeFileSync(path.join(root,'docs','long.md'),'# 标题\n\n短句。另一短句。\n');
 const clean=invoke(root,['--scope','docs/**/*.md','--max-zh','150']);
 assert.equal(clean.output.findings.length,0);
});

test('code blocks and inline code are out of scope for natural-language rules',t=>{
 const root=fixture(t);
 fs.writeFileSync(path.join(root,'docs','code.md'),[
  '# 标题',
  '```',
  `这行在代码块里${'长'.repeat(300)}。包含适当处理。然后接着同时并且`,
  '```',
  `行内 \`这段是代码里的适当处理和超长内容${'x'.repeat(300)}\` 结束。`
 ].join('\n'));
 const {output}=invoke(root,['--scope','docs/**/*.md','--max-zh','100']);
 assert.equal(output.findings.length,0);
});

test('vague words inside table cells are found (tables are not skipped wholesale)',t=>{
 const root=fixture(t);
 fs.writeFileSync(path.join(root,'docs','table.md'),'| 列一 | 列二 |\n|---|---|\n| 正常 | 出问题时适当处理 |\n');
 const {output}=invoke(root,['--scope','docs/**/*.md']);
 const hit=output.findings.find(finding=>finding.detail.startsWith('ws-vague-word'));
 assert.ok(hit,JSON.stringify(output.findings));
 assert.equal(hit.line,3);
 assert.match(hit.detail,/适当处理/);
});

test('example-marker lines are exempt to avoid self-reference false positives',t=>{
 const root=fixture(t);
 fs.writeFileSync(path.join(root,'docs','example.md'),'规则样例：不要写"适当处理" <!--qgate-style:example-->\n');
 const {output}=invoke(root,['--scope','docs/**/*.md']);
 assert.equal(output.findings.filter(finding=>finding.detail.startsWith('ws-vague-word')).length,0);
});

test('multi-action list steps are flagged by the connector heuristic',t=>{
 const root=fixture(t);
 fs.writeFileSync(path.join(root,'docs','steps.md'),'1. 运行测试然后部署接着同时记录\n- 单一动作步骤\n');
 const {output}=invoke(root,['--scope','docs/**/*.md']);
 const hit=output.findings.find(finding=>finding.detail.startsWith('ws-multi-action'));
 assert.ok(hit,JSON.stringify(output.findings));
 assert.equal(hit.line,1);
 assert.match(hit.detail,/3 个动作连接词/);
 assert.ok(!output.findings.some(finding=>finding.line===2&&finding.detail.startsWith('ws-multi-action')),'single-action step must not flag');
});

test('zero matched files surface as an explicit finding, never as silent compliance',t=>{
 const root=fixture(t);
 const {output}=invoke(root,['--scope','nowhere/**/*.md']);
 assert.equal(output.scannedFiles,0);
 const hit=output.findings.find(finding=>finding.category==='scope-empty');
 assert.ok(hit,JSON.stringify(output.findings));
 assert.match(hit.detail,/扫描零文件/);
 assert.match(hit.detail,/不能作为符合规范的证据/);
});

test('invalid protocol input or arguments fail closed with non-zero exit',t=>{
 const root=fixture(t);
 const bad=spawnSync(process.execPath,[script,'--scope','docs/**/*.md'],{cwd:root,input:'not-json',encoding:'utf8'});
 assert.notEqual(bad.status,0);
 const unknown=spawnSync(process.execPath,[script,'--bogus'],{cwd:root,input:'{}\n',encoding:'utf8'});
 assert.notEqual(unknown.status,0);
});

test('summary renders zero-scan visibility for banned-words rules that matched no files (X14)',()=>{
 const report={status:'PASS',stage:'close',id:'0123456789abcdef0123456789abcdef',root:'.',reportPath:'runs/x.json',claims:[{id:'C1'}],evidence:[
  {gateId:'conv',claimId:'C1',level:'L0',kind:'convention-alignment',status:'PASS',details:{rules:[
   {id:'TERM-x',type:'banned-words',severity:'fail',source:{file:'a.md'},scannedFiles:0,hits:[]},
   {id:'TERM-y',type:'banned-words',severity:'fail',source:{file:'a.md'},scannedFiles:12,hits:[]}
  ]}}
 ]};
 for(const text of [renderBrief(report),renderSummary(report)]){
  assert.match(text,/扫描零文件: TERM-x（conv）——范围未命中任何文件，零文件不构成检查证据/);
  assert.ok(!text.includes('TERM-y（conv）'),'non-zero-scan rule must not appear');
 }
});
