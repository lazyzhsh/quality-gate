// 同机 pin 基线：用参考 runner 截取当前 page.html 并覆盖 baseline.png。
// 在 demo 根目录执行：node scripts/pin-baseline.mjs
// 跨机器复验前必须重新执行（字体渲染/抗锯齿差异是字节比较的已知噪声——
// 详见 .quality-gate.json 风险登记与本 demo 的 README 行）。
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const demoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const adapter=path.resolve(demoRoot,'..','..','adapters','visual','screenshot.mjs');
const run=spawnSync(process.execPath,[adapter],{
  cwd:demoRoot,
  encoding:'utf8',
  input:JSON.stringify({schemaVersion:'0.1',runId:'pin-baseline'})+'\n',
  windowsHide:true
});
if(run.error||run.status!==0){
  console.error(String(run.stderr||run.error?.message||'baseline capture failed'));
  process.exit(2);
}
const observation=JSON.parse(run.stdout);
fs.copyFileSync(path.join(demoRoot,observation.actualFile),path.join(demoRoot,'baseline.png'));
console.log(`baseline.png pinned (${observation.source}, sha256=${observation.sha256.slice(0,12)}…)`);
