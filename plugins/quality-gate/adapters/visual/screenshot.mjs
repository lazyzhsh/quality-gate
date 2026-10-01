#!/usr/bin/env node
// 参考浏览器截图 runner（v1.13 T4，visual 门禁）：零 npm 依赖，经系统浏览器
// headless CLI 对目标 URL 截图，按 visual 观察协议回报 actualFile+sha256——判定
// 仍由内核做（默认严格字节比较；像素容差需 runner 报 diff 度量，本参考不实现
// 图像解码，边界如实）。
//
// 确定性选项：--headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1
// 固定 --window-size 与 --virtual-time-budget（等待渲染）。跨机器字体渲染/抗锯齿差异
// 是字节比较的已知噪声：基线建议同机 pin（examples/visual-browser-demo/scripts/
// pin-baseline.mjs），跨机复验应重新 pin 基线；截图"对不对"仍属 runner 诚实边界。
//
// 环境变量：QGATE_BROWSER=可执行文件路径（显式指定）；QGATE_URL=目标（相对项目根或
// file:///绝对地址，默认 page.html）；QGATE_WINDOW=宽,高（默认 1280,720）；
// QGATE_BUDGET=虚拟时间预算毫秒（默认 5000）。缺失浏览器退出码 2 并给安装指引。
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const BROWSER_CANDIDATES=[
 ...(process.env.QGATE_BROWSER?[process.env.QGATE_BROWSER]:process.platform==='win32'?[
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
 ]:process.platform==='darwin'?[
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
 ]:[
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/microsoft-edge'
 ])
];

export function findBrowser(){
 for(const candidate of BROWSER_CANDIDATES)if(fs.existsSync(candidate))return candidate;
 return null;
}

const isMain=import.meta.url===pathToFileURL(process.argv[1]??'').href;
if(isMain){
 let raw='';
 for await(const chunk of process.stdin)raw+=chunk;
 const request=JSON.parse(raw);
 const browser=findBrowser();
 if(!browser){
  if(process.env.QGATE_BROWSER)console.error(`QGATE_BROWSER 指定的浏览器不存在: ${process.env.QGATE_BROWSER}`);
  else console.error(`未找到系统浏览器（已探测：${BROWSER_CANDIDATES.length} 个候选路径；Chrome/Edge）——请安装 Google Chrome 或 Microsoft Edge，或设置环境变量 QGATE_BROWSER 指向可执行文件`);
  console.error('安装指引: https://www.google.com/chrome/ | https://www.microsoft.com/edge');
  process.exit(2);
 }
 const target=process.env.QGATE_URL??'page.html';
 const url=/^(file:|https?:)/.test(target)?target:pathToFileURL(path.resolve(target)).href;
 const out='build/browser-shot.png';
 fs.mkdirSync('build',{recursive:true});
 const shot=path.resolve(out);
 const args=[
  '--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1',
  `--window-size=${process.env.QGATE_WINDOW??'1280,720'}`,
  `--virtual-time-budget=${process.env.QGATE_BUDGET??'5000'}`,
  `--screenshot=${shot}`,url
 ];
 const run=spawnSync(browser,args,{encoding:'utf8',timeout:30000,windowsHide:true});
 if(run.error||run.status!==0){console.error(String(run.stderr||run.error?.message||'browser screenshot failed'));process.exit(2);}
 if(!fs.existsSync(shot)||fs.statSync(shot).size===0){console.error('浏览器未产出截图文件');process.exit(2);}
 console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:`browser-headless-cli:${path.basename(browser)}`,actualFile:out,sha256:createHash('sha256').update(fs.readFileSync(shot)).digest('hex')}));
}
