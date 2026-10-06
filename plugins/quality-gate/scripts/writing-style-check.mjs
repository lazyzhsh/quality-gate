#!/usr/bin/env node
// 受控表达文风检查器（X14 首轮，severity:advisory）——约定对齐 argv 规则的零依赖文档检查。
// 统一观察协议：stdin {schemaVersion:'0.1',runId,ruleId} → stdout {schemaVersion:'0.1',runId,source,findings}
// （内核解析判定，runner 无权自判放行；本脚本自身失败 = 非零退出 → 门禁 ERROR fail-closed）。
// 边界如实：这是确定性的计数/字面量检查，不理解语义——误报边界与升级为阻断的条件见
// docs/WRITING-GUIDE.md「与自动检查的关系」。规则编号 WS-1/WS-2/WS-3（W4/W12 的可判定子集）。
import fs from 'node:fs';
import path from 'node:path';
import {pathGlob} from '../lib/freshness.mjs';

const SOURCE='writing-style-check@1.27.0';
const SKIPPED_DIRECTORIES=new Set(['.git','node_modules','.quality-gate','dist']);
const EXEMPT_MARKER='qgate-style:example'; // 规则样例/文档自身引述行标记：避免自引用误报（范围不因此缩小）
const VAGUE_WORDS=['适当处理','按需优化','酌情优化','尽量保证','后续完善'];
const MULTI_ACTION_CONNECTORS=['然后','接着','同时','并且'];
const MAX_FINDINGS=200; // 统一观察协议上限

const args=process.argv.slice(2);
const scopes=[];let maxZh=160,maxEn=45;const enabled=new Set(['ws-long-sentence','ws-vague-word','ws-multi-action']);
for(let index=0;index<args.length;index++){
 if(args[index]==='--scope')scopes.push(args[++index]);
 else if(args[index]==='--max-zh')maxZh=Number(args[++index]);
 else if(args[index]==='--max-en')maxEn=Number(args[++index]);
 else if(args[index]==='--rules'){enabled.clear();for(const id of String(args[++index]).split(','))enabled.add(id);}
 else{console.error(`Unknown argument: ${args[index]}`);process.exit(2);}
}
if(!Number.isInteger(maxZh)||maxZh<20||!Number.isInteger(maxEn)||maxEn<10){console.error('Invalid length threshold');process.exit(2);}

let raw='';
for await(const chunk of process.stdin){raw+=chunk;if(raw.length>65536)throw new Error('Input too large');}
const input=JSON.parse(raw);
if(input?.schemaVersion!=='0.1'||typeof input.runId!=='string'||typeof input.ruleId!=='string')throw new Error('Invalid convention observation request');

function walk(dir,accumulator){
 for(const entry of fs.readdirSync(dir?path.join(root,dir):root,{withFileTypes:true})){
  if(SKIPPED_DIRECTORIES.has(entry.name))continue;
  const relative=dir?`${dir}/${entry.name}`:entry.name;
  if(entry.isDirectory())walk(relative,accumulator);
  else accumulator.push(relative);
 }
 return accumulator;
}

const root=process.cwd(); // 约定 argv runner 以项目根为 cwd 执行（与内核观察协议一致）
const patterns=(scopes.length?scopes:['docs/**/*.md']).map(pattern=>pathGlob(pattern));
const files=walk('',[]).filter(file=>file.endsWith('.md')&&patterns.some(regex=>regex.test(file))).sort();
const findings=[];
const add=(file,line,detail,category='style')=>{if(findings.length<MAX_FINDINGS)findings.push({path:file,line,detail,category});};

const stripInlineCode=line=>line.replaceAll(/`[^`]*`/g,' ');
const zhSentences=text=>text.split(/[。！？；]/).filter(Boolean);
const enSentences=text=>text.split(/[.!?]/).filter(Boolean);

for(const file of files){
 const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/);
 let inFence=false;
 lines.forEach((rawLine,index)=>{
  if(rawLine.trimStart().startsWith('```')){inFence=!inFence;return;}
  if(inFence)return; // 代码块字面量不参与自然语言句长规则（W12：路径/参数/引用不参与长度检查）
  const line=stripInlineCode(rawLine);
  if(line.includes(EXEMPT_MARKER))return; // 显式样例行（登记性豁免，advisory 层可见性换自引用不误报）
  const cells=line.includes('|')?line.split('|'):[line]; // 表格逐单元格检查——RTM 与选项表在表格里，不能整表跳过
  for(const cell of cells){
   if(enabled.has('ws-vague-word'))for(const word of VAGUE_WORDS){
    if(cell.includes(word))add(file,index+1,`ws-vague-word: 模糊表述"${word}"——W4 要求动作可判定（advisory）`);
   }
   if(enabled.has('ws-long-sentence')){
    for(const sentence of zhSentences(cell)){
     const text=sentence.trim();
     if(text.length>maxZh)add(file,index+1,`ws-long-sentence: 中文分句 ${text.length} 字 > ${maxZh}（W12 提示级）`);
    }
    for(const sentence of enSentences(cell)){
     const words=sentence.trim().split(/\s+/).filter(Boolean);
     if(words.length>maxEn)add(file,index+1,`ws-long-sentence: 英文句 ${words.length} 词 > ${maxEn}（W12 提示级）`);
    }
   }
  }
  if(enabled.has('ws-multi-action')&&/^\s*(\d+[.、)]|[-*])\s/.test(line)){
   const count=MULTI_ACTION_CONNECTORS.filter(connector=>line.includes(connector)).length;
   if(count>=2)add(file,index+1,`ws-multi-action: 列表步骤含 ${count} 个动作连接词——W4 建议一步一个主要动作（启发式，advisory）`);
  }
 });
}
if(!files.length)findings.push({path:'(scope)',line:null,detail:`扫描零文件：范围 ${scopes.join(' ')||'docs/**/*.md'} 未命中任何文件——不能作为符合规范的证据`,category:'scope-empty'});
if(findings.length===MAX_FINDINGS)findings[MAX_FINDINGS-1]={path:'(truncated)',line:null,detail:'命中数达协议上限 200，已截断——按文件优先级排序的完整清单需缩小范围复跑',category:'truncated'};
process.stdout.write(JSON.stringify({schemaVersion:'0.1',runId:input.runId,source:SOURCE,ruleId:input.ruleId,scannedFiles:files.length,findings}));
