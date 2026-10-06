import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
const source=fileURLToPath(new URL('../examples/visual-demo',import.meta.url));
function project(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-visual-'));t.after(()=>fs.rmSync(root,{recursive:true}));fs.cpSync(source,root,{recursive:true});return root;}
test('fresh rendered SVG exactly matches approved baseline',t=>{
 const result=run(project(t));assert.equal(result.status,'PASS',JSON.stringify(result.evidence));
 assert.equal(result.evidence[0].details.comparison,'exact-bytes');
});
test('rendered color change fails with distinct artifact hashes',t=>{
 const root=project(t),file=path.join(root,'ui.mjs');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('#0a6','#a00'));
 const result=run(root);assert.equal(result.status,'FAIL');
 assert.notEqual(result.evidence[0].details.baselineSha256,result.evidence[0].details.actualSha256);
});
test('visual artifact path escape fails closed',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'runner.mjs'),'import fs from "node:fs";console.log(JSON.stringify({schemaVersion:"0.1",runId:JSON.parse(fs.readFileSync(0,"utf8")).runId,source:"fake",actualFile:"../escape.svg"}));');
 assert.equal(run(root).status,'ERROR');
});

test('pixel tolerance passes minor drift within budget and fails beyond it',t=>{
 const root=project(t),file=path.join(root,'ui.mjs');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('#0a6','#a00'));
 let result=run(root);
 assert.equal(result.status,'FAIL');
 const gates=new Map(result.evidence.map(evidence=>[evidence.gateId,evidence]));
 assert.equal(gates.get('visual').status,'FAIL');
 const tolerance=gates.get('visual-tolerance');
 assert.equal(tolerance.status,'PASS');
 assert.equal(tolerance.details.comparison,'pixel-diff');
 assert.equal(tolerance.details.maxDiffPixels,10);
 assert.ok(tolerance.details.diff.pixels<=10&&tolerance.details.diff.pixels>0);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates.find(g=>g.id==='visual-tolerance').maxDiffPixels=0;
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='visual-tolerance').status,'FAIL');
});

test('configured tolerance requires diff metrics from the runner',t=>{
 const root=project(t);
 fs.writeFileSync(path.join(root,'no-diff-runner.mjs'),`import fs from 'node:fs';console.log(JSON.stringify({schemaVersion:'0.1',runId:JSON.parse(fs.readFileSync(0,'utf8')).runId,source:'fake',actualFile:'baseline.svg'}));`);
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 const gate=config.gates.find(g=>g.id==='visual-tolerance');
 gate.argv=['$NODE','no-diff-runner.mjs'];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const result=run(root);
 assert.equal(result.evidence.find(e=>e.gateId==='visual-tolerance').status,'ERROR');
 assert.match(result.evidence.find(e=>e.gateId==='visual-tolerance').details.error,/diff metrics required/i);
});

test('missing baseline file fails closed',t=>{
 const root=project(t);
 fs.rmSync(path.join(root,'baseline.svg'));
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(String(result.evidence[0].details),/baseline/i);
});

// ---- W4（v1.29）：像素差内核重算——PNG 双侧解码、自报交叉核验、越界子集 fail-closed ----
import {deflateSync} from 'node:zlib';
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=buffer=>{let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const out=Buffer.alloc(8+data.length+4);out.writeUInt32BE(data.length,0);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type,'ascii'),data])),8+data.length);return out;};
const encodePng=(width,height,rgba,filter=0)=>{
 const signature=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;ihdr[12]=0;
 const rows=Buffer.alloc((width*4+1)*height);
 for(let y=0;y<height;y++){rows[y*(width*4+1)]=filter;const row=rgba.subarray(y*width*4,(y+1)*width*4);for(let i=0;i<row.length;i++){const prior=y>0?rgba[(y-1)*width*4+i]:0;rows[y*(width*4+1)+1+i]=(row[i]-(filter===2?prior:0))&0xff;}}
 return Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
};
const solidPng=(width,height,pixel)=>encodePng(width,height,Buffer.concat(Array.from({length:width*height},()=>Buffer.from(pixel))));
const differingPng=(width,height,base,changed)=>encodePng(width,height,Buffer.concat(Array.from({length:width*height},(_,index)=>Buffer.from(changed.has(index)?[base[0]^0xff,base[1],base[2],base[3]]:base))));
const pngProject=(t,{baseline,actual,maxDiffPixels,reportedDiff})=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-png-'));
 t.after(()=>fs.rmSync(root,{recursive:true}));
 fs.writeFileSync(path.join(root,'baseline.png'),baseline);
 fs.writeFileSync(path.join(root,'actual.png'),actual);
 const runner=`import fs from 'node:fs';const q=JSON.parse(fs.readFileSync(0,'utf8'));const out={schemaVersion:'0.1',runId:q.runId,source:'png fixture',actualFile:'actual.png'};${reportedDiff?`out.diff=${JSON.stringify(reportedDiff)};`:''}console.log(JSON.stringify(out));`;
 fs.writeFileSync(path.join(root,'runner.mjs'),runner);
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify({schemaVersion:'0.2',claims:[{id:'C',statement:'visual'}],gates:[{id:'png',kind:'visual',level:'L3',enabled:true,stages:['close'],claimId:'C',argv:['$NODE','runner.mjs'],timeoutMs:5000,baselineFile:'baseline.png',...(maxDiffPixels!==undefined?{maxDiffPixels}:{})}],risks:[],exceptions:[]}));
 return root;
};
test('kernel pixel diff counts exact differing pixels without runner self-report (W4)',t=>{
 const baseline=solidPng(8,8,[10,20,30,255]);
 const changed=new Set([3,17,63]);
 const actual=differingPng(8,8,[10,20,30,255],changed);
 let root=pngProject(t,{baseline,actual,maxDiffPixels:3});
 let result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0].details).slice(0,300));
 const evidence=result.evidence[0].details;
 assert.equal(evidence.diffSource,'kernel-recompute');
 assert.equal(evidence.diff.pixels,3);
 assert.equal(evidence.diff.totalPixels,64);
 root=pngProject(t,{baseline,actual,maxDiffPixels:2});
 result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.diff.pixels,3);
});
test('same pixels with different bytes pass tolerance via kernel recompute (W4)',t=>{
 const baseline=solidPng(4,4,[200,100,50,255]);
 const actual=encodePng(4,4,Buffer.concat(Array.from({length:16},()=>Buffer.from([200,100,50,255]))),2);
 const root=pngProject(t,{baseline,actual,maxDiffPixels:0});
 const result=run(root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.diff.pixels,0);
 assert.notEqual(result.evidence[0].details.baselineSha256,result.evidence[0].details.actualSha256,'bytes must differ to prove pixel-level compare');
});
test('runner-reported diff matching kernel recompute cross-checks; contradiction errors (W4)',t=>{
 const baseline=solidPng(4,4,[1,2,3,255]);
 const actual=differingPng(4,4,[1,2,3,255],new Set([5]));
 let root=pngProject(t,{baseline,actual,maxDiffPixels:5,reportedDiff:{pixels:1,totalPixels:16}});
 let result=run(root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.diff.crossCheck,'match');
 root=pngProject(t,{baseline,actual,maxDiffPixels:5,reportedDiff:{pixels:0,totalPixels:16}});
 result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence[0].details.error,/contradicts kernel recompute/);
});
test('dimension mismatch and out-of-subset PNG fail closed (W4)',t=>{
 const baseline=solidPng(4,4,[0,0,0,255]);
 const otherSize=solidPng(3,4,[0,0,0,255]);
 let root=pngProject(t,{baseline,actual:otherSize,maxDiffPixels:5});
 let result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence[0].details.error,/dimension mismatch/);
 const paletteIhdr=Buffer.alloc(13);paletteIhdr.writeUInt32BE(2,0);paletteIhdr.writeUInt32BE(2,4);paletteIhdr[8]=8;paletteIhdr[9]=3;paletteIhdr[12]=0;
 const palette=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',paletteIhdr),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0]))),chunk('IEND',Buffer.alloc(0))]);
 root=pngProject(t,{baseline:palette,actual:palette,maxDiffPixels:5});
 result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(result.evidence[0].details.error,/declared decode subset/);
});

// ---- F04（2026-10-06 二轮评审）：tRNS 透明语义与结构防线 ----
// 评审反例：两幅合法 1×1 RGB8 PNG，实际图新增 tRNS 把 (10,20,30) 设为透明——Pillow 解码
// 得 (10,20,30,255) 与 (10,20,30,0)，内核却算 pixels:0 在 maxDiffPixels=0 下 PASS；删除
// IEND 后同样 PASS。样本构造与评审 reproduce.mjs 同法（独立 CRC 编码器，非内核路径）。
const rgbPng=transparent=>{
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;ihdr[12]=0;
 const trns=Buffer.alloc(6);[10,20,30].forEach((value,index)=>trns.writeUInt16BE(value,index*2));
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),...(transparent?[chunk('tRNS',trns)]:[]),chunk('IDAT',deflateSync(Buffer.from([0,10,20,30]))),chunk('IEND',Buffer.alloc(0))]);
};
const buildPng=({colorType=2,trns,rows=[Buffer.from([0,10,20,30])],extraChunks=[]})=>{
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=colorType;ihdr[12]=0;
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),...(trns!==undefined?[chunk('tRNS',trns)]:[]),...extraChunks,chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
};
const trnsKey=()=>{const trns=Buffer.alloc(6);[10,20,30].forEach((value,index)=>trns.writeUInt16BE(value,index*2));return trns;};
test('RGB tRNS transparency key participates in pixel equality (F04)',t=>{
 // 基线无 tRNS、实际图带 tRNS 键色＝唯一像素：alpha 255→0 必须计为差异
 const root=pngProject(t,{baseline:rgbPng(false),actual:rgbPng(true),maxDiffPixels:0});
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.diffSource,'kernel-recompute');
 assert.deepEqual(result.evidence[0].details.diff,{pixels:1,totalPixels:1});
 // 同为带 tRNS 的两图自比仍 PASS（键色对两侧一致生效）
 const root2=pngProject(t,{baseline:rgbPng(true),actual:rgbPng(true),maxDiffPixels:0});
 assert.equal(run(root2).status,'PASS');
});
test('PNG structural corruption fails closed (F04)',t=>{
 const good=rgbPng(false);
 const corrupted=Buffer.from(good);corrupted[corrupted.length-20]^=0xff;
 const rgbaTrns=buildPng({colorType:6,trns:trnsKey(),rows:[Buffer.from([0,10,20,30,255])]});
 const shortTrns=buildPng({colorType:2,trns:Buffer.alloc(5)});
 const unknownCritical=Buffer.concat([good.subarray(0,good.length-12),chunk('TESt',Buffer.from([1])),chunk('IEND',Buffer.alloc(0))]);
 const inflateOvershoot=buildPng({rows:[Buffer.from([0,10,20,30]),Buffer.from([0,10,20,30])]});
 const cases={
  missingIend:{buffer:good.subarray(0,good.length-12),pattern:/PNG missing IEND/},
  badCrc:{buffer:corrupted,pattern:/PNG chunk CRC mismatch/},
  trailingData:{buffer:Buffer.concat([good,Buffer.from([0x00])]),pattern:/PNG trailing data after IEND/},
  rgbaTrns:{buffer:rgbaTrns,pattern:/tRNS chunk forbidden for RGBA/},
  shortTrns:{buffer:shortTrns,pattern:/tRNS for RGB must be 6 bytes/},
  unknownCritical:{buffer:unknownCritical,pattern:/unknown critical chunk: TESt/},
  duplicateTrns:{buffer:Buffer.concat([good.subarray(0,good.length-12),chunk('tRNS',trnsKey()),chunk('tRNS',trnsKey()),chunk('IDAT',deflateSync(Buffer.from([0,10,20,30]))),chunk('IEND',Buffer.alloc(0))]),pattern:/PNG duplicate tRNS/},
  inflateOvershoot:{buffer:inflateOvershoot,pattern:/larger than|pixel data size mismatch/}
 };
 for(const [name,{buffer,pattern}] of Object.entries(cases)){
  const root=pngProject(t,{baseline:buffer,actual:buffer,maxDiffPixels:0});
  const result=run(root);
  assert.equal(result.status,'ERROR',`${name} must fail closed`);
  assert.match(result.evidence[0].details.error,pattern,`${name} must name the defect`);
 }
});
