import fs from 'node:fs';
import path from 'node:path';
// 依赖图真实测量 runner（W3，v1.29；F05 收敛 2026-10-06 二轮评审）：扫描 src/ 下真实 .mjs
// 源码的静态 import/export-from 说明符，解析相对路径构建真实模块图，按 layers.json 声明的
// 分层规则计算违规方向数与环数。与 architecture-demo 的声明布尔不同：这里的指标值来自真实
// 代码结构——注入违规 import 即被检出。
//
// F05 修复：提取不再用裸正则直扫全文——先逐字符分类（行/块注释、单双引号字符串、模板字面
// 量含 ${} 嵌套、正则字面量启发式跳过），再仅在"代码"区域识别三类静态引用：命名/默认
// import…from、副作用 import '…'、export…from。注释与字符串里的 from '…' 不再误计为依赖，
// 副作用 import 与 export-from 不再漏计。声明的边界不变：动态 import()、外部裸包说明符不计
// 边；无法解析到测量模块集的静态引用计入 unresolvedImports 指标（报告性，无阈值）。
// 负例：QGATE_SCENARIO=violation 写入真实违规文件（core→ui）；QGATE_SCENARIO=cycle 写入
// 真实环（两模块互引）。均在 finally 清理。
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const query=JSON.parse(raw);
const root=process.cwd();
const {layers,forbidden}=JSON.parse(fs.readFileSync(path.join(root,'layers.json'),'utf8'));
const normalize=file=>file.replaceAll('\\','/');
const layerOf=file=>{
 const relative=path.relative(root,file);
 return Object.entries(layers).find(([,dir])=>normalize(relative)===normalize(dir)||normalize(relative).startsWith(normalize(dir)+'/'))?.[0]??null;
};

const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const full=path.join(dir,entry.name);
 return entry.isDirectory()?walk(full):entry.name.endsWith('.mjs')||entry.name.endsWith('.js')?[normalize(full)]:[];
});

// 逐字符分类：c=代码 m=注释 s=字符串内部 q=字符串定界引号 t/ts=模板定界/内部 x=正则字面量。
// 模板字面量内 ${…} 回到代码态（花括号深度平衡后返回模板），嵌套模板同理。
function classify(source){
 const classes=new Array(source.length).fill('c');
 let state='code',braceDepth=0;
 const templateStack=[];
 let lastSignificant=-1;
 for(let index=0;index<source.length;index++){
  const ch=source[index],next=source[index+1];
  if(state==='code'){
   if(ch==='/'&&next==='/'){classes[index]=classes[index+1]='m';state='line';index++;}
   else if(ch==='/'&&next==='*'){classes[index]=classes[index+1]='m';state='block';index++;}
   else if(ch==='/'){
    // 除法还是正则：看前一个代码态有效字符——空/运算符/右花括号（语句位）或关键字
    // （return/typeof/case 等）之后是正则起始；关键字查词首（return /x/ 的 prev 是 'n'）
    const prev=lastSignificant>=0?source[lastSignificant]:'' ;
    const wordBefore=lastSignificant>=0?source.slice(Math.max(0,lastSignificant-8),lastSignificant+1):'';
    const regexContext=prev===''||prev==='}'||'([{,;=:?!&|+-*%~^<>'.includes(prev)||/\b(return|typeof|instanceof|in|of|case|delete|void|throw|new|do|else|yield|await)$/.test(wordBefore);
    classes[index]='x';
    if(regexContext){
     let scan=index+1;
     while(scan<source.length){
      classes[scan]='x';
      if(source[scan]==='\\'){classes[scan+1]='x';scan+=2;continue;}
      if(source[scan]==='/')break;
      if(source[scan]==='\n')break; // 未闭合正则跨行＝非法，按行终止避免吞掉后续代码
      scan++;
     }
     index=scan;
    }
   }
   else if(ch==="'"){classes[index]='q';state='single';}
   else if(ch==='"'){classes[index]='q';state='double';}
   else if(ch==='`'){classes[index]='t';state='template';}
   else{
    classes[index]='c';
    if(ch==='{')braceDepth++;
    else if(ch==='}'){
     if(templateStack.length&&braceDepth===0){braceDepth=templateStack.pop();state='template';classes[index]='t';}
     else braceDepth=Math.max(0,braceDepth-1);
    }
   }
   if(classes[index]==='c'&&!/\s/.test(ch))lastSignificant=index;
  }else if(state==='line'){
   if(ch==='\n'||ch==='\r'){classes[index]='c';state='code';}
   else classes[index]='m';
  }else if(state==='block'){
   classes[index]='m';
   if(ch==='*'&&next==='/'){classes[index+1]='m';state='code';index++;}
  }else if(state==='single'||state==='double'){
   const quote=state==='single'?"'":'"';
   if(ch==='\\'){classes[index]=classes[index+1]='s';index++;}
   else if(ch===quote){classes[index]='q';state='code';}
   else classes[index]='s';
  }else if(state==='template'){
   if(ch==='\\'){classes[index]=classes[index+1]='ts';index++;}
   else if(ch==='$'&&next==='{'){classes[index]=classes[index+1]='ts';templateStack.push(braceDepth);braceDepth=0;state='code';index++;}
   else if(ch==='`'){classes[index]='t';state='code';}
   else classes[index]='ts';
  }
 }
 return classes;
}

// 三类静态引用只在代码态成立：关键字首字符 c、说明符定界引号 q、说明符内容 s。
// 模板字面量不是合法模块说明符（须 StringLiteral），t/ts 不接受。
const IMPORT_PATTERNS=[
 /import\s+[^;'"]*?from\s*(['"])([^'"\n]+)\1/dg,
 /import\s*(['"])([^'"\n]+)\1/dg,
 /export\s+[^;'"]*?from\s*(['"])([^'"\n]+)\1/dg,
];
function staticImportSpecifiers(source){
 const classes=classify(source);
 const specs=[];
 for(const pattern of IMPORT_PATTERNS){
  pattern.lastIndex=0;
  for(const match of source.matchAll(pattern)){
   const [quoteStart,specStart]=match.indices[1];
   const [specFrom,specTo]=match.indices[2];
   if(classes[match.index]!=='c')continue;
   if(classes[quoteStart]!=='q'||classes[specFrom]!=='s'||classes[specTo-1]!=='s')continue;
   specs.push(match[2]);
  }
 }
 return specs;
}

const importsOf=(file,content)=>staticImportSpecifiers(content)
 .map(spec=>({spec,resolved:spec.startsWith('.')?normalize(path.resolve(path.dirname(file),spec)):null}));
const files=walk(path.join(root,'src'));
const edgesOf=list=>list.flatMap(file=>importsOf(file,fs.readFileSync(file,'utf8')).map(({spec,resolved})=>({from:file,to:resolved,spec})));

const injected=[];
const scenario=process.env.QGATE_SCENARIO;
try{
 if(scenario==='violation'){
  fs.writeFileSync(path.join(root,'src','core','leak.mjs'),"import {render} from '../ui/dashboard.mjs';\nexport const leak=render;\n");
  injected.push(normalize(path.join(root,'src','core','leak.mjs')));
 }else if(scenario==='cycle'){
  fs.writeFileSync(path.join(root,'src','core','a.mjs'),"import {b} from './b.mjs';\nexport const a=1;\n");
  fs.writeFileSync(path.join(root,'src','core','b.mjs'),"import {a} from './a.mjs';\nexport const b=1;\n");
  injected.push(normalize(path.join(root,'src','core','a.mjs')),normalize(path.join(root,'src','core','b.mjs')));
 }
 const measuredFiles=scenario?[...new Set([...files,...injected])]:files;
 const allEdges=edgesOf(measuredFiles);
 const measuredEdges=allEdges.filter(edge=>measuredFiles.includes(edge.to));
 const unresolvedImports=allEdges.length-measuredEdges.length;
 const layerEdges=measuredEdges.map(edge=>({from:layerOf(edge.from),to:layerOf(edge.to),fromFile:edge.from,toFile:edge.to}))
  .filter(edge=>edge.from&&edge.to);
 const violations=layerEdges.filter(edge=>forbidden.some(rule=>rule.from===edge.from&&rule.to===edge.to));
 // 环检测：真实模块图 DFS 三色标记，灰→灰边即环
 const adjacency=new Map();
 for(const edge of measuredEdges){
  if(!adjacency.has(edge.from))adjacency.set(edge.from,[]);
  adjacency.get(edge.from).push(edge.to);
 }
 let cycles=0;const state=new Map();
 const visit=node=>{
  state.set(node,1);
  for(const next of adjacency.get(node)??[]){
   if(state.get(next)===1)cycles++;
   else if(!state.has(next))visit(next);
  }
  state.set(node,2);
 };
 for(const node of [...adjacency.keys()])if(!state.has(node))visit(node);
 console.log(JSON.stringify({
  schemaVersion:'0.1',
  runId:query.runId,
  source:'real import-graph measurement over src/ (layering + cycle detection; comment/string-aware static extraction)',
  metrics:{
   forbiddenDependencies:violations.length,
   cycles,
   measuredModules:measuredFiles.length,
   measuredEdges:measuredEdges.length,
   unresolvedImports
  },
  ...(violations.length?{violationExamples:violations.slice(0,5).map(v=>`${v.from}→${v.to}`)}:{})
 }));
}finally{
 for(const file of injected){try{fs.unlinkSync(file);}catch{}}
}
