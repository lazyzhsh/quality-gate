import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';
import {renderSummary} from '../lib/summary.mjs';
import {scanConfigDependencies,probeExecutable,dependencyReport,formatDependencyHints} from '../lib/dependencies.mjs';
const adapter=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));

test('scan derives registry tools from change-scope, runner argv, checks and coverage',()=>{
 const config={gates:[
  {id:'scope',kind:'change-scope'},
  {id:'pay',kind:'persistence',argv:['python','runner.py']},
  {id:'eng',kind:'engineering',checks:[{id:'static',type:'exit',argv:['$NODE','--check','a.mjs']},{id:'lint',type:'exit',argv:['python','lint.py']}]},
  {id:'rtm',kind:'traceability',coverage:{argv:['python','cov.py'],timeoutMs:1000}},
  {id:'node',kind:'command',argv:['$NODE','-e','0']},
  {id:'abs',kind:'command',argv:['C:/tools/scan.exe','x']},
  {id:'unknown',kind:'command',argv:['eslint','.']}
 ]};
 const found=scanConfigDependencies(config);
 const byTool=new Map(found.map(item=>[item.tool,item.gateIds]));
 assert.deepEqual(byTool.get('git'),['scope']);
 assert.deepEqual(byTool.get('python'),['pay','eng','rtm']);
 assert.equal(byTool.has('eslint'),false);
 assert.equal(found.some(item=>item.gateIds.includes('node')||item.gateIds.includes('abs')),false);
});

test('probeExecutable detects missing binaries without side effects',()=>{
 assert.equal(probeExecutable('qgate-definitely-missing-9999',['--version']),false);
 assert.equal(probeExecutable(process.execPath,['--version']),true);
});

test('kernel report carries dependency results for configured registry tools',t=>{
 const f=fixture(t);
 f.c.gates[0].argv=['python','--version'];f.save();
 const report=run(f.root);
 assert.equal(report.dependencies.required[0].tool,'python');
 assert.equal(typeof report.dependencies.required[0].available,'boolean');
 assert.equal(report.dependencies.missing.length===0||report.dependencies.missing[0].url.startsWith('https://'),true);
});

test('formatDependencyHints and summary render install guidance',()=>{
 const report={missing:[{tool:'python',gateIds:['pay'],hint:'Python 3.10+',url:'https://www.python.org/downloads/'}]};
 const hints=formatDependencyHints(report);
 assert.match(hints[0],/missing dependency 'python'.*pay.*https:\/\/www\.python\.org/);
 const summary=renderSummary({status:'FAIL',stage:'close',id:'0123456789abcdef',root:'.',evidence:[],dependencies:report});
 assert.match(summary,/缺少外部依赖: python（门禁 pay）/);
 assert.match(summary,/python\.org/);
});

test('runner ENOENT failures append an install guide for registry tools',()=>{
 const summary=renderSummary({status:'ERROR',stage:'close',id:'0123456789abcdef',root:'.',evidence:[{gateId:'pay',kind:'persistence',level:'L2',status:'ERROR',details:{error:'spawnSync python ENOENT',exitCode:null}}]});
 assert.match(summary,/spawnSync python ENOENT/);
 assert.match(summary,/安装指引: https:\/\/www\.python\.org/);
});

test('SessionStart keeps base context and adds dependency hints when readable config needs tools',t=>{
 const f=fixture(t);
 f.c.gates[0].argv=['python','--version'];f.save();
 const result=spawnSync(process.execPath,[adapter],{input:JSON.stringify({cwd:f.root,hook_event_name:'SessionStart'})+'\n',encoding:'utf8'});
 assert.equal(result.status,0);
 const context=JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
 assert.match(context,/Quality Gate enabled/);
 if(JSON.parse(fs.readFileSync(path.join(f.root,'.quality-gate.json'),'utf8')).gates.some(gate=>gate.argv[0]==='python')&&!probeExecutable('python',['--version']))assert.match(context,/Dependency hints:/);
});
