import fs from 'node:fs';
import {render} from './ui.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
fs.writeFileSync('actual.svg',render());
// 演示用像素度量：等长文件按差异字节数计，长度不同按较大者计。
// 真实项目应替换为图像工具的逐像素比较结果；内核只按配置阈值判定。
const actual=fs.readFileSync('actual.svg');
const baseline=fs.readFileSync('baseline.svg');
let pixels=0;
if(actual.length===baseline.length){for(let i=0;i<actual.length;i++)if(actual[i]!==baseline[i])pixels++;}
else pixels=Math.max(actual.length,baseline.length);
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'visual-demo/ui.mjs render',actualFile:'actual.svg',diff:{pixels,totalPixels:baseline.length}}));
