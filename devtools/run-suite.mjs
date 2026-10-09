import {spawnSync} from 'node:child_process';
import os from 'node:os';
import {suiteExitCode} from './run-suite-result.mjs';
// 套件并发钳制（2026-09-30）：node --test 默认文件并发≈全部逻辑核，分片后的套件会
// 跑满 CPU。目标：持续利用率 ≤75%。注意超线程——24 逻辑核仅 12 物理核，按逻辑核×0.75
// （=18）实测持续段仍 100%；按物理核×0.75（逻辑核×0.375）钳制。24 逻辑核机器实测校准：
// 并发 9 → 持续段 74%/wall 15.5s（采用）；12 → 84%（超）；8 → 68%（过保守）。
const cores=os.availableParallelism();
const concurrency=Math.max(2,Math.floor(cores*0.375));
const args=['--test',`--test-concurrency=${concurrency}`,...process.argv.slice(2)];
const r=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});
if(r.signal!==null&&r.signal!==undefined||!Number.isInteger(r.status)){
 console.error(`Test runner did not return an exit code: ${r.error?.message??r.signal??'unknown termination'}`);
}
process.exitCode=suiteExitCode(r);
