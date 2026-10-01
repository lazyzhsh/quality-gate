import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {quote} from './app.mjs';
// 基线来源协议（W3）：基线优先取 git 真历史（QGATE_BASELINE_REF，默认 legacy 标签——
// `git show <ref>:app.mjs` 读出历史实现后双次运行，路径相对仓库根）；仓库无该 ref 时回退
// 内嵌 legacy 实现并如实回报 baselineSource:{type:'embedded'}（摘要降级标注）。
// 夹具/测试以临时 git 仓库演练真基线路径：先提交 legacy 版 app.mjs 打 legacy 标签，
// 再切回当前实现。基线"实际值"如实上报，通过与失败由内核按期望判定。
// 基线内容绑定（v1.15 T2）：git 路径下对实际取用的基线内容（Buffer 原样）声明 contentSha256，
// 并在观察记录与观察两处声明同形 baseline 块——内核 git show 内容比对内容哈希 + 两源一致核验，
// 核验一致计入证据力证据信号"基线内容核验"。
const embeddedLegacyQuote=({amount,currency})=>{
 if(currency!=='USD')return {decision:'reject',reason:'currency'};
 if(typeof amount!=='number'||amount<=0)return {decision:'reject',reason:'amount'};
 return {decision:'accept',fee:Math.round(amount*0.02)};
};
const baselineRef=process.env.QGATE_BASELINE_REF??'legacy';
let baselineQuote;
let baselineDeclaration={type:'embedded'};
const shown=spawnSync('git',['show',`${baselineRef}:app.mjs`],{maxBuffer:65536,timeout:5000,windowsHide:true});
if(shown.status===0&&Buffer.isBuffer(shown.stdout)&&shown.stdout.toString('utf8').includes('export')){
 try{
  const historical=await import(`data:text/javascript;base64,${shown.stdout.toString('base64')}`);
  if(typeof historical.quote==='function'){
   baselineQuote=historical.quote;
   baselineDeclaration={type:'git-commit',ref:baselineRef,file:'app.mjs',contentSha256:createHash('sha256').update(shown.stdout).digest('hex')};
  }
 }catch{/* 回退内嵌基线 */}
}
if(!baselineQuote){baselineQuote=embeddedLegacyQuote;baselineDeclaration={type:'embedded'};}
let input='';
for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
// evaluatedAt 是易变字段：如实上报，由门禁配置的 ignorePaths 显式豁免
const cases=request.cases.map(c=>({id:c.id,actual:{...quote(c.input),evaluatedAt:Date.now()},baselineActual:{...baselineQuote(c.input),evaluatedAt:Date.now()}}));
// 原始用例观察记录（v1.13 T2）+ 基线声明块（v1.15 T2）：当次逐用例观察原样落盘（runId 绑定
// 当次运行）并承载 baseline 块（与观察 baselineSource 同形）——内核解析观察记录与自报交叉
// 核验 + 基线两源一致 + git show 内容内容比对，不符 ERROR；一致计入证据力证据信号。
const transcriptFile='build/behavior-transcript.json';
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync(transcriptFile,JSON.stringify({schemaVersion:'0.1',kind:'behavior',runId:request.runId,baseline:baselineDeclaration,cases:cases.map(c=>({id:c.id,actual:c.actual,baselineActual:c.baselineActual}))},null,2));
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,baselineSource:baselineDeclaration,cases,rawTranscript:{format:'qgate-transcript',file:transcriptFile}}));
