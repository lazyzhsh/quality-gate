#!/usr/bin/env node
// 多轮门禁延迟分布测量（W7，v1.29）：对同一项目重复执行 CLI 阶段，记录每轮报告级与逐门禁耗时，
// 输出分布（min/median/max）而非单点计时。可选 --load busy 在测量期间注入 CPU 负载工作进程，
// 用于观察负载下的预算裕量。结论只代表当轮环境，不作为长期保证（与 PLAN 口径一致）。
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index===-1?undefined:args[index+1];};
const rounds=Math.max(1,Number(option('--rounds')??5));
const stage=option('--stage')??'release';
const load=option('--load')??'none';
const project=option('--project')??repo;
const qgate=path.join(repo,'plugins/quality-gate/bin/qgate.mjs');

const measure=()=>{
 const start=Date.now();
 const result=spawnSync(process.execPath,[qgate,project,stage],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
 const wallMs=Date.now()-start;
 if(result.status!==0)throw new Error(`gate run exit ${result.status}: ${result.stderr?.slice(-400)}`);
 const json=JSON.parse(result.stdout.slice(0,result.stdout.indexOf('\n}')+2));
 const gates=json.evidence.map(entry=>({gateId:entry.gateId,status:entry.status,ms:Date.parse(entry.finishedAt)-Date.parse(entry.startedAt)}));
 return {runId:json.id.slice(0,8),stage,wallMs,reportMs:Date.parse(json.finishedAt)-Date.parse(json.startedAt),overall:json.status,gates};
};

// 负载观察：外部纯计算工作进程（与套件自身的并发钳制互不影响），测量结束即终止
const busyWorkers=[];
if(load==='busy')for(let i=0;i<2;i++)busyWorkers.push(spawn(process.execPath,['-e','const until=Date.now()+900000;while(Date.now()<until){Math.sqrt(Math.random());}'],{stdio:'ignore',windowsHide:true}));

const samples=[];
try{
 for(let index=1;index<=rounds;index++){
  const sample=measure();samples.push(sample);
  console.error(`round ${index}/${rounds}: ${sample.overall} wall=${(sample.wallMs/1000).toFixed(1)}s report=${(sample.reportMs/1000).toFixed(1)}s [${sample.gates.map(g=>`${g.gateId}=${(g.ms/1000).toFixed(1)}s`).join(' ')}]`);
 }
}finally{
 for(const worker of busyWorkers)try{worker.kill();}catch{}
}
const sorted=[...samples.map(s=>s.reportMs)].sort((a,b)=>a-b);
const median=sorted[Math.floor(sorted.length/2)];
const summary={stage,load,rounds,reportMs:{min:sorted[0],median,max:sorted[sorted.length-1]},samples};
console.log(JSON.stringify(summary,null,1));
