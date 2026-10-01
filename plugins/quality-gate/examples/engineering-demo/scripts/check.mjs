import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const task=process.argv[2];
let input='';for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const source=fs.readFileSync('calc.mjs','utf8');
const base={schemaVersion:'0.1',runId:request.runId,source:'engineering-demo/scripts/check.mjs'};
const output=value=>console.log(JSON.stringify({...base,...value}));
const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
if(task==='build'){
 fs.mkdirSync('dist',{recursive:true});
 const file='dist/calc.bundle.mjs';
 fs.writeFileSync(file,`// build run ${request.runId}\n${source}`);
 output({artifact:{path:file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}});
}else if(task==='unit'){
 // F2P/P2P 协议演示：声明 expected 时，在当前实现与内嵌 legacy 基线（无大额档）上分别
 // 执行同一测试文件，逐用例上报 current 与 baseline 状态。生产 runner 应改为对真实基线
 // （如 git worktree）执行。未声明 expected 时不做基线双次运行。
 const declaredExpected=(()=>{
  try{
   const config=JSON.parse(fs.readFileSync('.quality-gate.json','utf8'));
   return config.gates.flatMap(gate=>gate.checks??[]).find(check=>check.type==='test')?.expected??null;
  }catch{return null;}
 })();
 // runSuite 同时采集行覆盖率（node --test --experimental-test-coverage 的 TAP 汇总行）。
 // 旧版 Node 不支持该旗标时自动降级为不带覆盖率的观察（由配置侧 minCoverageRatio 决定是否强制）。
 const runSuite=(moduleHref,withCoverage=true)=>{
  const args=['--test','--test-reporter=tap',...(withCoverage?['--experimental-test-coverage']:[]),'calc.test.mjs'];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,env:{...childEnv,QGATE_MODULE:moduleHref}});
  const count=name=>Number(new RegExp(`^# ${name} (\\d+)$`,'m').exec(result.stdout)?.[1]);
  const cases=[...result.stdout.matchAll(/^(not )?ok \d+ - (.+)$/gm)].map(match=>{
   const raw=match[2].trim();const skipped=raw.includes('# SKIP');
   return {name:skipped?raw.slice(0,raw.indexOf('# SKIP')).trim():raw,status:match[1]?'fail':skipped?'skip':'pass'};
  });
  const total=count('tests'),passed=count('pass'),failed=count('fail'),skipped=count('skipped');
  if([total,passed,failed,skipped].some(value=>!Number.isInteger(value))){
   if(withCoverage&&/bad option|experimental-test-coverage/.test(result.stderr))return runSuite(moduleHref,false);
   throw new Error(result.stdout+result.stderr);
  }
  const coveredPercent=Number(new RegExp('^# all files\\s*\\|\\s*([\\d.]+)','m').exec(result.stdout)?.[1]);
  const coverage=withCoverage&&Number.isFinite(coveredPercent)?{tool:'node:test --experimental-test-coverage (all files)',ratio:coveredPercent/100}:undefined;
  return {total,passed,failed,skipped,cases,stdout:result.stdout,...(coverage?{coverage}:{})};
 };
 // 原始证据内核解析（B1）演示：把当前实现的原始 TAP 输出落盘并在观察中声明 rawOutput，
 // 由内核自行解析重算计数并与本 runner 的自报交叉核验（requireRawOutput 已在配置侧开启）。
 const declareRawOutput=stdout=>{
  fs.mkdirSync('dist',{recursive:true});
  const file='dist/unit-run.tap';
  fs.writeFileSync(file,stdout);
  return {format:'tap',file};
 };
 // 基线原始输出（v1.15 T3）演示：基线实现的原始 TAP 同样落盘并声明 baselineRawOutput——
 // 内核解析基线 TAP 逐用例重算基线状态与自报 baselineStatus 交叉核验，F2P/P2P 方向审计
 // 的基线侧不再凭 runner 自报（门禁级 requireBaselineRawOutput 为可选强制，见 CONFIG-GUIDE）。
 const declareBaselineRawOutput=stdout=>{
  fs.mkdirSync('dist',{recursive:true});
  const file='dist/baseline-run.tap';
  fs.writeFileSync(file,stdout);
  return {format:'tap',file};
 };
 if(!declaredExpected){
  const {cases,stdout,...observation}=runSuite(pathToFileURL(path.resolve('calc.mjs')).href);
  output({...observation,rawOutput:declareRawOutput(stdout)});
 }else{
  // 基线来源协议（W3）+ 内容绑定（v1.15 T3）：基线优先取 git 真历史（QGATE_BASELINE_REF，
  // 默认 legacy 标签，`git show <ref>:calc.mjs` 路径相对仓库根），对取用内容（Buffer 原样）
  // 声明 contentSha256——内核 git show 内容比对证明"执行的基线就是该 ref 的真实内容"；无该
  // ref 时回退内嵌 legacy 实现并如实回报 embedded（摘要降级标注）。未声明 expected 时
  // 不做基线双次运行。
  const baselineRef=process.env.QGATE_BASELINE_REF??'legacy';
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-baseline-'));
  try{
   const shown=spawnSync('git',['show',`${baselineRef}:calc.mjs`],{maxBuffer:65536,timeout:5000,windowsHide:true});
   let baselineSource;
   let baselineModuleHref;
   if(shown.status===0&&Buffer.isBuffer(shown.stdout)&&shown.stdout.toString('utf8').includes('export')){
    baselineModuleHref=`data:text/javascript;base64,${shown.stdout.toString('base64')}`;
    baselineSource={type:'git-commit',ref:baselineRef,file:'calc.mjs',contentSha256:createHash('sha256').update(shown.stdout).digest('hex')};
   }else{
    const legacyFile=path.join(directory,'legacy.mjs');
    fs.writeFileSync(legacyFile,'export function fee(amount){\n if(amount<=0)return null;\n return Math.ceil(amount*0.02);\n}\n');
    baselineModuleHref=pathToFileURL(legacyFile).href;
    baselineSource={type:'embedded'};
   }
   const baselineRun=runSuite(baselineModuleHref,false);
   const baselineByName=new Map(baselineRun.cases.map(item=>[item.name,item.status]));
   const current=runSuite(pathToFileURL(path.resolve('calc.mjs')).href);
   const {cases,stdout,...observation}=current;
   output({...observation,rawOutput:declareRawOutput(stdout),baselineRawOutput:declareBaselineRawOutput(baselineRun.stdout),baselineSource,cases:cases.map(item=>({name:item.name,status:item.status,baselineStatus:baselineByName.get(item.name)??'skip'}))});
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
}else if(task==='mutation'){
 const targets=[{mutate:()=>source.replace('amount<=0','amount<0'),description:'boundary condition amount<=0 weakened to amount<0'},{mutate:()=>source.replace('0.02','0.03'),description:'fee rate 0.02 changed to 0.03'}];
 const mutations=targets.map(target=>target.mutate());
 if(mutations.some(mutant=>mutant===source))throw new Error('Expected mutation target missing');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-mutation-'));
 try{
  let killed=0;const survivors=[];
  for(let index=0;index<mutations.length;index++){
   const file=path.join(directory,`mutant-${index}.mjs`);fs.writeFileSync(file,mutations[index]);
   const result=spawnSync(process.execPath,['--test','--test-reporter=tap','calc.test.mjs'],{encoding:'utf8',windowsHide:true,env:{...childEnv,QGATE_MODULE:pathToFileURL(file).href}});
   if(result.status!==0)killed++;else survivors.push({id:`mutant-${index}`,description:targets[index].description});
  }
  output({killed,total:mutations.length,score:killed/mutations.length,survivors});
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}else if(task==='structure'){
 const findings=[...source.matchAll(/from\s+['"]\.\.\/legacy[^'"]*['"]/g)].map(()=>({path:'calc.mjs',rule:'no-legacy-import',message:'Import from legacy layer',severity:'high'}));
 output({findings});
}else if(task==='convention'){
 const findings=[...source.matchAll(/console\.log\s*\(/g)].map(()=>({path:'calc.mjs',rule:'no-console-log',message:'Use structured logging',severity:'medium'}));
 output({findings});
}else throw new Error(`Unknown engineering task: ${task}`);
