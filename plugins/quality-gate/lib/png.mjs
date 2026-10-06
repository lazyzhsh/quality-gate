import {inflateSync} from 'node:zlib';

// 确定性 PNG 像素差分（W4，v1.29）：内核自行解码与比较两幅 PNG 的像素——容差判定不再
// 依赖 runner 自报的 diff 数值（自报仍在时做交叉核验，不符即 ERROR，同 B1 声明即核验模式）。
// 声明解码子集（越界抛错 fail-closed，不静默近似）：8 位深、颜色类型 2（RGB）/6（RGBA）、
// 非隔行；宽×高上限 6400 万像素。像素相等定义：RGBA 四通道逐字节相等（无逐通道容差——
// 容差在门禁层的 maxDiffPixels/maxDiffRatio）。
// v1.30 F04（2026-10-06 二轮评审）补全结构防线与透明语义：
// - chunk 结构完整核验：长度边界、逐 chunk CRC32、IHDR 首位且恰一次、IDAT 连续、IEND
//   存在且为末尾（其后不得有字节）、未知关键 chunk（PNG 规范大写首字母）拒绝——不认识的
//   关键扩展可能改变像素解释，不能当没看见；
// - tRNS：RGB 真彩色透明键正确展开（命中键色的像素 alpha=0，其余 alpha=255；位深 8 取
//   低字节）；RGBA（颜色类型 6）出现 tRNS 即 ERROR（规范禁止）；此前统一按 alpha=255
//   处理使带透明键的实际图与基线误判相等；
// - 解压上限：inflateSync maxOutputLength 锁定为期望行容量（防解压放大），解压结果长度
//   须恰等于 (stride+1)×height——多字节同样是损坏。
// 证明边界（如实）：像素相等是解码样本字节相等，不做色彩管理（gAMA/iCCP 等描述性辅助
// chunk 不改变样本字节，按规范忽略）。
const maxPixels=64_000_000;
const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=buffer=>{let c=0xffffffff;for(const byte of buffer)c=CRC_TABLE[(c^byte)&0xff]^(c>>>8);return(c^0xffffffff)>>>0;};
const KNOWN_CHUNKS=new Set(['IHDR','IDAT','tRNS','IEND']);

export function decodePng(buffer){
 const view=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
 if(view.length<8||view.readUInt32BE(0)!==0x89504e47||view.readUInt32BE(4)!==0x0d0a1a0a)throw new Error('Not a PNG file');
 let offset=8,width,height,bitDepth,colorType,interlace;
 const idat=[];
 let sawIend=false,trns=null,idatClosed=false;
 while(offset<view.length){
  if(offset+12>view.length)throw new Error('PNG chunk header truncated');
  const length=view.readUInt32BE(offset);
  if(offset+12+length>view.length)throw new Error('PNG chunk data truncated');
  const type=view.toString('latin1',offset+4,offset+8);
  const data=view.subarray(offset+8,offset+8+length);
  if(crc32(view.subarray(offset+4,offset+8+length))!==view.readUInt32BE(offset+8+length))throw new Error(`PNG chunk CRC mismatch: ${type}`);
  if(type==='IHDR'){
   if(offset!==8||length!==13)throw new Error('PNG IHDR must be the first chunk with length 13');
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);
   bitDepth=data[8];colorType=data[9];interlace=data[12];
  }else{
   if(width===undefined)throw new Error(`PNG chunk ${type} appears before IHDR`);
   if(type==='IDAT'){
    if(idatClosed)throw new Error('PNG IDAT chunks must be consecutive');
    idat.push(data);
   }else{
    if(idat.length)idatClosed=true;
    if(type==='tRNS'){
     // 重复 tRNS 是损坏文件（规范至多一个），静默取后者会掩盖结构问题
     if(trns!==null)throw new Error('PNG duplicate tRNS chunk');
     trns=data;
    }
    else if(type==='IEND'){
     if(length!==0)throw new Error('PNG IEND must be empty');
     sawIend=true;
    }else if(!KNOWN_CHUNKS.has(type)&&(type.charCodeAt(0)&0x20)===0)throw new Error(`PNG unknown critical chunk: ${type} (declared decode subset cannot interpret it)`);
   }
  }
  offset+=12+length;
  if(sawIend){
   if(offset!==view.length)throw new Error('PNG trailing data after IEND');
   break;
  }
 }
 if(width===undefined)throw new Error('PNG missing IHDR');
 if(!idat.length)throw new Error('PNG missing IDAT');
 if(!sawIend)throw new Error('PNG missing IEND');
 if(bitDepth!==8||![2,6].includes(colorType))throw new Error(`PNG outside declared decode subset: bitDepth=${bitDepth} colorType=${colorType} (supported: 8-bit RGB/RGBA)`);
 if(interlace!==0)throw new Error('Interlaced PNG outside declared decode subset');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>maxPixels)throw new Error(`PNG dimensions out of range: ${width}x${height}`);
 let transparentKey=null;
 if(trns!==null){
  if(colorType===6)throw new Error('PNG tRNS chunk forbidden for RGBA (color type 6)');
  if(trns.length!==6)throw new Error(`PNG tRNS for RGB must be 6 bytes, got ${trns.length}`);
  // 位深 <16 时样本取低字节（PNG 规范 tRNS：真彩色键以 3×16bit 存储于 8 位深时低字节有效）
  transparentKey={r:trns[1]&0xff,g:trns[3]&0xff,b:trns[5]&0xff};
 }
 const channels=colorType===6?4:3;
 const stride=width*channels;
 const expectedBytes=(stride+1)*height;
 const raw=inflateSync(Buffer.concat(idat),{maxOutputLength:expectedBytes});
 if(raw.length!==expectedBytes)throw new Error(`PNG pixel data size mismatch: expected ${expectedBytes} bytes, got ${raw.length}`);
 const pixels=Buffer.alloc(width*height*4);
 const prior=Buffer.alloc(stride);
 for(let row=0;row<height;row++){
  const base=row*(stride+1);
  const filter=raw[base];
  const line=Buffer.from(raw.subarray(base+1,base+1+stride));
  for(let index=0;index<stride;index++){
   const left=index>=channels?line[index-channels]:0;
   const up=prior[index];
   const upLeft=index>=channels?prior[index-channels]:0;
   let value=line[index];
   if(filter===1)value+=left;
   else if(filter===2)value+=up;
   else if(filter===3)value+=Math.floor((left+up)/2);
   else if(filter===4){
    const p=left+up-upLeft,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-upLeft);
    value+=pa<=pb&&pa<=pc?left:pb<=pc?up:upLeft;
   }else if(filter!==0)throw new Error(`Unknown PNG filter: ${filter}`);
   line[index]=value&0xff;
  }
  line.copy(prior);
  for(let column=0;column<width;column++){
   const source=line.subarray(column*channels,column*channels+channels);
   const target=column*4+row*width*4;
   pixels[target]=source[0];pixels[target+1]=source[1];pixels[target+2]=source[2];
   pixels[target+3]=channels===4?source[3]:(transparentKey!==null&&source[0]===transparentKey.r&&source[1]===transparentKey.g&&source[2]===transparentKey.b?0:255);
  }
 }
 return {width,height,pixels};
}

export function pixelDiff(baselineBuffer,actualBuffer){
 const baseline=decodePng(baselineBuffer),actual=decodePng(actualBuffer);
 if(baseline.width!==actual.width||baseline.height!==actual.height)throw new Error(`PNG dimension mismatch: baseline ${baseline.width}x${baseline.height} vs actual ${actual.width}x${actual.height} — pixels are not comparable`);
 let differing=0;
 const total=baseline.width*baseline.height;
 for(let index=0;index<total*4;index+=4){
  if(baseline.pixels[index]!==actual.pixels[index]||baseline.pixels[index+1]!==actual.pixels[index+1]||baseline.pixels[index+2]!==actual.pixels[index+2]||baseline.pixels[index+3]!==actual.pixels[index+3])differing++;
 }
 return {pixels:differing,totalPixels:total};
}

export const isPng=buffer=>Buffer.isBuffer(buffer)&&buffer.length>=8&&buffer.readUInt32BE(0)===0x89504e47&&buffer.readUInt32BE(4)===0x0d0a1a0a;
