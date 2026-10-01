import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export const BASELINE_MODES=['any','git'];
export const BASELINE_SOURCE_TYPES=['git-commit','embedded'];

const hex64=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

// 基线声明形状（W3 + v1.15 内容绑定）：runner 回报与 behavior 观察记录承载的基线来源统一形状——
// git 型 {type:'git-commit', ref, file?, contentSha256?}（file 与 contentSha256 必须成对声明；
// 声明即核验：内核 `git show <ref>:<file>` 取该 ref 树中的真实内容内容比对 sha256，不符 ERROR——
// runner 声称执行的基线内容必须就是该 ref 的真实内容）；embedded 型仅 {type:'embedded'}
// （内嵌实现，无真实历史可锚，摘要降级）。返回键序固定的规范化对象；非法形状抛错。
export function normalizeBaselineSource(reported){
 check(object(reported)&&BASELINE_SOURCE_TYPES.includes(reported.type)&&Object.keys(reported).every(k=>['type','ref','file','contentSha256'].includes(k)),'Invalid baselineSource');
 if(reported.type==='git-commit'){
  check(text(reported.ref),'Invalid baselineSource');
  check((reported.file===undefined)===(reported.contentSha256===undefined),'Invalid baselineSource (file and contentSha256 must be declared together)');
  if(reported.file!==undefined)check(text(reported.file)&&hex64(reported.contentSha256),'Invalid baselineSource (expected file path + 64-hex contentSha256)');
  return {type:'git-commit',ref:reported.ref,...(reported.file!==undefined?{file:reported.file,contentSha256:reported.contentSha256}:{})};
 }
 check(Object.keys(reported).length===1,'Invalid baselineSource (embedded carries no other fields)');
 return {type:'embedded'};
}

// 基线来源协议（W3）：凡声明 expected 即适用。runner 回报 baselineSource{type,ref?}——
// git 型内核在项目根 `git rev-parse --verify <ref>^{commit}` 核验 ref 真实存在且解析为
// commit（非仓库/捏造 ref 即 ERROR fail-closed）；embedded 型如实标注（摘要降级，非真实
// 历史）。baselineMode（默认 any 兼容）：git 模式下 embedded/缺失即 FAIL。
// v1.15 内容核验（T2）：git 型可选 file+contentSha256——`git show <ref>:<file>` 取内容
// （Buffer 原样哈希，不经编码转换），与声明内容比对不符即 ERROR；核验一致记 contentVerified
// 并计入证据力证据信号"基线内容核验"。
// 返回 details 用的 baseline 块；accepted=false 由调用方转为门禁 FAIL。
export function evaluateBaselineSource(declaredMode,reported,root){
 check(declaredMode===undefined||BASELINE_MODES.includes(declaredMode),'Invalid baselineMode');
 const mode=declaredMode??'any';
 let block;
 if(reported===undefined||reported===null)block={mode,source:null,status:'missing'};
 else{
  const source=normalizeBaselineSource(reported);
  if(source.type==='git-commit'){
   const r=spawnSync('git',['rev-parse','--verify',`${source.ref}^{commit}`],{cwd:root,shell:false,encoding:'utf8',maxBuffer:4096,timeout:5000,windowsHide:true});
   check(!r.error&&!r.signal&&r.status===0,`baselineSource ref does not resolve to a commit: ${source.ref}${r.error?.code==='ENOENT'?' (git executable not found)':''}`);
   let contentVerified=false;
   if(source.file!==undefined){
    // 路径是 git 树路径而非文件系统路径（在 ref 的树对象内解析，不存在越界）；
    // maxBuffer 超限/超时同样 fail-closed 为 ERROR。
    const shown=spawnSync('git',['show',`${source.ref}:${source.file}`],{cwd:root,shell:false,maxBuffer:4194304,timeout:5000,windowsHide:true});
    check(!shown.error&&!shown.signal&&shown.status===0&&Buffer.isBuffer(shown.stdout),`baselineSource file not found in ref tree: ${source.ref}:${source.file}`);
    const actual=createHash('sha256').update(shown.stdout).digest('hex');
    check(actual===source.contentSha256,`baselineSource content sha256 mismatch: declared ${source.contentSha256} but ${source.ref}:${source.file} hashes to ${actual}`);
    contentVerified=true;
   }
   block={mode,source,resolvedCommit:r.stdout.trim(),status:'verified',...(contentVerified?{contentVerified:true}:{})};
  }else block={mode,source,status:'embedded'};
 }
 return {...block,accepted:mode==='any'||block.status==='verified'};
}
